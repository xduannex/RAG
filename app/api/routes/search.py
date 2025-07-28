import os
import time
import traceback

from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional, Dict, Any
from fastapi.requests import Request
import logging
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

try:
    from fastapi import Request
except ImportError:
    from starlette.requests import Request

from app.services.rag_service import rag_service  # Import the global instance
from app.core.database import get_db  # Add this import
from app.models.database_models import Document, SearchHistory, DocumentChunk

router = APIRouter()
logger = logging.getLogger(__name__)


class SearchRequest(BaseModel):
    query: str
    n_results: Optional[int] = 10
    pdf_ids: Optional[List[int]] = None
    similarity_threshold: Optional[float] = 0.3
    category: Optional[str] = None


class RAGRequest(BaseModel):
    query: str
    n_results: Optional[int] = 5
    max_results: Optional[int] = 5  # Added for backward compatibility
    model: Optional[str] = "qwen2.5vl:7b-q8_0"
    pdf_ids: Optional[List[int]] = None
    document_ids: Optional[List[int]] = None  # Added for document IDs
    similarity_threshold: Optional[float] = 0.3
    category: Optional[str] = None  # Added for category filtering
    include_context: Optional[bool] = True  # Added for context inclusion


def get_services(request: Request):
    """Get services from app state"""
    return {
        "chroma_service": getattr(request.app.state, 'chroma_service', None),
        "ollama_service": getattr(request.app.state, 'ollama_service', None),
        "rag_service": getattr(request.app.state, 'rag_service', None)
    }


@router.get("/category", response_model=List[str])
async def get_unique_categories(
        db: Session = Depends(get_db)
) -> List[str]:
    """
    Retrieve a list of unique document categories from the database.

    Returns:
        List[str]: A list of unique category names.
    """
    try:
        # Query for unique categories (ignore empty/null values)
        categories = (
            db.query(Document.category)
            .filter(Document.category.isnot(None), Document.category != "")
            .distinct()
            .order_by(Document.category.asc())
            .all()
        )

        # Flatten the result tuples and return as list
        return [category[0] for category in categories]

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")


