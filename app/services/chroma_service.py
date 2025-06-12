import logging
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
import os

logger = logging.getLogger(__name__)


class ChromaService:
    def __init__(self, collection_name: str = "pdf_documents"):
        self.collection_name = collection_name
        self.client = None
        self.collection = None
        self._initialized = False

        # ChromaDB storage path
        self.persist_directory = os.path.join("storage", "chroma_db")
        os.makedirs(self.persist_directory, exist_ok=True)

    async def initialize(self):
        """Initialize ChromaDB client and collection"""
        try:
            if self._initialized:
                return True

            logger.info("Initializing ChromaDB...")

            # Create ChromaDB client with persistence
            self.client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )

            # Get or create collection
            try:
                self.collection = self.client.get_collection(name=self.collection_name)
                logger.info(f"Connected to existing ChromaDB collection: {self.collection_name}")
            except Exception:
                self.collection = self.client.create_collection(
                    name=self.collection_name,
                    metadata={"description": "PDF document chunks for RAG"}
                )
                logger.info(f"Created new ChromaDB collection: {self.collection_name}")

            self._initialized = True
            logger.info("ChromaDB initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            self._initialized = False
            return False

    async def search_documents(
            self,
            query: str,
            n_results: int = 10,  # Changed from 'limit' to 'n_results'
            pdf_ids: Optional[List[int]] = None,
            category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for similar documents using ChromaDB"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                logger.error("ChromaDB collection not initialized")
                return []

            logger.info(f"Searching ChromaDB for: '{query}' with n_results: {n_results}")

            # Build where clause for filtering
            where_clause = {}
            if pdf_ids:
                where_clause["pdf_id"] = {"$in": pdf_ids}
            if category:
                where_clause["category"] = category

            # Perform search
            search_params = {
                "query_texts": [query],
                "n_results": n_results
            }

            # Add where clause if we have filters
            if where_clause:
                search_params["where"] = where_clause

            results = self.collection.query(**search_params)

            if not results or not results.get("documents") or not results["documents"][0]:
                logger.info(f"No results found for query: {query}")
                return []

            # Format results
            formatted_results = []
            documents = results["documents"][0]
            metadatas = results.get("metadatas", [[]])[0]
            distances = results.get("distances", [[]])[0]
            ids = results.get("ids", [[]])[0]

            for i, (doc, metadata, distance, doc_id) in enumerate(zip(documents, metadatas, distances, ids)):
                try:
                    # Convert distance to similarity score (lower distance = higher similarity)
                    similarity_score = max(0, 1 - distance) if distance is not None else 0

                    result = {
                        "id": doc_id,
                        "content": doc,
                        "pdf_id": metadata.get("pdf_id", 0),
                        "filename": metadata.get("filename", "Unknown"),
                        "title": metadata.get("title", metadata.get("filename", "Unknown")),
                        "category": metadata.get("category", "Uncategorized"),
                        "page_number": metadata.get("page_number", 1),
                        "chunk_index": metadata.get("chunk_index", i),
                        "distance": distance,
                        "score": similarity_score,
                        "relevance_score": similarity_score
                    }
                    formatted_results.append(result)

                except Exception as e:
                    logger.warning(f"Error formatting result {i}: {e}")
                    continue

            logger.info(f"Found {len(formatted_results)} results for query: {query}")
            return formatted_results

        except Exception as e:
            logger.error(f"Error searching ChromaDB: {e}")
            return []

    async def add_documents(
            self,
            documents: List[str],
            metadatas: List[Dict[str, Any]],
            ids: List[str]
    ) -> bool:
        """Add documents to ChromaDB collection"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                logger.error("ChromaDB collection not initialized")
                return False

            logger.info(f"Adding {len(documents)} documents to ChromaDB")

            self.collection.add(
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )

            logger.info(f"Successfully added {len(documents)} documents to ChromaDB")
            return True

        except Exception as e:
            logger.error(f"Error adding documents to ChromaDB: {e}")
            return False

    async def delete_documents(self, pdf_id: int) -> bool:
        """Delete all documents for a specific PDF"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                logger.error("ChromaDB collection not initialized")
                return False

            logger.info(f"Deleting documents for PDF ID: {pdf_id}")

            # Delete documents where pdf_id matches
            self.collection.delete(
                where={"pdf_id": pdf_id}
            )

            logger.info(f"Successfully deleted documents for PDF ID: {pdf_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting documents for PDF {pdf_id}: {e}")
            return False

    async def get_collection_info(self) -> Dict[str, Any]:
        """Get collection information"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                return {"error": "Collection not initialized", "document_count": 0}

            count = self.collection.count()
            return {
                "document_count": count,
                "collection_name": self.collection_name,
                "status": "healthy" if count > 0 else "empty"
            }

        except Exception as e:
            logger.error(f"Error getting collection info: {e}")
            return {"error": str(e), "document_count": 0}

    def reset_collection(self):
        """Reset the collection (delete all documents)"""
        try:
            if self.client and self.collection:
                self.client.delete_collection(name=self.collection_name)
                self.collection = self.client.create_collection(
                    name=self.collection_name,
                    metadata={"description": "PDF document chunks for RAG"}
                )
                logger.info("ChromaDB collection reset successfully")
                return True
        except Exception as e:
            logger.error(f"Error resetting collection: {e}")
            return False
