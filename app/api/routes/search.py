from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import time
import json
import logging

from app.core.database import get_db
from app.models.database_models import PDFDocument, SearchLog
from app.models.search_models import SearchQuery, SearchResponse, RAGQuery, RAGResponse, SearchResult
from app.services.rag_service import RAGService
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)
router = APIRouter()


def get_rag_service(request: Request) -> RAGService:
    """Get RAG service from app state or create new instance"""
    try:
        if hasattr(request.app.state, 'rag_service') and request.app.state.rag_service:
            return request.app.state.rag_service
        else:
            logger.warning("Creating new RAG service instance")
            return RAGService()
    except Exception as e:
        logger.error(f"Error getting RAG service: {e}")
        return RAGService()


@router.post("/", response_model=SearchResponse)
async def search_documents(
        search_query: SearchQuery,
        request: Request,
        db: Session = Depends(get_db)
):
    """Search through PDF documents"""
    start_time = time.time()

    try:
        # Validate PDF IDs if provided
        if search_query.pdf_ids:
            valid_pdfs = db.query(PDFDocument.id).filter(
                PDFDocument.id.in_(search_query.pdf_ids),
                PDFDocument.is_searchable == True
            ).all()
            valid_pdf_ids = [pdf.id for pdf in valid_pdfs]

            if not valid_pdf_ids:
                raise HTTPException(status_code=400, detail="No valid searchable PDFs found")

            search_query.pdf_ids = valid_pdf_ids

        # Perform search
        rag_service = get_rag_service(request)
        search_results = await rag_service.search_documents(
            query=search_query.query,
            limit=search_query.limit,
            pdf_ids=search_query.pdf_ids,
            category=search_query.category
        )

        # Generate AI summary if requested
        ai_summary = None
        if search_query.include_content and search_results:
            try:
                summary_text = " ".join([r.chunk_text[:200] for r in search_results[:3]])
                ai_summary = await rag_service.ollama_service.summarize_text(
                    f"Search results for '{search_query.query}': {summary_text}",
                    max_length=100
                )
            except Exception as e:
                logger.warning(f"Failed to generate AI summary: {e}")

        processing_time = time.time() - start_time

        # Log search - Remove category field if it doesn't exist in SearchLog
        try:
            search_log = SearchLog(
                query=search_query.query,
                pdf_ids=json.dumps(search_query.pdf_ids) if search_query.pdf_ids else None,
                results_count=len(search_results),
                processing_time=processing_time
            )
            db.add(search_log)
            db.commit()
        except Exception as e:
            logger.error(f"Error logging search query: {e}")
            # Don't fail the request if logging fails

        return SearchResponse(
            query=search_query.query,
            total_results=len(search_results),
            results=search_results,
            ai_summary=ai_summary,
            processing_time=processing_time
        )

    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")


@router.post("/rag", response_model=RAGResponse)
async def rag_query(
        rag_request: RAGQuery,
        request: Request,
        db: Session = Depends(get_db)
):
    """Ask questions using RAG (Retrieval-Augmented Generation)"""
    start_time = time.time()

    try:
        logger.info(f"Received RAG query: {rag_request.question}")

        # Validate input
        if not rag_request.question or not rag_request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")

        # Validate PDF IDs if provided
        if rag_request.pdf_ids:
            valid_pdfs = db.query(PDFDocument.id).filter(
                PDFDocument.id.in_(rag_request.pdf_ids),
                PDFDocument.is_searchable == True
            ).all()
            valid_pdf_ids = [pdf.id for pdf in valid_pdfs]

            if not valid_pdf_ids:
                raise HTTPException(status_code=400, detail="No valid searchable PDFs found")

            rag_request.pdf_ids = valid_pdf_ids

        # Get RAG service
        rag_service = get_rag_service(request)

        # Generate RAG response
        response = await rag_service.generate_rag_response(
            question=rag_request.question,
            pdf_ids=rag_request.pdf_ids,
            category=rag_request.category,
            max_context_chunks=rag_request.max_context_chunks
        )

        processing_time = time.time() - start_time
        response.processing_time = processing_time

        # Log RAG query - Remove category field if it doesn't exist
        try:
            search_log = SearchLog(
                query=f"RAG: {rag_request.question}",
                pdf_ids=json.dumps(rag_request.pdf_ids) if rag_request.pdf_ids else None,
                results_count=len(response.sources),
                processing_time=processing_time
            )
            db.add(search_log)
            db.commit()
        except Exception as e:
            logger.error(f"Error logging RAG query: {e}")

        logger.info(f"RAG query completed successfully in {processing_time:.2f}s")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RAG query error: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)}")


