import os
import logging
import asyncio
from typing import List, Dict, Any, Optional
from pathlib import Path
import hashlib
import json

try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    from chromadb.utils import embedding_functions

    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    chromadb = None

logger = logging.getLogger(__name__)


class ChromaService:
    """Enhanced ChromaDB service with persistence and error handling"""

    def __init__(self):
        self.client = None
        self.collection = None
        self.embedding_function = None
        self._initialized = False

        # Safe settings import to avoid circular import
        try:
            from app.config.settings import settings
            self.collection_name = getattr(settings, 'chroma_collection_name', 'rag_documents')
            self.persist_directory = getattr(settings, 'get_chroma_path', lambda: str(
                Path(__file__).parent.parent.parent / "storage" / "chroma_db"))()
            self.embedding_model = getattr(settings, 'embedding_model', 'all-MiniLM-L6-v2')
        except Exception as e:
            logger.warning(f"Could not import settings, using defaults: {e}")
            # Fallback values
            self.collection_name = 'rag_documents'
            self.persist_directory = str(Path(__file__).parent.parent.parent / "storage" / "chroma_db")
            self.embedding_model = 'all-MiniLM-L6-v2'

        # Ensure ChromaDB directory exists
        self._ensure_chroma_directory()

    def _ensure_chroma_directory(self):
        """Ensure ChromaDB persistence directory exists with proper permissions"""
        try:
            chroma_path = Path(self.persist_directory)
            chroma_path.mkdir(parents=True, exist_ok=True)

            # Set proper permissions
            os.chmod(chroma_path, 0o755)

            logger.info(f"✅ ChromaDB directory ensured: {chroma_path}")

        except Exception as e:
            logger.error(f"❌ Could not create ChromaDB directory: {e}")
            raise

    @property
    def is_initialized(self) -> bool:
        """Check if ChromaDB service is initialized"""
        return self._initialized

    async def initialize(self) -> bool:
        """Initialize ChromaDB with persistence"""
        if not CHROMADB_AVAILABLE:
            logger.error("❌ ChromaDB not available. Install with: pip install chromadb")
            return False

        if self._initialized:
            return True

        try:
            logger.info("🔍 Initializing ChromaDB service...")

            # Create ChromaDB client with persistence
            chroma_settings = ChromaSettings(
                persist_directory=self.persist_directory,
                anonymized_telemetry=False,
                allow_reset=True
            )

            self.client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=chroma_settings
            )

            logger.info(f"✅ ChromaDB client created with persistence: {self.persist_directory}")

            # Initialize embedding function
            self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=self.embedding_model
            )

            # Get or create collection
            try:
                self.collection = self.client.get_collection(
                    name=self.collection_name,
                    embedding_function=self.embedding_function
                )
                logger.info(f"✅ Loaded existing collection: {self.collection_name}")

            except Exception:
                # Collection doesn't exist, create it
                self.collection = self.client.create_collection(
                    name=self.collection_name,
                    embedding_function=self.embedding_function,
                    metadata={"description": "RAG document chunks with persistence"}
                )
                logger.info(f"✅ Created new collection: {self.collection_name}")

            # Verify collection is working
            collection_count = self.collection.count()
            logger.info(f"📊 Collection contains {collection_count} documents")

            self._initialized = True
            return True

        except Exception as e:
            logger.error(f"❌ ChromaDB initialization failed: {e}")
            self._initialized = False
            return False

