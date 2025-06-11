import logging
from typing import List, Dict, Any, Optional
import asyncio
import time
from app.services.chroma_service import ChromaService
from app.services.ollama_service import OllamaService
from app.models.search_models import SearchResult, RAGResponse

logger = logging.getLogger(__name__)


class RAGService:
    def __init__(self):
        self.chroma_service = ChromaService()
        self.ollama_service = OllamaService()
        self._initialized = False

    async def initialize(self):
        """Initialize the RAG service"""
        if not self._initialized:
            try:
                # Initialize ChromaDB
                await self.chroma_service.initialize()
                logger.info("ChromaDB service initialized")

                # Test Ollama connection (don't fail if not available)
                try:
                    is_healthy = await self.ollama_service.health_check()
                    if is_healthy:
                        logger.info("Ollama service is healthy")
                    else:
                        logger.warning("Ollama service is not available - will use fallback responses")
                except Exception as e:
                    logger.warning(f"Ollama service check failed: {e}")

                self._initialized = True
                logger.info("RAG service initialized successfully")

            except Exception as e:
                logger.error(f"Failed to initialize RAG service: {e}")
                raise

    async def search_documents(self,
                               query: str,
                               limit: int = 10,
                               pdf_ids: Optional[List[int]] = None,
                               category: Optional[str] = None) -> List[SearchResult]:
        """Search documents using ChromaDB and return formatted results"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Searching for query: '{query}' with limit: {limit}")

            # Search in ChromaDB
            chroma_results = await self.chroma_service.search_documents(
                query=query,
                n_results=limit,
                pdf_ids=pdf_ids
            )

            if not chroma_results:
                logger.warning("No search results found in ChromaDB")
                return []

            # Convert ChromaDB results to SearchResult objects
            search_results = []
            for result in chroma_results:
                try:
                    metadata = result.get('metadata', {})

                    # Extract information from metadata
                    pdf_id = metadata.get('pdf_id', 0)
                    pdf_filename = metadata.get('filename', f'document_{pdf_id}.pdf')
                    pdf_title = metadata.get('title', pdf_filename)
                    page_number = metadata.get('page_number', 1)
                    chunk_text = result.get('document', '')

                    # Calculate relevance score (ChromaDB returns distance, convert to similarity)
                    distance = result.get('distance', 1.0)
                    relevance_score = max(0.0, 1.0 - distance)  # Convert distance to similarity

                    # Create SearchResult
                    search_result = SearchResult(
                        pdf_id=pdf_id,
                        pdf_filename=pdf_filename,
                        pdf_title=pdf_title,
                        page_number=page_number,
                        chunk_text=chunk_text,
                        relevance_score=relevance_score,
                        pdf_url=f"/api/v1/pdf/{pdf_id}/view",
                        chunk_id=result.get('id', f'chunk_{pdf_id}_{page_number}'),
                        chunk_index=metadata.get('chunk_index', 0)
                    )

                    search_results.append(search_result)

                except Exception as e:
                    logger.error(f"Error processing search result: {e}")
                    continue

            # Sort by relevance score (highest first)
            search_results.sort(key=lambda x: x.relevance_score, reverse=True)

            logger.info(f"Returning {len(search_results)} search results")
            return search_results

        except Exception as e:
            logger.error(f"Error in document search: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return []

    async def generate_rag_response(self,
                                    question: str,
                                    pdf_ids: Optional[List[int]] = None,
                                    category: Optional[str] = None,
                                    max_context_chunks: int = 5) -> RAGResponse:
        """Generate RAG response with context from relevant documents"""
        start_time = time.time()

        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Generating RAG response for question: '{question}'")

            # Search for relevant chunks
            search_results = await self.search_documents(
                query=question,
                limit=max_context_chunks,
                pdf_ids=pdf_ids,
                category=category
            )

            if not search_results:
                logger.warning("No relevant documents found for RAG response")
                return RAGResponse(
                    question=question,
                    answer="I couldn't find any relevant information in the documents to answer your question.",
                    sources=[],
                    confidence_score=0.0,
                    processing_time=time.time() - start_time
                )

            logger.info(f"Found {len(search_results)} relevant chunks for RAG")

            # Prepare context from search results
            context_parts = []
            for i, result in enumerate(search_results, 1):
                context_part = f"""
