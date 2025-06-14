import os
import logging
import asyncio
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.config.settings import settings
from app.models.database_models import Document, DocumentChunk
from app.services.document_processor import DocumentProcessor

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize PDF processor
pdf_processor = DocumentProcessor()


@router.post("/upload")
async def upload_pdf(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        category: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        auto_process: bool = Form(True),
        db: Session = Depends(get_db)
):
    """Upload a PDF file"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        # Check file type
        file_extension = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
        if file_extension not in settings.allowed_file_types:
            raise HTTPException(
                status_code=400,
                detail=f"File type '{file_extension}' not allowed. Allowed types: {settings.allowed_file_types}"
            )

        # Check file size
        file_content = await file.read()
        if len(file_content) > settings.max_file_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {settings.max_file_size / (1024 * 1024):.1f}MB"
            )

        # Reset file pointer
        await file.seek(0)

        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = "".join(c for c in file.filename if c.isalnum() or c in '._-')
        unique_filename = f"{timestamp}_{safe_filename}"

        # Save file - FIXED: Use proper storage path
        upload_dir = Path(settings.upload_dir)  # Use upload_dir instead of storage_path
        upload_dir.mkdir(parents=True, exist_ok=True)

        file_path = upload_dir / unique_filename

        logger.info(f"Saving file to: {file_path}")

        # Save file to disk
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        # Calculate file hash
        import hashlib
        file_hash = hashlib.sha256(content).hexdigest()

        # Check for duplicates
        existing_doc = db.query(Document).filter(Document.file_hash == file_hash).first()
        if existing_doc:
            # Remove the uploaded file since it's a duplicate
            os.remove(file_path)
            raise HTTPException(
                status_code=409,
                detail=f"File already exists: {existing_doc.filename}"
            )

        # Create database record
        pdf_doc = Document(
            filename=unique_filename,
            original_filename=file.filename,
            file_path=str(file_path),
            file_type=file_extension,
            file_size=len(content),
            file_hash=file_hash,
            category=category,
            description=description,
            status="uploaded",
            processing_status="pending" if auto_process else "manual"
        )

        db.add(pdf_doc)
        db.commit()
        db.refresh(pdf_doc)

        logger.info(f"File uploaded successfully: {pdf_doc.id}")

        # Schedule background processing if requested
        if auto_process:
            background_tasks.add_task(process_pdf_background, pdf_doc.id)

        return {
            "id": pdf_doc.id,
            "filename": pdf_doc.filename,
            "original_filename": pdf_doc.original_filename,
            "file_size": pdf_doc.file_size,
            "status": pdf_doc.status,
            "processing_status": pdf_doc.processing_status,
            "auto_process": auto_process,
            "message": "File uploaded successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving file: {e}")
        # Clean up file if it was created
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/list")
async def list_pdfs(
        skip: int = 0,
        limit: int = 100,
        status: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """List uploaded PDFs"""
    try:
        query = db.query(Document)

        if status:
            query = query.filter(Document.status == status)

        total = query.count()
        pdfs = query.offset(skip).limit(limit).all()

        return {
            "documents": [pdf.to_dict() for pdf in pdfs],
            "total": total,
            "skip": skip,
            "limit": limit
        }

    except Exception as e:
        logger.error(f"Error listing PDFs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pdf_id}")
async def get_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Get PDF by ID"""
    try:
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        return pdf.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{pdf_id}")
async def delete_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Delete PDF"""
    try:
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        # Delete file from disk
        if os.path.exists(pdf.file_path):
            os.remove(pdf.file_path)

        # Delete from database
        db.delete(pdf)
        db.commit()

        logger.info(f"PDF deleted: {pdf_id}")

        return {"message": "PDF deleted successfully", "id": pdf_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{pdf_id}/process")
async def process_pdf(
        pdf_id: int,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db)
):
    """Manually trigger PDF processing"""
    try:
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        if pdf.processing_status == "processing":
            raise HTTPException(status_code=409, detail="PDF is already being processed")

        # Update status
        pdf.processing_status = "processing"
        db.commit()

        # Schedule background processing
        background_tasks.add_task(process_pdf_background, pdf_id)

        return {
            "message": "PDF processing started",
            "id": pdf_id,
            "status": "processing"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting PDF processing {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def process_pdf_background(pdf_id: int):
    """Background task to process PDF using DocumentProcessor"""
    try:
        logger.info(f"Starting background processing for PDF {pdf_id}")

        from app.core.database import get_db_context
        from app.services.chroma_service import ChromaService

        with get_db_context() as db:
            pdf = db.query(Document).filter(Document.id == pdf_id).first()
            if not pdf:
                logger.error(f"PDF {pdf_id} not found")
                return

            pdf.processing_status = "processing"
            db.commit()

            try:
                # Initialize services
                document_processor = DocumentProcessor()
                chroma_service = ChromaService()
                await chroma_service.initialize()

                # Process document using DocumentProcessor
                chunks, metadata = document_processor.process_document(
                    file_path=pdf.file_path,
                    chunk_size=1000,
                    chunk_overlap=200
                )

                # Update PDF metadata
                pdf.total_pages = metadata.get("total_pages", 0)
                pdf.total_chunks = len(chunks)
                pdf.title = metadata.get("title", pdf.filename)
                pdf.file_hash = metadata.get("file_hash", "")
                pdf.processed_at = datetime.utcnow()

                # Store chunks in database
                for chunk in chunks:
                    db_chunk = DocumentChunk(
                        document_id=pdf_id,
                        content=chunk["content"],
                        chunk_index=chunk["chunk_index"],
                        page_number=metadata.get("page_number", 1),
                        word_count=chunk.get("word_count", 0),
                        char_count=chunk.get("char_count", 0)
                    )
                    db.add(db_chunk)

                # Store in ChromaDB
                documents = [chunk["content"] for chunk in chunks]
                metadatas = []
                ids = []

                for i, chunk in enumerate(chunks):
                    chunk_metadata = {
                        "pdf_id": pdf_id,
                        "document_id": pdf_id,
                        "filename": pdf.filename,
                        "title": pdf.title or pdf.filename,
                        "category": pdf.category or "uncategorized",
                        "chunk_index": chunk["chunk_index"],
                        "page_number": metadata.get("page_number", 1),
                        "word_count": chunk.get("word_count", 0),
                        "char_count": chunk.get("char_count", 0)
                    }
                    metadatas.append(chunk_metadata)
                    ids.append(f"pdf_{pdf_id}_chunk_{chunk['chunk_index']}")

                # Add to ChromaDB
                success = await chroma_service.add_documents(
                    documents=documents,
                    metadatas=metadatas,
                    ids=ids
                )

                if success:
                    pdf.processing_status = "completed"
                    pdf.status = "completed"
                    logger.info(f"PDF processing completed for {pdf_id}: {len(chunks)} chunks indexed")
                else:
                    pdf.processing_status = "failed"
                    pdf.status = "error"
                    logger.error(f"Failed to index PDF {pdf_id} in ChromaDB")

            except Exception as e:
                logger.error(f"Error processing PDF {pdf_id}: {e}")
                pdf.processing_status = "failed"
                pdf.status = "error"

            db.commit()


    except Exception as e:
        logger.error(f"Background processing failed for PDF {pdf_id}: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")

@router.get("/{pdf_id}/status")
async def get_pdf_status(pdf_id: int, db: Session = Depends(get_db)):
    """Get PDF processing status"""
    try:
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        return {
            "id": pdf.id,
            "filename": pdf.original_filename,
            "status": pdf.status,
            "processing_status": pdf.processing_status,
            "error_message": pdf.error_message,
            "created_at": pdf.created_at,
            "processed_at": pdf.processed_at,
            "total_chunks": pdf.total_chunks or 0
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PDF status {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{pdf_id}/reprocess")
async def reprocess_pdf(
        pdf_id: int,
        background_tasks: BackgroundTasks,
        force: bool = False,
        db: Session = Depends(get_db)
):
    """Reprocess a PDF (useful if processing failed)"""
    try:
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        if pdf.processing_status == "processing" and not force:
            raise HTTPException(
                status_code=409,
                detail="PDF is currently being processed. Use force=true to override."
            )

        # Reset status
        pdf.processing_status = "processing"
        pdf.status = "uploaded"
        pdf.error_message = None
        pdf.processed_at = None
        db.commit()

        # Schedule background processing
        background_tasks.add_task(process_pdf_background, pdf_id)

        return {
            "message": "PDF reprocessing started",
            "id": pdf_id,
            "status": "processing"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reprocessing PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{pdf_id}/download")
async def download_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Download original PDF file"""
    try:
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        if not os.path.exists(pdf.file_path):
            raise HTTPException(status_code=404, detail="PDF file not found on disk")

        from fastapi.responses import FileResponse
        return FileResponse(
            path=pdf.file_path,
            filename=pdf.original_filename,
            media_type='application/pdf'
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{pdf_id}/chunks")
async def get_pdf_chunks(
        pdf_id: int,
        skip: int = 0,
        limit: int = 50,
        db: Session = Depends(get_db)
):
    """Get chunks for a specific PDF"""
    try:
        from app.models.database_models import DocumentChunk

        # Verify PDF exists
        pdf = db.query(Document).filter(Document.id == pdf_id).first()
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        # Get chunks
        query = db.query(DocumentChunk).filter(DocumentChunk.document_id == pdf_id)
        total = query.count()
        chunks = query.offset(skip).limit(limit).all()

        return {
            "pdf_id": pdf_id,
            "chunks": [chunk.to_dict() for chunk in chunks],
            "total": total,
            "skip": skip,
            "limit": limit
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting chunks for PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk-upload")
async def bulk_upload_pdfs(
        background_tasks: BackgroundTasks,
        files: List[UploadFile] = File(...),
        category: Optional[str] = Form(None),
        auto_process: bool = Form(True),
        db: Session = Depends(get_db)
):
    """Upload multiple PDF files"""
    try:
        if len(files) > 10:  # Limit bulk uploads
            raise HTTPException(status_code=400, detail="Maximum 10 files allowed per bulk upload")

        results = []

        for file in files:
            try:
                # Validate file
                if not file.filename:
                    results.append({
                        "filename": "unknown",
                        "status": "error",
                        "error": "No filename provided"
                    })
                    continue

                file_extension = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
                if file_extension not in settings.allowed_file_types:
                    results.append({
                        "filename": file.filename,
                        "status": "error",
                        "error": f"File type '{file_extension}' not allowed"
                    })
                    continue

                # Check file size
                file_content = await file.read()
                if len(file_content) > settings.max_file_size:
                    results.append({
                        "filename": file.filename,
                        "status": "error",
                        "error": "File too large"
                    })
                    continue

                # Reset file pointer
                await file.seek(0)

                # Generate unique filename
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                safe_filename = "".join(c for c in file.filename if c.isalnum() or c in '._-')
                unique_filename = f"{timestamp}_{safe_filename}"

                # Save file
                upload_dir = Path(settings.upload_dir)
                upload_dir.mkdir(parents=True, exist_ok=True)
                file_path = upload_dir / unique_filename

                with open(file_path, "wb") as buffer:
                    content = await file.read()
                    buffer.write(content)

                # Calculate file hash
                import hashlib
                file_hash = hashlib.sha256(content).hexdigest()

                # Check for duplicates
                existing_doc = db.query(Document).filter(Document.file_hash == file_hash).first()
                if existing_doc:
                    os.remove(file_path)
                    results.append({
                        "filename": file.filename,
                        "status": "duplicate",
                        "existing_id": existing_doc.id,
                        "message": "File already exists"
                    })
                    continue

                # Create database record
                pdf_doc = Document(
                    filename=unique_filename,
                    original_filename=file.filename,
                    file_path=str(file_path),
                    file_type=file_extension,
                    file_size=len(content),
                    file_hash=file_hash,
                    category=category,
                    status="uploaded",
                    processing_status="pending" if auto_process else "manual"
                )

                db.add(pdf_doc)
                db.commit()
                db.refresh(pdf_doc)

                # Schedule background processing
                if auto_process:
                    background_tasks.add_task(process_pdf_background, pdf_doc.id)

                results.append({
                    "id": pdf_doc.id,
                    "filename": file.filename,
                    "status": "success",
                    "processing_status": pdf_doc.processing_status
                })

            except Exception as e:
                logger.error(f"Error processing file {file.filename}: {e}")
                results.append({
                    "filename": file.filename,
                    "status": "error",
                    "error": str(e)
                })

        # Summary
        successful = len([r for r in results if r["status"] == "success"])
        failed = len([r for r in results if r["status"] == "error"])
        duplicates = len([r for r in results if r["status"] == "duplicate"])

        return {
            "results": results,
            "summary": {
                "total": len(files),
                "successful": successful,
                "failed": failed,
                "duplicates": duplicates
            },
            "auto_process": auto_process
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk upload error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats/summary")
async def get_pdf_stats(db: Session = Depends(get_db)):
    """Get PDF statistics summary"""
    try:
        from sqlalchemy import func

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

        # Total size
        total_size = db.query(func.sum(Document.file_size)).scalar() or 0

        # Recent uploads (last 24 hours)
        from datetime import timedelta
        recent_cutoff = datetime.utcnow() - timedelta(hours=24)
        recent_uploads = db.query(Document).filter(
            Document.created_at >= recent_cutoff
        ).count()

        return {
            "total_documents": db.query(Document).count(),
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "recent_uploads_24h": recent_uploads,
            "status_breakdown": {status: count for status, count in status_counts},
            "processing_breakdown": {status: count for status, count in processing_counts},
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting PDF stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

