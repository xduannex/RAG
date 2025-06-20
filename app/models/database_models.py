from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey, JSON, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import json

Base = declarative_base()


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, default="pdf")
    file_size = Column(Integer)
    file_hash = Column(String, index=True)

    # Metadata
    title = Column(String)
    author = Column(String)
    subject = Column(String)
    creator = Column(String)
    category = Column(String)
    description = Column(Text)
    keywords = Column(Text)


    # Processing info
    total_pages = Column(Integer)
    total_chunks = Column(Integer, default=0)
    word_count = Column(Integer)
    char_count = Column(Integer)

    # Status - FIXED: Use correct attribute names
    status = Column(String, default="uploaded")  # uploaded, processing, completed, error
    processing_status = Column(String, default="pending")  # pending, processing, completed, failed
    error_message = Column(Text)

    # Quality metrics
    text_quality_score = Column(Float)
    ocr_confidence = Column(Float)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at = Column(DateTime)

    # Relationships
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<PDFDocument(id={self.id}, filename='{self.original_filename}', status='{self.processing_status}')>"

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "filename": self.filename,
            "original_filename": self.original_filename,
            "file_path": self.file_path,
            "file_type": self.file_type,
            "file_size": self.file_size,
            "file_hash": self.file_hash,
            "title": self.title,
            "author": self.author,
            "subject": self.subject,
            "creator": self.creator,
            "category": self.category,
            "description": self.description,
            "keywords": self.keywords,
            "total_pages": self.total_pages,
            "total_chunks": self.total_chunks,
            "word_count": self.word_count,
            "char_count": self.char_count,
            "status": self.status,
            "processing_status": self.processing_status,
            "error_message": self.error_message,
            "text_quality_score": self.text_quality_score,
            "ocr_confidence": self.ocr_confidence,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None
        }

    @property
    def is_processed(self):
        """Compatibility property for old code"""
        return self.processing_status == "completed"

    @property
    def processing_failed(self):
        """Check if processing failed"""
        return self.processing_status == "failed"

    @property
    def is_processing(self):
        """Check if currently processing"""
        return self.processing_status == "processing"


class DocumentChunk(Base):
    __tablename__ = "chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    content_hash = Column(String, index=True)

    # Position info
    page_number = Column(Integer)
    start_char = Column(Integer)
    end_char = Column(Integer)

    # Metadata
    word_count = Column(Integer)
    char_count = Column(Integer)
    language = Column(String)

    # Quality metrics
    text_quality_score = Column(Float)
    embedding_quality = Column(Float)

    # Processing info
    embedding_model = Column(String)
    processed_at = Column(DateTime)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="chunks")

    def __repr__(self):
        return f"<DocumentChunk(id={self.id}, document_id={self.document_id}, chunk_index={self.chunk_index})>"

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "document_id": self.document_id,
            "chunk_index": self.chunk_index,
            "content": self.content,
            "content_hash": self.content_hash,
            "page_number": self.page_number,
            "start_char": self.start_char,
            "end_char": self.end_char,
            "word_count": self.word_count,
            "char_count": self.char_count,
            "language": self.language,
            "text_quality_score": self.text_quality_score,
            "embedding_quality": self.embedding_quality,
            "embedding_model": self.embedding_model,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


