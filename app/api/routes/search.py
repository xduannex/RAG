import logging
import time
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel

from app.core.database import get_db
from app.services.rag_service import RAGService
from app.models.database_models import SearchLog, PDFDocument

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize RAG service
rag_service = RAGService()


# Pydantic models - define once only
class SearchRequest(BaseModel):
    query: str
    limit: Optional[int] = 10
    pdf_ids: Optional[List[int]] = None
    category: Optional[str] = None


class RAGRequest(BaseModel):
    question: str
    limit: Optional[int] = 5
    pdf_ids: Optional[List[int]] = None
    category: Optional[str] = None


@router.post("/")
async def search_documents(
        request: SearchRequest,
        db: Session = Depends(get_db)
):
    """Search through documents"""
    start_time = time.time()

    try:
        # Initialize RAG service if needed
        if not rag_service._initialized:
            await rag_service.initialize()

        logger.info(f"Searching for: '{request.query}' with limit: {request.limit}")

        # Perform search
        results = await rag_service.search_documents(
            query=request.query,
            limit=request.limit,
            pdf_ids=request.pdf_ids,
            category=request.category
        )

        response_time = time.time() - start_time

        # Log the search - with safe metadata handling
        try:
            search_log = SearchLog(
                query=request.query,
                query_type="search",
                results_count=len(results) if results else 0,
                response_time=response_time
            )

            # Set metadata safely
            search_metadata = {
                "limit": request.limit,
                "pdf_ids": request.pdf_ids,
                "category": request.category,
                "user_agent": "api_client",
                "timestamp": time.time()
            }
            search_log.set_metadata(search_metadata)

            db.add(search_log)
            db.commit()
            logger.info(f"Search logged successfully")

        except Exception as log_error:
            logger.error(f"Error logging search: {log_error}")
            # Don't fail the request if logging fails

        logger.info(f"Search completed in {response_time:.2f}s with {len(results) if results else 0} results")

        return {
            "query": request.query,
            "results": results or [],
            "count": len(results) if results else 0,
            "response_time": response_time
        }

    except Exception as e:
        logger.error(f"Error in search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rag")