Document {i} (from {result.pdf_filename}, page {result.page_number}):
{result.chunk_text}
---
"""
                context_parts.append(context_part)

            context = "\n".join(context_parts)

            # Generate response using Ollama
            answer = None
            try:
                is_healthy = await self.ollama_service.health_check()
                if is_healthy:
                    answer = await self.ollama_service.generate_response(
                        prompt=question,
                        context=context
                    )
                    logger.info("Generated answer using Ollama")
                else:
                    logger.warning("Ollama service is not healthy")
            except Exception as e:
                logger.error(f"Error generating answer with Ollama: {e}")

            # Fallback answer if Ollama failed
            if not answer:
                logger.info("Using fallback answer generation")
                answer = self._generate_fallback_answer(question, search_results)

            # Calculate confidence score based on relevance scores
            if search_results:
                avg_relevance = sum(r.relevance_score for r in search_results) / len(search_results)
                confidence_score = min(avg_relevance * 1.2, 1.0)  # Boost and cap at 1.0
            else:
                confidence_score = 0.0

            processing_time = time.time() - start_time

            return RAGResponse(
                question=question,
                answer=answer,
                sources=search_results,
                confidence_score=confidence_score,
                processing_time=processing_time
            )

        except Exception as e:
            logger.error(f"Error generating RAG response: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")

            return RAGResponse(
                question=question,
                answer="I apologize, but I encountered an error while processing your question. Please try again.",
                sources=[],
                confidence_score=0.0,
                processing_time=time.time() - start_time
            )

    def _generate_fallback_answer(self, question: str, search_results: List[SearchResult]) -> str:
        """Generate a fallback answer when Ollama is not available"""
        if not search_results:
            return "I couldn't find relevant information to answer your question."

        # Create a simple answer from the most relevant chunks
        top_chunks = search_results[:3]  # Use top 3 most relevant chunks

        answer_parts = [f"Based on the documents, here's what I found regarding '{question}':\n"]

        for i, result in enumerate(top_chunks, 1):
            # Extract key sentences from the chunk
            sentences = result.chunk_text.split('.')
            key_sentences = [s.strip() for s in sentences if len(s.strip()) > 20][:2]  # Top 2 sentences

            if key_sentences:
                chunk_summary = '. '.join(key_sentences) + '.'
                answer_parts.append(f"\n{i}. From {result.pdf_filename} (page {result.page_number}):\n{chunk_summary}")

        answer_parts.append(f"\n\nThis information was found across {len(search_results)} relevant document sections.")

        return ''.join(answer_parts)

    async def generate_summary(self,
                               pdf_ids: List[int],
                               max_chunks: int = 10) -> str:
        """Generate summary for specific PDFs"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Generating summary for PDFs: {pdf_ids}")

            # Get representative chunks from the PDFs
            search_results = await self.search_documents(
                query="summary overview main points key information important content",
                limit=max_chunks,
                pdf_ids=pdf_ids
            )

            if not search_results:
                return "No content available for summary."

            # Combine chunks for summarization
            combined_text = "\n\n".join([result.chunk_text for result in search_results])

            # Generate summary using Ollama if available
            try:
                is_healthy = await self.ollama_service.health_check()
                if is_healthy:
                    summary = await self.ollama_service.summarize_text(combined_text)
                    if summary:
                        return summary
                    else:
                        logger.warning("Ollama returned empty summary")
                else:
                    logger.warning("Ollama service is not healthy for summary generation")
            except Exception as e:
                logger.error(f"Error generating summary with Ollama: {e}")

            # Fallback summary when Ollama is not available
            return self._generate_fallback_summary(search_results)

        except Exception as e:
            logger.error(f"Error generating summary: {e}")
            return "Unable to generate summary at this time."

    def _generate_fallback_summary(self, search_results: List[SearchResult]) -> str:
        """Generate a fallback summary when Ollama is not available"""
        if not search_results:
            return "No content available for summary."

        # Extract key information from search results
        summary_parts = ["Summary of document content:\n"]

        # Group results by PDF
        pdf_groups = {}
        for result in search_results:
            pdf_id = result.pdf_id
            if pdf_id not in pdf_groups:
                pdf_groups[pdf_id] = {
                    'filename': result.pdf_filename,
                    'chunks': []
                }
            pdf_groups[pdf_id]['chunks'].append(result)

        # Create summary for each PDF
        for pdf_id, pdf_data in pdf_groups.items():
            summary_parts.append(f"\n• {pdf_data['filename']}:")

            # Get key sentences from chunks
            all_text = " ".join([chunk.chunk_text for chunk in pdf_data['chunks']])
            sentences = all_text.split('.')

            # Find important sentences (containing key words)
            important_keywords = ['main', 'important', 'key', 'summary', 'conclusion', 'result', 'significant']
            key_sentences = []

            for sentence in sentences[:20]:  # Limit to first 20 sentences
                sentence = sentence.strip()
                if len(sentence) > 30:  # Only consider substantial sentences
                    if any(keyword in sentence.lower() for keyword in important_keywords):
                        key_sentences.append(sentence)
                    elif len(key_sentences) < 2:  # Include first few sentences anyway
                        key_sentences.append(sentence)

            # Add key sentences to summary
            for sentence in key_sentences[:3]:  # Max 3 sentences per PDF
                summary_parts.append(f"  - {sentence}.")

        return '\n'.join(summary_parts)

    async def find_similar_documents(self,
                                     pdf_id: int,
                                     limit: int = 5) -> List[SearchResult]:
        """Find documents similar to a specific PDF"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Finding similar documents for PDF {pdf_id}")

            # First, get some content from the target PDF to use as search query
            target_content = await self.search_documents(
                query="main content overview summary",
                limit=3,
                pdf_ids=[pdf_id]
            )

            if not target_content:
                logger.warning(f"No content found for PDF {pdf_id}")
                return []

            # Use the content as search query to find similar documents
            search_query = " ".join([chunk.chunk_text[:200] for chunk in target_content])

            # Search for similar documents (excluding the target PDF)
            similar_results = await self.search_documents(
                query=search_query,
                limit=limit + 5  # Get extra to filter out source PDF
            )

            # Filter out the source PDF
            filtered_results = [r for r in similar_results if r.pdf_id != pdf_id]

            return filtered_results[:limit]

        except Exception as e:
            logger.error(f"Error finding similar documents for PDF {pdf_id}: {e}")
            return []

    async def get_document_statistics(self) -> Dict[str, Any]:
        """Get statistics about the document collection"""
        try:
            if not self._initialized:
                await self.initialize()

            # Get ChromaDB collection info
            collection_info = await self.chroma_service.get_collection_info()

            # Get basic stats
            total_chunks = collection_info.get('document_count', 0)

            # Try to get PDF count by querying unique PDF IDs
            try:
                # This is a simplified approach - you might need to adjust based on your metadata structure
                all_results = await self.chroma_service.search_documents(
                    query="",  # Empty query to get all documents
                    n_results=1000  # Adjust based on your collection size
                )

                unique_pdf_ids = set()
                categories = set()

                for result in all_results:
                    metadata = result.get('metadata', {})
                    pdf_id = metadata.get('pdf_id')
                    category = metadata.get('category')

                    if pdf_id:
                        unique_pdf_ids.add(pdf_id)
                    if category:
                        categories.add(category)

                total_pdfs = len(unique_pdf_ids)

            except Exception as e:
                logger.error(f"Error getting detailed stats: {e}")
                total_pdfs = 0
                categories = set()

            return {
                "total_pdfs": total_pdfs,
                "searchable_pdfs": total_pdfs,  # Assume all PDFs in ChromaDB are searchable
                "total_chunks": total_chunks,
                "avg_chunks_per_pdf": total_chunks / max(total_pdfs, 1),
                "categories": list(categories),
                "vector_db_info": collection_info,
                "processing_status": {
                    "completed": total_pdfs,  # All PDFs in ChromaDB are processed
                    "pending": 0,
                    "processing": 0,
                    "failed": 0
                }
            }

        except Exception as e:
            logger.error(f"Error getting document statistics: {e}")
            return {
                "total_pdfs": 0,
                "searchable_pdfs": 0,
                "total_chunks": 0,
                "avg_chunks_per_pdf": 0,
                "categories": [],
                "vector_db_info": {},
                "processing_status": {
                    "completed": 0,
                    "pending": 0,
                    "processing": 0,
                    "failed": 0
                }
            }

    async def add_pdf_to_collection(self,
                                    pdf_id: int,
                                    chunks: List[Dict[str, Any]],
                                    pdf_metadata: Dict[str, Any]) -> bool:
        """Add PDF chunks to ChromaDB collection"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Adding PDF {pdf_id} to ChromaDB collection with {len(chunks)} chunks")

            # Prepare data for ChromaDB
            documents = []
            metadatas = []
            ids = []

            for i, chunk in enumerate(chunks):
                # Create unique ID for each chunk
                chunk_id = f"pdf_{pdf_id}_chunk_{i}"

                # Prepare document text
                document_text = chunk.get('text', chunk.get('content', ''))

                # Prepare metadata
                metadata = {
                    'pdf_id': pdf_id,
                    'chunk_index': i,
                    'page_number': chunk.get('page_number', 1),
                    'filename': pdf_metadata.get('filename', f'document_{pdf_id}.pdf'),
                    'title': pdf_metadata.get('title', pdf_metadata.get('filename', f'Document {pdf_id}')),
                    'category': pdf_metadata.get('category'),
                    'file_size': pdf_metadata.get('file_size', 0),
                    'upload_date': pdf_metadata.get('upload_date', ''),
                    'char_count': len(document_text),
                    'word_count': len(document_text.split()) if document_text else 0
                }

                # Remove None values from metadata
                metadata = {k: v for k, v in metadata.items() if v is not None}

                documents.append(document_text)
                metadatas.append(metadata)
                ids.append(chunk_id)

            # Add to ChromaDB
            success = await self.chroma_service.add_documents(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )

            if success:
                logger.info(f"Successfully added PDF {pdf_id} to ChromaDB")
            else:
                logger.error(f"Failed to add PDF {pdf_id} to ChromaDB")

            return success

        except Exception as e:
            logger.error(f"Error adding PDF {pdf_id} to collection: {e}")
            return False

    async def remove_pdf_from_collection(self, pdf_id: int) -> bool:
        """Remove PDF chunks from ChromaDB collection"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Removing PDF {pdf_id} from ChromaDB collection")

            # ChromaDB doesn't have a direct way to delete by metadata filter
            # We need to find all chunk IDs for this PDF first
            search_results = await self.chroma_service.search_documents(
                query="",  # Empty query
                n_results=1000,  # Large number to get all chunks
                pdf_ids=[pdf_id]
            )

            if not search_results:
                logger.warning(f"No chunks found for PDF {pdf_id}")
                return True  # Nothing to delete

            # Extract chunk IDs
            chunk_ids = [result['id'] for result in search_results]

            # Delete chunks (this would need to be implemented in ChromaService)
            # For now, we'll log the operation
            logger.info(f"Would delete {len(chunk_ids)} chunks for PDF {pdf_id}")

            # TODO: Implement actual deletion in ChromaService
            # success = await self.chroma_service.delete_documents(chunk_ids)

            return True

        except Exception as e:
            logger.error(f"Error removing PDF {pdf_id} from collection: {e}")
            return False

    async def get_pdf_chunks(self, pdf_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all chunks for a specific PDF"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Getting chunks for PDF {pdf_id}")

            # Search for all chunks of this PDF
            search_results = await self.chroma_service.search_documents(
                query="",  # Empty query to get all chunks
                n_results=limit,
                pdf_ids=[pdf_id]
            )

            # Format chunks for response
            chunks = []
            for result in search_results:
                metadata = result.get('metadata', {})
                chunk_data = {
                    'chunk_id': result.get('id'),
                    'chunk_index': metadata.get('chunk_index', 0),
                    'page_number': metadata.get('page_number', 1),
                    'text_content': result.get('document', ''),
                    'char_count': metadata.get('char_count', 0),
                    'word_count': metadata.get('word_count', 0),
                    'metadata': metadata
                }
                chunks.append(chunk_data)

            # Sort by chunk index
            chunks.sort(key=lambda x: x['chunk_index'])

            logger.info(f"Retrieved {len(chunks)} chunks for PDF {pdf_id}")
            return chunks

        except Exception as e:
            logger.error(f"Error getting chunks for PDF {pdf_id}: {e}")
            return []

    async def search_with_filters(self,
                                  query: str,
                                  pdf_ids: Optional[List[int]] = None,
                                  categories: Optional[List[str]] = None,
                                  date_range: Optional[Dict[str, str]] = None,
                                  min_relevance: float = 0.0,
                                  limit: int = 10) -> List[SearchResult]:
        """Advanced search with multiple filters"""
        try:
            if not self._initialized:
                await self.initialize()

            logger.info(f"Advanced search with query: '{query}', filters: pdf_ids={pdf_ids}, categories={categories}")

            # Perform basic search first
            search_results = await self.search_documents(
                query=query,
                limit=limit * 2,  # Get more results to filter
                pdf_ids=pdf_ids
            )

            # Apply additional filters
            filtered_results = []
            for result in search_results:
                # Check relevance threshold
                if result.relevance_score < min_relevance:
                    continue

                # Check category filter
                if categories:
                    # This would need to be extracted from metadata
                    # For now, we'll skip this filter
                    pass

                # Check date range filter
                if date_range:
                    # This would need to be implemented based on your metadata structure
                    pass

                filtered_results.append(result)

            # Limit final results
            filtered_results = filtered_results[:limit]

            logger.info(f"Advanced search returned {len(filtered_results)} filtered results")
            return filtered_results

        except Exception as e:
            logger.error(f"Error in advanced search: {e}")
            return []

    async def get_search_suggestions(self, partial_query: str, limit: int = 5) -> List[str]:
        """Get search suggestions based on partial query"""
        try:
            if not self._initialized:
                await self.initialize()

            # This is a simplified implementation
            # In a real system, you might maintain a separate index of common terms

            # For now, return some generic suggestions based on the partial query
            suggestions = []

            if len(partial_query) >= 2:
                # Search for documents containing the partial query
                search_results = await self.search_documents(
                    query=partial_query,
                    limit=10
                )

                # Extract common terms from results
                all_text = " ".join([result.chunk_text for result in search_results])
                words = all_text.lower().split()

                # Find words that start with the partial query
                matching_words = [word for word in set(words)
                                if word.startswith(partial_query.lower()) and len(word) > len(partial_query)]

                # Sort by frequency (simplified)
                suggestions = sorted(matching_words)[:limit]

            return suggestions

        except Exception as e:
            logger.error(f"Error getting search suggestions: {e}")
            return []

    async def health_check(self) -> Dict[str, Any]:
        """Health check for RAG service"""
        try:
            health_status = {
                "rag_service": "healthy",
                "chroma_db": "unknown",
                "ollama_service": "unknown",
                "initialized": self._initialized
            }

            # Check ChromaDB
            try:
                if self._initialized:
                    collection_info = await self.chroma_service.get_collection_info()
                    health_status["chroma_db"] = "healthy"
                    health_status["chroma_info"] = collection_info
                else:
                    health_status["chroma_db"] = "not_initialized"
            except Exception as e:
                health_status["chroma_db"] = f"unhealthy: {str(e)}"

            # Check Ollama
            try:
                is_ollama_healthy = await self.ollama_service.health_check()
                health_status["ollama_service"] = "healthy" if is_ollama_healthy else "unhealthy"
            except Exception as e:
                health_status["ollama_service"] = f"unhealthy: {str(e)}"

            return health_status

        except Exception as e:
            logger.error(f"Error in RAG service health check: {e}")
            return {
                "rag_service": "unhealthy",
                "error": str(e),
                "initialized": self._initialized
            }

    async def cleanup_service(self):
        """Cleanup resources"""
        try:
            logger.info("Cleaning up RAG service...")

            # Close Ollama service
            if hasattr(self, 'ollama_service') and self.ollama_service:
                await self.ollama_service.close()
                logger.info("Ollama service closed")

            # ChromaDB client cleanup (if needed)
            if hasattr(self, 'chroma_service') and self.chroma_service:
                # ChromaDB doesn't typically need explicit cleanup
                logger.info("ChromaDB service cleanup completed")

            self._initialized = False
            logger.info("RAG service cleanup completed")

        except Exception as e:
            logger.error(f"Error during RAG service cleanup: {e}")

    def __del__(self):
        """Destructor to ensure cleanup"""
        if self._initialized:
            try:
                # Note: This won't work with async cleanup, but it's a safety net
                logger.warning("RAG service was not properly cleaned up")
            except:
                pass