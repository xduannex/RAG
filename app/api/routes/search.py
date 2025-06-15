import time
import traceback

from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional, Dict, Any
from fastapi.requests import Request
import logging
from pydantic import BaseModel
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
    model: Optional[str] = "llama3.2:latest"
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
        request: Request
):
    """Search documents without RAG generation"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            raise HTTPException(status_code=503, detail="ChromaDB service not available")

        # Ensure ChromaDB is initialized
        if not chroma_service.is_initialized:
            await chroma_service.initialize()

        # Perform search directly with ChromaDB
        results = await chroma_service.search_documents(
            query=search_request.query,
            n_results=search_request.n_results,
            pdf_ids=search_request.pdf_ids,
            similarity_threshold=search_request.similarity_threshold
        )

        # Format response
        response = {
            "success": True,
            "query": search_request.query,
            "results": results,
            "total": len(results),
            "parameters": {
                "n_results": search_request.n_results,
                "similarity_threshold": search_request.similarity_threshold,
                "pdf_ids": search_request.pdf_ids
            }
        }

        # Save search query (optional)
        try:
            await rag_service.save_search_query(
                query=search_request.query,
                results_count=len(results)
            )
        except Exception as e:
            logger.warning(f"Could not save search query: {e}")

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


@router.get("/suggestions")
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


@router.post("/advanced")
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
        # Use max_results if provided, otherwise fall back to n_results
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

        # Step 1: Search for relevant documents
        logger.info(f"🔍 Searching ChromaDB for: '{request.query}'")

        search_results = await chroma_service.search_documents(
            query=request.query,
            n_results=max_results,
            pdf_ids=request.document_ids or request.pdf_ids,
            category=request.category,
            similarity_threshold=request.similarity_threshold
        )

        logger.info(f"📊 Found {len(search_results)} search results")

        if not search_results:
            return {
                "success": True,
                "query": request.query,
                "answer": "I couldn't find any relevant documents to answer your question. Please try a different search term or check if documents are properly uploaded and processed.",
                "sources": [],
                "total_sources": 0,
                "response_time": time.time() - start_time,
                "context": "No relevant documents found"
            }

        # Step 2: Generate answer using Ollama (if available)
        if ollama_service:
            try:
                # Prepare context from search results
                context_parts = []
                for i, result in enumerate(search_results[:3]):  # Use top 3 results
                    context_parts.append(
                        f"Source {i + 1} (from {result.get('filename', 'Unknown')}): {result.get('content', '')}")

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

        # Step 3: Format response
        response = {
            "success": True,
            "query": request.query,
            "answer": answer,
            "sources": search_results,
            "total_sources": len(search_results),
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
            for result in search_results:
                context_parts.append({
                    "source": result.get('filename', 'Unknown'),
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
                results_count=len(search_results),
                top_score=max([s.get("similarity_score", 0) for s in search_results]) if search_results else 0,
                avg_score=sum([s.get("similarity_score", 0) for s in search_results]) / len(
                    search_results) if search_results else 0,
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

@router.post("/debug/reindex")
async def reindex_documents(request: Request, db: Session = Depends(get_db)):
    """Re-index all documents from app.db to ChromaDB"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            return {"error": "ChromaDB service not available"}

        # Get all documents from app.db
        from app.models.database_models import Document, DocumentChunk

        documents = db.query(Document).all()

        if not documents:
            return {"message": "No documents found in database"}

        reindexed_count = 0
        errors = []

        for doc in documents:
            try:
                # Get chunks for this document
                chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).all()

                if chunks:
                    # Prepare data for ChromaDB
                    chunk_contents = []
                    chunk_ids = []
                    chunk_metadatas = []

                    for chunk in chunks:
                        chunk_contents.append(chunk.content)
                        chunk_ids.append(f"doc_{doc.id}_chunk_{chunk.chunk_index}")
                        chunk_metadatas.append({
                            "document_id": doc.id,
                            "chunk_index": chunk.chunk_index,
                            "filename": doc.original_filename or doc.title or "unknown",
                            "file_type": doc.file_type,
                            "page_number": getattr(chunk, 'page_number', None)
                        })

                    # Add to ChromaDB
                    await chroma_service.add_documents(
                        documents=chunk_contents,
                        metadatas=chunk_metadatas,
                        ids=chunk_ids
                    )

                    reindexed_count += 1
                    logger.info(f"Re-indexed document: {doc.original_filename} ({len(chunks)} chunks)")

            except Exception as e:
                error_msg = f"Error re-indexing {doc.original_filename}: {str(e)}"
                errors.append(error_msg)
                logger.error(error_msg)

        return {
            "success": True,
            "message": f"Re-indexed {reindexed_count} documents",
            "total_documents": len(documents),
            "errors": errors
        }

    except Exception as e:
        logger.error(f"Re-indexing failed: {e}")
        return {"error": str(e), "traceback": traceback.format_exc()}


@router.get("/debug/chroma")
async def debug_chroma(request: Request):
    """Debug ChromaDB contents"""
    try:
        services = get_services(request)
        chroma_service = services["chroma_service"]

        if not chroma_service:
            return {"error": "ChromaDB service not available"}

        # Get collection info
        stats = chroma_service.get_collection_stats()

        # Try a simple search with very low threshold
        test_results = await chroma_service.search_documents(
            query="dennis",
            n_results=10,
            similarity_threshold=0.0  # No threshold
        )

        return {
            "collection_stats": stats,
            "test_search_results": len(test_results),
            "sample_results": test_results[:2] if test_results else [],
            "debug_info": {
                "chroma_service_available": chroma_service is not None,
                "collection_initialized": hasattr(chroma_service,
                                                  'collection') and chroma_service.collection is not None
            }
        }

    except Exception as e:
        return {"error": str(e), "traceback": traceback.format_exc()}