async def rag_query(
        request: RAGRequest,
        db: Session = Depends(get_db)
):
    """Perform RAG query with context"""
    start_time = time.time()

    try:
        # Initialize RAG service if needed
        if not rag_service._initialized:
            await rag_service.initialize()

        logger.info(f"RAG query: '{request.question}' with limit: {request.limit}")

        # Perform RAG query
        response = await rag_service.generate_rag_response(
            question=request.question,
            pdf_ids=request.pdf_ids,
            category=request.category,
            max_context_chunks=request.limit
        )

        response_time = time.time() - start_time

        # Format sources properly for frontend
        formatted_sources = []
        for source in response.sources:
            formatted_source = {
                "id": source.get("id", "unknown"),
                "title": source.get("title", "Unknown Document"),
                "filename": source.get("filename", "Unknown Document"),
                "content": source.get("content", "No content available"),
                "page_number": source.get("page_number", 1),
                "category": source.get("category", "Uncategorized"),
                "pdf_id": source.get("pdf_id", 0),
                "score": round(float(source.get("score", 0.0)) * 100, 1),  # Convert to percentage
                "relevance_score": round(float(source.get("relevance_score", 0.0)) * 100, 1)
            }
            formatted_sources.append(formatted_source)

        # Log the RAG query - with safe metadata handling
        try:
            search_log = SearchLog(
                query=request.question,
                query_type="rag",
                results_count=len(formatted_sources),
                response_time=response_time
            )

            # Set metadata safely
            rag_metadata = {
                "limit": request.limit,
                "pdf_ids": request.pdf_ids,
                "category": request.category,
                "confidence_score": response.confidence_score,
                "sources_count": len(formatted_sources),
                "user_agent": "api_client",
                "timestamp": time.time()
            }
            search_log.set_metadata(rag_metadata)

            db.add(search_log)
            db.commit()
            logger.info(f"RAG query logged successfully")

        except Exception as log_error:
            logger.error(f"Error logging RAG query: {log_error}")
            # Don't fail the request if logging fails

        logger.info(f"RAG query completed successfully in {response_time:.2f}s")

        return {
            "question": request.question,
            "answer": response.answer,
            "sources": formatted_sources,
            "confidence_score": round(response.confidence_score * 100, 1),  # Convert to percentage
            "processing_time": round(response.processing_time, 3),
            "response_time": round(response_time, 3),
            "sources_count": len(formatted_sources)
        }

    except Exception as e:
        logger.error(f"Error in RAG query: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_search_stats(db: Session = Depends(get_db)):
    """Get search statistics"""
    try:
        from app.services.pdf_processor import PDFProcessor

        pdf_processor = PDFProcessor()
        pdf_stats = pdf_processor.get_pdf_stats(db)

        # Get search stats
        try:
            total_searches = db.query(SearchLog).count()
            rag_searches = db.query(SearchLog).filter(SearchLog.query_type == 'rag').count()
            regular_searches = db.query(SearchLog).filter(SearchLog.query_type == 'search').count()

            # Get average response time
            from sqlalchemy import func
            avg_response_time = db.query(func.avg(SearchLog.response_time)).scalar() or 0

        except Exception as e:
            logger.warning(f"Could not get search stats: {e}")
            total_searches = 0
            rag_searches = 0
            regular_searches = 0
            avg_response_time = 0

        return {
            **pdf_stats,
            "total_searches": total_searches,
            "rag_searches": rag_searches,
            "regular_searches": regular_searches,
            "avg_response_time": round(avg_response_time, 3) if avg_response_time else 0
        }

    except Exception as e:
        logger.error(f"Error getting search stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Get all available categories"""
    try:
        categories = db.query(PDFDocument.category).filter(
            PDFDocument.category.isnot(None),
            PDFDocument.processed == True
        ).distinct().all()

        return {"categories": [cat.category for cat in categories if cat.category]}
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        return {"categories": []}


@router.post("/debug/simple-query")
async def debug_simple_query(
        query: str,
        db: Session = Depends(get_db)
):
    """Debug a simple query step by step"""
    debug_steps = {
        "query": query,
        "steps": {},
        "timestamp": time.time()
    }

    try:
        # Step 1: Check database
        debug_steps["steps"]["1_database"] = {"status": "checking"}

        pdf_count = db.query(PDFDocument).count()
        searchable_count = db.query(PDFDocument).filter(PDFDocument.processed == True).count()

        debug_steps["steps"]["1_database"] = {
            "status": "ok",
            "total_pdfs": pdf_count,
            "searchable_pdfs": searchable_count
        }

        # Step 2: Initialize RAG service
        debug_steps["steps"]["2_rag_init"] = {"status": "initializing"}

        if not rag_service._initialized:
            await rag_service.initialize()

        debug_steps["steps"]["2_rag_init"] = {
            "status": "ok",
            "initialized": rag_service._initialized
        }

        # Step 3: Test ChromaDB
        debug_steps["steps"]["3_chroma"] = {"status": "testing"}

        try:
            from app.services.chroma_service import ChromaService
            chroma_service = ChromaService()
            await chroma_service.initialize()

            collection_info = await chroma_service.get_collection_info()

            debug_steps["steps"]["3_chroma"] = {
                "status": "ok",
                "collection_info": collection_info
            }
        except Exception as e:
            debug_steps["steps"]["3_chroma"] = {
                "status": "error",
                "error": str(e)
            }

        # Step 4: Test search
        debug_steps["steps"]["4_search"] = {"status": "searching"}

        try:
            search_results = await rag_service.search_documents(
                query=query,
                limit=3
            )

            debug_steps["steps"]["4_search"] = {
                "status": "ok",
                "results_count": len(search_results) if search_results else 0,
                "results": [
                    {
                        "pdf_id": r.pdf_id if hasattr(r, 'pdf_id') else 'unknown',
                        "relevance_score": r.relevance_score if hasattr(r, 'relevance_score') else 0,
                        "text_preview": str(r)[:100] + "..." if len(str(r)) > 100 else str(r)
                    }
                    for r in (search_results[:3] if search_results else [])
                ]
            }
        except Exception as e:
            debug_steps["steps"]["4_search"] = {
                "status": "error",
                "error": str(e)
            }

        # Step 5: Test Ollama if search worked
        if debug_steps["steps"]["4_search"]["status"] == "ok":
            debug_steps["steps"]["5_ollama"] = {"status": "testing"}

            try:
                from app.services.ollama_service import OllamaService
                ollama_service = OllamaService()
                ollama_health = await ollama_service.health_check()

                debug_steps["steps"]["5_ollama"] = {
                    "status": "ok" if ollama_health else "unhealthy",
                    "health": ollama_health
                }
            except Exception as e:
                debug_steps["steps"]["5_ollama"] = {
                    "status": "error",
                    "error": str(e)
                }

        return debug_steps

    except Exception as e:
        logger.error(f"Error in debug query: {e}")
        debug_steps["error"] = str(e)
        return debug_steps
