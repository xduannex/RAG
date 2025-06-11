from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum

class BulkUploadStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"

class BulkUploadRequest(BaseModel):
    category: Optional[str] = None
    description: Optional[str] = None
    auto_process: bool = True

class FileUploadResult(BaseModel):
    filename: str
    success: bool
    pdf_id: Optional[int] = None
    error: Optional[str] = None
    file_size: Optional[int] = None

class BulkUploadResponse(BaseModel):
    bulk_id: str
    total_files: int
    successful_uploads: int
    failed_uploads: int
    results: List[FileUploadResult]
    status: BulkUploadStatus
    created_at: datetime
    processing_time: Optional[float] = None

class BulkUploadProgress(BaseModel):
    bulk_id: str
    total_files: int
    processed_files: int
    successful_files: int
    failed_files: int
    current_file: Optional[str] = None
    status: BulkUploadStatus
    progress_percentage: float
    estimated_time_remaining: Optional[float] = None