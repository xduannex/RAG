from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class SearchQuery(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    category: Optional[str] = None
    pdf_ids: Optional[List[int]] = None
    limit: int = Field(default=10, ge=1, le=50)
    include_content: bool = True


class SearchResult(BaseModel):
    pdf_id: int
    pdf_filename: str
    pdf_title: str
    page_number: int
    chunk_text: str
    relevance_score: float
    pdf_url: str
    chunk_id: Optional[str] = None
    chunk_index: Optional[int] = None

class RAGResponse(BaseModel):
    question: str
    answer: str
    sources: List[SearchResult]
    confidence_score: float
    processing_time: float


class SearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[SearchResult]
    ai_summary: Optional[str] = None
    processing_time: float


class RAGQuery(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    category: Optional[str] = None
    pdf_ids: Optional[List[int]] = None
    max_context_chunks: int = Field(default=5, ge=1, le=20)


