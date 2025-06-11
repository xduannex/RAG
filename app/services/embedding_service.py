import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self):
        pass

    async def delete_pdf_embeddings(self, pdf_id: int) -> bool:
        """Delete all embeddings for a specific PDF"""
        logger.info(f"Skipping embedding deletion for PDF {pdf_id} (embeddings not implemented)")
        return True

    async def process_pdf_chunks(self, pdf_id: int, chunks: List[Dict[str, Any]]) -> bool:
        """Process PDF chunks and create embeddings"""
        logger.info(
            f"Skipping embedding creation for {len(chunks)} chunks in PDF {pdf_id} (embeddings not implemented)")
        return True

    def get_stats(self) -> Dict[str, Any]:
        """Get embedding service statistics"""
        return {
            "total_chunks": 0,
            "status": "disabled"
        }