from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import os
import mimetypes

from app.core.database import get_db, logger
from app.models.database_models import Document  # Changed from PDFDocument to Document
from app.config.settings import settings

router = APIRouter()

@router.get("/")
async def list_pdfs(
    db: Session = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    status: Optional[str] = None
):
    """List all documents with optional filtering"""
    try:
        query = db.query(Document)

        # Apply filters
        if category:
            query = query.filter(Document.category == category)

        if status:
            query = query.filter(Document.status == status)

        # Get total count
        total = query.count()

        # Apply pagination and order by created_at desc
        documents = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()

        # Format response
        doc_list = []
        for doc in documents:
            doc_dict = {
                "id": doc.id,
                "title": doc.title or doc.original_filename,
                "filename": doc.filename,
                "original_filename": doc.original_filename,
                "file_type": doc.file_type,
                "category": doc.category,
                "description": doc.description,
                "total_pages": doc.total_pages,
                "file_size": doc.file_size,
                "status": doc.status,
                "processing_status": doc.processing_status,
                "word_count": doc.word_count,
                "total_chunks": doc.total_chunks,
                "processed": doc.status == "completed",
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
                "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
                "processed_at": doc.processed_at.isoformat() if doc.processed_at else None
            }
            doc_list.append(doc_dict)

        return {
            "pdfs": doc_list,  # Keep "pdfs" for frontend compatibility
            "documents": doc_list,  # Also provide "documents" key
            "total": total,
            "skip": skip,
            "limit": limit,
            "count": len(doc_list)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve documents: {str(e)}")

@router.get("/{doc_id}")
async def get_document_info(
    doc_id: int,
    db: Session = Depends(get_db)
):
    """Get document metadata by ID"""
    try:
        document = db.query(Document).filter(Document.id == doc_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        return {
            "id": document.id,
            "title": document.title or document.original_filename,
            "filename": document.filename,
            "original_filename": document.original_filename,
            "file_type": document.file_type,
            "category": document.category,
            "description": document.description,
            "total_pages": document.total_pages,
            "file_size": document.file_size,
            "status": document.status,
            "processing_status": document.processing_status,
            "word_count": document.word_count,
            "total_chunks": document.total_chunks,
            "text_quality_score": document.text_quality_score,
            "ocr_confidence": document.ocr_confidence,
            "error_message": document.error_message,
            "processed": document.status == "completed",
            "created_at": document.created_at.isoformat() if document.created_at else None,
            "updated_at": document.updated_at.isoformat() if document.updated_at else None,
            "processed_at": document.processed_at.isoformat() if document.processed_at else None
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve document info: {str(e)}")


@router.get("/{doc_id}/download")
async def download_document(
    doc_id: int,
    db: Session = Depends(get_db)
):
    """Serve document file for viewing/download"""
    try:
        document = db.query(Document).filter(Document.id == doc_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Use the file_path from the document record
        file_path = document.file_path

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Document file not found on disk")

        # Determine media type based on file extension
        media_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"

        # Return the document file
        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=document.original_filename,
            headers={
                "Content-Disposition": f"inline; filename={document.original_filename}",
                "Cache-Control": "public, max-age=3600"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to serve document: {str(e)}")


@router.put("/{doc_id}")
async def update_document(
    doc_id: int,
    title: Optional[str] = None,
    category: Optional[str] = None,
    description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Update document metadata"""
    try:
        document = db.query(Document).filter(Document.id == doc_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Update fields if provided
        if title is not None:
            document.title = title
        if category is not None:
            document.category = category
        if description is not None:
            document.description = description

        db.commit()
        db.refresh(document)

        return {
            "message": "Document updated successfully",
            "id": document.id,
            "title": document.title,
            "category": document.category,
            "description": document.description
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update document: {str(e)}")

@router.get("/stats/summary")
async def get_document_stats(db: Session = Depends(get_db)):
    """Get document statistics"""
    try:
        total_docs = db.query(Document).count()
        completed_docs = db.query(Document).filter(Document.status == "completed").count()
        processing_docs = db.query(Document).filter(Document.status == "processing").count()
        failed_docs = db.query(Document).filter(Document.status == "failed").count()

        # Get categories
        categories = db.query(Document.category, func.count(Document.id)).group_by(Document.category).all()
        category_stats = {cat: count for cat, count in categories if cat}

        # Get total file size
        total_size = db.query(func.sum(Document.file_size)).scalar() or 0

        # Get file types
        file_types = db.query(Document.file_type, func.count(Document.id)).group_by(Document.file_type).all()
        file_type_stats = {ft: count for ft, count in file_types if ft}

        return {
            "total_documents": total_docs,
            "total_pdfs": total_docs,  # For backward compatibility
            "completed_documents": completed_docs,
            "processing_documents": processing_docs,
            "failed_documents": failed_docs,
            "categories": category_stats,
            "file_types": file_type_stats,
            "total_file_size": total_size
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get document stats: {str(e)}")

@router.post("/{doc_id}/reprocess")
async def reprocess_document(
    doc_id: int,
    db: Session = Depends(get_db)
):
    """Mark document for reprocessing"""
    try:
        document = db.query(Document).filter(Document.id == doc_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Reset processing status
        document.status = "uploaded"
        document.processing_status = "pending"
        document.error_message = None
        document.processed_at = None

        db.commit()

        return {
            "message": f"Document '{document.original_filename}' marked for reprocessing",
            "id": doc_id
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to mark document for reprocessing: {str(e)}")

# Backward compatibility endpoints
@router.get("/test")
async def test_endpoint():
    """Test endpoint to verify API is working"""
    return {
        "message": "Documents API is working",
        "endpoint": "/api/pdfs",
        "note": "This endpoint now uses the 'documents' table instead of 'pdfs'"
    }


@router.delete("/{doc_id}")
async def delete_document(
        doc_id: int,
        delete_file: bool = False,
        db: Session = Depends(get_db)
):
    """Delete document and its chunks from vector store"""
    try:
        # Get document from database
        document = db.query(Document).filter(Document.id == doc_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Store document info for response
        doc_info = {
            "id": document.id,
            "filename": document.original_filename,
            "title": document.title
        }

        # Delete chunks from ChromaDB
        try:
            from app.services.chroma_service import get_chroma_service
            chroma_service = get_chroma_service()

            if chroma_service:
                # Delete document chunks using document ID
                await chroma_service.delete_document_chunks(doc_id)
                logger.info(f"Deleted chunks for document {doc_id} from ChromaDB")
            else:
                logger.warning("ChromaDB service not available - chunks not deleted")
        except Exception as e:
            logger.error(f"Error deleting chunks from ChromaDB: {e}")
            # Continue with database deletion even if vector store deletion fails

        # Delete physical file if requested
        if delete_file and document.file_path and os.path.exists(document.file_path):
            try:
                os.remove(document.file_path)
                logger.info(f"Deleted physical file: {document.file_path}")
            except Exception as e:
                logger.error(f"Error deleting physical file: {e}")
                # Continue with database deletion

        # Delete from database
        db.delete(document)
        db.commit()

        logger.info(f"Document {doc_id} deleted successfully")

        return {
            "message": "Document deleted successfully",
            "document": doc_info,
            "chunks_deleted": True,
            "file_deleted": delete_file
        }

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting document {doc_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")