import os
from typing import List


class Settings:
    """Application settings"""

    def __init__(self):
        # API Configuration
        self.host: str = os.getenv("HOST", "0.0.0.0")
        self.port: int = int(os.getenv("PORT", "8000"))
        self.debug: bool = os.getenv("DEBUG", "true").lower() == "true"
        self.log_level: str = os.getenv("LOG_LEVEL", "INFO")

        # CORS Configuration
        self.allowed_origins: List[str] = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
            "http://localhost:5173",
            "http://127.0.0.1:5173"
        ]

        # Database Configuration
        self.database_url: str = os.getenv("DATABASE_URL", "sqlite:///./storage/rag_pdf.db")

        # File Storage
        self.pdf_storage_path: str = os.getenv("PDF_STORAGE_PATH", "./storage/pdfs")
        self.max_file_size: int = int(os.getenv("MAX_FILE_SIZE", str(50 * 1024 * 1024)))  # 50MB

        # Ollama Configuration
        self.ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.ollama_model: str = os.getenv("OLLAMA_MODEL", "llama2")

        # Vector Store Configuration
        self.vector_db_path: str = os.getenv("VECTOR_DB_PATH", "./storage/vector.db")
        self.embedding_model: str = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

        # Ensure storage directories exist
        self._ensure_directories()

    def _ensure_directories(self):
        """Ensure storage directories exist"""
        import os

        # Extract directory from database URL
        if self.database_url.startswith("sqlite:///"):
            db_path = self.database_url.replace("sqlite:///", "")
            db_dir = os.path.dirname(db_path)
            if db_dir and not os.path.exists(db_dir):
                os.makedirs(db_dir, exist_ok=True)

        # Create PDF storage directory
        if not os.path.exists(self.pdf_storage_path):
            os.makedirs(self.pdf_storage_path, exist_ok=True)

        # Create vector DB directory
        vector_dir = os.path.dirname(self.vector_db_path)
        if vector_dir and not os.path.exists(vector_dir):
            os.makedirs(vector_dir, exist_ok=True)


settings = Settings()