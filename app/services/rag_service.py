import logging
from typing import List, Dict, Any, Optional
from app.services.chroma_service import ChromaService
from app.services.ollama_service import OllamaService

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self):
        self.chroma_service = ChromaService()
        self.ollama_service = OllamaService()
        self._initialized = False

    async def initialize(self):
        """Initialize the RAG service"""
        try:
            if self._initialized:
                return True

            logger.info("Initializing RAG service...")

            # Initialize ChromaDB
            chroma_success = await self.chroma_service.initialize()
            if not chroma_success:
                logger.error("Failed to initialize ChromaDB")
                return False

            # Initialize Ollama
            ollama_success = await self.ollama_service.initialize()
            if not ollama_success:
                logger.warning("Ollama service not available - RAG will work with search only")

            self._initialized = True
            logger.info("RAG service initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize RAG service: {e}")
            return False

    async def search_documents(
            self,
            query: str,
            limit: int = 10,
            pdf_ids: Optional[List[int]] = None,
            document_ids: Optional[List[int]] = None,
            category: Optional[str] = None,
            file_types: Optional[List[str]] = None,
            similarity_threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """Search for relevant documents"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.chroma_service:
                logger.error("ChromaDB service not available")
                return []

            logger.info(f"Searching for query: '{query}' with limit: {limit}")

            # Search using ChromaDB - match the interface
            results = await self.chroma_service.search_documents(
                query=query,
                n_results=limit,
                pdf_ids=pdf_ids,
                category=category,
                similarity_threshold=similarity_threshold
            )

            if not results:
                logger.warning("No search results found in ChromaDB")
                return []

            # Format results properly
            formatted_results = []
            for i, result in enumerate(results):
                try:
                    if isinstance(result, dict):
                        formatted_result = {
                            "id": result.get("id", f"result_{i}"),
                            "content": result.get("content", "No content available"),
                            "text": result.get("content", "No content available"),
                            "filename": result.get("filename", "Unknown document"),
                            "title": result.get("title", result.get("filename", "Untitled")),
                            "category": result.get("category", "Uncategorized"),
                            "page_number": result.get("page_number", 1),
                            "document_id": result.get("document_id", 0),
                            "pdf_id": result.get("document_id", 0),
                            "score": float(result.get("similarity_score", 0.0)),
                            "similarity_score": float(result.get("similarity_score", 0.0)),
                            "distance": float(result.get("distance", 0.0)),
                            "file_type": result.get("file_type", "unknown"),
                            "chunk_index": result.get("chunk_index", 0),
                            "metadata": result.get("metadata", {})
                        }
                        formatted_results.append(formatted_result)
                    else:
                        logger.warning(f"Unexpected result format: {type(result)}")

                except Exception as e:
                    logger.error(f"Error formatting result {i}: {e}")
                    continue

            logger.info(f"Formatted {len(formatted_results)} search results")
            return formatted_results

        except Exception as e:
            logger.error(f"Error in search_documents: {e}")
            return []

    async def generate_rag_response(
            self,
            query: str,
            max_results: int = 5,
            model: str = "llama2",
            pdf_ids: Optional[List[int]] = None,
            document_ids: Optional[List[int]] = None,
            category: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate RAG response with context"""
        try:
            if not self._initialized:
                await self.initialize()

            # Search for relevant documents
            search_results = await self.search_documents(
                query=query,
                limit=max_results,
                pdf_ids=pdf_ids,
                category=category
            )

            if not search_results:
                return {
                    "query": query,
                    "answer": "I couldn't find any relevant documents to answer your question. Please make sure documents are uploaded and processed.",
                    "context": "",
                    "sources": [],
                    "model_used": model
                }

            # Build context from search results
            context_parts = []
            sources = []

            for result in search_results:
                context_parts.append(f"Source: {result['filename']}\nContent: {result['content']}\n")
                sources.append({
                    "filename": result['filename'],
                    "title": result['title'],
                    "page_number": result['page_number'],
                    "similarity_score": result['similarity_score'],
                    "document_id": result['document_id']
                })

            context = "\n".join(context_parts)

            # Generate answer using Ollama if available
            if self.ollama_service and await self.ollama_service.is_available():
                try:
                    prompt = f"""Based on the following context, please answer the question. If the context doesn't contain enough information to answer the question, say so clearly.

Context:
{context}

Question: {query}

Answer:"""

                    response = await self.ollama_service.generate_response(
                        prompt=prompt,
                        model=model
                    )

                    answer = response.get("response", "I couldn't generate a response.")

                except Exception as e:
                    logger.error(f"Error generating Ollama response: {e}")
                    answer = f"I found relevant information but couldn't generate a complete response. Here's what I found: {context[:500]}..."

            else:
                # Fallback: provide context-based answer without LLM
                answer = f"Based on the documents, here's the relevant information I found:\n\n{context[:1000]}..."

            return {
                "query": query,
                "answer": answer,
                "context": context,
                "sources": sources,
                "model_used": model,
                "total_sources": len(sources)
            }

        except Exception as e:
            logger.error(f"Error generating RAG response: {e}")
            return {
                "query": query,
                "answer": f"An error occurred while processing your question: {str(e)}",
                "context": "",
                "sources": [],
                "model_used": model,
                "error": str(e)
            }

    async def get_similar_documents(
            self,
            document_id: int,
            limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Find documents similar to a given document"""
        try:
            if not self._initialized:
                await self.initialize()

            # Search for documents excluding the current one
            results = await self.chroma_service.search_documents(
                query="",
                n_results=limit + 1
            )

            # Filter out the current document
            similar_docs = [
                result for result in results
                if result.get("document_id") != document_id
            ][:limit]

            return similar_docs

        except Exception as e:
            logger.error(f"Error finding similar documents: {e}")
            return []
