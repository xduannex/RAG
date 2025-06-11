from typing import Optional
from app.services.ollama_service import OllamaService
from app.services.vector_store import VectorStore
from app.config.database import get_db_connection
import app.main as main_module

def get_ollama_service() -> Optional[OllamaService]:
    """Get the global Ollama service instance"""
    return getattr(main_module, 'ollama_service', None)

def get_vector_store() -> Optional[VectorStore]:
    """Get the global vector store instance"""
    return getattr(main_module, 'vector_store', None)

async def get_database():
    """Get database connection"""
    return await get_db_connection()