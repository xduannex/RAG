import chromadb
from chromadb.config import Settings as ChromaSettings
import logging
from typing import List, Dict, Any, Optional
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class ChromaService:
    def __init__(self, persist_directory: str = "./storage/chroma"):
        self.persist_directory = persist_directory
        self.client = None
        self.collection = None
        self.executor = ThreadPoolExecutor(max_workers=4)

    async def initialize(self):
        """Initialize ChromaDB client and collection"""
        try:
            # Ensure directory exists
            os.makedirs(self.persist_directory, exist_ok=True)

            # Create ChromaDB client in thread pool (ChromaDB is synchronous)
            loop = asyncio.get_event_loop()
            self.client = await loop.run_in_executor(
                self.executor,
                self._create_client
            )

            # Get or create collection
            self.collection = await loop.run_in_executor(
                self.executor,
                self._get_or_create_collection
            )

            logger.info("ChromaDB service initialized successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            return False

    def _create_client(self):
        """Create ChromaDB client (synchronous)"""
        return chromadb.PersistentClient(
            path=self.persist_directory,
            settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=False
            )
        )

    def _get_or_create_collection(self):
        """Get or create collection (synchronous)"""
        try:
            collection = self.client.get_collection("pdf_documents")
            logger.info("Connected to existing ChromaDB collection")
            return collection
        except:
            collection = self.client.create_collection("pdf_documents")
            logger.info("Created new ChromaDB collection")
            return collection

    async def add_documents(self, documents: List[str], metadatas: List[Dict], ids: List[str]):
        """Add documents to ChromaDB"""
        try:
            if not self.collection:
                await self.initialize()

            # Run in thread pool since ChromaDB is synchronous
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._add_documents_sync,
                documents, metadatas, ids
            )

            logger.info(f"Added {len(documents)} documents to ChromaDB")
            return True

        except Exception as e:
            logger.error(f"Error adding documents to ChromaDB: {e}")
            return False

    def _add_documents_sync(self, documents: List[str], metadatas: List[Dict], ids: List[str]):
        """Add documents synchronously"""
        self.collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    async def search_documents(self, query: str, n_results: int = 10,
                             pdf_ids: Optional[List[int]] = None) -> List[Dict]:
        """Search documents in ChromaDB"""
        try:
            if not self.collection:
                await self.initialize()

            # Build where clause for filtering
            where_clause = None
            if pdf_ids:
                where_clause = {"pdf_id": {"$in": pdf_ids}}

            # Run search in thread pool
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self.executor,
                self._search_documents_sync,
                query, n_results, where_clause
            )

            # Format results
            formatted_results = []
            if results and results.get('documents') and len(results['documents']) > 0:
                for i, doc in enumerate(results['documents'][0]):
                    result = {
                        'id': results['ids'][0][i],
                        'document': doc,
                        'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                        'distance': results['distances'][0][i] if results['distances'] else 0
                    }
                    formatted_results.append(result)

            return formatted_results

        except Exception as e:
            logger.error(f"Error searching ChromaDB: {e}")
            return []

    def _search_documents_sync(self, query: str, n_results: int, where_clause: Optional[Dict]):
        """Search documents synchronously"""
        return self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_clause
        )

    async def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the ChromaDB collection"""
        try:
            if not self.collection:
                await self.initialize()

            # Run in thread pool
            loop = asyncio.get_event_loop()
            count = await loop.run_in_executor(
                self.executor,
                self._get_count_sync
            )

            return {
                "collection_name": self.collection.name,
                "document_count": count,
                "persist_directory": self.persist_directory
            }

        except Exception as e:
            logger.error(f"Error getting collection info: {e}")
            return {}

    def _get_count_sync(self):
        """Get collection count synchronously"""
        return self.collection.count()

    async def delete_documents(self, ids: List[str]) -> bool:
        """Delete documents by IDs"""
        try:
            if not self.collection:
                await self.initialize()

            # Run in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._delete_documents_sync,
                ids
            )

            logger.info(f"Deleted {len(ids)} documents from ChromaDB")
            return True

        except Exception as e:
            logger.error(f"Error deleting documents from ChromaDB: {e}")
            return False

    def _delete_documents_sync(self, ids: List[str]):
        """Delete documents synchronously"""
        self.collection.delete(ids=ids)

    async def update_documents(self, ids: List[str], documents: List[str],
                             metadatas: List[Dict]) -> bool:
        """Update existing documents"""
        try:
            if not self.collection:
                await self.initialize()

            # Run in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._update_documents_sync,
                ids, documents, metadatas
            )

            logger.info(f"Updated {len(ids)} documents in ChromaDB")
            return True

        except Exception as e:
            logger.error(f"Error updating documents in ChromaDB: {e}")
            return False

    def _update_documents_sync(self, ids: List[str], documents: List[str], metadatas: List[Dict]):
        """Update documents synchronously"""
        self.collection.update(
            ids=ids,
            documents=documents,
            metadatas=metadatas
        )

    async def get_documents_by_pdf_id(self, pdf_id: int) -> List[Dict]:
        """Get all documents for a specific PDF ID"""
        try:
            if not self.collection:
                await self.initialize()

            # Search with empty query but filter by PDF ID
            results = await self.search_documents(
                query="",  # Empty query
                n_results=1000,  # Large number to get all chunks
                pdf_ids=[pdf_id]
            )

            return results

        except Exception as e:
            logger.error(f"Error getting documents for PDF {pdf_id}: {e}")
            return []

    async def get_all_pdf_ids(self) -> List[int]:
        """Get all unique PDF IDs in the collection"""
        try:
            if not self.collection:
                await self.initialize()

            # Get all documents (this might be expensive for large collections)
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self.executor,
                self._get_all_documents_sync
            )

            # Extract unique PDF IDs
            pdf_ids = set()
            if results and results.get('metadatas'):
                for metadata in results['metadatas']:
                    pdf_id = metadata.get('pdf_id')
                    if pdf_id is not None:
                        pdf_ids.add(pdf_id)

            return list(pdf_ids)

        except Exception as e:
            logger.error(f"Error getting all PDF IDs: {e}")
            return []

    def _get_all_documents_sync(self):
        """Get all documents synchronously"""
        return self.collection.get()

    async def collection_exists(self) -> bool:
        """Check if collection exists"""
        try:
            if not self.client:
                await self.initialize()

            loop = asyncio.get_event_loop()
            collections = await loop.run_in_executor(
                self.executor,
                self._list_collections_sync
            )

            return "pdf_documents" in [col.name for col in collections]

        except Exception as e:
            logger.error(f"Error checking collection existence: {e}")
            return False

    def _list_collections_sync(self):
        """List collections synchronously"""
        return self.client.list_collections()

    async def reset_collection(self) -> bool:
        """Reset (delete and recreate) the collection"""
        try:
            if not self.client:
                await self.initialize()

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                self.executor,
                self._reset_collection_sync
            )

            # Recreate collection
            self.collection = await loop.run_in_executor(
                self.executor,
                self._get_or_create_collection
            )

            logger.info("ChromaDB collection reset successfully")
            return True

        except Exception as e:
            logger.error(f"Error resetting collection: {e}")
            return False

    def _reset_collection_sync(self):
        """Reset collection synchronously"""
        try:
            self.client.delete_collection("pdf_documents")
        except:
            pass  # Collection might not exist

    async def close(self):
        """Close the ChromaDB service"""
        try:
            if self.executor:
                self.executor.shutdown(wait=True)
            logger.info("ChromaDB service closed")
        except Exception as e:
            logger.error(f"Error closing ChromaDB service: {e}")