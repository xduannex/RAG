from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.core.database import get_db
from app.models.bulk_models import BulkUploadResponse, BulkUploadProgress
from app.services.bulk_upload_service import bulk_upload_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/start", response_model=BulkUploadResponse)
async def start_bulk_upload(
        background_tasks: BackgroundTasks,
        files: List[UploadFile] = File(...),
        category: Optional[str] = Form(None),
        description: Optional[str] = Form(None),
        auto_process: bool = Form(True),
        db: Session = Depends(get_db)
):
    """Start bulk upload of multiple PDF files"""

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    if len(files) > 50:  # Limit to 50 files per batch
        raise HTTPException(status_code=400, detail="Maximum 50 files allowed per batch")

    try:
        logger.info(f"Starting bulk upload with {len(files)} files")

        # Start bulk upload
        result = await bulk_upload_service.start_bulk_upload(
            files=files,
            category=category,
            description=description,
            auto_process=auto_process,
            db=db
        )

        # Schedule cleanup task
        background_tasks.add_task(bulk_upload_service.cleanup_completed_uploads)

        return result

    except Exception as e:
        logger.error(f"Bulk upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")


@router.get("/progress/{bulk_id}")
async def get_bulk_upload_progress(bulk_id: str):
    """Get progress of bulk upload"""

    progress = bulk_upload_service.get_upload_progress(bulk_id)

    if not progress:
        raise HTTPException(status_code=404, detail="Bulk upload not found")

    return progress


@router.get("/status/{bulk_id}")
async def get_bulk_upload_status(bulk_id: str):
    """Get status of bulk upload"""

    progress = bulk_upload_service.get_upload_progress(bulk_id)

    if not progress:
        raise HTTPException(status_code=404, detail="Bulk upload not found")

    return {
        "bulk_id": bulk_id,
        "status": progress["status"],
        "total_files": progress["total_files"],
        "processed_files": progress["processed_files"],
        "successful_files": progress["successful_files"],
        "failed_files": progress["failed_files"],
        "progress_percentage": progress["progress_percentage"]
    }


@router.post("/preview")
async def preview_bulk_upload(
        files: List[UploadFile] = File(...)
):
    """Preview bulk upload without actually uploading"""

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    preview_results = []
    total_size = 0

    for file in files:
        file_content = await file.read()
        file_size = len(file_content)
        total_size += file_size

        # Reset file pointer
        await file.seek(0)

        # Basic validation
        is_valid = file.filename.lower().endswith(('.pdf', '.doc', '.docx'))
        is_size_valid = file_size <= 50 * 1024 * 1024  # 50MB limit

        warnings = []
        if not is_valid:
            warnings.append("Invalid file type")
        if not is_size_valid:
            warnings.append("File too large")

        preview_results.append({
            "filename": file.filename,
            "size": file_size,
            "size_formatted": format_file_size(file_size),
            "type": file.content_type,
            "valid": is_valid and is_size_valid,
            "warnings": warnings
        })

    valid_files = sum(1 for result in preview_results if result["valid"])

    return {
        "total_files": len(files),
        "valid_files": valid_files,
        "invalid_files": len(files) - valid_files,
        "total_size": total_size,
        "total_size_formatted": format_file_size(total_size),
        "files": preview_results,
        "estimated_processing_time": valid_files * 30  # 30 seconds per file estimate
    }


def format_file_size(bytes_size: int) -> str:
    """Format file size in human readable format"""
    if bytes_size == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB"]
    i = 0
    while bytes_size >= 1024 and i < len(size_names) - 1:
        bytes_size /= 1024.0
        i += 1

    return f"{bytes_size:.1f} {size_names[i]}"