# Rest of the methods remain the same...
    async def add_documents(
            self,
            documents: List[str],
            metadatas: List[Dict[str, Any]],
            ids: List[str]
    ) -> bool:
        """Add documents to ChromaDB with persistence verification"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                logger.error("ChromaDB collection not initialized")
                return False

            # Validate inputs
            if len(documents) != len(metadatas) or len(documents) != len(ids):
                logger.error("Documents, metadatas, and ids must have the same length")
                return False

            if not documents:
                logger.warning("No documents to add")
                return True

            logger.info(f"📝 Adding {len(documents)} documents to ChromaDB...")

            # Add documents in batches to avoid memory issues
            batch_size = 100
            total_added = 0

            for i in range(0, len(documents), batch_size):
                batch_docs = documents[i:i + batch_size]
                batch_metas = metadatas[i:i + batch_size]
                batch_ids = ids[i:i + batch_size]

                try:
                    self.collection.add(
                        documents=batch_docs,
                        metadatas=batch_metas,
                        ids=batch_ids
                    )
                    total_added += len(batch_docs)
                    logger.info(f"✅ Added batch {i // batch_size + 1}: {len(batch_docs)} documents")

                except Exception as e:
                    logger.error(f"❌ Failed to add batch {i // batch_size + 1}: {e}")
                    continue

            # Verify persistence by checking count
            final_count = self.collection.count()
            logger.info(f"📊 ChromaDB now contains {final_count} total documents")

            # Force persistence (ChromaDB should auto-persist, but let's be sure)
            try:
                if hasattr(self.client, 'persist'):
                    self.client.persist()
                    logger.info("💾 ChromaDB persistence forced")
            except Exception as e:
                logger.warning(f"Could not force persistence: {e}")

            return total_added > 0

        except Exception as e:
            logger.error(f"❌ Error adding documents to ChromaDB: {e}")
            return False

    async def search_documents(
            self,
            query: str,
            n_results: int = 10,
            pdf_ids: Optional[List[int]] = None,
            category: Optional[str] = None,
            similarity_threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """Search documents with enhanced filtering and error handling"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                logger.error("ChromaDB collection not initialized")
                return []

            if not query or not query.strip():
                logger.warning("Empty search query")
                return []

            logger.info(f"🔍 Searching ChromaDB: '{query}' (limit: {n_results})")

            # Build where clause for filtering
            where_clause = {}
            if pdf_ids:
                where_clause["pdf_id"] = {"$in": pdf_ids}
            if category:
                where_clause["category"] = category

            # Perform search
            search_params = {
                "query_texts": [query],
                "n_results": min(n_results, 100)  # Limit to prevent memory issues
            }

            if where_clause:
                search_params["where"] = where_clause

            results = self.collection.query(**search_params)

            if not results or not results.get("documents") or not results["documents"][0]:
                logger.info(f"No results found for query: '{query}'")
                return []

            # Format results
            formatted_results = []
            documents = results["documents"][0]
            metadatas = results.get("metadatas", [[]])[0]
            distances = results.get("distances", [[]])[0]
            ids = results.get("ids", [[]])[0]

            for i, (doc, metadata, distance, doc_id) in enumerate(zip(documents, metadatas, distances, ids)):
                try:
                    # Convert distance to similarity score (ChromaDB uses cosine distance)
                    similarity_score = max(0.0, 1.0 - distance)

                    # Apply similarity threshold
                    if similarity_score < similarity_threshold:
                        continue

                    result = {
                        "id": doc_id,
                        "content": doc,
                        "similarity_score": round(similarity_score, 4),
                        "distance": round(distance, 4),
                        "rank": i + 1
                    }

                    # Add metadata
                    if metadata:
                        result.update({
                            "document_id": metadata.get("pdf_id"),
                            "pdf_id": metadata.get("pdf_id"),
                            "filename": metadata.get("filename", "Unknown"),
                            "title": metadata.get("title", ""),
                            "category": metadata.get("category", ""),
                            "page_number": metadata.get("page_number"),
                            "chunk_index": metadata.get("chunk_index"),
                            "word_count": metadata.get("word_count", 0),
                            "char_count": metadata.get("char_count", 0)
                        })

                    formatted_results.append(result)

                except Exception as e:
                    logger.warning(f"Error formatting result {i}: {e}")
                    continue

            logger.info(f"✅ Found {len(formatted_results)} relevant results")
            return formatted_results

        except Exception as e:
            logger.error(f"❌ ChromaDB search failed: {e}")
            return []

    async def delete_documents(self, pdf_id: int) -> bool:
        """Delete all documents for a specific PDF with verification"""
        try:
            if not self._initialized:
                await self.initialize()

            if not self.collection:
                logger.error("ChromaDB collection not initialized")
                return False

            logger.info(f"🗑️  Deleting documents for PDF ID: {pdf_id}")

            # Get count before deletion for verification
            count_before = self.collection.count()

            # Delete documents where pdf_id matches
            self.collection.delete(
                where={"pdf_id": pdf_id}
            )

            # Verify deletion
            count_after = self.collection.count()
            deleted_count = count_before - count_after

            logger.info(f"✅ Deleted {deleted_count} documents for PDF ID: {pdf_id}")

            # Force persistence
            try:
                if hasattr(self.client, 'persist'):
                    self.client.persist()
            except Exception as e:
                logger.warning(f"Could not force persistence after deletion: {e}")

            return True

        except Exception as e:
            logger.error(f"❌ Error deleting documents for PDF {pdf_id}: {e}")
            return False

    def get_collection_stats(self) -> Dict[str, Any]:
        """Get detailed collection statistics"""
        try:
            if not self._initialized or not self.collection:
                return {
                    "status": "not_initialized",
                    "total_documents": 0,
                    "collection_name": self.collection_name,
                    "persist_directory": self.persist_directory
                }

            # Get basic stats
            total_docs = self.collection.count()

            # Get storage info
            storage_info = self._get_storage_info()

            # Get sample metadata to understand data structure
            sample_data = None
            if total_docs > 0:
                try:
                    sample_results = self.collection.get(limit=1, include=["metadatas"])
                    if sample_results and sample_results.get("metadatas"):
                        sample_data = sample_results["metadatas"][0]
                except Exception:
                    pass

            stats = {
                "status": "healthy",
                "total_documents": total_docs,
                "collection_name": self.collection_name,
                "persist_directory": self.persist_directory,
                "embedding_model": self.embedding_model,
                "storage_info": storage_info,
                "sample_metadata": sample_data,
                "initialized": self._initialized
            }

            return stats

        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {
                "status": "error",
                "error": str(e),
                "total_documents": 0,
                "collection_name": self.collection_name,
                "persist_directory": self.persist_directory
            }

    def _get_storage_info(self) -> Dict[str, Any]:
        """Get ChromaDB storage information"""
        try:
            chroma_path = Path(self.persist_directory)

            if not chroma_path.exists():
                return {"status": "directory_not_found"}

            # Calculate directory size
            total_size = 0
            file_count = 0

            for file_path in chroma_path.rglob('*'):
                if file_path.is_file():
                    total_size += file_path.stat().st_size
                    file_count += 1

            return {
                "status": "exists",
                "directory_exists": True,
                "directory_writable": os.access(chroma_path, os.W_OK),
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "file_count": file_count,
                "path": str(chroma_path)
            }

        except Exception as e:
            return {"status": "error", "error": str(e)}

    def reset_collection(self) -> bool:
        """Reset the collection (delete all documents)"""
        try:
            logger.warning("🗑️  Resetting ChromaDB collection...")

            if self.client and self.collection:
                # Delete and recreate collection
                self.client.delete_collection(name=self.collection_name)
                self.collection = self.client.create_collection(
                    name=self.collection_name,
                    embedding_function=self.embedding_function,
                    metadata={"description": "RAG document chunks (reset)"}
                )

                logger.info("✅ ChromaDB collection reset successfully")
                return True
            else:
                logger.error("ChromaDB client or collection not available")
                return False

        except Exception as e:
            logger.error(f"❌ Error resetting collection: {e}")
            return False

    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check for ChromaDB"""
        health_info = {
            "status": "unknown",
            "chromadb_available": CHROMADB_AVAILABLE,
            "initialized": self._initialized,
            "collection_exists": False,
            "document_count": 0,
            "can_search": False,
            "can_add": False,
            "persistence_working": False,
            "storage_info": {},
            "errors": []
        }

        try:
            # Check if ChromaDB is available
            if not CHROMADB_AVAILABLE:
                health_info["status"] = "unavailable"
                health_info["errors"].append("ChromaDB not installed")
                return health_info

            # Check initialization
            if not self._initialized:
                try:
                    await self.initialize()
                except Exception as e:
                    health_info["errors"].append(f"Initialization failed: {e}")
                    health_info["status"] = "unhealthy"
                    return health_info

            health_info["initialized"] = self._initialized

            # Check collection
            if self.collection:
                health_info["collection_exists"] = True

                try:
                    # Test document count
                    health_info["document_count"] = self.collection.count()

                    # Test search capability
                    test_results = self.collection.query(
                        query_texts=["test query"],
                        n_results=1
                    )
                    health_info["can_search"] = True

                    # Test add capability (add and immediately remove a test document)
                    test_id = f"health_check_{hash(str(asyncio.get_event_loop().time()))}"
                    try:
                        self.collection.add(
                            documents=["health check test document"],
                            metadatas=[{"test": True}],
                            ids=[test_id]
                        )
                        health_info["can_add"] = True

                        # Clean up test document
                        self.collection.delete(ids=[test_id])

                    except Exception as e:
                        health_info["errors"].append(f"Add test failed: {e}")

                except Exception as e:
                    health_info["errors"].append(f"Collection operations failed: {e}")

            # Check persistence
            health_info["storage_info"] = self._get_storage_info()
            health_info["persistence_working"] = health_info["storage_info"].get("directory_exists", False)

            # Determine overall status
            if health_info["collection_exists"] and health_info["can_search"] and health_info[
                "persistence_working"]:
                health_info["status"] = "healthy"
            elif health_info["collection_exists"]:
                health_info["status"] = "degraded"
            else:
                health_info["status"] = "unhealthy"

        except Exception as e:
            health_info["status"] = "error"
            health_info["errors"].append(f"Health check failed: {e}")

        return health_info

    async def close(self):
        """Clean up resources"""
        try:
            # Force final persistence
            if self.client and hasattr(self.client, 'persist'):
                self.client.persist()
                logger.info("💾 Final ChromaDB persistence completed")

            self.client = None
            self.collection = None
            self._initialized = False

            logger.info("✅ ChromaDB service closed")

        except Exception as e:
            logger.error(f"Error closing ChromaDB service: {e}")

# Global ChromaDB service instance - Only create if ChromaDB is available
if CHROMADB_AVAILABLE:
    try:
        chroma_service = ChromaService()
        logger.info("🎉 Global ChromaDB service instance created successfully")
    except Exception as e:
        logger.error(f"❌ Failed to create global ChromaDB service: {e}")
        chroma_service = None
else:
    logger.warning("⚠️  ChromaDB not available, service not created")
    chroma_service = None