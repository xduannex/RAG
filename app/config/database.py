# app/config/database.py
import logging
import aiosqlite
import os
from app.config.settings import settings

logger = logging.getLogger(__name__)

async def init_db():
    """Initialize the database and create tables"""
    try:
        # Ensure storage directory exists
        db_path = settings.database_url.replace("sqlite:///", "")
        db_dir = os.path.dirname(db_path)

        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
            logger.info(f"Created database directory: {db_dir}")

        # Create database and tables
        async with aiosqlite.connect(db_path) as db:
            # Create PDFs table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS pdfs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL UNIQUE,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed BOOLEAN DEFAULT FALSE,
                    chunk_count INTEGER DEFAULT 0,
                    metadata TEXT
                )
            """)

            # Create chunks table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pdf_id INTEGER NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    page_number INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (pdf_id) REFERENCES pdfs (id) ON DELETE CASCADE
                )
            """)

            # Create search history table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS search_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query TEXT NOT NULL,
                    results_count INTEGER DEFAULT 0,
                    search_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    response_time REAL
                )
            """)

            await db.commit()
            logger.info("Database tables created successfully")

    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

async def get_db_connection():
    """Get database connection"""
    db_path = settings.database_url.replace("sqlite:///", "")
    return await aiosqlite.connect(db_path)