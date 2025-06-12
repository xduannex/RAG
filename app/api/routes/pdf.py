import logging
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional, List
from app.core.database import get_db
from app.services.pdf_processor import PDFProcessor
from app.models.database_models import PDFDocument
from datetime import datetime

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize PDF processor
pdf_processor = PDFProcessor()


@router.post("/upload")
async def upload_pdf(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
        title: Optional[str] = Form(None),
        category: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        db: Session = Depends(get_db)
):
    """Upload and process a PDF file"""
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")

        # Read file content
        file_content = await file.read()

        if len(file_content) == 0:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        logger.info(f"Uploading PDF: {file.filename} ({len(file_content)} bytes)")

        # Process the PDF (this handles database creation and processing)
        result = await pdf_processor.upload_and_process_pdf(
            file_content=file_content,
            filename=file.filename,
            title=title,
            category=category,
            description=description,
            db=db
        )

        if result["success"]:
            logger.info(f"PDF uploaded successfully: {result['id']}")

            # Return properly formatted response
            response_data = {
                "id": result["id"],
                "filename": result["filename"],
                "title": result.get("title"),
                "category": result.get("category"),
                "status": result["status"],
                "file_size": result["file_size"],
                "chunks": result.get("chunks", 0),
                "message": "PDF uploaded and processed successfully"
            }

            # Handle upload_date safely
            if result.get("upload_date"):
                if isinstance(result["upload_date"], str):
                    response_data["upload_date"] = result["upload_date"]
                else:
                    response_data["upload_date"] = result["upload_date"].isoformat()
            else:
                response_data["upload_date"] = datetime.utcnow().isoformat()

            return response_data
        else:
            logger.error(f"PDF upload failed: {result.get('error', 'Unknown error')}")
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to process PDF")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading PDF: {e}")
        logger.error(f"Full traceback: ", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/")
async def list_pdfs(
        skip: int = 0,
        limit: int = 100,
        db: Session = Depends(get_db)
):
    """List all uploaded PDFs"""
    try:
        pdfs = pdf_processor.list_pdfs(db, skip=skip, limit=limit)

        # Format the response safely
        pdf_list = []
        for pdf in pdfs:
            pdf_data = {
                "id": pdf.id,
                "filename": pdf.filename,
                "title": pdf.title,
                "category": pdf.category,
                "description": pdf.description,
                "status": pdf.status or "uploaded",
                "file_size": pdf.file_size,
                "chunk_count": pdf.chunk_count or 0,
                "processed": pdf.processed or False
            }

            # Handle dates safely
            if pdf.upload_date:
                pdf_data["upload_date"] = pdf.upload_date.isoformat()
            else:
                pdf_data["upload_date"] = None

            if pdf.created_at:
                pdf_data["created_at"] = pdf.created_at.isoformat()
            else:
                pdf_data["created_at"] = None

            if pdf.updated_at:
                pdf_data["updated_at"] = pdf.updated_at.isoformat()
            else:
                pdf_data["updated_at"] = None

            pdf_list.append(pdf_data)

        return pdf_list

    except Exception as e:
        logger.error(f"Error listing PDFs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pdf_id}")
async def get_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Get PDF details by ID"""
    try:
        pdf = pdf_processor.get_pdf_by_id(pdf_id, db)
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")

        # Format response safely
        pdf_data = {
            "id": pdf.id,
            "filename": pdf.filename,
            "title": pdf.title,
            "category": pdf.category,
            "description": pdf.description,
            "status": pdf.status or "uploaded",
            "file_size": pdf.file_size,
            "chunk_count": pdf.chunk_count or 0,
            "processed": pdf.processed or False,
            "processing_error": pdf.processing_error
        }

        # Handle dates safely
        if pdf.upload_date:
            pdf_data["upload_date"] = pdf.upload_date.isoformat()
        if pdf.created_at:
            pdf_data["created_at"] = pdf.created_at.isoformat()
        if pdf.updated_at:
            pdf_data["updated_at"] = pdf.updated_at.isoformat()

        # Get metadata safely
        try:
            pdf_data["metadata"] = pdf.get_metadata()
        except:
            pdf_data["metadata"] = {}

        return pdf_data

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{pdf_id}/reprocess")
async def reprocess_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Reprocess a PDF file"""
    try:
        result = await pdf_processor.reprocess_pdf(pdf_id, db)

        if result["success"]:
            return {
                "message": "PDF reprocessing completed successfully",
                **result
            }
        else:
            raise HTTPException(status_code=500, detail=result["error"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reprocessing PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{pdf_id}")
async def delete_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """Delete a PDF file"""
    try:
        result = await pdf_processor.delete_pdf(pdf_id, db)

        if result["success"]:
            return {
                "message": "PDF deleted successfully",
                **result
            }
        else:
            raise HTTPException(status_code=500, detail=result["error"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{pdf_id}/view")
async def view_pdf(pdf_id: int, db: Session = Depends(get_db)):
    """View/download PDF file"""
    try:
        from fastapi.responses import Response

        pdf_content = pdf_processor.get_pdf_content(pdf_id, db)
        if not pdf_content:
            raise HTTPException(status_code=404, detail="PDF file not found")

        # Get PDF info for filename
        pdf = pdf_processor.get_pdf_by_id(pdf_id, db)
        filename = pdf.filename if pdf else f"document_{pdf_id}.pdf"

        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"inline; filename={filename}"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error viewing PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
