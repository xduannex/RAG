import time
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.database_models import SearchHistory, Document
from app.services.rag_service import RAGService
from app.services.chroma_service import ChromaService
from app.config.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize services
rag_service = RAGService()
chroma_service = ChromaService()


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    limit: int = Field(default=10, ge=1, le=50)
    pdf_ids: Optional[List[int]] = Field(default=None, description="Legacy parameter for document IDs")
    document_ids: Optional[List[int]] = Field(default=None, description="Document IDs to search within")
    categories: Optional[List[str]] = Field(default=None, description="Categories to filter by")
    file_types: Optional[List[str]] = Field(default=None, description="File types to filter by")
    similarity_threshold: float = Field(default=0.0, ge=0.0, le=1.0)


class RAGRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    max_results: int = Field(default=5, ge=1, le=20)
    model: str = Field(default="llama2")
    pdf_ids: Optional[List[int]] = Field(default=None, description="Legacy parameter for document IDs")
    document_ids: Optional[List[int]] = Field(default=None, description="Document IDs to search within")
    category: Optional[str] = Field(default=None)
    include_context: bool = Field(default=True)


@router.post("/")
async def search_documents(
        request: SearchRequest,
        http_request: Request,
        db: Session = Depends(get_db)
):
    """Search through documents using vector similarity"""

    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if request.limit > settings.max_search_limit:
        raise HTTPException(
            status_code=400,
            detail=f"Limit cannot exceed {settings.max_search_limit}"
        )

    start_time = time.time()

    try:
        # Initialize ChromaDB if needed
        await chroma_service.initialize()

        # Use document_ids if provided, otherwise fall back to pdf_ids for backward compatibility
        target_doc_ids = request.document_ids or request.pdf_ids

        # Perform search
        search_start = time.time()
        results = await chroma_service.search_documents(
            query=request.query,
            n_results=request.limit,
            document_ids=target_doc_ids,  # Use the unified parameter
            category=request.categories[0] if request.categories else None,
            file_types=request.file_types,
            similarity_threshold=request.similarity_threshold
        )
        search_time = time.time() - search_start

        total_time = time.time() - start_time

        # Log search to database
        try:
            search_history = SearchHistory(
                query=request.query,
                query_type="search",
                query_hash=hash(request.query),
                results_count=len(results),
                top_score=max([r.get("similarity_score", 0) for r in results]) if results else 0,
                avg_score=sum([r.get("similarity_score", 0) for r in results]) / len(results) if results else 0,
                response_time=total_time,
                model_used="vector_search"
            )
            db.add(search_history)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log search history: {e}")

        return {
            "query": request.query,
            "results": results,
            "total_results": len(results),
            "search_time": search_time,
            "total_time": total_time,
            "filters_applied": {
                "document_ids": target_doc_ids,
                "categories": request.categories,
                "file_types": request.file_types,
                "similarity_threshold": request.similarity_threshold
            }
        }

    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/rag")
async def rag_search(
        request: RAGRequest,
        db: Session = Depends(get_db)
):
    """Perform RAG search with context and answer generation"""

    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    start_time = time.time()

    try:
        logger.info(f"RAG search request: '{request.query}' with max_results: {request.max_results}")

        # Initialize RAG service
        await rag_service.initialize()

        # Use document_ids if provided, otherwise fall back to pdf_ids for backward compatibility
        target_doc_ids = request.document_ids or request.pdf_ids

        # Generate RAG response
        rag_response = await rag_service.generate_rag_response(
            query=request.query,
            max_results=request.max_results,
            model=request.model,
            document_ids=target_doc_ids,  # Use the unified parameter
            category=request.category
        )

        total_time = time.time() - start_time

        # Log RAG query to database
        try:
            search_history = SearchHistory(
                query=request.query,
                query_type="rag",
                query_hash=hash(request.query),
                results_count=rag_response.get("total_sources", 0),
                top_score=max(
                    [s.get("similarity_score", 0) for s in rag_response.get("sources", [])]) if rag_response.get(
                    "sources") else 0,
                avg_score=sum([s.get("similarity_score", 0) for s in rag_response.get("sources", [])]) / len(
                    rag_response.get("sources", [])) if rag_response.get("sources") else 0,
                response_time=total_time,
                model_used=request.model,
                generated_answer=rag_response.get("answer", "")[:1000]  # Truncate for storage
            )
            db.add(search_history)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log RAG history: {e}")

        # Add timing information
        rag_response["response_time"] = total_time
        rag_response["include_context"] = request.include_context

        # Remove context if not requested
        if not request.include_context:
            rag_response.pop("context", None)

        return rag_response

    except Exception as e:
        logger.error(f"RAG query failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)}")


@router.get("/stats")
async def get_search_stats(db: Session = Depends(get_db)):
    """Get search statistics"""
    try:
        from sqlalchemy import func

        # Basic stats
        total_searches = db.query(SearchHistory).count()
        total_documents = db.query(Document).count()
        processed_documents = db.query(Document).filter(Document.is_processed == True).count()

        # Recent searches (last 24 hours)
        from datetime import datetime, timedelta
        yesterday = datetime.utcnow() - timedelta(days=1)
        recent_searches = db.query(SearchHistory).filter(SearchHistory.created_at >= yesterday).count()

        # Average response time
        avg_response_time = db.query(func.avg(SearchHistory.response_time)).scalar() or 0

        # Top queries
        top_queries = db.query(
            SearchHistory.query,
            func.count(SearchHistory.id).label('count')
        ).group_by(SearchHistory.query).order_by(func.count(SearchHistory.id).desc()).limit(10).all()

        # ChromaDB stats
        chroma_stats = chroma_service.get_collection_stats()

        return {
            "total_searches": total_searches,
            "recent_searches_24h": recent_searches,
            "total_documents": total_documents,
            "processed_documents": processed_documents,
            "searchable_documents": processed_documents,
            "avg_response_time": round(avg_response_time, 3),
            "top_queries": [{"query": q.query, "count": q.count} for q in top_queries],
            "vector_store": chroma_stats
        }

    except Exception as e:
        logger.error(f"Error getting search stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")


@router.get("/history")
async def get_search_history(
        limit: int = 50,
        offset: int = 0,
        query_type: Optional[str] = None,
        db: Session = Depends(get_db)
):
    """Get search history"""
    try:
        query = db.query(SearchHistory)

        if query_type:
            query = query.filter(SearchHistory.query_type == query_type)

        total = query.count()
        history = query.order_by(SearchHistory.created_at.desc()).offset(offset).limit(limit).all()

        history_list = []
        for item in history:
            history_list.append({
                "id": item.id,
                "query": item.query,
                "query_type": item.query_type,
                "results_count": item.results_count,
                "response_time": item.response_time,
                "model_used": item.model_used,
                "created_at": item.created_at.isoformat() if item.created_at else None
            })

        return {
            "history": history_list,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    except Exception as e:
        logger.error(f"Error getting search history: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")


@router.delete("/history")
async def clear_search_history(db: Session = Depends(get_db)):
    """Clear search history"""
    try:
        deleted_count = db.query(SearchHistory).delete()
        db.commit()

        return {
            "message": f"Cleared {deleted_count} search history entries",
            "deleted_count": deleted_count
        }

    except Exception as e:
        logger.error(f"Error clearing search history: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear history: {str(e)}")