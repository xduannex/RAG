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


class RAGRequest(BaseModel):
    query: str
    n_results: Optional[int] = 5
    max_results: Optional[int] = 5  # Added for backward compatibility
    model: Optional[str] = "qwen2.5:7b"
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


@router.post("/search")
async def search_documents(
        search_request: SearchRequest,
        request: Request,
        db: Session = Depends(get_db)
):
    """Search documents without RAG generation - Enhanced with document viewing support"""
    start_time = time.time()

    try:
        if not search_request.query or not search_request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        logger.info(f"Search request: '{search_request.query}' with n_results: {search_request.n_results}")

        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="ChromaDB service not available")

        # Ensure ChromaDB is initialized
        if not chroma_service.is_initialized:
            await chroma_service.initialize()

        # Perform search directly with ChromaDB
        chroma_results = await chroma_service.search_documents(
            query=search_request.query,
            n_results=search_request.n_results,
            pdf_ids=search_request.pdf_ids,
            similarity_threshold=search_request.similarity_threshold
        )

        logger.info(f"📊 Found {len(chroma_results)} ChromaDB results")

        if not chroma_results:
            return {
                "success": True,
                "query": search_request.query,
                "results": [],
                "total": 0,
                "response_time": time.time() - start_time,
                "message": "No documents found matching your search query",
                "parameters": {
                    "n_results": search_request.n_results,
                    "similarity_threshold": search_request.similarity_threshold,
                    "pdf_ids": search_request.pdf_ids
                }
            }

        # Step 2: Extract document IDs and enrich with database information
        document_ids = set()
        for result in chroma_results:
            # Extract document ID from chunk ID or metadata
            doc_id = result.get('document_id')
            if not doc_id and 'chunk_id' in result:
                # Extract from chunk_id like "doc_1_chunk_0"
                import re
                match = re.match(r'doc_(\d+)_chunk_\d+', result['chunk_id'])
                if match:
                    doc_id = int(match.group(1))
            elif not doc_id and 'id' in result:
                # Extract from id field
                import re
                match = re.match(r'doc_(\d+)_chunk_\d+', result['id'])
                if match:
                    doc_id = int(match.group(1))

            if doc_id:
                document_ids.add(doc_id)

        # Step 3: Get document information from database
        documents_info = {}
        if document_ids:
            documents = db.query(Document).filter(Document.id.in_(document_ids)).all()
            for doc in documents:
                documents_info[doc.id] = {
                    'id': doc.id,
                    'filename': doc.filename,
                    'original_filename': doc.original_filename,
                    'title': doc.title,
                    'author': doc.author,
                    'category': doc.category,
                    'file_type': doc.file_type,
                    'total_pages': doc.total_pages,
                    'file_size': doc.file_size,
                    'created_at': doc.created_at.isoformat() if doc.created_at else None,
                    'processed_at': doc.processed_at.isoformat() if doc.processed_at else None,
                    'file_path': doc.file_path,
                    'status': doc.status,
                    'processing_status': doc.processing_status
                }

        # Step 4: Enrich ChromaDB results with database information
        enriched_results = []
        for result in chroma_results:
            # Extract document ID
            doc_id = result.get('document_id')
            if not doc_id:
                # Try to extract from chunk_id or id
                chunk_id = result.get('chunk_id') or result.get('id', '')
                import re
                match = re.match(r'doc_(\d+)_chunk_\d+', chunk_id)
                if match:
                    doc_id = int(match.group(1))

            # Get document info from database
            doc_info = documents_info.get(doc_id, {})

            # Create enriched result
            enriched_result = {
                'document_id': doc_id,
                'chunk_id': result.get('chunk_id') or result.get('id'),
                'content': result.get('content', ''),
                'similarity_score': result.get('similarity_score', 0),
                'chunk_index': result.get('chunk_index', 0),
                'page_number': result.get('page_number', 0),
                # Database information for document viewing
                'filename': doc_info.get('filename', 'Unknown'),
                'original_filename': doc_info.get('original_filename', 'Unknown'),
                'title': doc_info.get('title', ''),
                'author': doc_info.get('author', ''),
                'category': doc_info.get('category', ''),
                'file_type': doc_info.get('file_type', ''),
                'total_pages': doc_info.get('total_pages', 0),
                'file_size': doc_info.get('file_size', 0),
                'created_at': doc_info.get('created_at'),
                'processed_at': doc_info.get('processed_at'),
                'status': doc_info.get('status', ''),
                'processing_status': doc_info.get('processing_status', ''),
                # Document viewing support
                'can_view': bool(doc_info.get('file_path') and os.path.exists(doc_info.get('file_path', ''))),
                'view_url': f"/documents/{doc_id}/view" if doc_id else None,
                'download_url': f"/pdf/{doc_id}/download" if doc_id else None,
                'display_name': doc_info.get('title') or doc_info.get('original_filename') or doc_info.get(
                    'filename') or f"Document {doc_id}"
            }
            enriched_results.append(enriched_result)

        logger.info(f"📋 Enriched {len(enriched_results)} results with database info")

        # Format response
        response = {
            "success": True,
            "query": search_request.query,
            "results": enriched_results,
            "total": len(enriched_results),
            "response_time": time.time() - start_time,
            "parameters": {
                "n_results": search_request.n_results,
                "similarity_threshold": search_request.similarity_threshold,
                "pdf_ids": search_request.pdf_ids
            },
            # Additional metadata for document viewing
            "unique_documents": len(document_ids),
            "document_summary": {
                doc_id: {
                    "title": info.get('title') or info.get('original_filename', 'Unknown'),
                    "total_matches": len([r for r in enriched_results if r['document_id'] == doc_id]),
                    "file_type": info.get('file_type', ''),
                    "can_view": bool(info.get('file_path') and os.path.exists(info.get('file_path', ''))),
                    "view_url": f"/documents/{doc_id}/view"
                }
                for doc_id, info in documents_info.items()
            }
        }

        # Log to database
        try:
            search_history = SearchHistory(
                query=search_request.query,
                query_type="search",
                query_hash=hash(search_request.query),
                results_count=len(enriched_results),
                top_score=max([s.get("similarity_score", 0) for s in enriched_results]) if enriched_results else 0,
                avg_score=sum([s.get("similarity_score", 0) for s in enriched_results]) / len(
                    enriched_results) if enriched_results else 0,
                response_time=response["response_time"],
                model_used="search_only",
                generated_answer=""
            )
            db.add(search_history)
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to log search history: {e}")

        return response

    except Exception as e:
        logger.error(f"Search error: {e}")
        import traceback
        logger.error(f"Search traceback: {traceback.format_exc()}")
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
async def get_search_stats(request: Request):
    """Get search statistics"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            return {
                "success": False,
                "message": "Search service not available"
            }

        # Get ChromaDB statistics
        stats = chroma_service.get_collection_stats()

        # Add search-specific statistics
        search_stats = {
            "total_documents": stats.get("total_documents", 0),
            "collection_status": stats.get("status", "unknown"),
            "embedding_model": stats.get("embedding_model", "unknown"),
            "search_service_available": True,
            "rag_service_available": services["ollama_service"] is not None,
            "supported_operations": [
                "search",
                "ask" if services["ollama_service"] else None,
                "similar_documents",
                "suggestions",
                "advanced_search"
            ]
        }

        # Remove None values
        search_stats["supported_operations"] = [
            op for op in search_stats["supported_operations"] if op is not None
        ]

        return {
            "success": True,
            "stats": search_stats,
            "timestamp": stats.get("timestamp")
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
    """Perform RAG search with context and answer generation"""

    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    start_time = time.time()

    try:
        max_results = request.max_results or request.n_results

        logger.info(f"RAG search request: '{request.query}' with max_results: {max_results}")

        # Get services from app state
        services = get_services(request_obj)
        chroma_service = services["chroma_service"]
        ollama_service = services["ollama_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="ChromaDB service not available")

        # Ensure ChromaDB is initialized
        if not chroma_service.is_initialized:
            await chroma_service.initialize()

        # Step 1: Search for relevant documents in ChromaDB
        logger.info(f"🔍 Searching ChromaDB for: '{request.query}'")

        chroma_results = await chroma_service.search_documents(
            query=request.query,
            n_results=max_results,
            pdf_ids=request.document_ids or request.pdf_ids,
            category=request.category,
            similarity_threshold=request.similarity_threshold
        )

        logger.info(f"📊 Found {len(chroma_results)} ChromaDB results")

        if not chroma_results:
            return {
                "success": True,
                "query": request.query,
                "answer": "I couldn't find any relevant documents to answer your question. Please try a different search term or check if documents are properly uploaded and processed.",
                "sources": [],
                "total_sources": 0,
                "response_time": time.time() - start_time,
                "context": "No relevant documents found"
            }

        # Step 2: Extract document IDs and enrich with database information
        document_ids = set()
        for result in chroma_results:
            # Extract document ID from chunk ID or metadata
            doc_id = result.get('document_id')
            if not doc_id and 'chunk_id' in result:
                # Extract from chunk_id like "doc_1_chunk_0"
                import re
                match = re.match(r'doc_(\d+)_chunk_\d+', result['chunk_id'])
                if match:
                    doc_id = int(match.group(1))
            elif not doc_id and 'id' in result:
                # Extract from id field
                import re
                match = re.match(r'doc_(\d+)_chunk_\d+', result['id'])
                if match:
                    doc_id = int(match.group(1))

            if doc_id:
                document_ids.add(doc_id)

        # Step 3: Get document information from database
        documents_info = {}
        if document_ids:
            documents = db.query(Document).filter(Document.id.in_(document_ids)).all()
            for doc in documents:
                documents_info[doc.id] = {
                    'id': doc.id,
                    'filename': doc.filename,
                    'original_filename': doc.original_filename,
                    'title': doc.title,
                    'author': doc.author,
                    'category': doc.category,
                    'file_type': doc.file_type,
                    'total_pages': doc.total_pages
                }

        # Step 4: Enrich ChromaDB results with database information
        enriched_results = []
        for result in chroma_results:
            # Extract document ID
            doc_id = result.get('document_id')
            if not doc_id:
                # Try to extract from chunk_id or id
                chunk_id = result.get('chunk_id') or result.get('id', '')
                import re
                match = re.match(r'doc_(\d+)_chunk_\d+', chunk_id)
                if match:
                    doc_id = int(match.group(1))

            # Get document info from database
            doc_info = documents_info.get(doc_id, {})

            # Create enriched result
            enriched_result = {
                'document_id': doc_id,
                'chunk_id': result.get('chunk_id') or result.get('id'),
                'content': result.get('content', ''),
                'similarity_score': result.get('similarity_score', 0),
                'chunk_index': result.get('chunk_index', 0),
                'page_number': result.get('page_number', 0),
                # Database information
                'filename': doc_info.get('filename', 'Unknown'),
                'original_filename': doc_info.get('original_filename', 'Unknown'),
                'title': doc_info.get('title', ''),
                'author': doc_info.get('author', ''),
                'category': doc_info.get('category', ''),
                'file_type': doc_info.get('file_type', ''),
                'total_pages': doc_info.get('total_pages', 0)
            }
            enriched_results.append(enriched_result)

        logger.info(f"📋 Enriched {len(enriched_results)} results with database info")

        # Step 5: Generate answer using Ollama (if available)
        if ollama_service:
            try:
                # Prepare context from search results
                context_parts = []
                for i, result in enumerate(enriched_results[:3]):  # Use top 3 results
                    filename = result.get('original_filename') or result.get('filename', 'Unknown')
                    context_parts.append(
                        f"Source {i + 1} (from {filename}): {result.get('content', '')}")

                context = "\n\n".join(context_parts)

                # Generate answer
                prompt = f"""Based on the following context, please answer the question: "{request.query}"

