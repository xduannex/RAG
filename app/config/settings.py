import os
import shutil
from pathlib import Path
from typing import List, Optional, Dict, Any
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Base paths - FIXED: Ensure all paths point to storage directory
    BASE_DIR: Path = Path(__file__).parent.parent.parent
    STORAGE_DIR: Path = BASE_DIR / "storage"

    # Environment
    environment: str = "development"

    # Database settings - FIXED: Ensure database is in storage folder
    database_url: str = ""  # Will be set in __init__
    database_path: str = ""  # Will be set in __init__

    # Server settings
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True
    log_level: str = "INFO"

    # Storage paths - FIXED: All storage in one place
    storage_path: str = ""  # Will be set in __init__
    upload_dir: str = ""  # Will be set in __init__
    upload_directory: str = ""  # Will be set in __init__
    temp_directory: str = ""  # Will be set in __init__
    logs_directory: str = ""  # Will be set in __init__
    pdf_storage_path: str = ""  # Will be set in __init__
    uploads_dir: str = ""  # Will be set in __init__
    files_dir: str = ""  # Will be set in __init__

    # File upload settings
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    max_bulk_files: int = 50

    # Supported file types
    allowed_file_types: List[str] = [
        "pdf", "docx", "doc", "txt", "md", "rtf",
        "jpg", "jpeg", "png", "bmp", "tiff", "gif",
        "csv", "json", "xml", "html"
    ]

    # OCR settings
    enable_ocr: bool = True
    ocr_language: str = "eng"
    ocr_confidence_threshold: int = 30

    # ChromaDB settings - FIXED: Store in storage folder
    chroma_host: str = "localhost"
    chroma_port: int = 8000
    chroma_collection_name: str = "rag_documents"  # This is the missing attribute
    chroma_persist_directory: str = ""  # Will be set in __init__
    chroma_db_path: str = ""  # Will be set in __init__

    # Ollama settings
    ollama_base_url: str = "http://localhost:11434"
    ollama_host: str = "http://localhost:11434"
    ollama_model: str = "deepseek-r1:8b"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_timeout: int = 120
    default_model: str = "deepseek-r1:8b"

    # Embedding settings
    embedding_model: str = "all-MiniLM-L6-v2"

    # Text processing
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunks_per_document: int = 1000
    max_chunks_per_pdf: int = 1000

    # Search settings
    default_search_limit: int = 10
    max_search_limit: int = 100
    similarity_threshold: float = 0.7

    # Processing settings
    max_concurrent_processing: int = 3
    processing_timeout: int = 300

    # File monitoring settings
    webserver_pdf_path: str = ""  # Will be set in __init__
    enable_file_monitoring: bool = False
    scan_interval: int = 300

    # Security
    secret_key: str = "your-secret-key-change-in-production"
    allowed_origins: List[str] = ["*"]

    # Backup settings - NEW: For data persistence
    enable_auto_backup: bool = True
    backup_directory: str = ""  # Will be set in __init__
    backup_interval_hours: int = 24
    max_backups: int = 7

    model_config = {
        "env_file": ".env",
        "case_sensitive": False,
        "extra": "allow"
    }

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._setup_paths()
        self._create_directories()
        self._ensure_database_persistence()

    def _setup_paths(self):
        """Setup all path attributes after initialization"""
        # Set up all paths based on STORAGE_DIR
        self.storage_path = str(self.STORAGE_DIR)
        self.database_url = f"sqlite:///{self.STORAGE_DIR}/app.db"
        self.database_path = str(self.STORAGE_DIR / "app.db")

        self.upload_dir = str(self.STORAGE_DIR / "pdfs")
        self.upload_directory = str(self.STORAGE_DIR / "pdfs")
        self.temp_directory = str(self.STORAGE_DIR / "temp")
        self.logs_directory = str(self.STORAGE_DIR / "logs")
        self.pdf_storage_path = str(self.STORAGE_DIR / "pdfs")
        self.uploads_dir = str(self.STORAGE_DIR / "pdfs")
        self.files_dir = str(self.STORAGE_DIR / "pdfs")

        self.chroma_persist_directory = str(self.STORAGE_DIR / "chroma_db")
        self.chroma_db_path = str(self.STORAGE_DIR / "chroma_db")

        self.webserver_pdf_path = str(self.STORAGE_DIR / "webserver_pdfs")
        self.backup_directory = str(self.STORAGE_DIR / "backups")

    def _create_directories(self):
        """Create all necessary directories with proper permissions"""
        directories = [
            self.STORAGE_DIR,
            Path(self.upload_dir),
            Path(self.temp_directory),
            Path(self.logs_directory),
            Path(self.chroma_persist_directory),
            Path(self.backup_directory),
            Path(self.webserver_pdf_path),
        ]

        for directory in directories:
            try:
                directory.mkdir(parents=True, exist_ok=True)
                # Ensure directory is writable
                if not os.access(directory, os.W_OK):
                    os.chmod(directory, 0o755)
            except Exception as e:
                print(f"⚠️  Warning: Could not create directory {directory}: {e}")

    def _ensure_database_persistence(self):
        """Ensure database file exists and is persistent"""
        try:
            db_path = Path(self.database_path)

            # Create database file if it doesn't exist
            if not db_path.exists():
                db_path.touch()

            # Ensure database directory is writable
            db_dir = db_path.parent
            if not os.access(db_dir, os.W_OK):
                os.chmod(db_dir, 0o755)

            # Verify database file is writable
            if not os.access(db_path, os.W_OK):
                os.chmod(db_path, 0o644)

        except Exception as e:
            print(f"⚠️  Warning: Could not ensure database persistence: {e}")

    # Helper methods
    def get_storage_path(self) -> str:
        """Get the main storage path"""
        return self.storage_path

    def get_upload_path(self, filename: str = "") -> str:
        """Get upload path, optionally with filename"""
        if filename:
            return str(Path(self.upload_dir) / filename)
        return self.upload_dir

    def get_pdf_storage_path(self, filename: str = "") -> str:
        """Get PDF storage path, optionally with filename"""
        if filename:
            return str(Path(self.pdf_storage_path) / filename)
        return self.pdf_storage_path

    def get_database_url(self) -> str:
        """Get properly formatted database URL"""
        # Ensure the database URL uses absolute path
        db_path = Path(self.database_path).resolve()
        return f"sqlite:///{db_path}"

    def get_chroma_path(self) -> str:
        """Get ChromaDB persistence path"""
        chroma_path = Path(self.chroma_persist_directory).resolve()
        # Ensure directory exists
        chroma_path.mkdir(parents=True, exist_ok=True)
        return str(chroma_path)

        # Add method to check ChromaDB requirements
    def check_chromadb_requirements(self) -> Dict[str, Any]:
        """Check if ChromaDB requirements are met"""
        try:
            import chromadb
            chromadb_available = True
            chromadb_version = getattr(chromadb, '__version__', 'unknown')
        except ImportError:
            chromadb_available = False
            chromadb_version = None

        chroma_path = Path(self.chroma_persist_directory)

        return {
            "chromadb_available": chromadb_available,
            "chromadb_version": chromadb_version,
            "storage_directory_exists": chroma_path.exists(),
            "storage_directory_writable": os.access(chroma_path.parent,
                                                    os.W_OK) if chroma_path.parent.exists() else False,
            "chroma_path": str(chroma_path)
        }


# Create global settings instance - Fix circular import
try:
    settings = Settings()
except Exception as e:
    print(f"⚠️  Warning: Could not create settings instance: {e}")
    # Create a fallback settings object
    settings = type('Settings', (), {
        'chroma_collection_name': 'rag_documents',
        'embedding_model': 'all-MiniLM-L6-v2',
        'get_chroma_path': lambda: str(Path(__file__).parent.parent.parent / "storage" / "chroma_db")
    })()
