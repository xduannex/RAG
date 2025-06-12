import logging
from typing import List, Dict, Any, Optional
from app.services.chroma_service import ChromaService
from app.services.ollama_service import OllamaService
import time

logger = logging.getLogger(__name__)


class RAGResponse:
    def __init__(self, answer: str, sources: List[Dict], confidence_score: float = 0.0, processing_time: float = 0.0):
        self.answer = answer
        self.sources = sources or []
        self.confidence_score = confidence_score
        self.processing_time = processing_time


class RAGService:
    def __init__(self):
        self.chroma_service = None
        self.ollama_service = None
        self._initialized = False

    async def initialize(self):
        """Initialize the RAG service components"""
        try:
            logger.info("Initializing RAG service...")

            # Initialize ChromaDB
            self.chroma_service = ChromaService()
            await self.chroma_service.initialize()

            # Initialize Ollama (optional)
            try:
                self.ollama_service = OllamaService()
                ollama_available = await self.ollama_service.health_check()
                if ollama_available:
                    logger.info("Ollama service is available")
                else:
                    logger.warning("Ollama service is not available - will use fallback responses")
                    self.ollama_service = None
            except Exception as e:
                logger.warning(f"Could not initialize Ollama: {e}")
                self.ollama_service = None

            self._initialized = True
            logger.info("RAG service initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize RAG service: {e}")
            raise

    async def search_documents(
            self,
            query: str,
            limit: int = 10,  # Keep this as 'limit' for external API
            pdf_ids: Optional[List[int]] = None,
            category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for relevant documents"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.chroma_service:
                logger.error("ChromaDB service not available")
                return []

            logger.info(f"Searching for query: '{query}' with limit: {limit}")

            # Search using ChromaDB - use n_results instead of limit
            results = await self.chroma_service.search_documents(
                query=query,
                n_results=limit,  # Changed from limit to n_results
                pdf_ids=pdf_ids,
                category=category
            )

            if not results:
                logger.warning("No search results found in ChromaDB")
                return []

            # Format results properly
            formatted_results = []
            for i, result in enumerate(results):
                try:
                    # Handle different result formats
                    if isinstance(result, dict):
                        formatted_result = {
                            "id": result.get("id", f"result_{i}"),
                            "content": result.get("content", result.get("text", "No content available")),
                            "filename": result.get("filename", result.get("source", "Unknown document")),
                            "title": result.get("title", result.get("filename", "Untitled")),
                            "category": result.get("category", "Uncategorized"),
                            "page_number": result.get("page_number", 1),
                            "pdf_id": result.get("pdf_id", 0),
                            "score": float(result.get("score", result.get("distance", 0.0))),
                            "relevance_score": float(result.get("relevance_score", result.get("score", 0.0)))
                        }
                    else:
                        # Handle string or other formats
                        formatted_result = {
                            "id": f"result_{i}",
                            "content": str(result)[:500] + "..." if len(str(result)) > 500 else str(result),
                            "filename": "Unknown document",
                            "title": "Search Result",
                            "category": "Uncategorized",
                            "page_number": 1,
                            "pdf_id": 0,
                            "score": 0.0,
                            "relevance_score": 0.0
                        }

                    formatted_results.append(formatted_result)

                except Exception as e:
                    logger.warning(f"Error formatting search result {i}: {e}")
                    continue

            logger.info(f"Formatted {len(formatted_results)} search results")
            return formatted_results

        except Exception as e:
            logger.error(f"Error in search_documents: {e}")
            return []

    async def generate_rag_response(
            self,
            question: str,
            pdf_ids: Optional[List[int]] = None,
            category: Optional[str] = None,
            max_context_chunks: int = 5
    ) -> RAGResponse:
        """Generate RAG response with proper formatting"""
        start_time = time.time()

        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Generating RAG response for: '{question}'")

            # Step 1: Search for relevant documents
            search_results = await self.search_documents(
                query=question,
                limit=max_context_chunks,
                pdf_ids=pdf_ids,
                category=category
            )

            if not search_results:
                logger.warning("No relevant documents found for RAG response")
                return RAGResponse(
                    answer="I couldn't find any relevant information in the documents to answer your question.",
                    sources=[],
                    confidence_score=0.0,
                    processing_time=time.time() - start_time
                )

            # Step 2: Prepare context from search results
            context_parts = []
            sources = []

            for i, result in enumerate(search_results[:max_context_chunks]):
                # Add to context
                doc_context = f"Document {i + 1} ({result['filename']}):\n{result['content']}\n"
                context_parts.append(doc_context)

                # Format source properly
                source = {
                    "id": result.get("id", f"source_{i}"),
                    "title": result.get("title", result.get("filename", "Unknown Document")),
                    "filename": result.get("filename", "Unknown Document"),
                    "content": result.get("content", "No content available")[:200] + "...",
                    "page_number": result.get("page_number", 1),
                    "category": result.get("category", "Uncategorized"),
                    "pdf_id": result.get("pdf_id", 0),
                    "relevance_score": result.get("relevance_score", 0.0),
                    "score": result.get("score", 0.0)
                }
                sources.append(source)

            context = "\n\n".join(context_parts)

            # Step 3: Generate answer using Ollama or fallback
            if self.ollama_service:
                try:
                    logger.info("Generating answer using Ollama...")
                    answer = await self.ollama_service.generate_answer(question, context)
                    confidence_score = 0.8  # High confidence when using LLM

                except Exception as e:
                    logger.warning(f"Ollama generation failed: {e}, using fallback")
                    answer = self._generate_fallback_answer(question, search_results)
                    confidence_score = 0.5  # Medium confidence for fallback
            else:
                logger.info("Using fallback answer generation")
                answer = self._generate_fallback_answer(question, search_results)
                confidence_score = 0.5

            processing_time = time.time() - start_time

            logger.info(f"RAG response generated successfully in {processing_time:.2f}s")

            return RAGResponse(
                answer=answer,
                sources=sources,
                confidence_score=confidence_score,
                processing_time=processing_time
            )

        except Exception as e:
            logger.error(f"Error generating RAG response: {e}")
            return RAGResponse(
                answer=f"I encountered an error while processing your question: {str(e)}",
                sources=[],
                confidence_score=0.0,
                processing_time=time.time() - start_time
            )

    def _generate_fallback_answer(self, question: str, search_results: List[Dict]) -> str:
        """Generate a fallback answer when Ollama is not available"""
        if not search_results:
            return "I couldn't find any relevant information to answer your question."

        # Create a simple answer from search results
        answer_parts = [
            f"Based on the available documents, here's what I found related to your question:"
        ]

        for i, result in enumerate(search_results[:3]):  # Use top 3 results
            content = result.get("content", "No content available")
            filename = result.get("filename", "Unknown document")

            # Truncate content if too long
            if len(content) > 200:
                content = content[:200] + "..."

            answer_parts.append(f"\nFrom {filename}:\n{content}")

        if len(search_results) > 3:
            answer_parts.append(f"\n(And {len(search_results) - 3} more relevant documents found)")

        return "\n".join(answer_parts)