Context:
{context}

Answer:"""

                logger.info(f"🤖 Generating answer with model: {request.model}")

                answer = await ollama_service.generate_response(
                    prompt=prompt,
                    model=request.model,
                    max_tokens=500
                )

                if not answer or answer.strip() == "":
                    answer = "I found relevant documents but couldn't generate a specific answer. Please review the source documents below."

            except Exception as e:
                logger.error(f"Error generating answer: {e}")
                answer = f"I found relevant documents but encountered an error generating an answer: {str(e)}"
        else:
            answer = "Found relevant documents but answer generation is not available. Please review the source documents below."

        # Step 6: Format response
        response = {
            "success": True,
            "query": request.query,
            "answer": answer,
            "sources": enriched_results,  # Now includes database info
            "total_sources": len(enriched_results),
            "response_time": time.time() - start_time,
            "model_used": request.model,
            "parameters": {
                "max_results": max_results,
                "similarity_threshold": request.similarity_threshold,
                "document_ids": request.document_ids or request.pdf_ids,
                "category": request.category
            }
        }

        # Add context if requested
        if request.include_context:
            context_parts = []
            for result in enriched_results:
                context_parts.append({
                    "source": result.get('original_filename') or result.get('filename', 'Unknown'),
                    "content": result.get('content', ''),
                    "similarity": result.get('similarity_score', 0)
                })
            response["context"] = context_parts

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
        logger.error(f"RAG query failed: {e}")
        import traceback
        logger.error(f"RAG traceback: {traceback.format_exc()}")
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



