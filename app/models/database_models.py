from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
import json
from typing import Dict, Any, Optional

Base = declarative_base()


class PDFDocument(Base):
    __tablename__ = "pdfs"

    # Existing columns in your database (match exactly)
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    file_size = Column(Integer, nullable=False)
    upload_date = Column(DateTime, nullable=True)
    processed = Column(Boolean, nullable=True)
    chunk_count = Column(Integer, nullable=True)

    # Map your 'metadata' column to a different attribute name
    document_metadata = Column('metadata', Text, nullable=True)

    file_hash = Column(String(64), nullable=True, index=True)

    # New columns we'll add (all nullable to avoid conflicts)
    title = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), default='uploaded', nullable=True)
    processing_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=True)

    def set_metadata(self, metadata_dict: Dict[str, Any]):
        """Set document metadata as JSON string"""
        if metadata_dict:
            self.document_metadata = json.dumps(metadata_dict)

    def get_metadata(self) -> Dict[str, Any]:
        """Get document metadata from JSON string"""
        if self.document_metadata:
            try:
                return json.loads(self.document_metadata)
            except json.JSONDecodeError:
                return {}
        return {}


class PDFChunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    chunk_metadata = Column('chunk_meta', Text, nullable=True)
    created_at = Column(DateTime, default=func.now())


class SearchLog(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text, nullable=False)
    query_type = Column(String(50), default='search')
    results_count = Column(Integer, default=0)
    response_time = Column(Float, nullable=True)
    search_date = Column(DateTime, default=func.now())
    user_session = Column(String(100), nullable=True)
    search_metadata = Column('search_meta', Text, nullable=True)  # Map to different attribute name

    def set_metadata(self, metadata_dict: Dict[str, Any]):
        """Set search metadata as JSON string"""
        if metadata_dict:
            self.search_metadata = json.dumps(metadata_dict)

    def get_metadata(self) -> Dict[str, Any]:
        """Get search metadata from JSON string"""
        if self.search_metadata:
            try:
                return json.loads(self.search_metadata)
            except json.JSONDecodeError:
                return {}
        return {}
