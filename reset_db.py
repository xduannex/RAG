#!/usr/bin/env python3
"""
Reset and initialize the database
"""
import os
import shutil
import sqlite3
from pathlib import Path

def reset_database():
    """Reset all databases and storage"""

    # Paths
    storage_dir = Path("./storage")
    db_path = storage_dir / "app.db"
    chroma_path = storage_dir / "chroma_db"
    pdfs_path = storage_dir / "pdfs"

    print("🗑️  Resetting databases...")

    # 1. Remove SQLite database
    if db_path.exists():
        os.remove(db_path)
        print(f"✅ Deleted SQLite database: {db_path}")

    # 2. Remove ChromaDB
    if chroma_path.exists():
        shutil.rmtree(chroma_path)
        print(f"✅ Deleted ChromaDB: {chroma_path}")

    # 3. Clean PDFs (optional - uncomment if you want to remove uploaded files)
    # if pdfs_path.exists():
    #     for file in pdfs_path.glob("*"):
    #         if file.is_file():
    #             os.remove(file)
    #     print(f"✅ Cleaned PDFs directory: {pdfs_path}")

    # 4. Ensure directories exist
    storage_dir.mkdir(exist_ok=True)
    pdfs_path.mkdir(exist_ok=True)

    print("✅ Storage directories created")

    # 5. Initialize fresh SQLite database
    print("🔧 Creating fresh database schema...")

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create PDFs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pdfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed BOOLEAN DEFAULT FALSE,
            chunk_count INTEGER DEFAULT 0,
            metadata TEXT,
            file_hash TEXT,
            title TEXT,
            category TEXT,
            description TEXT,
            status TEXT DEFAULT 'uploaded',
            processing_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create chunks table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdf_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            page_number INTEGER,
            chunk_meta TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pdf_id) REFERENCES pdfs (id) ON DELETE CASCADE
        )
    """)

    # Create search history table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            query_type TEXT DEFAULT 'search',
            results_count INTEGER DEFAULT 0,
            response_time REAL,
            search_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_session TEXT,
            search_meta TEXT
        )
    """)

    # Create indexes for better performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pdfs_status ON pdfs(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pdfs_processed ON pdfs(processed)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_pdfs_file_hash ON pdfs(file_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_pdf_id ON chunks(pdf_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_search_query_type ON search_history(query_type)")

    conn.commit()
    conn.close()

    print("✅ Fresh database schema created with indexes")
    print("🎉 Database reset complete!")
    print("\nNext steps:")
    print("1. Start your server: uvicorn app.main:app --reload")
    print("2. Upload some PDFs to test")
    print("3. Try searching and RAG queries")

if __name__ == "__main__":
    reset_database()