@router.get("/health")
async def search_health(request: Request):
    """Health check for search service"""
    try:
        rag_service = get_rag_service(request)
        health = await rag_service.health_check()
        return health
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simple")
async def simple_search(
        query: str,
        request: Request,
        limit: int = Query(default=5, ge=1, le=20)
):
    """Simple search endpoint for testing"""
    try:
        rag_service = get_rag_service(request)
        results = await rag_service.simple_search(query, limit)
        return {"query": query, "results": results, "count": len(results)}
    except Exception as e:
        logger.error(f"Simple search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
def get_search_stats(db: Session = Depends(get_db)):
    """Get search statistics"""
    try:
        total_pdfs = db.query(PDFDocument).count()
        searchable_pdfs = db.query(PDFDocument).filter(PDFDocument.is_searchable == True).count()
        total_searches = db.query(SearchLog).count()

        # Get vector store stats
        try:
            embedding_service = EmbeddingService()
            vector_stats = embedding_service.get_stats()
        except Exception as e:
            logger.error(f"Failed to get vector stats: {e}")
            vector_stats = {"total_chunks": 0}

        return {
            "total_pdfs": total_pdfs,
            "searchable_pdfs": searchable_pdfs,
            "total_searches": total_searches,
            "total_chunks": vector_stats.get("total_chunks", 0),
            "processing_status": {
                "pending": db.query(PDFDocument).filter(PDFDocument.processing_status == "pending").count(),
                "processing": db.query(PDFDocument).filter(PDFDocument.processing_status == "processing").count(),
                "completed": db.query(PDFDocument).filter(PDFDocument.processing_status == "completed").count(),
                "failed": db.query(PDFDocument).filter(PDFDocument.processing_status == "failed").count()
            }
        }
    except Exception as e:
        logger.error(f"Error getting search stats: {e}")
        # Return default stats if database query fails
        return {
            "total_pdfs": 0,
            "searchable_pdfs": 0,
            "total_searches": 0,
            "total_chunks": 0,
            "processing_status": {
                "pending": 0,
                "processing": 0,
                "completed": 0,
                "failed": 0
            }
        }


@router.get("/categories")
def get_categories(db: Session = Depends(get_db)):
    """Get all available categories"""
    try:
        categories = db.query(PDFDocument.category).filter(
            PDFDocument.category.isnot(None),
            PDFDocument.is_searchable == True
        ).distinct().all()

        return {"categories": [cat.category for cat in categories if cat.category]}
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        return {"categories": []}


@router.get("/similar/{pdf_id}")
async def find_similar_documents(
        pdf_id: int,
        request: Request,
        limit: int = Query(default=5, ge=1, le=20),
        db: Session = Depends(get_db)
):
    """Find documents similar to a specific PDF"""
    pdf = db.query(PDFDocument).filter(
        PDFDocument.id == pdf_id,
        PDFDocument.is_searchable == True
    ).first()

    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found or not searchable")

    try:
        # Use the PDF's title and subject as search query
        search_query = f"{pdf.title or ''} {pdf.subject or ''} {pdf.category or ''}".strip()

        if not search_query:
            # Fallback: get some content from the PDF
            rag_service = get_rag_service(request)
            chunks = await rag_service.search_documents(
                query="main content overview",
                limit=1,
                pdf_ids=[pdf_id]
            )
            if chunks:
                search_query = chunks[0].chunk_text[:200]

        if not search_query:
            return {
                "source_pdf": {
                    "id": pdf.id,
                    "filename": pdf.filename,
                    "title": pdf.title
                },
                "similar_documents": [],
                "total_found": 0
            }

        # Search for similar documents (excluding the current one)
        rag_service = get_rag_service(request)
        results = await rag_service.search_documents(
            query=search_query,
            limit=limit + 5  # Get extra to filter out current PDF
        )

        # Filter out the current PDF and limit results
        similar_docs = [r for r in results if r.pdf_id != pdf_id][:limit]

        return {
            "source_pdf": {
                "id": pdf.id,
                "filename": pdf.filename,
                "title": pdf.title
            },
            "similar_documents": similar_docs,
            "total_found": len(similar_docs)
        }

    except Exception as e:
        logger.error(f"Error finding similar documents for PDF {pdf_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to find similar documents")


@router.post("/summary")
async def generate_summary(
        pdf_ids: List[int],
        request: Request,
        max_chunks: int = Query(default=10, ge=5, le=50),
        db: Session = Depends(get_db)
):
    """Generate summary for selected PDFs"""
    # Validate PDF IDs
    valid_pdfs = db.query(PDFDocument).filter(
        PDFDocument.id.in_(pdf_ids),
        PDFDocument.is_searchable == True
    ).all()

    if not valid_pdfs:
        raise HTTPException(status_code=400, detail="No valid searchable PDFs found")

    try:
        rag_service = get_rag_service(request)
        summary = await rag_service.generate_summary(
            pdf_ids=[pdf.id for pdf in valid_pdfs],
            max_chunks=max_chunks
        )

        return {
            "summary": summary,
            "source_pdfs": [
                {
                    "id": pdf.id,
                    "filename": pdf.filename,
                    "title": pdf.title
                }
                for pdf in valid_pdfs
            ],
            "chunks_analyzed": max_chunks
        }

    except Exception as e:
        logger.error(f"Error generating summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate summary")


@router.post("/test-rag")
async def test_rag_simple(
        question: str,
        request: Request
):
    """Simple RAG test endpoint"""
    try:
        logger.info(f"Testing RAG with question: {question}")

        rag_service = get_rag_service(request)

        # Simple health check first
        try:
            health = await rag_service.health_check()
            logger.info(f"RAG service health: {health}")
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            health = {"status": "unknown", "error": str(e)}

        # Try simple search first
        try:
            search_results = await rag_service.simple_search(question, limit=3)
            logger.info(f"Simple search returned {len(search_results)} results")
        except Exception as e:
            logger.error(f"Simple search failed: {e}")
            search_results = []

        if not search_results:
            return {
                "question": question,
                "answer": "No documents found to answer this question.",
                "health": health,
                "search_results": []
            }

        # Generate basic response
        context = " ".join([r.get("text_snippet", "") for r in search_results])
        basic_answer = f"Based on the documents, here's what I found: {context[:300]}..."

        return {
            "question": question,
            "answer": basic_answer,
            "health": health,
            "search_results": search_results
        }

    except Exception as e:
        logger.error(f"Test RAG failed: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        return {
            "question": question,
            "error": str(e),
            "traceback": traceback.format_exc()
        }


@router.get("/debug/database")
def debug_database(db: Session = Depends(get_db)):
    """Debug database connection and table structure"""
    try:
        # Test basic database connection
        db.execute("SELECT 1")

        # Get table information
        from sqlalchemy import inspect
        inspector = inspect(db.bind)
        tables = inspector.get_table_names()

        # Get PDFDocument table info if it exists
        pdf_table_info = {}
        if 'pdf_documents' in tables:
            columns = inspector.get_columns('pdf_documents')
            pdf_table_info = {
                'exists': True,
                'columns': [col['name'] for col in columns],
                'column_details': columns
            }
        else:
            pdf_table_info = {'exists': False}

        # Get SearchLog table info if it exists
        search_log_info = {}
        if 'search_logs' in tables:
            columns = inspector.get_columns('search_logs')
            search_log_info = {
                'exists': True,
                'columns': [col['name'] for col in columns],
                'column_details': columns
            }
        else:
            search_log_info = {'exists': False}

        # Count records
        pdf_count = 0
        search_log_count = 0

        try:
            pdf_count = db.query(PDFDocument).count()
        except Exception as e:
            logger.error(f"Error counting PDFs: {e}")

        try:
            search_log_count = db.query(SearchLog).count()
        except Exception as e:
            logger.error(f"Error counting search logs: {e}")

        return {
            "database_connection": "OK",
            "all_tables": tables,
            "pdf_documents_table": pdf_table_info,
            "search_logs_table": search_log_info,
            "record_counts": {
                "pdf_documents": pdf_count,
                "search_logs": search_log_count
            }
        }

    except Exception as e:
        logger.error(f"Database debug failed: {e}")
        return {
            "database_connection": "FAILED",
            "error": str(e),
            "tables": []
        }


@router.get("/debug/services")
async def debug_services(request: Request):
    """Debug service connections"""
    debug_info = {
        "timestamp": time.time(),
        "services": {}
    }

    # Test RAG Service
    try:
        rag_service = get_rag_service(request)
        debug_info["services"]["rag_service"] = {
            "status": "initialized",
            "type": str(type(rag_service))
        }

        # Test Ollama service
        try:
            ollama_health = await rag_service.ollama_service.health_check()
            debug_info["services"]["ollama"] = {
                "status": "healthy" if ollama_health else "unhealthy",
                "health_check": ollama_health
            }
        except Exception as e:
            debug_info["services"]["ollama"] = {
                "status": "error",
                "error": str(e)
            }

        # Test Embedding service
        try:
            embedding_stats = rag_service.embedding_service.get_stats()
            debug_info["services"]["embedding"] = {
                "status": "healthy",
                "stats": embedding_stats
            }
        except Exception as e:
            debug_info["services"]["embedding"] = {
                "status": "error",
                "error": str(e)
            }

    except Exception as e:
        debug_info["services"]["rag_service"] = {
            "status": "error",
            "error": str(e)
        }

    return debug_info


@router.post("/debug/simple-query")
async def debug_simple_query(
        query: str,
        request: Request,
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
        debug_steps["steps"]["1_database"] = {
            "status": "checking"
        }

        pdf_count = db.query(PDFDocument).count()
        searchable_count = db.query(PDFDocument).filter(PDFDocument.is_searchable == True).count()

        debug_steps["steps"]["1_database"] = {
            "status": "ok",
            "total_pdfs": pdf_count,
            "searchable_pdfs": searchable_count
        }

        # Step 2: Initialize services
        debug_steps["steps"]["2_services"] = {
            "status": "initializing"
        }

        rag_service = get_rag_service(request)

        debug_steps["steps"]["2_services"] = {
            "status": "ok",
            "rag_service": str(type(rag_service))
        }

        # Step 3: Test embedding service
        debug_steps["steps"]["3_embedding"] = {
            "status": "testing"
        }

        try:
            embedding_stats = rag_service.embedding_service.get_stats()
            debug_steps["steps"]["3_embedding"] = {
                "status": "ok",
                "stats": embedding_stats
            }
        except Exception as e:
            debug_steps["steps"]["3_embedding"] = {
                "status": "error",
                "error": str(e)
            }

        # Step 4: Test search
        debug_steps["steps"]["4_search"] = {
            "status": "searching"
        }

        try:
            search_results = await rag_service.search_documents(
                query=query,
                limit=3
            )

            debug_steps["steps"]["4_search"] = {
                "status": "ok",
                "results_count": len(search_results),
                "results": [
                    {
                        "pdf_id": r.pdf_id,
                        "relevance_score": r.relevance_score,
                        "text_preview": r.chunk_text[:100] + "..." if len(r.chunk_text) > 100 else r.chunk_text
                    }
                    for r in search_results[:3]
                ]
            }
        except Exception as e:
            debug_steps["steps"]["4_search"] = {
                "status": "error",
                "error": str(e),
                "traceback": str(e.__traceback__)
            }

        # Step 5: Test Ollama if search worked
        if debug_steps["steps"]["4_search"]["status"] == "ok":
            debug_steps["steps"]["5_ollama"] = {
                "status": "testing"
            }

            try:
                ollama_health = await rag_service.ollama_service.health_check()
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
        debug_steps["error"] = str(e)
        debug_steps["status"] = "failed"
        return debug_steps


@router.get("/debug/vector-store")
async def debug_vector_store(request: Request):
    """Debug vector store connection and data"""
    try:
        rag_service = get_rag_service(request)

        # Get embedding service stats
        embedding_stats = rag_service.embedding_service.get_stats()

        # Try to get some sample data
        try:
            sample_search = await rag_service.embedding_service.search_similar_chunks(
                query="test",
                limit=3
            )

            return {
                "status": "ok",
                "stats": embedding_stats,
                "sample_search_results": len(sample_search),
                "sample_data": [
                    {
                        "pdf_id": chunk.get("pdf_id"),
                        "page_number": chunk.get("page_number"),
                        "text_preview": chunk.get("text", "")[:100]
                    }
                    for chunk in sample_search[:2]
                ]
            }

        except Exception as e:
            return {
                "status": "partial",
                "stats": embedding_stats,
                "search_error": str(e)
            }

    except Exception as e:
        logger.error(f"Vector store debug failed: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@router.get("/test")
async def test_endpoint():
    """Simple test endpoint"""
    return {
        "status": "ok",
        "message": "Search routes are working",
        "timestamp": time.time(),
        "endpoints": [
            "/search/",
            "/search/rag",
            "/search/stats",
            "/search/categories",
            "/search/test",
            "/search/debug/database",
            "/search/debug/services"
        ]
    }


