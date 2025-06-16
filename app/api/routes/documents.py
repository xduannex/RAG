import os
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.database_models import Document as Document, DocumentChunk
from app.services.document_processor import DocumentProcessor
from app.services.chroma_service import ChromaService
from app.config.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize services
document_processor = DocumentProcessor()
chroma_service = ChromaService()


def validate_file_type(filename: str) -> bool:
    """Validate if file type is supported"""
    file_extension = filename.lower().split('.')[-1]
    return file_extension in settings.allowed_file_types


def validate_file_size(file_size: int) -> bool:
    """Validate file size"""
    return file_size <= settings.max_file_size


@router.post("/upload")
async def upload_document(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        title: Optional[str] = Form(None),
        category: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        auto_process: bool = Form(True),
        db: Session = Depends(get_db)
):
    """Upload a document of any supported type"""

    try:
        # Validate file type
        if not validate_file_type(file.filename):
            raise HTTPException(
                status_code=400,
                detail=f"File type not supported. Supported types: {settings.allowed_file_types}"
            )

        # Read file content to check size
        file_content = await file.read()
        if not validate_file_size(len(file_content)):
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {settings.max_file_size} bytes"
            )

        # Reset file pointer
        await file.seek(0)

        # Create upload directory if it doesn't exist
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)

        # Generate unique filename
        import uuid
        file_extension = file.filename.split('.')[-1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(upload_dir, unique_filename)

        # Save file
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)

        logger.info(f"File saved: {file_path}")

        # Get file type
        file_type = document_processor.get_file_type(file_path)

        # Create database record
        document = Document(
            filename=unique_filename,
            original_filename=file.filename,
            file_path=file_path,
            file_type=file_type,
            file_size=len(file_content),
            title=title or file.filename,
            category=category,
            description=description,
            status="uploaded",
            processing_status="pending"
        )

        db.add(document)
        db.commit()
        db.refresh(document)

        logger.info(f"Document record created with ID: {document.id}")

        # Process document in background if requested
        if auto_process:
            background_tasks.add_task(process_document_background, document.id)

        return {
            "message": "Document uploaded successfully",
            "document_id": document.id,
            "filename": file.filename,
            "file_type": file_type,
            "size": len(file_content),
            "auto_process": auto_process
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        # Clean up file if it was created
        if 'file_path' in locals() and os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/")
async def list_documents(
        skip: int = 0,
        limit: int = 100,
        file_type: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """List all documents with optional filtering"""

    try:
        query = db.query(Document)

        # Apply filters
        if file_type:
            query = query.filter(Document.file_type == file_type)
        if category:
            query = query.filter(Document.category == category)
        if status:
            query = query.filter(Document.status == status)

        # Get total count
        total = query.count()

        # Apply pagination
        documents = query.offset(skip).limit(limit).all()

        # Format response
        document_list = []
        for doc in documents:
            document_list.append({
                "id": doc.id,
                "filename": doc.original_filename,
                "file_type": doc.file_type,
                "file_size": doc.file_size,
                "title": doc.title,
                "category": doc.category,
                "description": doc.description,
                "status": doc.status,
                "processing_status": doc.processing_status,
                "is_processed": doc.is_processed,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
                "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
                "word_count": doc.word_count,
                "total_chunks": doc.total_chunks,
                "metadata": doc.metadata
            })

        return {
            "documents": document_list,
            "total": total,
            "skip": skip,
            "limit": limit,
            "filters": {
                "file_type": file_type,
                "category": category,
                "status": status
            }
        }

    except Exception as e:
        logger.error(f"Error listing documents: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list documents: {str(e)}")


@router.get("/{document_id}")
async def get_document(document_id: int, db: Session = Depends(get_db)):
    """Get document details by ID"""

    try:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Get chunks count
        chunks_count = db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).count()

        return {
            "id": document.id,
            "filename": document.original_filename,
            "file_type": document.file_type,
            "file_size": document.file_size,
            "file_hash": document.file_hash,
            "title": document.title,
            "author": document.author,
            "subject": document.subject,
            "creator": document.creator,
            "category": document.category,
            "description": document.description,
            "keywords": document.keywords,
            "total_pages": document.total_pages,
            "total_chunks": document.total_chunks,
            "word_count": document.word_count,
            "char_count": document.char_count,
            "chunks_in_db": chunks_count,
            "status": document.status,
            "processing_status": document.processing_status,
            "error_message": document.error_message,
            "is_processed": document.is_processed,
            "is_searchable": document.is_searchable,
            "created_at": document.created_at.isoformat() if document.created_at else None,
            "updated_at": document.updated_at.isoformat() if document.updated_at else None,
            "processed_at": document.processed_at.isoformat() if document.processed_at else None,
            "metadata": document.metadata
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get document: {str(e)}")


@router.post("/{document_id}/process")
async def process_document(
        document_id: int,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db)
):
    """Manually trigger document processing"""

    try:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if document.processing_status == "processing":
            raise HTTPException(status_code=400, detail="Document is already being processed")

        # Update status
        document.processing_status = "processing"
        db.commit()

        # Start background processing
        background_tasks.add_task(process_document_background, document_id)

        return {
            "message": "Document processing started",
            "document_id": document_id,
            "status": "processing"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting document processing: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start processing: {str(e)}")


@router.delete("/{document_id}")
async def delete_document(document_id: int, db: Session = Depends(get_db)):
    """Delete a document and its associated data"""

    try:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Delete from vector store
        try:
            await chroma_service.delete_documents(document_id)
        except Exception as e:
            logger.warning(f"Error deleting from vector store: {e}")

        # Delete chunks from database
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()

        # Delete file from filesystem
        if os.path.exists(document.file_path):
            try:
                os.remove(document.file_path)
                logger.info(f"Deleted file: {document.file_path}")
            except Exception as e:
                logger.warning(f"Could not delete file {document.file_path}: {e}")

        # Delete document record
        db.delete(document)
        db.commit()

        return {
            "message": "Document deleted successfully",
            "document_id": document_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


@router.get("/{document_id}/chunks")
async def get_document_chunks(
        document_id: int,
        skip: int = 0,
        limit: int = 50,
        db: Session = Depends(get_db)
):
    """Get chunks for a specific document"""

    try:
        # Check if document exists
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Get chunks
        query = db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id)
        total = query.count()
        chunks = query.offset(skip).limit(limit).all()

        chunk_list = []
        for chunk in chunks:
            chunk_list.append({
                "id": chunk.id,
                "chunk_index": chunk.chunk_index,
                "content": chunk.content,
                "word_count": chunk.word_count,
                "char_count": chunk.char_count,
                "page_number": chunk.page_number,
                "created_at": chunk.created_at.isoformat() if chunk.created_at else None
            })

        return {
            "document_id": document_id,
            "chunks": chunk_list,
            "total": total,
            "skip": skip,
            "limit": limit
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting chunks for document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get chunks: {str(e)}")


@router.get("/stats/overview")
async def get_documents_stats(db: Session = Depends(get_db)):
    """Get overview statistics for all documents"""

    try:
        # Total documents
        total_documents = db.query(Document).count()

        # Documents by type
        from sqlalchemy import func
        type_stats = db.query(
            Document.file_type,
            func.count(Document.id).label('count')
        ).group_by(Document.file_type).all()

        # Documents by status
        status_stats = db.query(
            Document.status,
            func.count(Document.id).label('count')
        ).group_by(Document.status).all()

        # Processing status
        processing_stats = db.query(
            Document.processing_status,
            func.count(Document.id).label('count')
        ).group_by(Document.processing_status).all()

        # Total storage used
        total_size = db.query(func.sum(Document.file_size)).scalar() or 0

        # Total chunks
        total_chunks = db.query(DocumentChunk).count()

        # Recent uploads (last 7 days)
        from datetime import datetime, timedelta
        week_ago = datetime.utcnow() - timedelta(days=7)
        recent_uploads = db.query(Document).filter(Document.created_at >= week_ago).count()

        return {
            "total_documents": total_documents,
            "total_storage_bytes": total_size,
            "total_chunks": total_chunks,
            "recent_uploads_7days": recent_uploads,
            "by_file_type": {item.file_type: item.count for item in type_stats},
            "by_status": {item.status: item.count for item in status_stats},
            "by_processing_status": {item.processing_status: item.count for item in processing_stats},
            "supported_types": settings.allowed_file_types
        }

    except Exception as e:
        logger.error(f"Error getting document stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.get("/{document_id}/view")
async def view_document(document_id: int, db: Session = Depends(get_db)):
    """Get document content for viewing"""

    try:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if not os.path.exists(document.file_path):
            raise HTTPException(status_code=404, detail="Document file not found")

        # Get document content based on file type
        content = ""
        file_type = document.file_type.lower()

        try:
            if file_type == "txt":
                with open(document.file_path, 'r', encoding='utf-8') as f:
                    content = f.read()

            elif file_type == "pdf":
                # Extract text from PDF
                import PyPDF2
                with open(document.file_path, 'rb') as f:
                    pdf_reader = PyPDF2.PdfReader(f)
                    content = ""
                    for page_num, page in enumerate(pdf_reader.pages):
                        page_text = page.extract_text()
                        content += f"\n--- Page {page_num + 1} ---\n{page_text}\n"

            elif file_type in ["doc", "docx"]:
                # Extract text from Word documents
                from docx import Document as DocxDocument
                doc = DocxDocument(document.file_path)
                paragraphs = []
                for para in doc.paragraphs:
                    if para.text.strip():
                        paragraphs.append(para.text)
                content = "\n\n".join(paragraphs)

            else:
                raise HTTPException(status_code=400, detail=f"File type {file_type} not supported for viewing")

        except Exception as e:
            logger.error(f"Error extracting content from document {document_id}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to extract document content: {str(e)}")

        return {
            "document_id": document.id,
            "filename": document.original_filename,
            "title": document.title,
            "file_type": document.file_type,
            "content": content,
            "word_count": document.word_count,
            "total_pages": document.total_pages,
            "created_at": document.created_at.isoformat() if document.created_at else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error viewing document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to view document: {str(e)}")


@router.get("/{document_id}/download")
async def download_document(document_id: int, db: Session = Depends(get_db)):
    """Download original document file"""
    from fastapi.responses import FileResponse

    try:
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        if not os.path.exists(document.file_path):
            raise HTTPException(status_code=404, detail="Document file not found")

        return FileResponse(
            path=document.file_path,
            filename=document.original_filename,
            media_type='application/octet-stream'
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to download document: {str(e)}")

# Fixed background processing function
async def process_document_background(document_id: int):
    """Background task to process a document"""
    # Import here to avoid circular imports
    from app.core.database import SessionLocal

    db = None
    try:
        # Create database session
        db = SessionLocal()

        # Get document
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            logger.error(f"Document {document_id} not found for processing")
            return

        logger.info(
            f"Starting background processing for document {document_id}: {document.original_filename}")

        # Update status
        document.processing_status = "processing"
        db.commit()

        # Process the document
        chunks, metadata = document_processor.process_document(
            document.file_path,
            chunk_size=1000,
            chunk_overlap=200
        )

        logger.info(f"Document processed: {len(chunks)} chunks created")

        # Update document with metadata
        document.file_hash = metadata.get("file_hash")
        document.word_count = metadata.get("word_count", 0)
        document.char_count = sum(chunk.get("char_count", 0) for chunk in chunks)
        document.total_chunks = len(chunks)
        document.keywords = metadata.get("keywords", [])
        document.metadata = metadata

        # Extract additional metadata based on file type
        if document.file_type == "pdf":
            document.total_pages = metadata.get("total_pages")
        elif document.file_type in ["docx", "doc"]:
            document.total_pages = metadata.get("paragraph_count")

        # Set author, title, etc. if available in metadata
        if not document.title or document.title == document.original_filename:
            document.title = metadata.get("title") or document.original_filename

        if not document.author:
            document.author = metadata.get("author")

        if not document.subject:
            document.subject = metadata.get("subject")

        # Save chunks to database
        for chunk_data in chunks:
            chunk = DocumentChunk(
                document_id=document_id,
                chunk_index=chunk_data["chunk_index"],
                content=chunk_data["content"],
                word_count=chunk_data["word_count"],
                char_count=chunk_data["char_count"],
                page_number=chunk_data.get("page_number")
            )
            db.add(chunk)

        # Initialize ChromaDB if not already done
        await chroma_service.initialize()

        # Add to vector store
        documents_for_vector = []
        metadatas_for_vector = []
        ids_for_vector = []

        for i, chunk_data in enumerate(chunks):
            documents_for_vector.append(chunk_data["content"])
            metadatas_for_vector.append({
                "document_id": document_id,
                "chunk_index": i,
                "file_type": document.file_type,
                "filename": document.original_filename,
                "title": document.title or "",
                "category": document.category or "",
                "page_number": chunk_data.get("page_number", 0)
            })
            ids_for_vector.append(f"doc_{document_id}_chunk_{i}")

        # Add to ChromaDB
        success = await chroma_service.add_documents(
            documents=documents_for_vector,
            metadatas=metadatas_for_vector,
            ids=ids_for_vector
        )

        if success:
            # Update document status
            document.status = "completed"
            document.processing_status = "completed"
            document.is_processed = True
            document.is_searchable = True
            document.processed_at = func.now()
            document.error_message = None

            logger.info(f"Document {document_id} processed successfully")
        else:
            raise Exception("Failed to add documents to vector store")

        db.commit()

    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")

        if db:
            try:
                # Update document with error status
                document = db.query(Document).filter(Document.id == document_id).first()
                if document:
                    document.status = "failed"
                    document.processing_status = "failed"
                    document.error_message = str(e)
                    db.commit()
            except Exception as commit_error:
                logger.error(f"Error updating document status: {commit_error}")

    finally:
        if db:
            db.close()

    # Additional utility functions for document processing
    def get_file_extension(filename: str) -> str:
        """Get file extension from filename"""
        return filename.lower().split('.')[-1] if '.' in filename else ''

    def generate_unique_filename(original_filename: str) -> str:
        """Generate unique filename while preserving extension"""
        import uuid
        file_extension = get_file_extension(original_filename)
        return f"{uuid.uuid4()}.{file_extension}"

    def calculate_file_hash(file_path: str) -> str:
        """Calculate SHA-256 hash of file"""
        import hashlib

        hash_sha256 = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Error calculating file hash: {e}")
            return ""

    # Batch processing endpoints
    @router.post("/batch/upload")
    async def batch_upload_documents(
            background_tasks: BackgroundTasks,
            files: List[UploadFile] = File(...),
            category: Optional[str] = Form(None),
            description: Optional[str] = Form(None),
            auto_process: bool = Form(True),
            db: Session = Depends(get_db)
    ):
        """Upload multiple documents at once"""

        if len(files) > 50:  # Limit batch size
            raise HTTPException(status_code=400, detail="Too many files. Maximum 50 files per batch.")

        results = []
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)

        for file in files:
            try:
                # Validate file
                if not validate_file_type(file.filename):
                    results.append({
                        "filename": file.filename,
                        "status": "failed",
                        "error": f"Unsupported file type"
                    })
                    continue

                # Read and validate size
                file_content = await file.read()
                if not validate_file_size(len(file_content)):
                    results.append({
                        "filename": file.filename,
                        "status": "failed",
                        "error": "File too large"
                    })
                    continue

                # Save file
                unique_filename = generate_unique_filename(file.filename)
                file_path = os.path.join(upload_dir, unique_filename)

                with open(file_path, "wb") as buffer:
                    buffer.write(file_content)

                # Get file type
                file_type = document_processor.get_file_type(file_path)

                # Create database record
                document = Document(
                    filename=unique_filename,
                    original_filename=file.filename,
                    file_path=file_path,
                    file_type=file_type,
                    file_size=len(file_content),
                    title=file.filename,
                    category=category,
                    description=description,
                    status="uploaded",
                    processing_status="pending"
                )

                db.add(document)
                db.commit()
                db.refresh(document)

                # Schedule processing
                if auto_process:
                    background_tasks.add_task(process_document_background, document.id)

                results.append({
                    "filename": file.filename,
                    "document_id": document.id,
                    "status": "uploaded",
                    "file_type": file_type,
                    "size": len(file_content)
                })

                logger.info(f"Batch uploaded: {file.filename} -> {document.id}")

            except Exception as e:
                logger.error(f"Error uploading {file.filename}: {e}")
                results.append({
                    "filename": file.filename,
                    "status": "failed",
                    "error": str(e)
                })

        successful_uploads = len([r for r in results if r["status"] == "uploaded"])

        return {
            "message": f"Batch upload completed: {successful_uploads}/{len(files)} files uploaded",
            "results": results,
            "total_files": len(files),
            "successful_uploads": successful_uploads,
            "auto_process": auto_process
        }

    @router.post("/batch/process")
    async def batch_process_documents(
            background_tasks: BackgroundTasks,
            document_ids: List[int],
            db: Session = Depends(get_db)
    ):
        """Process multiple documents"""

        if len(document_ids) > 20:  # Limit batch processing
            raise HTTPException(status_code=400, detail="Too many documents. Maximum 20 documents per batch.")

        results = []

        for doc_id in document_ids:
            try:
                document = db.query(Document).filter(Document.id == doc_id).first()

                if not document:
                    results.append({
                        "document_id": doc_id,
                        "status": "failed",
                        "error": "Document not found"
                    })
                    continue

                if document.processing_status == "processing":
                    results.append({
                        "document_id": doc_id,
                        "status": "skipped",
                        "error": "Already processing"
                    })
                    continue

                # Update status and schedule processing
                document.processing_status = "processing"
                db.commit()

                background_tasks.add_task(process_document_background, doc_id)

                results.append({
                    "document_id": doc_id,
                    "filename": document.original_filename,
                    "status": "scheduled"
                })

            except Exception as e:
                logger.error(f"Error scheduling processing for document {doc_id}: {e}")
                results.append({
                    "document_id": doc_id,
                    "status": "failed",
                    "error": str(e)
                })

        scheduled_count = len([r for r in results if r["status"] == "scheduled"])

        return {
            "message": f"Batch processing scheduled: {scheduled_count}/{len(document_ids)} documents",
            "results": results,
            "total_documents": len(document_ids),
            "scheduled_processing": scheduled_count
        }

    @router.delete("/batch/delete")
    async def batch_delete_documents(
            document_ids: List[int],
            db: Session = Depends(get_db)
    ):
        """Delete multiple documents"""

        if len(document_ids) > 50:  # Limit batch deletion
            raise HTTPException(status_code=400, detail="Too many documents. Maximum 50 documents per batch.")

        results = []

        for doc_id in document_ids:
            try:
                document = db.query(Document).filter(Document.id == doc_id).first()

                if not document:
                    results.append({
                        "document_id": doc_id,
                        "status": "failed",
                        "error": "Document not found"
                    })
                    continue

                # Delete from vector store
                try:
                    await chroma_service.delete_documents(doc_id)
                except Exception as e:
                    logger.warning(f"Error deleting from vector store: {e}")

                # Delete chunks
                db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).delete()

                # Delete file
                if document.file_path and os.path.exists(document.file_path):
                    try:
                        os.remove(document.file_path)
                    except Exception as e:
                        logger.warning(f"Could not delete file {document.file_path}: {e}")

                # Delete document record
                filename = document.original_filename
                db.delete(document)
                db.commit()

                results.append({
                    "document_id": doc_id,
                    "filename": filename,
                    "status": "deleted"
                })

            except Exception as e:
                logger.error(f"Error deleting document {doc_id}: {e}")
                results.append({
                    "document_id": doc_id,
                    "status": "failed",
                    "error": str(e)
                })

        deleted_count = len([r for r in results if r["status"] == "deleted"])

        return {
            "message": f"Batch deletion completed: {deleted_count}/{len(document_ids)} documents deleted",
            "results": results,
            "total_documents": len(document_ids),
            "deleted_documents": deleted_count
        }

    # Health check endpoint for documents service
    @router.get("/health")
    async def documents_health_check(db: Session = Depends(get_db)):
        """Health check for documents service"""
        try:
            # Test database connection
            total_docs = db.query(Document).count()

            # Test document processor
            processor_status = "ok" if document_processor else "error"

            # Test chroma service
            chroma_status = "ok"
            try:
                await chroma_service.initialize()
            except Exception:
                chroma_status = "error"

            return {
                "status": "healthy",
                "database": "connected",
                "total_documents": total_docs,
                "document_processor": processor_status,
                "vector_store": chroma_status,
                "supported_types": settings.allowed_file_types
            }

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")