@router.post("/search")
async def search_documents(
        search_request: SearchRequest,
        request: Request,
        db: Session = Depends(get_db)
):
    """Search documents without RAG generation, with category filtering and result de-duplication."""
    start_time = time.time()

    try:
        if not search_request.query or not search_request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        logger.info(
            f"Search request: '{search_request.query}' with n_results: {search_request.n_results}, category: '{search_request.category}'")

        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="ChromaDB service not available")

        if not chroma_service.is_initialized:
            await chroma_service.initialize()

        where_filter = {}
        if search_request.pdf_ids:
            where_filter["document_id"] = {"$in": search_request.pdf_ids}
        if search_request.category:
            where_filter["category"] = search_request.category

        # --- Fetch more results to allow for de-duplication ---
        n_results_requested = search_request.n_results
        fetch_limit = n_results_requested * 3  # Fetch 3x the requested results
        logger.info(f"Requesting {fetch_limit} results from ChromaDB to de-duplicate down to {n_results_requested}.")

        chroma_results = await chroma_service.search_documents(
            query=search_request.query,
            n_results=fetch_limit,
            where_filter=where_filter if where_filter else None,
            similarity_threshold=search_request.similarity_threshold
        )

        logger.info(f"📊 Found {len(chroma_results)} ChromaDB results initially.")

        # --- De-duplicate results to show one best result per document ---
        if chroma_results:
            unique_document_results = {}
            for result in chroma_results:
                doc_id = result.get('document_id')
                if not doc_id:
                    chunk_id = result.get('chunk_id') or result.get('id', '')
                    import re
                    match = re.match(r'doc_(\d+)_chunk_\d+', chunk_id)
                    if match:
                        doc_id = int(match.group(1))

                if doc_id:
                    current_score = result.get('similarity_score', 0)
                    if doc_id not in unique_document_results or current_score > unique_document_results[doc_id].get(
                            'similarity_score', 0):
                        unique_document_results[doc_id] = result

            deduplicated_results = sorted(list(unique_document_results.values()),
                                          key=lambda x: x.get('similarity_score', 0), reverse=True)
            chroma_results = deduplicated_results[:n_results_requested]
            logger.info(f"📊 Found {len(chroma_results)} unique document sources after de-duplication.")

        if not chroma_results:
            message = "No documents found matching your search query."
            if search_request.category:
                message += f" The search was limited to the '{search_request.category}' category."
            return {"success": True, "query": search_request.query, "results": [], "total": 0,
                    "response_time": time.time() - start_time, "message": message}

        # --- The rest of the function remains the same, processing the de-duplicated chroma_results ---
        document_ids = {res.get('document_id') for res in chroma_results if res.get('document_id')}

        documents_info = {}
        if document_ids:
            documents = db.query(Document).filter(Document.id.in_(document_ids)).all()
            for doc in documents:
                documents_info[doc.id] = {
                    'id': doc.id, 'filename': doc.filename, 'original_filename': doc.original_filename,
                    'title': doc.title, 'author': doc.author, 'category': doc.category, 'file_type': doc.file_type,
                    'total_pages': doc.total_pages, 'file_size': doc.file_size,
                    'created_at': doc.created_at.isoformat() if doc.created_at else None,
                    'processed_at': doc.processed_at.isoformat() if doc.processed_at else None,
                    'file_path': doc.file_path, 'status': doc.status, 'processing_status': doc.processing_status
                }

        enriched_results = []
        for result in chroma_results:
            doc_id = result.get('document_id')
            doc_info = documents_info.get(doc_id, {})
            enriched_result = {
                'document_id': doc_id, 'chunk_id': result.get('chunk_id') or result.get('id'),
                'content': result.get('content', ''), 'similarity_score': result.get('similarity_score', 0),
                'chunk_index': result.get('chunk_index', 0), 'page_number': result.get('page_number', 0),
                'filename': doc_info.get('filename', 'Unknown'),
                'original_filename': doc_info.get('original_filename', 'Unknown'),
                'title': doc_info.get('title', ''), 'author': doc_info.get('author', ''),
                'category': doc_info.get('category', ''),
                'file_type': doc_info.get('file_type', ''), 'total_pages': doc_info.get('total_pages', 0),
                'file_size': doc_info.get('file_size', 0), 'created_at': doc_info.get('created_at'),
                'processed_at': doc_info.get('processed_at'), 'status': doc_info.get('status', ''),
                'processing_status': doc_info.get('processing_status', ''),
                'can_view': bool(doc_info.get('file_path') and os.path.exists(doc_info.get('file_path', ''))),
                'view_url': f"/documents/{doc_id}/view" if doc_id else None,
                'download_url': f"/documents/{doc_id}/download" if doc_id else None,
                'display_name': doc_info.get('title') or doc_info.get('original_filename') or doc_info.get(
                    'filename') or f"Document {doc_id}"
            }
            enriched_results.append(enriched_result)

        logger.info(f"📋 Enriched {len(enriched_results)} results with database info")

        response = {
            "success": True, "query": search_request.query, "results": enriched_results,
            "total": len(enriched_results), "response_time": time.time() - start_time,
            "parameters": {"n_results": n_results_requested,
                           "similarity_threshold": search_request.similarity_threshold,
                           "pdf_ids": search_request.pdf_ids, "category": search_request.category},
            "unique_documents": len(document_ids)
        }

        # Log to database
        try:
            search_history = SearchHistory(
                query=search_request.query, query_type="search", query_hash=hash(search_request.query),
                results_count=len(enriched_results),
                top_score=max([s.get("similarity_score", 0) for s in enriched_results]) if enriched_results else 0,
                avg_score=sum([s.get("similarity_score", 0) for s in enriched_results]) / len(
                    enriched_results) if enriched_results else 0,
                response_time=response["response_time"], model_used="search_only", generated_answer=""
            )
            db.add(search_history)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log search history: {e}")

        return response

    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
