import os
import logging
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.config.settings import settings
from app.models.database_models import Document, DocumentChunk
from app.services.document_processor import DocumentProcessor
from app.services.upload_handler import UploadHandler

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize processors
document_processor = DocumentProcessor()
upload_handler = UploadHandler()


def get_existing_files_from_db(db: Session) -> List[dict]:
    """Get existing files from database for duplicate detection"""
    try:
        documents = db.query(Document).all()
        existing_files = []

        for doc in documents:
            existing_files.append({
                'id': doc.id,
                'filename': doc.filename or '',
                'original_filename': doc.original_filename or '',
                'file_hash': doc.file_hash or '',
                'title': doc.title or '',
                'display_filename': getattr(doc, 'display_filename', '') or doc.filename or ''
            })

        return existing_files

    except Exception as e:
        logger.error(f"Error getting existing files: {e}")
        return []


def save_document_to_database(db: Session, result: dict, category: Optional[str] = None,
                              description: Optional[str] = None) -> Document:
    """Save processed document to database"""
    try:
        metadata = result.get('metadata', {})

        # Get all fields safely with fallbacks
        file_path = metadata.get('file_path') or result.get('file_path', '')
        file_type = metadata.get('file_type', '')
        file_size = metadata.get('file_size', 0)
        file_hash = metadata.get('file_hash', '')

        # Create document record with safe access
        document = Document(
            filename=os.path.basename(file_path) if file_path else '',
            original_filename=metadata.get('original_filename', ''),
            file_path=file_path,
            file_type=file_type,
            file_size=file_size,
            file_hash=file_hash,
            category=category,
            description=description,
            title=metadata.get('extracted_title') or result.get('display_name', ''),
            total_pages=metadata.get('total_pages', 0),
            total_chunks=len(result.get('chunks', [])),
            word_count=metadata.get('word_count', 0),
            status="uploaded",
            processing_status="pending"
        )

        db.add(document)
        db.commit()
        db.refresh(document)

        logger.info(f"Document saved to database: ID {document.id}, Display: {result.get('display_name', 'Unknown')}")
        return document

    except Exception as e:
        db.rollback()
        logger.error(f"Error saving document to database: {e}")
        raise e


