import hashlib
import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import shutil
from datetime import datetime
import logging

from app.core.database import get_db
from app.models.database_models import PDFDocument
from app.models.pdf_models import PDFResponse, PDFCreate, PDFUpdate, ProcessingStatus
from app.services.pdf_processor import PDFProcessor
from app.services.embedding_service import EmbeddingService
from app.config.settings import settings
from app.utils.file_utils import FileUtils

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=List[PDFResponse])
def list_pdfs(
        skip: int = 0,
        limit: int = 100,
        category: Optional[str] = None,
        status: Optional[ProcessingStatus] = None,
        db: Session = Depends(get_db)
):
    """List all PDFs with optional filtering"""
    query = db.query(PDFDocument)

    if category:
        query = query.filter(PDFDocument.category == category)

    if status:
        query = query.filter(PDFDocument.processing_status == status)

    pdfs = query.offset(skip).limit(limit).all()
    return pdfs


@router.post("/upload", response_model=PDFResponse)
async def upload_pdf(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        category: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Upload a new PDF file"""

    # Validate file
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    if file.size > settings.max_file_size:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit")

    try:
        # Generate safe filename
        safe_filename = FileUtils.get_safe_filename(file.filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{timestamp}_{safe_filename}"

        # Save file temporarily to calculate hash
        temp_file_path = os.path.join(settings.pdf_storage_path, f"temp_{unique_filename}")
        FileUtils.ensure_directory(settings.pdf_storage_path)

        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Validate PDF
        pdf_processor = PDFProcessor()
        is_valid, validation_message = pdf_processor.validate_pdf(temp_file_path)

        if not is_valid:
            os.remove(temp_file_path)  # Clean up
            raise HTTPException(status_code=400, detail=f"Invalid PDF: {validation_message}")

        # Get PDF metadata (including file hash)
        metadata = pdf_processor.get_pdf_metadata(temp_file_path)
        file_hash = metadata["file_hash"]

        # Check if file already exists in database
        existing_pdf = db.query(PDFDocument).filter(PDFDocument.file_hash == file_hash).first()

        if existing_pdf:
            # Remove temporary file
            os.remove(temp_file_path)

            # Update existing PDF metadata if provided
            updated = False
            if title and title != existing_pdf.title:
                existing_pdf.title = title
                updated = True
            if category and category != existing_pdf.category:
                existing_pdf.category = category
                updated = True
            if description and description != existing_pdf.description:
                existing_pdf.description = description
                updated = True

            if updated:
                existing_pdf.updated_at = datetime.utcnow()
                db.commit()
                db.refresh(existing_pdf)

            return {
                **existing_pdf.__dict__,
                "message": "File already exists in database",
                "is_duplicate": True
            }

        # Move temp file to final location
        final_file_path = os.path.join(settings.pdf_storage_path, unique_filename)
        shutil.move(temp_file_path, final_file_path)

        # Create database record
        pdf_doc = PDFDocument(
            filename=file.filename,
            file_path=final_file_path,
            file_size=metadata["file_size"],
            file_hash=file_hash,
            title=title or metadata.get("title"),
            author=metadata.get("author"),
            subject=metadata.get("subject"),
            category=category,
            description=description,
            total_pages=metadata["total_pages"],
            processing_status=ProcessingStatus.PENDING
        )

        db.add(pdf_doc)
        db.commit()
        db.refresh(pdf_doc)

        # Schedule background processing
        background_tasks.add_task(process_pdf_background, pdf_doc.id)

        return pdf_doc

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error uploading PDF: {e}")
        # Clean up files if they were created
        for file_path in [temp_file_path if 'temp_file_path' in locals() else None,
                          final_file_path if 'final_file_path' in locals() else None]:
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass
        raise HTTPException(status_code=500, detail="Failed to upload PDF")


@router.post("/check-duplicate")
async def check_duplicate(
        file: UploadFile = File(...),
        db: Session = Depends(get_db)
):
    """Check if a PDF file already exists in the database"""

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        # Calculate file hash
        file_content = await file.read()
        file_hash = hashlib.md5(file_content).hexdigest()

        # Reset file pointer
        await file.seek(0)

        # Check if exists
        existing_pdf = db.query(PDFDocument).filter(PDFDocument.file_hash == file_hash).first()

        if existing_pdf:
            return {
                "is_duplicate": True,
                "existing_pdf": {
                    "id": existing_pdf.id,
                    "filename": existing_pdf.filename,
                    "title": existing_pdf.title,
                    "upload_date": existing_pdf.created_at,
                    "processing_status": existing_pdf.processing_status
                }
            }
        else:
            return {
                "is_duplicate": False,
                "message": "File is new and can be uploaded"
            }

    except Exception as e:
        logger.error(f"Error checking duplicate: {e}")
        raise HTTPException(status_code=500, detail="Failed to check for duplicate")

@router.get("/", response_model=List[PDFResponse])
def list_pdfs(
        skip: int = 0,
        limit: int = 100,
        category: Optional[str] = None,
        status: Optional[ProcessingStatus] = None,
        db: Session = Depends(get_db)
):
    """List all PDFs with optional filtering"""
    query = db.query(PDFDocument)

    if category:
        query = query.filter(PDFDocument.category == category)

    if status:
        query = query.filter(PDFDocument.processing_status == status)

    pdfs = query.offset(skip).limit(limit).all()
    return pdfs


@router.get("/{pdf_id}", response_model=PDFResponse)
def get_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Get PDF by ID"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return pdf


@router.put("/{pdf_id}", response_model=PDFResponse)
def update_pdf(
        pdf_id: int,
        pdf_update: PDFUpdate,
        db: Session = Depends(get_db)
):
    """Update PDF metadata"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    update_data = pdf_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pdf, field, value)

    db.commit()
    db.refresh(pdf)
    return pdf


@router.delete("/{pdf_id}")
async def delete_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Delete PDF and all associated data"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    try:
        # Delete embeddings
        embedding_service = EmbeddingService()
        await embedding_service.delete_pdf_embeddings(pdf_id)

        # Delete file
        if os.path.exists(pdf.file_path):
            os.remove(pdf.file_path)

        # Delete database record
        db.delete(pdf)
        db.commit()

        return {"message": "PDF deleted successfully"}

    except Exception as e:
        logger.error(f"Error deleting PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete PDF")


@router.post("/{pdf_id}/reprocess")
async def reprocess_pdf(
        pdf_id: int,
        background_tasks: BackgroundTasks,
        db: Session = Depends(get_db)
):
    """Reprocess PDF (regenerate embeddings)"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not os.path.exists(pdf.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    try:
        # Update status
        pdf.processing_status = ProcessingStatus.PENDING
        pdf.processing_error = None
        db.commit()

        # Schedule reprocessing
        background_tasks.add_task(process_pdf_background, pdf_id)

        return {"message": "PDF reprocessing scheduled", "pdf_id": pdf_id}

    except Exception as e:
        logger.error(f"Error scheduling reprocessing for PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to schedule reprocessing")


@router.get("/{pdf_id}/view")
async def view_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Get PDF file for viewing"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not os.path.exists(pdf.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    from fastapi.responses import FileResponse
    return FileResponse(
        pdf.file_path,
        media_type="application/pdf",
        filename=pdf.filename
    )


@router.post("/{pdf_id}/test-process")
async def test_process_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Test PDF processing without background tasks"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    if not os.path.exists(pdf.file_path):
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    try:
        # Test the PDF processor directly
        pdf_processor = PDFProcessor()

        # Test validation
        is_valid, validation_message = pdf_processor.validate_pdf(pdf.file_path)
        if not is_valid:
            return {"error": f"PDF validation failed: {validation_message}"}

        # Test text extraction
        pages_text = pdf_processor.extract_text_from_pdf(pdf.file_path)
        if not pages_text:
            return {"error": "No text extracted from PDF"}

        # Test chunk creation
        chunks = pdf_processor.process_pdf_to_chunks(pdf.file_path)
        if not chunks:
            return {"error": "No chunks created from PDF"}

        return {
            "success": True,
            "pages_extracted": len(pages_text),
            "chunks_created": len(chunks),
            "sample_chunk": chunks[0] if chunks else None,
            "sample_text": pages_text[0]["text"][:200] if pages_text else None
        }

    except Exception as e:
        logger.error(f"Test processing error: {e}")
        return {"error": str(e)}


@router.get("/{pdf_id}/chunks")
def get_pdf_chunks(pdf_id: int, db: Session = Depends(get_db)):
    """Get all chunks for a PDF (for debugging)"""
    from app.models.database_models import PDFChunk

    chunks = db.query(PDFChunk).filter(PDFChunk.pdf_id == pdf_id).all()

    return {
        "pdf_id": pdf_id,
        "total_chunks": len(chunks),
        "chunks": [
            {
                "chunk_id": chunk.chunk_id,
                "page_number": chunk.page_number,
                "chunk_index": chunk.chunk_index,
                "text_preview": chunk.text_content[:200] + "..." if len(
                    chunk.text_content) > 200 else chunk.text_content,
                "char_count": chunk.char_count,
                "word_count": chunk.word_count
            }
            for chunk in chunks
        ]
    }

@router.get("/{pdf_id}/status")
def get_processing_status(pdf_id: int, db: Session = Depends(get_db)):
    """Get processing status for a PDF"""
    pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    return {
        "pdf_id": pdf_id,
        "status": pdf.processing_status,
        "total_pages": pdf.total_pages,
        "total_chunks": pdf.total_chunks,
        "processing_started_at": pdf.processing_started_at,
        "processing_completed_at": pdf.processing_completed_at,
        "error": pdf.processing_error,
        "is_searchable": pdf.is_searchable
    }


# Background task function
async def process_pdf_background(pdf_id: int):
    """Background task to process PDF and generate embeddings"""
    from app.core.database import SessionLocal
    from app.models.database_models import PDFChunk
    import json

    db = SessionLocal()
    try:
        # Get PDF record
        pdf = db.query(PDFDocument).filter(PDFDocument.id == pdf_id).first()
        if not pdf:
            logger.error(f"PDF {pdf_id} not found for processing")
            return

        # Update status
        pdf.processing_status = "processing"  # Changed from ProcessingStatus.PROCESSING
        pdf.processing_started_at = datetime.utcnow()
        pdf.processing_error = None
        db.commit()

        logger.info(f"Starting processing for PDF {pdf_id}: {pdf.filename}")

        # Process PDF
        pdf_processor = PDFProcessor()
        chunks = pdf_processor.process_pdf_to_chunks(pdf.file_path)

        if not chunks:
            raise Exception("No text content extracted from PDF")

        # Delete existing chunks
        db.query(PDFChunk).filter(PDFChunk.pdf_id == pdf_id).delete()
        db.commit()

        # Store chunk records in database
        for chunk in chunks:
            chunk_id = f"pdf_{pdf_id}_page_{chunk['page_number']}_chunk_{chunk['chunk_index']}"

            db_chunk = PDFChunk(
                pdf_id=pdf_id,
                chunk_id=chunk_id,
                page_number=chunk["page_number"],
                chunk_index=chunk["chunk_index"],
                position=json.dumps(chunk["position"]),
                text_content=chunk["text"],
                char_count=chunk["char_count"],
                word_count=chunk["word_count"],
                keywords=json.dumps(chunk["keywords"])
            )
            db.add(db_chunk)

        # Update PDF record
        pdf.processing_status = "completed"  # Changed from ProcessingStatus.COMPLETED
        pdf.processing_completed_at = datetime.utcnow()
        pdf.total_chunks = len(chunks)
        pdf.is_searchable = True
        pdf.last_indexed_at = datetime.utcnow()

        db.commit()
        logger.info(f"Successfully processed PDF {pdf_id} with {len(chunks)} chunks")

    except Exception as e:
        logger.error(f"Error processing PDF {pdf_id}: {e}")

        # Update error status
        if 'pdf' in locals() and pdf:
            pdf.processing_status = "failed"  # Changed from ProcessingStatus.FAILED
            pdf.processing_error = str(e)
            pdf.processing_completed_at = datetime.utcnow()
            db.commit()

    finally:
        db.close()