from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class PDFDocument(Base):
    __tablename__ = "pdfs"

    # Only include columns that exist in your current database
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    upload_date = Column(DateTime, default=datetime.utcnow)
    processed = Column(Boolean, default=False)
    chunk_count = Column(Integer, default=0)
    pdf_metadata = Column(Text, name="metadata")  # Map to 'metadata' column in DB

    # Add properties for missing columns to avoid errors
    @property
    def title(self):
        return self.filename  # Use filename as title fallback

    @property
    def author(self):
        return None

    @property
    def subject(self):
        return None

    @property
    def category(self):
        return None

    @property
    def description(self):
        return None

    @property
    def total_pages(self):
        return None

    @property
    def processing_status(self):
        return "completed" if self.processed else "pending"

    @property
    def processing_error(self):
        return None

    @property
    def processing_started_at(self):
        return None

    @property
    def processing_completed_at(self):
        return self.upload_date if self.processed else None

    @property
    def total_chunks(self):
        return self.chunk_count

    @property
    def is_searchable(self):
        return self.processed

    @property
    def last_indexed_at(self):
        return self.upload_date if self.processed else None

    @property
    def file_hash(self):
        return None

    @property
    def created_at(self):
        return self.upload_date

    @property
    def updated_at(self):
        return self.upload_date


class PDFChunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)
    pdf_id = Column(Integer, ForeignKey("pdfs.id"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Create relationship to PDFDocument
    pdf_document = relationship("PDFDocument", backref="chunks")

    @property
    def chunk_id(self):
        return f"chunk_{self.id}"

    @property
    def text_content(self):
        return self.content

    @property
    def char_count(self):
        return len(self.content) if self.content else 0

    @property
    def word_count(self):
        return len(self.content.split()) if self.content else 0

    @property
    def keywords(self):
        return "[]"

    @property
    def position(self):
        return "{}"


class SearchLog(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(String, nullable=False)
    results_count = Column(Integer, default=0)
    search_date = Column(DateTime, default=datetime.utcnow)
    response_time = Column(Float, nullable=True)