@router.post("/upload")
async def upload_pdf(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        category: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        auto_process: bool = Form(True),
        auto_rename_generic: bool = Form(True),
        db: Session = Depends(get_db)
):
    """Upload a document file with enhanced processing and duplicate detection"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Check file type
        if not document_processor.is_supported(file.filename):
            file_extension = document_processor.get_file_type(file.filename)
            raise HTTPException(
                status_code=400,
                detail=f"File type '{file_extension}' not supported. Supported types: {list(document_processor.supported_types.keys())}"
            )

        # Check file size
        file_content = await file.read()
        if len(file_content) > settings.max_file_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {settings.max_file_size / (1024 * 1024):.1f}MB"
            )

        # Get existing files for duplicate detection
        existing_files = get_existing_files_from_db(db)

        # Save and process file using upload handler
        try:
            file_path = upload_handler.save_uploaded_file(
                file_content,
                file.filename,
                preserve_original_name=False
            )

            result = upload_handler.process_uploaded_document(
                file_path,
                file.filename,
                existing_files,
                auto_rename_generic
            )

        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {e}")
            raise HTTPException(status_code=500, detail=f"File processing failed: {str(e)}")

        # Handle different processing statuses
        if result['status'] == 'duplicate_content':
            upload_handler.cleanup_temp_file(file_path)
            raise HTTPException(
                status_code=409,
                detail=f"File content already exists. {'; '.join(result['messages'])}"
            )

        elif result['status'] == 'error':
            upload_handler.cleanup_temp_file(file_path)
            raise HTTPException(
                status_code=500,
                detail=f"Processing failed: {'; '.join(result['messages'])}"
            )

        # Save to database
        try:
            document = save_document_to_database(db, result, category, description)
        except Exception as e:
            # Clean up file if database save fails
            upload_handler.cleanup_temp_file(result['file_path'])
            raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")

        logger.info(f"File uploaded successfully: {document.id} - {result['display_name']}")

        # Schedule background processing if requested
        if auto_process:
            background_tasks.add_task(process_document_background, document.id)

        # Prepare response
        response_data = {
            "id": document.id,
            "filename": document.filename,
            "original_filename": document.original_filename,
            "display_name": result['display_name'],
            "file_size": document.file_size,
            "file_type": document.file_type,
            "status": document.status,
            "processing_status": document.processing_status,
            "auto_process": auto_process,
            "was_renamed": result['metadata'].get('was_renamed', False),
            "extracted_title": result['metadata'].get('extracted_title'),
            "processing_info": result['processing_info'],
            "messages": result['messages'],
            "message": "File uploaded successfully"
        }

        # Add warning if duplicate filename
        if result['status'] == 'duplicate_filename':
            response_data['warning'] = f"Filename already exists. {'; '.join(result['messages'])}"

        return response_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error during upload: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.post("/bulk-upload")
async def bulk_upload_pdfs(
        background_tasks: BackgroundTasks,
        files: List[UploadFile] = File(...),
        category: Optional[str] = Form(None),
        auto_process: bool = Form(True),
        auto_rename_generic: bool = Form(True),
        db: Session = Depends(get_db)
):
    """Upload multiple document files with enhanced processing"""
    try:
        if len(files) > settings.max_bulk_files:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {settings.max_bulk_files} files allowed per bulk upload"
            )

        # Get existing files for duplicate detection
        existing_files = get_existing_files_from_db(db)

        # Prepare file data
        file_data = []
        skipped_files = []

        for file in files:
            if not file.filename:
                skipped_files.append({"filename": "unknown", "reason": "No filename provided"})
                continue

            if not document_processor.is_supported(file.filename):
                file_extension = document_processor.get_file_type(file.filename)
                skipped_files.append({
                    "filename": file.filename,
                    "reason": f"Unsupported file type: {file_extension}"
                })
                continue

            try:
                file_content = await file.read()
                if len(file_content) > settings.max_file_size:
                    skipped_files.append({
                        "filename": file.filename,
                        "reason": "File too large"
                    })
                    continue

                file_data.append((file_content, file.filename))

            except Exception as e:
                logger.error(f"Error reading file {file.filename}: {e}")
                skipped_files.append({
                    "filename": file.filename,
                    "reason": f"Read error: {str(e)}"
                })

        if not file_data:
            raise HTTPException(
                status_code=400,
                detail="No valid files found for processing"
            )

        # Process bulk upload
        bulk_result = upload_handler.handle_bulk_upload(file_data, existing_files)

        # Save successful documents to database
        saved_documents = []
        processing_failed = []

        for file_result in bulk_result['results']:
            filename = file_result['filename']
            result = file_result['result']

            if result['status'] == 'success':
                try:
                    document = save_document_to_database(db, result, category)

                    saved_documents.append({
                        'id': document.id,
                        'filename': document.filename,
                        'original_filename': document.original_filename,
                        'display_name': result['display_name'],
                        'file_size': document.file_size,
                        'file_type': document.file_type,
                        'status': document.status,
                        'processing_status': document.processing_status,
                        'was_renamed': result['metadata'].get('was_renamed', False),
                        'extracted_title': result['metadata'].get('extracted_title'),
                        'messages': result['messages']
                    })

                    # Schedule background processing
                    if auto_process:
                        background_tasks.add_task(process_document_background, document.id)

                except Exception as e:
                    logger.error(f"Failed to save {filename} to database: {e}")
                    upload_handler.cleanup_temp_file(result['file_path'])
                    processing_failed.append({
                        'filename': filename,
                        'reason': f"Database save failed: {str(e)}"
                    })

            elif result['status'].startswith('duplicate'):
                # Handle duplicates
                duplicate_info = {
                    'filename': filename,
                    'status': result['status'],
                    'messages': result['messages']
                }
                if result['status'] == 'duplicate_content':
                    upload_handler.cleanup_temp_file(result['file_path'])

            else:
                # Handle errors
                processing_failed.append({
                    'filename': filename,
                    'reason': '; '.join(result['messages'])
                })
                if result['file_path']:
                    upload_handler.cleanup_temp_file(result['file_path'])

        # Prepare summary
        total_attempted = len(files)
        total_processed = len(file_data)
        total_saved = len(saved_documents)
        total_duplicates = bulk_result['duplicates']
        total_errors = len(processing_failed) + len(skipped_files)

        logger.info(f"Bulk upload completed: {total_saved}/{total_attempted} files successfully processed")

        return {
            "success": True,
            "message": f"Bulk upload completed: {total_saved}/{total_attempted} files processed successfully",
            "summary": {
                "total_submitted": total_attempted,
                "total_processed": total_processed,
                "successful": total_saved,
                "duplicates": total_duplicates,
                "errors": total_errors,
                "skipped": len(skipped_files)
            },
            "saved_documents": saved_documents,
            "skipped_files": skipped_files,
            "processing_failed": processing_failed,
            "auto_process": auto_process,
            "detailed_results": bulk_result['results'] if len(bulk_result['results']) <= 10 else bulk_result['results'][
                                                                                                 :10]
            # Limit detailed results
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")


@router.get("/list")
async def list_pdfs(
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """List uploaded documents with enhanced filtering"""
    try:
        query = db.query(Document)

        # Apply filters
        if status:
            query = query.filter(Document.status == status)

        if category:
            query = query.filter(Document.category == category)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                (Document.filename.ilike(search_term)) |
                (Document.original_filename.ilike(search_term)) |
                (Document.title.ilike(search_term)) |
                (Document.description.ilike(search_term))
            )

        total = query.count()
        documents = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()

        # Enhanced document info
        document_list = []
        for doc in documents:
            doc_dict = doc.to_dict()

            # Add display name
            doc_dict['display_name'] = doc.title or document_processor.get_clean_filename(
                doc.filename or doc.original_filename or 'Untitled')

            # Add processing info
            doc_dict['processing_info'] = {
                'word_count': doc.word_count or 0,
                'total_chunks': doc.total_chunks or 0,
                'total_pages': doc.total_pages or 0,
                'file_size_mb': round((doc.file_size or 0) / (1024 * 1024), 2) if doc.file_size else 0
            }

            document_list.append(doc_dict)

        return {
            "documents": document_list,
            "total": total,
            "skip": skip,
            "limit": limit,
            "filters_applied": {
                "status": status,
                "category": category,
                "search": search
            }
        }


    except Exception as e:

        logger.error(f"Error listing documents: {e}")

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pdf_id}")
async def get_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Get document by ID with enhanced information"""

    try:

        document = db.query(Document).filter(Document.id == pdf_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        doc_dict = document.to_dict()

        # Add enhanced display information

        doc_dict['display_name'] = document.title or document_processor.get_clean_filename(

            document.filename or document.original_filename or 'Untitled'

        )

        # Add detailed processing info

        doc_dict['processing_info'] = {

            'word_count': document.word_count or 0,

            'total_chunks': document.total_chunks or 0,

            'total_pages': document.total_pages or 0,

            'file_size_mb': round((document.file_size or 0) / (1024 * 1024), 2) if document.file_size else 0,

            'file_exists': os.path.exists(document.file_path) if document.file_path else False

        }

        # Add file type info

        if document.file_path:
            doc_dict['file_type_info'] = {

                'extension': document_processor.get_file_type(document.file_path),

                'is_supported': document_processor.is_supported(document.file_path)

            }

        return doc_dict


    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Error getting document {pdf_id}: {e}")

        raise HTTPException(status_code=500, detail=str(e))



@router.post("/{pdf_id}/process")
async def process_pdf(

        pdf_id: int,

        background_tasks: BackgroundTasks,

        force_reprocess: bool = False,

        db: Session = Depends(get_db)

):
    """Manually trigger document processing"""

    try:

        document = db.query(Document).filter(Document.id == pdf_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if document.processing_status == "processing" and not force_reprocess:
            raise HTTPException(

                status_code=409,

                detail="Document is already being processed. Use force_reprocess=true to override."

            )

        if not document.file_path or not os.path.exists(document.file_path):
            raise HTTPException(

                status_code=404,

                detail="Document file not found on disk"

            )

        # Update status

        document.processing_status = "processing"

        document.error_message = None

        db.commit()

        # Schedule background processing

        background_tasks.add_task(process_document_background, pdf_id)

        return {

            "message": "Document processing started",

            "id": pdf_id,

            "status": "processing",

            "force_reprocess": force_reprocess

        }


    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Error starting document processing {pdf_id}: {e}")

        raise HTTPException(status_code=500, detail=str(e))


async def process_document_background(document_id: int):
    """Background task to process document using DocumentProcessor"""

    try:

        logger.info(f"Starting background processing for document {document_id}")

        from app.core.database import get_db_context

        from app.services.chroma_service import ChromaService

        with get_db_context() as db:

            document = db.query(Document).filter(Document.id == document_id).first()

            if not document:
                logger.error(f"Document {document_id} not found")

                return

            document.processing_status = "processing"

            db.commit()

            try:

                # Verify file exists

                if not document.file_path or not os.path.exists(document.file_path):
                    raise FileNotFoundError(f"Document file not found: {document.file_path}")

                # Process document using DocumentProcessor

                chunks, metadata = document_processor.process_document(

                    file_path=document.file_path,

                    chunk_size=settings.chunk_size,

                    chunk_overlap=settings.chunk_overlap,

                    auto_rename_generic=False  # Don't rename during reprocessing

                )

                # Update document metadata

                document.total_pages = metadata.get("total_pages", 0)

                document.total_chunks = len(chunks)

                # Update title if we have a better one

                extracted_title = metadata.get("extracted_title")

                if extracted_title and (not document.title or document.title == document.filename):
                    document.title = extracted_title

                document.word_count = metadata.get("word_count", 0)

                document.file_hash = metadata.get("file_hash", document.file_hash)

                document.processed_at = datetime.utcnow()

                # Clear existing chunks

                db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()

                # Store new chunks in database

                for chunk in chunks:
                    db_chunk = DocumentChunk(

                        document_id=document_id,

                        content=chunk["content"],

                        chunk_index=chunk["chunk_index"],

                        page_number=1,  # You might want to extract actual page numbers

                        word_count=chunk.get("word_count", 0),

                        char_count=chunk.get("char_count", 0)

                    )

                    db.add(db_chunk)

                # Initialize ChromaDB service if available

                try:

                    chroma_service = ChromaService()

                    await chroma_service.initialize()

                    # Prepare data for ChromaDB

                    documents_text = [chunk["content"] for chunk in chunks]

                    metadatas = []

                    ids = []

                    for i, chunk in enumerate(chunks):
                        chunk_metadata = {

                            "document_id": document_id,

                            "filename": document.filename or "",

                            "original_filename": document.original_filename or "",

                            "title": document.title or document.filename or "",

                            "category": document.category or "uncategorized",

                            "chunk_index": chunk["chunk_index"],

                            "page_number": 1,

                            "word_count": chunk.get("word_count", 0),

                            "char_count": chunk.get("char_count", 0),

                            "file_type": document.file_type or ""

                        }

                        metadatas.append(chunk_metadata)

                        ids.append(f"doc_{document_id}_chunk_{chunk['chunk_index']}")

                    # Remove existing vectors for this document

                    try:

                        await chroma_service.delete_document(document_id)

                    except Exception as e:

                        logger.warning(f"Could not delete existing vectors for document {document_id}: {e}")

                    # Add new vectors to ChromaDB

                    success = await chroma_service.add_documents(

                        documents=documents_text,

                        metadatas=metadatas,

                        ids=ids

                    )

                    if success:

                        document.processing_status = "completed"

                        document.status = "completed"

                        logger.info(f"Document processing completed for {document_id}: {len(chunks)} chunks indexed")

                    else:

                        document.processing_status = "completed_no_vectors"

                        document.status = "completed"

                        document.error_message = "Document processed but vector indexing failed"

                        logger.warning(f"Document {document_id} processed but ChromaDB indexing failed")


                except ImportError:

                    # ChromaDB not available

                    document.processing_status = "completed_no_vectors"

                    document.status = "completed"

                    logger.info(f"Document processing completed for {document_id} (no vector indexing available)")


                except Exception as e:

                    # ChromaDB error but document processing succeeded

                    document.processing_status = "completed_no_vectors"

                    document.status = "completed"

                    document.error_message = f"Vector indexing failed: {str(e)}"

                    logger.error(f"ChromaDB error for document {document_id}: {e}")


            except Exception as e:

                logger.error(f"Error processing document {document_id}: {e}")

                document.processing_status = "failed"

                document.status = "error"

                document.error_message = str(e)

            db.commit()


    except Exception as e:

        logger.error(f"Background processing failed for document {document_id}: {e}")

        import traceback

        logger.error(f"Full traceback: {traceback.format_exc()}")


@router.get("/{pdf_id}/status")
async def get_pdf_status(pdf_id: int, db: Session = Depends(get_db)):
    """Get document processing status with detailed information"""

    try:

        document = db.query(Document).filter(Document.id == pdf_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        display_name = document.title or document.filename or document.original_filename or f"Document {pdf_id}"

        return {

            "id": document.id,

            "display_name": display_name,

            "filename": document.filename,

            "original_filename": document.original_filename,

            "status": document.status,

            "processing_status": document.processing_status,

            "error_message": document.error_message,

            "created_at": document.created_at,

            "processed_at": document.processed_at,

            "updated_at": getattr(document, 'updated_at', None),

            "processing_info": {

                "total_chunks": document.total_chunks or 0,

                "total_pages": document.total_pages or 0,

                "word_count": document.word_count or 0,

                "file_size": document.file_size or 0,

                "file_exists": os.path.exists(document.file_path) if document.file_path else False

            }

        }


    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Error getting document status {pdf_id}: {e}")

        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{pdf_id}/reprocess")
async def reprocess_pdf(

        pdf_id: int,

        background_tasks: BackgroundTasks,

        force: bool = False,

        db: Session = Depends(get_db)

):
    """Reprocess a document (useful if processing failed or for updates)"""

    try:

        document = db.query(Document).filter(Document.id == pdf_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if document.processing_status == "processing" and not force:
            raise HTTPException(

                status_code=409,

                detail="Document is currently being processed. Use force=true to override."

            )

        if not document.file_path or not os.path.exists(document.file_path):
            raise HTTPException(

                status_code=404,

                detail="Document file not found on disk. Cannot reprocess."

            )

        # Reset status

        document.processing_status = "processing"

        document.status = "uploaded"

        document.error_message = None

        document.processed_at = None

        db.commit()

        # Schedule background processing

        background_tasks.add_task(process_document_background, pdf_id)

        display_name = document.title or document.filename or document.original_filename or f"Document {pdf_id}"

        return {

            "message": "Document reprocessing started",

            "id": pdf_id,

            "display_name": display_name,

            "status": "processing"

        }


    except HTTPException:

        raise

    except Exception as e:

        logger.error(f"Error reprocessing document {pdf_id}: {e}")

        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pdf_id}/download")
async def download_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Download original document file"""

    try:

        document = db.query(Document).filter(Document.id == pdf_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if not document.file_path or not os.path.exists(document.file_path):
            raise HTTPException(status_code=404, detail="Document file not found on disk")

        # Determine the download filename

        download_filename = (

                document.original_filename or

                document.filename or

                f"document_{pdf_id}.{document.file_type or 'bin'}"

        )

        # Determine media type

        media_type_map = {

            'pdf': 'application/pdf',

            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

            'doc': 'application/msword',

            'txt': 'text/plain',

            'md': 'text/markdown',

            'csv': 'text/csv',

            'json': 'application/json',

            'xml': 'application/xml',

            'html': 'text/html',

            'jpg': 'image/jpeg',

            'jpeg': 'image/jpeg',

                        'png': 'image/png',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            'gif': 'image/gif'
        }

        media_type = media_type_map.get(document.file_type, 'application/octet-stream')

        return FileResponse(
            path=document.file_path,
            filename=download_filename,
            media_type=media_type
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading document {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pdf_id}/chunks")
async def get_pdf_chunks(
        pdf_id: int,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Get chunks for a specific document with optional search"""
    try:
        # Verify document exists
        document = db.query(Document).filter(Document.id == pdf_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Build query for chunks
        query = db.query(DocumentChunk).filter(DocumentChunk.document_id == pdf_id)

        # Add search filter if provided
        if search:
            search_term = f"%{search}%"
            query = query.filter(DocumentChunk.content.ilike(search_term))

        # Get total count
        total = query.count()

        # Get chunks with pagination
        chunks = query.order_by(DocumentChunk.chunk_index).offset(skip).limit(limit).all()

        # Prepare chunk data
        chunk_list = []
        for chunk in chunks:
            chunk_dict = chunk.to_dict()

            # Add snippet if searching
            if search:
                chunk_dict['search_snippet'] = get_search_snippet(chunk.content, search)

            chunk_list.append(chunk_dict)

        display_name = document.title or document.filename or document.original_filename or f"Document {pdf_id}"

        return {
            "document_id": pdf_id,
            "document_name": display_name,
            "chunks": chunk_list,
            "total": total,
            "skip": skip,
            "limit": limit,
            "search": search,
            "document_info": {
                "status": document.status,
                "processing_status": document.processing_status,
                "total_chunks": document.total_chunks or 0,
                "word_count": document.word_count or 0
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting chunks for document {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_search_snippet(content: str, search_term: str, snippet_length: int = 200) -> str:
    """Extract a snippet around the search term"""
    try:
        content_lower = content.lower()
        search_lower = search_term.lower()

        # Find the search term in the content
        pos = content_lower.find(search_lower)
        if pos == -1:
            return content[:snippet_length] + "..." if len(content) > snippet_length else content

        # Calculate snippet boundaries
        start = max(0, pos - snippet_length // 2)
        end = min(len(content), pos + len(search_term) + snippet_length // 2)

        snippet = content[start:end]

        # Add ellipsis if needed
        if start > 0:
            snippet = "..." + snippet
        if end < len(content):
            snippet = snippet + "..."

        return snippet

    except Exception:
        return content[:snippet_length] + "..." if len(content) > snippet_length else content


@router.get("/stats/summary")
async def get_pdf_stats(db: Session = Depends(get_db)):
    """Get document statistics summary"""
    try:
        from sqlalchemy import func
        from datetime import timedelta

        # Count by status
        status_counts = db.query(
            Document.status,
            func.count(Document.id).label('count')
        ).group_by(Document.status).all()

        # Count by processing status
        processing_counts = db.query(
            Document.processing_status,
            func.count(Document.id).label('count')
        ).group_by(Document.processing_status).all()

        # Count by file type
        file_type_counts = db.query(
            Document.file_type,
            func.count(Document.id).label('count')
        ).group_by(Document.file_type).all()

        # Count by category
        category_counts = db.query(
            Document.category,
            func.count(Document.id).label('count')
        ).group_by(Document.category).all()

        # Total size and other aggregates
        total_size = db.query(func.sum(Document.file_size)).scalar() or 0
        total_chunks = db.query(func.sum(Document.total_chunks)).scalar() or 0
        total_words = db.query(func.sum(Document.word_count)).scalar() or 0

        # Recent uploads (last 24 hours)
        recent_cutoff = datetime.utcnow() - timedelta(hours=24)
        recent_uploads = db.query(Document).filter(
            Document.created_at >= recent_cutoff
        ).count()

        # Recent processing (last 24 hours)
        recent_processed = db.query(Document).filter(
            Document.processed_at >= recent_cutoff
        ).count() if db.query(Document).filter(Document.processed_at.isnot(None)).count() > 0 else 0

        # Processing success rate
        total_documents = db.query(Document).count()
        completed_documents = db.query(Document).filter(
            Document.processing_status.in_(['completed', 'completed_no_vectors'])
        ).count()

        success_rate = (completed_documents / total_documents * 100) if total_documents > 0 else 0

        return {
            "total_documents": total_documents,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "total_chunks": total_chunks,
            "total_words": total_words,
            "recent_uploads_24h": recent_uploads,
            "recent_processed_24h": recent_processed,
            "processing_success_rate": round(success_rate, 2),
            "status_breakdown": {status: count for status, count in status_counts},
            "processing_breakdown": {status: count for status, count in processing_counts},
            "file_type_breakdown": {file_type: count for file_type, count in file_type_counts},
            "category_breakdown": {category or 'uncategorized': count for category, count in category_counts},
            "storage_info": {
                "upload_directory": settings.upload_dir,
                "storage_directory": settings.storage_path,
                "max_file_size_mb": settings.max_file_size / (1024 * 1024)
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting document stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/categories")
async def get_category_stats(db: Session = Depends(get_db)):
    """Get detailed statistics by category"""
    try:
        from sqlalchemy import func

        # Get category statistics
        category_stats = db.query(
            Document.category,
            func.count(Document.id).label('document_count'),
            func.sum(Document.file_size).label('total_size'),
            func.sum(Document.total_chunks).label('total_chunks'),
            func.sum(Document.word_count).label('total_words'),
            func.avg(Document.file_size).label('avg_file_size')
        ).group_by(Document.category).all()

        # Format results
        categories = []
        for stat in category_stats:
            categories.append({
                'category': stat.category or 'uncategorized',
                'document_count': stat.document_count,
                'total_size_bytes': stat.total_size or 0,
                'total_size_mb': round((stat.total_size or 0) / (1024 * 1024), 2),
                'total_chunks': stat.total_chunks or 0,
                'total_words': stat.total_words or 0,
                'avg_file_size_mb': round((stat.avg_file_size or 0) / (1024 * 1024), 2)
            })

        # Sort by document count descending
        categories.sort(key=lambda x: x['document_count'], reverse=True)

        return {
            "categories": categories,
            "total_categories": len(categories),
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting category stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/search/content")
async def search_document_content(
        query: str,
        limit: int = 10,
        category: Optional[str] = None,
        file_type: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Search through document content using database full-text search"""
    try:
        if not query.strip():
            raise HTTPException(status_code=400, detail="Search query cannot be empty")

        # Build search query for chunks
        search_term = f"%{query}%"
        chunk_query = db.query(DocumentChunk).filter(
            DocumentChunk.content.ilike(search_term)
        )

        # Join with documents for additional filtering
        from sqlalchemy.orm import joinedload
        chunk_query = chunk_query.options(joinedload(DocumentChunk.document))

        # Apply document filters if specified
        if category or file_type:
            chunk_query = chunk_query.join(Document)
            if category:
                chunk_query = chunk_query.filter(Document.category == category)
            if file_type:
                chunk_query = chunk_query.filter(Document.file_type == file_type)

        # Get results
        chunks = chunk_query.limit(limit * 2).all()  # Get more to allow for deduplication

        # Group by document and prepare results
        document_results = {}
        for chunk in chunks:
            doc_id = chunk.document_id
            if doc_id not in document_results:
                document = chunk.document if hasattr(chunk, 'document') else db.query(Document).get(doc_id)
                if document:
                    document_results[doc_id] = {
                        'document_id': doc_id,
                        'display_name': document.title or document.filename or f"Document {doc_id}",
                        'filename': document.filename,
                        'original_filename': document.original_filename,
                        'category': document.category,
                        'file_type': document.file_type,
                        'created_at': document.created_at.isoformat() if document.created_at else None,
                        'matching_chunks': [],
                        'relevance_score': 0
                    }

            if doc_id in document_results:
                snippet = get_search_snippet(chunk.content, query, 300)
                document_results[doc_id]['matching_chunks'].append({
                    'chunk_id': chunk.id,
                    'chunk_index': chunk.chunk_index,
                    'snippet': snippet,
                    'word_count': chunk.word_count,
                    'page_number': getattr(chunk, 'page_number', None)
                })
                # Simple relevance scoring based on number of matches
                document_results[doc_id]['relevance_score'] += chunk.content.lower().count(query.lower())

        # Sort by relevance and limit results
        results = list(document_results.values())
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
        results = results[:limit]

        return {
            "query": query,
            "total_results": len(results),
            "total_chunks_found": len(chunks),
            "results": results,
            "filters": {
                "category": category,
                "file_type": file_type
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching document content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint for document service"""
    try:
        # Check database connectivity
        total_docs = db.query(Document).count()

        # Check upload directory
        upload_dir = Path(settings.upload_dir)
        upload_dir_exists = upload_dir.exists()
        upload_dir_writable = upload_dir.exists() and os.access(upload_dir, os.W_OK)

        # Check disk space (basic check)
        disk_usage = None
        if upload_dir_exists:
            try:
                import shutil
                total, used, free = shutil.disk_usage(upload_dir)
                disk_usage = {
                    "total_gb": round(total / (1024**3), 2),
                    "used_gb": round(used / (1024**3), 2),
                    "free_gb": round(free / (1024**3), 2),
                    "usage_percent": round((used / total) * 100, 2)
                }
            except Exception:
                pass

        # Check processing status
        processing_docs = db.query(Document).filter(
            Document.processing_status == "processing"
        ).count()

        failed_docs = db.query(Document).filter(
            Document.processing_status == "failed"
        ).count()

        # Overall health status
        health_issues = []
        if not upload_dir_exists:
            health_issues.append("Upload directory does not exist")
        if not upload_dir_writable:
            health_issues.append("Upload directory is not writable")
        if disk_usage and disk_usage["usage_percent"] > 90:
            health_issues.append("Disk space is running low")
        if failed_docs > total_docs * 0.1:  # More than 10% failed
            health_issues.append("High number of processing failures")

        status = "healthy" if not health_issues else "warning"

        return {
            "status": status,
            "timestamp": datetime.utcnow().isoformat(),
            "database": {
                "connected": True,
                "total_documents": total_docs,
                "processing_documents": processing_docs,
                "failed_documents": failed_docs
            },
            "storage": {
                "upload_directory": str(upload_dir),
                "directory_exists": upload_dir_exists,
                "directory_writable": upload_dir_writable,
                "disk_usage": disk_usage
            },
            "supported_file_types": list(document_processor.supported_types.keys()),
            "settings": {
                "max_file_size_mb": settings.max_file_size / (1024 * 1024),
                "chunk_size": settings.chunk_size,
                "chunk_overlap": settings.chunk_overlap
            },
            "health_issues": health_issues
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "timestamp": datetime.utcnow().isoformat(),
            "error": str(e),
            "database": {"connected": False},
            "storage": {"upload_directory": str(settings.upload_dir), "directory_exists": False},
            "health_issues": ["Service health check failed"]
        }


# Utility function for creating the UploadHandler
def create_upload_handler():
    """Create a new upload handler instance"""
    return UploadHandler()


# Additional utility endpoints
@router.get("/supported-types")
async def get_supported_file_types():
    """Get list of supported file types with descriptions"""
    try:
        file_type_descriptions = {
            'pdf': 'Portable Document Format',
            'docx': 'Microsoft Word (Office Open XML)',
            'doc': 'Microsoft Word (Legacy)',
            'txt': 'Plain Text',
            'md': 'Markdown',
            'rtf': 'Rich Text Format',
            'csv': 'Comma-Separated Values',
            'json': 'JavaScript Object Notation',
            'xml': 'Extensible Markup Language',
            'html': 'HyperText Markup Language',
            'jpg': 'JPEG Image (with OCR)',
            'jpeg': 'JPEG Image (with OCR)',
            'png': 'PNG Image (with OCR)',
            'bmp': 'Bitmap Image (with OCR)',
            'tiff': 'TIFF Image (with OCR)',
            'gif': 'GIF Image (with OCR)'
        }

        supported_types = []
        for file_type in document_processor.supported_types.keys():
            supported_types.append({
                'extension': file_type,
                'description': file_type_descriptions.get(file_type, f'{file_type.upper()} format'),
                'supports_ocr': file_type in ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif']
            })

        return {
            "supported_types": supported_types,
            "total_types": len(supported_types),
            "ocr_enabled": settings.enable_ocr,
            "max_file_size_mb": settings.max_file_size / (1024 * 1024)
        }

    except Exception as e:
        logger.error(f"Error getting supported file types: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-file")
async def validate_file_upload(
        file: UploadFile = File(...),
        check_duplicates: bool = True,
        db: Session = Depends(get_db)
):
    """Validate a file before actual upload (useful for client-side validation)"""
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Check file type
        if not document_processor.is_supported(file.filename):
            file_extension = document_processor.get_file_type(file.filename)
            return {
                "valid": False,
                "issues": [f"File type '{file_extension}' is not supported"],
                "supported_types": list(document_processor.supported_types.keys())
            }

        # Check file size
        file_content = await file.read()
        if len(file_content) > settings.max_file_size:
            return {
                "valid": False,
                "issues": [f"File too large. Maximum size: {settings.max_file_size / (1024 * 1024):.1f}MB"],
                "file_size_mb": len(file_content) / (1024 * 1024)
            }

        issues = []
        warnings = []

        # Check for duplicates if requested
        if check_duplicates:
            import hashlib
            file_hash = hashlib.sha256(file_content).hexdigest()

            existing_doc = db.query(Document).filter(Document.file_hash == file_hash).first()
            if existing_doc:
                issues.append(f"File content already exists (Document ID: {existing_doc.id})")

            # Check filename duplicates
            existing_filename = db.query(Document).filter(
                (Document.filename == file.filename) |
                (Document.original_filename == file.filename)
            ).first()
            if existing_filename:
                warnings.append(f"Filename already exists (Document ID: {existing_filename.id})")

        # Check if filename is generic
        if document_processor.is_generic_filename(file.filename):
            warnings.append("Filename appears to be generic and will be renamed based on content")

        return {
            "valid": len(issues) == 0,
            "filename": file.filename,
            "file_size_mb": round(len(file_content) / (1024 * 1024), 2),
            "file_type": document_processor.get_file_type(file.filename),
            "is_generic_filename": document_processor.is_generic_filename(file.filename),
            "issues": issues,
            "warnings": warnings,
            "estimated_processing_time": estimate_processing_time(len(file_content), file.filename)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def estimate_processing_time(file_size_bytes: int, filename: str) -> dict:
    """Estimate processing time based on file size and type"""
    try:
        file_type = document_processor.get_file_type(filename)
        file_size_mb = file_size_bytes / (1024 * 1024)

        # Base processing times per MB (rough estimates)
        processing_times = {
            'pdf': 2,      # 2 seconds per MB
            'docx': 1,     # 1 second per MB
            'doc': 3,      # 3 seconds per MB (slower due to conversion)
            'txt': 0.1,    # Very fast
            'md': 0.2,     # Fast
            'rtf': 1,      # Moderate
            'csv': 0.5,    # Fast
            'json': 0.3,   # Fast
            'xml': 0.5,    # Fast
            'html': 0.5,   # Fast
            'jpg': 5,      # Slower due to OCR
            'jpeg': 5,     # Slower due to OCR
            'png': 5,      # Slower due to OCR
            'bmp': 6,      # Slower due to OCR
            'tiff': 7,     # Slower due to OCR
            'gif': 4       # Moderate OCR
        }

        base_time = processing_times.get(file_type, 2)
        estimated_seconds = max(1, int(file_size_mb * base_time))

        return {
            "estimated_seconds": estimated_seconds,
            "estimated_minutes": round(estimated_seconds / 60, 1),
            "file_type": file_type,
            "requires_ocr": file_type in ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif']
        }

    except Exception:
        return {
            "estimated_seconds": 30,
            "estimated_minutes": 0.5,
            "file_type": "unknown",
            "requires_ocr": False
        }



