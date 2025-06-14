import os
import uuid
import asyncio
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import shutil
from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.database_models import Document
from app.models.bulk_models import BulkUploadStatus, FileUploadResult, BulkUploadResponse
from app.services.document_processor import DocumentProcessor
from app.utils.file_utils import FileUtils
from app.config.settings import settings

logger = logging.getLogger(__name__)


class BulkUploadService:
    def __init__(self):
        self.active_uploads: Dict[str, Dict[str, Any]] = {}
        self.pdf_processor = DocumentProcessor()

    async def start_bulk_upload(
            self,
            files: List[UploadFile],
            category: Optional[str] = None,
            description: Optional[str] = None,
            auto_process: bool = True,
            db: Session = None
    ) -> BulkUploadResponse:
        """Start bulk upload process"""

        bulk_id = str(uuid.uuid4())
        start_time = datetime.utcnow()

        # Initialize progress tracking
        self.active_uploads[bulk_id] = {
            "total_files": len(files),
            "processed_files": 0,
            "successful_files": 0,
            "failed_files": 0,
            "current_file": None,
            "status": BulkUploadStatus.PROCESSING,
            "start_time": start_time,
            "results": []
        }

        logger.info(f"Starting bulk upload {bulk_id} with {len(files)} files")

        results = []
        successful_uploads = 0
        failed_uploads = 0

        for i, file in enumerate(files):
            try:
                # Update progress
                self.active_uploads[bulk_id]["current_file"] = file.filename
                self.active_uploads[bulk_id]["processed_files"] = i + 1

                # Validate file
                if not file.filename.lower().endswith(('.pdf', '.doc', '.docx')):
                    result = FileUploadResult(
                        filename=file.filename,
                        success=False,
                        error="Only PDF, DOC, and DOCX files are allowed"
                    )
                    results.append(result)
                    failed_uploads += 1
                    self.active_uploads[bulk_id]["failed_files"] += 1
                    continue

                # Check file size
                file_content = await file.read()
                if len(file_content) > settings.max_file_size:
                    result = FileUploadResult(
                        filename=file.filename,
                        success=False,
                        error="File size exceeds maximum limit"
                    )
                    results.append(result)
                    failed_uploads += 1
                    self.active_uploads[bulk_id]["failed_files"] += 1
                    continue

                # Reset file pointer
                await file.seek(0)

                # Process single file
                upload_result = await self._process_single_file(
                    file, file_content, category, description, db
                )

                results.append(upload_result)

                if upload_result.success:
                    successful_uploads += 1
                    self.active_uploads[bulk_id]["successful_files"] += 1

                    # Schedule background processing if auto_process is True
                    if auto_process and upload_result.pdf_id:
                        asyncio.create_task(self._process_pdf_background(upload_result.pdf_id))
                else:
                    failed_uploads += 1
                    self.active_uploads[bulk_id]["failed_files"] += 1

            except Exception as e:
                logger.error(f"Error processing file {file.filename}: {e}")
                result = FileUploadResult(
                    filename=file.filename,
                    success=False,
                    error=str(e)
                )
                results.append(result)
                failed_uploads += 1
                self.active_uploads[bulk_id]["failed_files"] += 1

        # Update final status
        processing_time = (datetime.utcnow() - start_time).total_seconds()

        if failed_uploads == 0:
            final_status = BulkUploadStatus.COMPLETED
        elif successful_uploads == 0:
            final_status = BulkUploadStatus.FAILED
        else:
            final_status = BulkUploadStatus.PARTIAL

        self.active_uploads[bulk_id]["status"] = final_status
        self.active_uploads[bulk_id]["results"] = results

        logger.info(f"Bulk upload {bulk_id} completed: {successful_uploads} successful, {failed_uploads} failed")

        return BulkUploadResponse(
            bulk_id=bulk_id,
            total_files=len(files),
            successful_uploads=successful_uploads,
            failed_uploads=failed_uploads,
            results=results,
            status=final_status,
            created_at=start_time,
            processing_time=processing_time
        )

    async def _process_single_file(
            self,
            file: UploadFile,
            file_content: bytes,
            category: Optional[str],
            description: Optional[str],
            db: Session
    ) -> FileUploadResult:
        """Process a single file upload"""

        try:
            # Generate safe filename
            safe_filename = FileUtils.get_safe_filename(file.filename)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            unique_filename = f"{timestamp}_{safe_filename}"

            # Save file
            file_path = os.path.join(settings.pdf_storage_path, unique_filename)
            FileUtils.ensure_directory(settings.pdf_storage_path)

            with open(file_path, "wb") as buffer:
                buffer.write(file_content)

            # Validate PDF
            is_valid, validation_message = self.pdf_processor.validate_pdf(file_path)

            if not is_valid:
                os.remove(file_path)  # Clean up
                return FileUploadResult(
                    filename=file.filename,
                    success=False,
                    error=f"Invalid file: {validation_message}"
                )

            # Get PDF metadata
            metadata = self.pdf_processor.get_pdf_metadata(file_path)

            # Create database record
            pdf_doc = Document(
                filename=file.filename,
                file_path=file_path,
                file_size=metadata["file_size"],
                file_hash=metadata["file_hash"],
                title=metadata.get("title") or file.filename,
                author=metadata.get("author"),
                subject=metadata.get("subject"),
                category=category,
                description=description,
                total_pages=metadata["total_pages"],
                processing_status="pending"
            )

            db.add(pdf_doc)
            db.commit()
            db.refresh(pdf_doc)

            return FileUploadResult(
                filename=file.filename,
                success=True,
                pdf_id=pdf_doc.id,
                file_size=metadata["file_size"]
            )

        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {e}")
            # Clean up file if it was created
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)

            return FileUploadResult(
                filename=file.filename,
                success=False,
                error=str(e)
            )

    async def _process_pdf_background(self, pdf_id: int):
        """Background task to process PDF"""
        try:
            from app.api.routes.pdf import process_pdf_background
            await process_pdf_background(pdf_id)
        except Exception as e:
            logger.error(f"Error in background processing for PDF {pdf_id}: {e}")

    def get_upload_progress(self, bulk_id: str) -> Optional[Dict[str, Any]]:
        """Get progress of bulk upload"""
        if bulk_id not in self.active_uploads:
            return None

        upload_info = self.active_uploads[bulk_id]

        # Calculate progress percentage
        progress_percentage = (upload_info["processed_files"] / upload_info["total_files"]) * 100

        # Estimate time remaining
        elapsed_time = (datetime.utcnow() - upload_info["start_time"]).total_seconds()
        if upload_info["processed_files"] > 0:
            avg_time_per_file = elapsed_time / upload_info["processed_files"]
            remaining_files = upload_info["total_files"] - upload_info["processed_files"]
            estimated_time_remaining = avg_time_per_file * remaining_files
        else:
            estimated_time_remaining = None

        return {
            "bulk_id": bulk_id,
            "total_files": upload_info["total_files"],
            "processed_files": upload_info["processed_files"],
            "successful_files": upload_info["successful_files"],
            "failed_files": upload_info["failed_files"],
            "current_file": upload_info["current_file"],
            "status": upload_info["status"],
            "progress_percentage": progress_percentage,
            "estimated_time_remaining": estimated_time_remaining
        }

    def cleanup_completed_uploads(self, max_age_hours: int = 24):
        """Clean up old completed uploads from memory"""
        cutoff_time = datetime.utcnow().timestamp() - (max_age_hours * 3600)

        to_remove = []
        for bulk_id, upload_info in self.active_uploads.items():
            if (upload_info["start_time"].timestamp() < cutoff_time and
                    upload_info["status"] in [BulkUploadStatus.COMPLETED, BulkUploadStatus.FAILED,
                                              BulkUploadStatus.PARTIAL]):
                to_remove.append(bulk_id)

        for bulk_id in to_remove:
            del self.active_uploads[bulk_id]
            logger.info(f"Cleaned up old bulk upload {bulk_id}")


# Global instance
bulk_upload_service = BulkUploadService()