from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ProcessingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class PDFBase(BaseModel):
    filename: str
    file_path: str
    category: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class PDFCreate(PDFBase):
    pass


class PDFUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class PDFResponse(PDFBase):
    id: int
    file_size: int
    total_pages: Optional[int] = None
    processing_status: ProcessingStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PDFUpdate(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class PDFResponse(PDFBase):
    id: int
    file_size: int
    total_pages: Optional[int] = None
    processing_status: ProcessingStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PDFProcessingResult(BaseModel):
    pdf_id: int
    status: ProcessingStatus
    total_pages: int
    total_chunks: int
    processing_time: float
    error_message: Optional[str] = None