async def ask_question(
        rag_request: RAGRequest,
        request: Request
):
    """Ask a question using RAG (Retrieval-Augmented Generation)"""
    try:
        services = get_services(request)

        # Update RAG service with current services if needed
        if services["chroma_service"]:
            rag_service.set_services(
                chroma_service=services["chroma_service"],
                ollama_service=services["ollama_service"]
            )

        # Generate RAG response
        result = await rag_service.search_and_generate(
            query=rag_request.query,
            n_results=rag_request.n_results,
            model=rag_request.model,
            pdf_ids=rag_request.pdf_ids,
            similarity_threshold=rag_request.similarity_threshold
        )

        # Save search query
        await rag_service.save_search_query(
            query=rag_request.query,
            results_count=len(result.get("results", []))
        )

        return result

    except Exception as e:
        logger.error(f"RAG error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_search_history(
        request: Request,
        limit: int = 50,

):
    """Get search history"""
    try:
        services = get_services(request)

        if services["chroma_service"]:
            rag_service.set_services(
                chroma_service=services["chroma_service"],
                ollama_service=services["ollama_service"]
            )

        history = await rag_service.get_search_history(limit=limit)

        return {
            "success": True,
            "history": history,
            "total": len(history)
        }

    except Exception as e:
        logger.error(f"History error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/similar/{document_id}")
async def find_similar_documents(
        request: Request,
        document_id: int,
        n_results: int = 5,

):
    """Find documents similar to a specific document"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="Search service not available")

        # Update RAG service
        rag_service.set_services(
            chroma_service=chroma_service,
            ollama_service=services["ollama_service"]
        )

        # Get the document content first (you'll need to implement this based on your database)
        from sqlalchemy.orm import Session
        from app.core.database import get_db
        from app.models.database_models import Document

        # This is a simplified approach - you might want to use dependency injection
        db = next(get_db())
        document = db.query(Document).filter(Document.id == document_id).first()

        if not document:
            raise HTTPException(status_code=404, detail="Document not found")

        # Use the document title or filename as search query
        search_query = document.title or document.original_filename or "similar content"

        # Search for similar documents
        result = await rag_service.search_only(
            query=search_query,
            n_results=n_results + 1,  # +1 because the original document might be included
            similarity_threshold=0.5
        )

        # Filter out the original document from results
        filtered_results = [
            r for r in result.get("results", [])
            if r.get("document_id") != document_id and r.get("pdf_id") != document_id
        ]

        return {
            "success": True,
            "query": search_query,
            "original_document": {
                "id": document.id,
                "filename": document.original_filename,
                "title": document.title
            },
            "similar_documents": filtered_results[:n_results],
            "total_found": len(filtered_results)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Similar documents error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggestions")
async def get_search_suggestions(
        request: Request,
        query: str,
        limit: int = 5,

):
    """Get search suggestions based on partial query"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service or len(query.strip()) < 2:
            return {"suggestions": []}

        # Update RAG service
        rag_service.set_services(
            chroma_service=chroma_service,
            ollama_service=services["ollama_service"]
        )

        # Perform a quick search to get suggestions
        result = await rag_service.search_only(
            query=query,
            n_results=limit * 2,  # Get more results to extract diverse suggestions
            similarity_threshold=0.3
        )

        # Extract unique keywords/phrases from results
        suggestions = []
        seen_phrases = set()

        for doc in result.get("results", []):
            content = doc.get("content", "").lower()
            filename = doc.get("filename", "")

            # Simple suggestion extraction (you can make this more sophisticated)
            words = content.split()
            for i in range(len(words) - 1):
                phrase = f"{words[i]} {words[i + 1]}"
                if (query.lower() in phrase and
                        phrase not in seen_phrases and
                        len(phrase) > len(query)):
                    suggestions.append({
                        "text": phrase,
                        "source": filename,
                        "type": "content"
                    })
                    seen_phrases.add(phrase)
                    if len(suggestions) >= limit:
                        break

        return {
            "query": query,
            "suggestions": suggestions[:limit]
        }

    except Exception as e:
        logger.error(f"Suggestions error: {e}")
        return {"suggestions": []}


