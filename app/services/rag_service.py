import logging
from typing import Dict, Any, List, Optional
import asyncio

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self, chroma_service=None, ollama_service=None):
        """Initialize RAG service with optional services"""
        self.chroma_service = chroma_service
        self.ollama_service = ollama_service
        self._initialized = False

    async def initialize(self):
        """Initialize the RAG service"""
        if not self._initialized:
            logger.info("Initializing RAG service...")
            self._initialized = True
        return True

    def set_services(self, chroma_service=None, ollama_service=None):
        """Set services after initialization"""
        if chroma_service:
            self.chroma_service = chroma_service
        if ollama_service:
            self.ollama_service = ollama_service
        self._initialized = True
        logger.info("RAG service updated with new services")

    async def generate_rag_response(
            self,
            query: str,
            max_results: int = 5,
            model: str = "llama3.2:latest",
            document_ids: Optional[List[int]] = None,
            category: Optional[str] = None,
            similarity_threshold: float = 0.3  # Add this parameter
    ) -> Dict[str, Any]:
        """Generate RAG response with the expected method signature"""
        try:
            logger.info(f"Processing RAG query: '{query}' with max_results: {max_results}")

            # Check if we have ChromaDB service
            if not self.chroma_service:
                return {
                    "success": False,
                    "message": "ChromaDB service not available",
                    "query": query,
                    "sources": [],
                    "answer": "Search service is not available at the moment.",
                    "total_sources": 0
                }

            # Step 1: Search relevant documents
            search_results = await self.chroma_service.search_documents(
                query=query,
                n_results=max_results,
                pdf_ids=document_ids,  # Use document_ids as pdf_ids for backward compatibility
                similarity_threshold=similarity_threshold  # USE THE PARAMETER HERE!
            )

            if not search_results:
                return {
                    "success": False,
                    "message": "No relevant documents found",
                    "query": query,
                    "sources": [],
                    "answer": "I couldn't find any relevant information to answer your question.",
                    "total_sources": 0
                }

            logger.info(f"Found {len(search_results)} relevant results")

            # Step 2: Format context from search results
            context = self.format_context(search_results)
            logger.info(f"Formatted {len(search_results)} search results")

            # Step 3: Generate response using Ollama
            answer = "Based on the search results, I found relevant information but cannot generate a comprehensive answer without Ollama service."

            # Check if Ollama is available
            if self.ollama_service and hasattr(self.ollama_service, 'is_available') and self.ollama_service.is_available:
                try:
                    logger.info("Generating response using Ollama...")
                    ollama_response = await self.ollama_service.generate_response(
                        prompt=query,
                        model=model,
                        context=context
                    )

                    if ollama_response.get("success"):
                        answer = ollama_response.get("response", "No response generated")
                        logger.info("✅ RAG response generated successfully")
                    else:
                        error_msg = ollama_response.get("error", "Unknown error")
                        logger.warning(f"Ollama generation failed: {error_msg}")
                        answer = f"I found relevant information but encountered an error generating the response: {error_msg}"

                except Exception as e:
                    logger.error(f"Error calling Ollama service: {e}")
                    answer = "I found relevant information but encountered an error generating the response."
            else:
                logger.info("Ollama service not available, returning search-only results")
                answer = self.generate_search_summary(search_results, query)

            return {
                "success": True,
                "query": query,
                "answer": answer,
                "sources": self.format_sources(search_results),
                "context": context,
                "total_sources": len(search_results),
                "model_used": model if self.ollama_service and hasattr(self.ollama_service, 'is_available') and self.ollama_service.is_available else "search-only"
            }

        except Exception as e:
            logger.error(f"Error generating RAG response: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")

            return {
                "success": False,
                "error": str(e),
                "query": query,
                "answer": "I encountered an error while processing your question. Please try again.",
                "sources": [],
                "total_sources": 0
            }

    async def search_and_generate(
            self,
            query: str,
            n_results: int = 5,
            model: str = "llama3.2:latest",
            pdf_ids: Optional[List[int]] = None,
            similarity_threshold: float = 0.3
    ) -> Dict[str, Any]:
        """Search documents and generate RAG response (backward compatibility)"""
        return await self.generate_rag_response(
            query=query,
            max_results=n_results,
            model=model,
            document_ids=pdf_ids
        )

    async def search_only(
            self,
            query: str,
            n_results: int = 10,
            pdf_ids: Optional[List[int]] = None,
            similarity_threshold: float = 0.3
    ) -> Dict[str, Any]:
        """Search documents without generating response"""
        try:
            logger.info(f"Processing search-only query: '{query}'")

            if not self.chroma_service:
                return {
                    "success": False,
                    "message": "ChromaDB service not available",
                    "query": query,
                    "results": []
                }

            # Search relevant documents
            search_results = await self.chroma_service.search_documents(
                query=query,
                n_results=n_results,
                pdf_ids=pdf_ids,
                similarity_threshold=similarity_threshold
            )

            return {
                "success": True,
                "query": query,
                "results": search_results,
                "total_results": len(search_results),
                "sources": self.format_sources(search_results)
            }

        except Exception as e:
            logger.error(f"Error in search-only: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": query,
                "results": []
            }

    def format_context(self, search_results: List[Dict[str, Any]]) -> str:
        """Format search results into context for LLM"""
        try:
            if not search_results:
                return ""

            context_parts = []

            for i, result in enumerate(search_results[:5], 1):  # Limit to top 5 results
                content = result.get('content', '').strip()
                filename = result.get('filename', 'Unknown document')
                similarity = result.get('similarity_score', 0)

                if content:
                    context_part = f"[Source {i}: {filename} (relevance: {similarity:.2f})]\n{content}\n"
                    context_parts.append(context_part)

            context = "\n".join(context_parts)

            # Limit context length to prevent token overflow
            max_context_length = 4000  # Adjust based on your model's context window
            if len(context) > max_context_length:
                context = context[:max_context_length] + "\n[Content truncated...]"

            return context

        except Exception as e:
            logger.error(f"Error formatting context: {e}")
            return ""

    def generate_search_summary(self, search_results: List[Dict[str, Any]], query: str) -> str:
        """Generate a summary when Ollama is not available"""
        try:
            if not search_results:
                return "No relevant information found."

            # Create a simple summary from search results
            summary_parts = [f"Based on your query '{query}', I found the following relevant information:\n"]

            for i, result in enumerate(search_results[:3], 1):  # Top 3 results
                content = result.get('content', '').strip()
                filename = result.get('filename', 'Unknown document')
                similarity = result.get('similarity_score', 0)

                if content:
                    # Truncate content for summary
                    short_content = content[:200] + "..." if len(content) > 200 else content
                    summary_parts.append(f"{i}. From '{filename}' (relevance: {similarity:.2f}):\n{short_content}\n")

            if len(search_results) > 3:
                summary_parts.append(f"\n...and {len(search_results) - 3} more relevant results found.")

            return "\n".join(summary_parts)

        except Exception as e:
            logger.error(f"Error generating search summary: {e}")
            return "Found relevant information but could not generate summary."

    def format_sources(self, search_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format sources for response"""
        try:
            sources = []

            for result in search_results:
                source = {
                    "filename": result.get('filename', 'Unknown'),
                    "similarity_score": result.get('similarity_score', 0),
                    "page_number": result.get('page_number'),
                    "chunk_index": result.get('chunk_index')
                }

                # Add document ID if available
                if result.get('document_id'):
                    source["document_id"] = result['document_id']
                if result.get('pdf_id'):
                    source["pdf_id"] = result['pdf_id']

                sources.append(source)

            return sources

        except Exception as e:
            logger.error(f"Error formatting sources: {e}")
            return []

    async def get_search_history(
            self,
            limit: int = 50,
            user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get search history (placeholder - implement with database)"""
        # TODO: Implement search history storage and retrieval
        return []

    async def save_search_query(
            self,
            query: str,
            results_count: int,
            user_id: Optional[str] = None
    ) -> bool:
        """Save search query to history (placeholder - implement with database)"""
        # TODO: Implement search history saving
        return True


# Create global instance that can be imported
rag_service = RAGService()
