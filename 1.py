import sqlite3
import os

db_path = "./storage/rag_pdf.db"

if os.path.exists(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print("Tables:", [t[0] for t in tables])

    # Check pdfs table structure
    if any('pdfs' in str(t) for t in tables):
        cursor.execute("PRAGMA table_info(pdfs)")
        columns = cursor.fetchall()
        print("\nPDFs table columns:")
        for col in columns:
            print(f"  {col[1]} ({col[2]})")

    # Check chunks table structure
    if any('chunks' in str(t) for t in tables):
        cursor.execute("PRAGMA table_info(chunks)")
        columns = cursor.fetchall()
        print("\nChunks table columns:")
        for col in columns:
            print(f"  {col[1]} ({col[2]})")

    conn.close()
else:
    print("Database not found at:", db_path)