@router.get("/advanced")
async def advanced_search(
        request_data: Dict[str, Any],
        request: Request
):
    """Advanced search with multiple filters and options"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="Search service not available")

        # Extract search parameters
        query = request_data.get("query", "")
        n_results = request_data.get("n_results", 10)
        pdf_ids = request_data.get("pdf_ids")
        categories = request_data.get("categories")
        date_range = request_data.get("date_range")
        similarity_threshold = request_data.get("similarity_threshold", 0.3)
        include_content = request_data.get("include_content", True)
        search_mode = request_data.get("mode", "search")  # "search" or "rag"

        # Update RAG service
        rag_service.set_services(
            chroma_service=chroma_service,
            ollama_service=services["ollama_service"]
        )

        # Build filters (you'll need to extend ChromaDB service to support these)
        filters = {}
        if categories:
            filters["category"] = {"$in": categories}

        # Perform search based on mode
        if search_mode == "rag":
            result = await rag_service.search_and_generate(
                query=query,
                n_results=n_results,
                pdf_ids=pdf_ids,
                similarity_threshold=similarity_threshold
            )
        else:
            result = await rag_service.search_only(
                query=query,
                n_results=n_results,
                pdf_ids=pdf_ids,
                similarity_threshold=similarity_threshold
            )

        # Post-process results based on additional filters
        if not include_content:
            for doc in result.get("results", []):
                doc.pop("content", None)

        # Apply date range filter if specified (you'll need to implement this)
        if date_range and "results" in result:
            # This is a placeholder - implement based on your metadata structure
            pass

        return result

    except Exception as e:
        logger.error(f"Advanced search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_search_stats(request: Request, db: Session = Depends(get_db)):
    """Get search statistics"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        # Get actual document count from database
        actual_document_count = db.query(Document).count()

        # Get processed document count
        processed_document_count = db.query(Document).filter(
            Document.processing_status == "completed"
        ).count()

        # Get failed document count
        failed_document_count = db.query(Document).filter(
            Document.processing_status == "failed"
        ).count()

        # Get processing document count
        processing_document_count = db.query(Document).filter(
            Document.processing_status.in_(["processing", "pending"])
        ).count()

        if not chroma_service:
            return {
                "success": True,
                "stats": {
                    "total_documents": actual_document_count,
                    "processed_documents": processed_document_count,
                    "processing_documents": processing_document_count,
                    "failed_documents": failed_document_count,
                    "collection_status": "unavailable",
                    "embedding_model": "unknown",
                    "search_service_available": False,
                    "rag_service_available": False,
                    "supported_operations": []
                },
                "message": "Search service not available"
            }

        # Get ChromaDB statistics for comparison
        chroma_stats = chroma_service.get_collection_stats()
        chroma_count = chroma_stats.get("total_documents", 0)

        # Add search-specific statistics using DATABASE count (not ChromaDB count)
        search_stats = {
            "total_documents": actual_document_count,  # Use database count
            "processed_documents": processed_document_count,
            "processing_documents": processing_document_count,
            "failed_documents": failed_document_count,
            "collection_status": chroma_stats.get("status", "unknown"),
            "embedding_model": chroma_stats.get("embedding_model", "unknown"),
            "search_service_available": True,
            "rag_service_available": services["ollama_service"] is not None,
            "supported_operations": [
                "search",
                "ask" if services["ollama_service"] else None,
                "similar_documents",
                "suggestions",
                "advanced_search"
            ],
            # Debug info to see the discrepancy
            "chroma_document_count": chroma_count,
            "database_document_count": actual_document_count,
            "count_discrepancy": chroma_count - actual_document_count
        }

        # Remove None values
        search_stats["supported_operations"] = [
            op for op in search_stats["supported_operations"] if op is not None
        ]

        return {
            "success": True,
            "stats": search_stats,
            "timestamp": chroma_stats.get("timestamp")
        }

    except Exception as e:
        logger.error(f"Search stats error: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/history")