class SearchHistory(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    query = Column(Text, nullable=False, index=True)
    query_type = Column(String, default="search", index=True)  # search, rag, semantic, hybrid
    query_hash = Column(String, index=True)  # For deduplication

    # Results info
    results_count = Column(Integer, default=0)
    top_score = Column(Float)
    avg_score = Column(Float)

    # Performance metrics
    response_time = Column(Float)  # Total response time in seconds
    search_time = Column(Float)   # Vector search time
    llm_time = Column(Float)    # LLM processing time (for RAG)

    # Request info
    user_session = Column(String, index=True)
    user_agent = Column(String)
    ip_address = Column(String)

    # Parameters used
    similarity_threshold = Column(Float)
    max_results = Column(Integer)
    model_used = Column(String)
    generated_answer = Column(Text)# For RAG queries

    # Filters applied
    pdf_ids_filter = Column(Text)  # JSON string of PDF IDs
    categories_filter = Column(Text)  # JSON string of categories

    # Metadata
    search_metadata = Column(Text)  # JSON string for additional data

    # Timestamps
    search_date = Column(DateTime, default=datetime.utcnow, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<SearchHistory(id={self.id}, query='{self.query[:50]}...', type='{self.query_type}')>"

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "id": self.id,
            "query": self.query,
            "query_type": self.query_type,
            "query_hash": self.query_hash,
            "results_count": self.results_count,
            "top_score": self.top_score,
            "avg_score": self.avg_score,
            "response_time": self.response_time,
            "search_time": self.search_time,
            "llm_time": self.llm_time,
            "user_session": self.user_session,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
            "similarity_threshold": self.similarity_threshold,
            "max_results": self.max_results,
            "model_used": self.model_used,
            "pdf_ids_filter": json.loads(self.pdf_ids_filter) if self.pdf_ids_filter else None,
            "categories_filter": json.loads(self.categories_filter) if self.categories_filter else None,
            "search_metadata": json.loads(self.search_metadata) if self.search_metadata else None,
            "search_date": self.search_date.isoformat() if self.search_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

    def set_pdf_ids_filter(self, pdf_ids):
        """Set PDF IDs filter as JSON"""
        if pdf_ids:
            self.pdf_ids_filter = json.dumps(pdf_ids)

    def set_categories_filter(self, categories):
        """Set categories filter as JSON"""
        if categories:
            self.categories_filter = json.dumps(categories)

    def set_metadata(self, metadata_dict):
        """Set metadata as JSON"""
        if metadata_dict:
            self.search_metadata = json.dumps(metadata_dict)

    def get_metadata(self):
        """Get metadata as dictionary"""
        if self.search_metadata:
            return json.loads(self.search_metadata)
        return {}


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, unique=True, nullable=False, index=True)
    user_agent = Column(String)
    ip_address = Column(String, index=True)

    # Activity tracking
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    total_searches = Column(Integer, default=0)
    total_uploads = Column(Integer, default=0)

    # Session metadata
    session_metadata = Column(Text)  # JSON string

    # Status
    is_active = Column(Boolean, default=True)

    def __repr__(self):
        return f"<UserSession(id={self.id}, session_id='{self.session_id}', active={self.is_active})>"

    def to_dict(self):
        return {
            "id": self.id,
            "session_id": self.session_id,
            "user_agent": self.user_agent,
            "ip_address": self.ip_address,
            "first_seen": self.first_seen.isoformat() if self.first_seen else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "total_searches": self.total_searches,
            "total_uploads": self.total_uploads,
            "session_metadata": json.loads(self.session_metadata) if self.session_metadata else None,
            "is_active": self.is_active
        }


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String, nullable=False, index=True)  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    component = Column(String, index=True)  # search, upload, processing, etc.
    message = Column(Text, nullable=False)

    # Context
    function_name = Column(String)
    file_name = Column(String)
    line_number = Column(Integer)

    # Request context
    request_id = Column(String, index=True)
    user_session = Column(String, index=True)
    ip_address = Column(String)

    # Additional data
    log_metadata = Column(Text)  # JSON string
    stack_trace = Column(Text)

    # Timestamps
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<SystemLog(id={self.id}, level='{self.level}', component='{self.component}')>"

    def to_dict(self):
        return {
            "id": self.id,
            "level": self.level,
            "component": self.component,
            "message": self.message,
            "function_name": self.function_name,
            "file_name": self.file_name,
            "line_number": self.line_number,
            "request_id": self.request_id,
            "user_session": self.user_session,
            "ip_address": self.ip_address,
            "log_metadata": json.loads(self.log_metadata) if self.log_metadata else None,
            "stack_trace": self.stack_trace,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


class ProcessingQueue(Base):
    __tablename__ = "processing_queue"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    task_type = Column(String, nullable=False, index=True)  # extract, embed, reprocess
    priority = Column(Integer, default=0, index=True)  # Higher number = higher priority

    # Status
    status = Column(String, default="pending", index=True)  # pending, processing, completed, failed
    progress = Column(Float, default=0.0)  # 0.0 to 1.0

    # Processing info
    worker_id = Column(String)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Task parameters
    task_parameters = Column(Text)  # JSON string

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    document = relationship("Document")

    def __repr__(self):
        return f"<ProcessingQueue(id={self.id}, document_id={self.document_id}, task='{self.task_type}', status='{self.status}')>"

    def to_dict(self):
        return {
            "id": self.id,
            "document_id": self.document_id,
            "task_type": self.task_type,
            "priority": self.priority,
            "status": self.status,
            "progress": self.progress,
                        "worker_id": self.worker_id,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "error_message": self.error_message,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "task_parameters": json.loads(self.task_parameters) if self.task_parameters else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

    def set_parameters(self, params_dict):
        """Set parameters as JSON"""
        if params_dict:
            self.task_parameters = json.dumps(params_dict)

    def get_parameters(self):
        """Get parameters as dictionary"""
        if self.task_parameters:
            return json.loads(self.task_parameters)
        return {}


# Create indexes for better performance
Index('idx_documents_status', Document.processing_status)
Index('idx_documents_category', Document.category)
Index('idx_documents_file_type', Document.file_type)
Index('idx_documents_created_at', Document.created_at)
Index('idx_documents_file_hash', Document.file_hash)
Index('idx_documents_processed_at', Document.processed_at)

# Chunk indexes
Index('idx_chunks_document_id', DocumentChunk.document_id)
Index('idx_chunks_page_number', DocumentChunk.page_number)
Index('idx_chunks_content_hash', DocumentChunk.content_hash)
Index('idx_chunks_processed_at', DocumentChunk.processed_at)

# Search history indexes
Index('idx_search_history_query_type', SearchHistory.query_type)
Index('idx_search_history_search_date', SearchHistory.search_date)
Index('idx_search_history_user_session', SearchHistory.user_session)
Index('idx_search_history_query_hash', SearchHistory.query_hash)

# System log indexes
Index('idx_system_logs_level', SystemLog.level)
Index('idx_system_logs_component', SystemLog.component)
Index('idx_system_logs_timestamp', SystemLog.timestamp)
Index('idx_system_logs_request_id', SystemLog.request_id)

# Processing queue indexes
Index('idx_processing_queue_status', ProcessingQueue.status)
Index('idx_processing_queue_priority', ProcessingQueue.priority)
Index('idx_processing_queue_created_at', ProcessingQueue.created_at)
Index('idx_processing_queue_document_id', ProcessingQueue.document_id)

# User session indexes
Index('idx_user_sessions_session_id', UserSession.session_id)
Index('idx_user_sessions_ip_address', UserSession.ip_address)
Index('idx_user_sessions_last_seen', UserSession.last_seen)