async def clear_search_history(request: Request):
    """Clear search history"""
    try:
        services = get_services(request)

        if services["chroma_service"]:
            rag_service.set_services(
                chroma_service=services["chroma_service"],
                ollama_service=services["ollama_service"]
            )

        # TODO: Implement search history clearing
        # This would typically involve database operations

        return {
            "success": True,
            "message": "Search history cleared"
        }

    except Exception as e:
        logger.error(f"Clear history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def search_health_check(request: Request):
    """Health check for search services"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]
        ollama_service = services["ollama_service"]

        health_info = {
            "search_service": "healthy",
            "chroma_db": "unknown",
            "ollama_service": "unknown",
            "rag_available": False,
            "search_only_available": False
        }

        # Check ChromaDB
        if chroma_service:
            try:
                chroma_health = await chroma_service.health_check()
                health_info["chroma_db"] = chroma_health.get("status", "unknown")
                health_info["search_only_available"] = chroma_health.get("status") == "healthy"
            except Exception as e:
                health_info["chroma_db"] = f"error: {e}"

        # Check Ollama
        if ollama_service:
            try:
                ollama_health = await ollama_service.health_check()
                health_info["ollama_service"] = ollama_health.get("status", "unknown")
                health_info["rag_available"] = (
                        ollama_health.get("status") == "healthy" and
                        health_info["search_only_available"]
                )
            except Exception as e:
                health_info["ollama_service"] = f"error: {e}"

        # Overall status
        if health_info["rag_available"]:
            health_info["overall_status"] = "fully_operational"
        elif health_info["search_only_available"]:
            health_info["overall_status"] = "search_only"
        else:
            health_info["overall_status"] = "degraded"

        return health_info

    except Exception as e:
        logger.error(f"Search health check error: {e}")
        return {
            "search_service": "error",
            "error": str(e),
            "overall_status": "unhealthy"
        }


@router.post("/rag")
async def rag_search(
        request: RAGRequest,
        request_obj: Request,
        db: Session = Depends(get_db)
):
    """Perform RAG search with de-duplicated sources and answer generation."""
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    start_time = time.time()
    try:
        max_results = request.max_results or request.n_results
        logger.info(
            f"RAG search request: '{request.query}' with max_results: {max_results}, category: '{request.category}'")

        services = get_services(request_obj)
        chroma_service = services["chroma_service"]
        ollama_service = services["ollama_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="ChromaDB service not available")
        if not chroma_service.is_initialized:
            await chroma_service.initialize()

        where_filter = {}
        if request.category:
            where_filter["category"] = request.category
        document_ids_to_filter = request.document_ids or request.pdf_ids
        if document_ids_to_filter:
            where_filter["document_id"] = {"$in": document_ids_to_filter}

        # --- Fetch more results to allow for de-duplication ---
        fetch_limit = max_results * 3
        logger.info(f"Requesting {fetch_limit} results from ChromaDB to de-duplicate down to {max_results}.")

        chroma_results = await chroma_service.search_documents(
            query=request.query,
            n_results=fetch_limit,
            where_filter=where_filter if where_filter else None,
            similarity_threshold=request.similarity_threshold
        )
        logger.info(f"📊 Found {len(chroma_results)} ChromaDB results initially")

        # --- De-duplicate results to show one best result per document ---
        if chroma_results:
            unique_document_results = {}
            for result in chroma_results:
                doc_id = result.get('document_id')
                if not doc_id:
                    chunk_id = result.get('chunk_id') or result.get('id', '')
                    import re
                    match = re.match(r'doc_(\d+)_chunk_\d+', chunk_id)
                    if match:
                        doc_id = int(match.group(1))

                if doc_id:
                    current_score = result.get('similarity_score', 0)
                    if doc_id not in unique_document_results or current_score > unique_document_results[doc_id].get(
                            'similarity_score', 0):
                        unique_document_results[doc_id] = result

            deduplicated_results = sorted(list(unique_document_results.values()),
                                          key=lambda x: x.get('similarity_score', 0), reverse=True)
            chroma_results = deduplicated_results[:max_results]
            logger.info(f"📊 Found {len(chroma_results)} unique document sources after de-duplication.")

        if not chroma_results:
            answer = "I couldn't find any relevant documents to answer your question."
            if request.category:
                answer += f" The search was limited to the '{request.category}' category."
            return {"success": True, "query": request.query, "answer": answer, "sources": [], "total_sources": 0,
                    "response_time": time.time() - start_time}

        # --- The rest of the function remains the same, processing the de-duplicated chroma_results ---
        document_ids = {res.get('document_id') for res in chroma_results if res.get('document_id')}

        documents_info = {}
        if document_ids:
            documents = db.query(Document).filter(Document.id.in_(document_ids)).all()
            for doc in documents:
                documents_info[doc.id] = {
                    'id': doc.id, 'filename': doc.filename, 'original_filename': doc.original_filename,
                    'title': doc.title, 'author': doc.author, 'category': doc.category,
                    'file_type': doc.file_type, 'total_pages': doc.total_pages
                }

        enriched_results = []
        for result in chroma_results:
            doc_id = result.get('document_id')
            doc_info = documents_info.get(doc_id, {})
            enriched_result = {
                'document_id': doc_id, 'chunk_id': result.get('chunk_id') or result.get('id'),
                'content': result.get('content', ''), 'similarity_score': result.get('similarity_score', 0),
                'chunk_index': result.get('chunk_index', 0), 'page_number': result.get('page_number', 0),
                'filename': doc_info.get('filename', 'Unknown'),
                'original_filename': doc_info.get('original_filename', 'Unknown'),
                'title': doc_info.get('title', ''), 'author': doc_info.get('author', ''),
                'category': doc_info.get('category', ''), 'file_type': doc_info.get('file_type', ''),
                'total_pages': doc_info.get('total_pages', 0)
            }
            enriched_results.append(enriched_result)

        logger.info(f"📋 Enriched {len(enriched_results)} results with database info")

        answer = "Found relevant documents but answer generation is not available."
        if ollama_service:
            try:
                context_parts = [
                    f"Source {i + 1} (from {res.get('original_filename') or res.get('filename', 'Unknown')}): {res.get('content', '')}"
                    for i, res in enumerate(enriched_results[:3])]
                context = "\n\n".join(context_parts)
                prompt = f'Based on the following context, please answer the question: "{request.query}"\n\nContext:\n{context}\n\nAnswer:'
                logger.info(f"🤖 Generating answer with model: {request.model}")
                answer = await ollama_service.generate_response(prompt=prompt, model=request.model, max_tokens=500)
                if not answer or not answer.strip():
                    answer = "I found relevant documents but couldn't generate a specific answer. Please review the source documents below."
            except Exception as e:
                logger.error(f"Error generating answer: {e}")
                answer = f"I found relevant documents but encountered an error generating an answer: {str(e)}"

        response = {
            "success": True, "query": request.query, "answer": answer, "sources": enriched_results,
            "total_sources": len(enriched_results), "response_time": time.time() - start_time,
            "model_used": request.model,
            "parameters": {"max_results": max_results, "similarity_threshold": request.similarity_threshold,
                           "document_ids": document_ids_to_filter, "category": request.category}
        }

        if request.include_context:
            response["context"] = [{"source": res.get('original_filename') or res.get('filename', 'Unknown'),
                                    "content": res.get('content', ''), "similarity": res.get('similarity_score', 0)
                } for res in enriched_results]

        # Log to database
        try:
            search_history = SearchHistory(
                query=request.query,
                query_type="rag",
                query_hash=hash(request.query),
                results_count=len(enriched_results),
                top_score=max([s.get("similarity_score", 0) for s in enriched_results]) if enriched_results else 0,
                avg_score=sum([s.get("similarity_score", 0) for s in enriched_results]) / len(
                    enriched_results) if enriched_results else 0,
                response_time=response["response_time"],
                model_used=request.model,
                generated_answer=answer[:1000] if answer else ""
            )
            db.add(search_history)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log RAG history: {e}")

        return response

    except Exception as e:
        logger.error(f"RAG query failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"RAG query failed: {str(e)}")


def get_document_info_from_chunk_id(chunk_id: str, db: Session) -> dict:
    """Get complete document and chunk information from chunk ID"""

    try:
        # Query to join chunks and documents tables
        query = text("""
                     SELECT
                         -- Document fields
                         d.id         as document_id,
                         d.filename,
                         d.original_filename,
                         d.file_path,
                         d.file_type,
                         d.file_size,
                         d.title,
                         d.author,
                         d.category,
                         d.total_pages,
                         d.word_count as doc_word_count,
                         d.char_count as doc_char_count,
                         d.language,
                         d.created_at,
                         -- Chunk fields
                         c.id         as chunk_id,
                         c.chunk_index,
                         c.page_number,
                         c.word_count as chunk_word_count,
                         c.char_count as chunk_char_count,
                         c.start_char,
                         c.end_char
                     FROM document_chunks c
                              JOIN documents d ON c.document_id = d.id
                     WHERE c.id = :chunk_id LIMIT 1
                     """)

        result = db.execute(query, {"chunk_id": chunk_id}).fetchone()

        if result:
            return {
                "document_id": result.document_id,
                "filename": result.filename,
                "original_filename": result.original_filename,
                "file_path": result.file_path,
                "file_type": result.file_type,
                "file_size": result.file_size,
                "title": result.title,
                "author": result.author,
                "category": result.category,
                "total_pages": result.total_pages,
                "word_count": result.doc_word_count,
                "char_count": result.doc_char_count,
                "language": result.language,
                "created_at": result.created_at,
                "chunk_index": result.chunk_index,
                "page_number": result.page_number,
                "chunk_word_count": result.chunk_word_count,
                "chunk_char_count": result.chunk_char_count,
                "start_char": result.start_char,
                "end_char": result.end_char
            }
        else:
            logger.warning(f"No document found for chunk_id: {chunk_id}")
            return None

    except Exception as e:
        logger.error(f"Database error getting document info for chunk {chunk_id}: {e}")
        return None

def get_document_info_from_chunk_id(chunk_id: str, db: Session) -> dict:
    """Get complete document and chunk information from chunk ID"""

    try:
        # Query to join chunks and documents tables
        query = text("""
                     SELECT
                         -- Document fields
                         d.id         as document_id,
                         d.filename,
                         d.original_filename,
                         d.file_path,
                         d.file_type,
                         d.file_size,
                         d.title,
                         d.author,
                         d.category,
                         d.total_pages,
                         d.word_count as doc_word_count,
                         d.char_count as doc_char_count,
                         d.language,
                         d.created_at,
                         -- Chunk fields
                         c.id         as chunk_id,
                         c.chunk_index,
                         c.page_number,
                         c.word_count as chunk_word_count,
                         c.char_count as chunk_char_count,
                         c.start_char,
                         c.end_char
                     FROM chunks c
                              JOIN documents d ON c.document_id = d.id
                     WHERE c.id = :chunk_id LIMIT 1
                     """)

        result = db.execute(query, {"chunk_id": chunk_id}).fetchone()

        if result:
            return {
                "document_id": result.document_id,
                "filename": result.filename,
                "original_filename": result.original_filename,
                "file_path": result.file_path,
                "file_type": result.file_type,
                "file_size": result.file_size,
                "title": result.title,
                "author": result.author,
                "category": result.category,
                "total_pages": result.total_pages,
                "word_count": result.doc_word_count,
                "char_count": result.doc_char_count,
                "language": result.language,
                "created_at": result.created_at,
                "chunk_index": result.chunk_index,
                "page_number": result.page_number,
                "chunk_word_count": result.chunk_word_count,
                "chunk_char_count": result.chunk_char_count,
                "start_char": result.start_char,
                "end_char": result.end_char
            }
        else:
            logger.warning(f"No document found for chunk_id: {chunk_id}")
            return None

    except Exception as e:
        logger.error(f"Database error getting document info for chunk {chunk_id}: {e}")
        return None



