import os
import sqlite3
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import logging

from app.config.settings import Settings
from app.models.database_models import Base

logger = logging.getLogger(__name__)

# Database engine with proper configuration for persistence
engine = create_engine(
    Settings.get_database_url(),
    connect_args={
        "check_same_thread": False,
        "timeout": 30,
        "isolation_level": None,
    },
    poolclass=StaticPool,
    pool_pre_ping=True,
    pool_recycle=300,
    echo=Settings.debug
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> bool:
    """Initialize database with proper error handling and persistence"""
    try:
        logger.info("🗄️  Initializing database...")

        # Ensure storage directory exists
        storage_dir = Path(Settings.storage_path)
        storage_dir.mkdir(parents=True, exist_ok=True)

        # Ensure database file exists
        db_path = Path(Settings.database_path)
        if not db_path.exists():
            db_path.touch()
            logger.info(f"✅ Created database file: {db_path}")

        # Set proper permissions
        os.chmod(db_path, 0o644)
        os.chmod(storage_dir, 0o755)

        # Test database connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            logger.info("✅ Database connection successful")

        # Create all tables
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created/verified")

        # Verify tables exist
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        expected_tables = ['documents', 'chunks', 'search_history', 'user_sessions', 'system_logs', 'processing_queue']

        missing_tables = [table for table in expected_tables if table not in tables]
        if missing_tables:
            logger.warning(f"⚠️  Missing tables: {missing_tables}")
        else:
            logger.info(f"✅ All expected tables present: {len(tables)} tables")

        # Add any missing columns (for upgrades)
        add_missing_columns()

        # Create indexes for performance
        create_indexes()

        # Enable WAL mode for better concurrency
        enable_wal_mode()

        logger.info("🎉 Database initialization completed successfully")
        return True

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        return False


def add_missing_columns():
    """Add any missing columns for database upgrades"""
    try:
        with engine.connect() as conn:
            # Check and add missing columns to documents table
            inspector = inspect(engine)

            # Get existing columns
            existing_columns = [col['name'] for col in inspector.get_columns('documents')]

            # Define required columns with their SQL definitions
            required_columns = {
                'file_hash': 'VARCHAR(64)',
                'processing_status': 'VARCHAR(20) DEFAULT "pending"',
                'error_message': 'TEXT',
                'text_quality_score': 'FLOAT',
                'ocr_confidence': 'FLOAT',
                'processed_at': 'DATETIME',
                'content_hash': 'VARCHAR(64)',
                'embedding_model': 'VARCHAR(100)',
                'embedding_quality': 'FLOAT'
            }

            # Add missing columns
            for column_name, column_def in required_columns.items():
                if column_name not in existing_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE documents ADD COLUMN {column_name} {column_def}"))
                        conn.commit()
                        logger.info(f"✅ Added column {column_name} to documents table")
                    except Exception as e:
                        logger.warning(f"⚠️  Could not add column {column_name}: {e}")

            # Check chunks table
            chunks_columns = [col['name'] for col in inspector.get_columns('chunks')]
            chunks_required = {
                'content_hash': 'VARCHAR(64)',
                'start_char': 'INTEGER',
                'end_char': 'INTEGER',
                'language': 'VARCHAR(10)',
                'text_quality_score': 'FLOAT',
                'embedding_quality': 'FLOAT',
                'embedding_model': 'VARCHAR(100)',
                'processed_at': 'DATETIME'
            }

            for column_name, column_def in chunks_required.items():
                if column_name not in chunks_columns:
                    try:
                        conn.execute(text(f"ALTER TABLE chunks ADD COLUMN {column_name} {column_def}"))
                        conn.commit()
                        logger.info(f"✅ Added column {column_name} to chunks table")
                    except Exception as e:
                        logger.warning(f"⚠️  Could not add column {column_name}: {e}")

    except Exception as e:
        logger.error(f"Error adding missing columns: {e}")


def create_indexes():
    """Create database indexes for better performance"""
    try:
        with engine.connect() as conn:
            indexes = [
                # Documents table indexes
                "CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(processing_status)",
                "CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)",
                "CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type)",
                "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON documents(file_hash)",
                "CREATE INDEX IF NOT EXISTS idx_documents_processed_at ON documents(processed_at)",

                # Chunks table indexes
                "CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)",
                "CREATE INDEX IF NOT EXISTS idx_chunks_page_number ON chunks(page_number)",
                "CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks(content_hash)",
                "CREATE INDEX IF NOT EXISTS idx_chunks_processed_at ON chunks(processed_at)",

                # Search history indexes
                "CREATE INDEX IF NOT EXISTS idx_search_history_query_type ON search_history(query_type)",
                "CREATE INDEX IF NOT EXISTS idx_search_history_search_date ON search_history(search_date)",
                "CREATE INDEX IF NOT EXISTS idx_search_history_user_session ON search_history(user_session)",
                "CREATE INDEX IF NOT EXISTS idx_search_history_query_hash ON search_history(query_hash)",

                # System logs indexes
                "CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)",
                "CREATE INDEX IF NOT EXISTS idx_system_logs_component ON system_logs(component)",
                "CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp)",
                "CREATE INDEX IF NOT EXISTS idx_system_logs_request_id ON system_logs(request_id)",

                # Processing queue indexes
                "CREATE INDEX IF NOT EXISTS idx_processing_queue_status ON processing_queue(status)",
                "CREATE INDEX IF NOT EXISTS idx_processing_queue_priority ON processing_queue(priority)",
                "CREATE INDEX IF NOT EXISTS idx_processing_queue_created_at ON processing_queue(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_processing_queue_document_id ON processing_queue(document_id)",

                # User sessions indexes
                "CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id)",
                "CREATE INDEX IF NOT EXISTS idx_user_sessions_ip_address ON user_sessions(ip_address)",
                "CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen ON user_sessions(last_seen)"
            ]

            for index_sql in indexes:
                try:
                    conn.execute(text(index_sql))
                    conn.commit()
                except Exception as e:
                    logger.warning(f"Could not create index: {e}")

            logger.info("✅ Database indexes created/verified")

    except Exception as e:
        logger.error(f"Error creating indexes: {e}")


def enable_wal_mode():
    """Enable WAL mode for better concurrency and crash recovery"""
    try:
        with engine.connect() as conn:
            # Enable WAL mode
            conn.execute(text("PRAGMA journal_mode=WAL"))

            # Set other performance pragmas
            conn.execute(text("PRAGMA synchronous=NORMAL"))
            conn.execute(text("PRAGMA cache_size=10000"))
            conn.execute(text("PRAGMA temp_store=MEMORY"))
            conn.execute(text("PRAGMA mmap_size=268435456"))  # 256MB

            conn.commit()
            logger.info("✅ Database WAL mode and performance settings enabled")

    except Exception as e:
        logger.warning(f"Could not enable WAL mode: {e}")


def check_database_health() -> dict:
    """Check database health and return status"""
    try:
        health_info = {
            "status": "healthy",
            "database_exists": False,
            "database_writable": False,
            "tables_count": 0,
            "total_documents": 0,
            "total_chunks": 0,
            "database_size_mb": 0,
            "last_backup": None,
            "wal_mode": False
        }

        # Check if database file exists
        db_path = Path(Settings.database_path)
        health_info["database_exists"] = db_path.exists()

        if db_path.exists():
            health_info["database_size_mb"] = round(db_path.stat().st_size / (1024 * 1024), 2)
            health_info["database_writable"] = os.access(db_path, os.W_OK)

        # Test database connection and queries
        with engine.connect() as conn:
            # Check tables
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            health_info["tables_count"] = len(tables)

            # Check WAL mode
            result = conn.execute(text("PRAGMA journal_mode")).fetchone()
            health_info["wal_mode"] = result[0].upper() == "WAL" if result else False

            # Count documents and chunks
            if "documents" in tables:
                result = conn.execute(text("SELECT COUNT(*) FROM documents")).fetchone()
                health_info["total_documents"] = result[0] if result else 0

            if "chunks" in tables:
                result = conn.execute(text("SELECT COUNT(*) FROM chunks")).fetchone()
                health_info["total_chunks"] = result[0] if result else 0

        # Check for recent backups
        backups = Settings.list_backups()
        if backups:
            health_info["last_backup"] = backups[0]["timestamp"]

        return health_info

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "database_exists": Path(Settings.database_path).exists(),
            "database_writable": False,
            "tables_count": 0,
            "total_documents": 0,
            "total_chunks": 0
        }


def backup_database() -> str:
    """Create a database backup"""
    try:
        return Settings.create_backup()
    except Exception as e:
        logger.error(f"Database backup failed: {e}")
        return ""


def restore_database(backup_name: str) -> bool:
    """Restore database from backup"""
    try:
        return Settings.restore_backup(backup_name)
    except Exception as e:
        logger.error(f"Database restore failed: {e}")
        return False


def vacuum_database():
    """Vacuum database to reclaim space and optimize performance"""
    try:
        logger.info("🧹 Starting database vacuum...")

        # Get database size before vacuum
        db_path = Path(Settings.database_path)
        size_before = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0

        with engine.connect() as conn:
            # Vacuum main database
            conn.execute(text("VACUUM"))

            # Analyze tables for query optimization
            conn.execute(text("ANALYZE"))

            conn.commit()

        # Get size after vacuum
        size_after = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0
        space_saved = size_before - size_after

        logger.info(f"✅ Database vacuum completed. Space saved: {space_saved:.2f} MB")

        return {
            "success": True,
            "size_before_mb": round(size_before, 2),
            "size_after_mb": round(size_after, 2),
            "space_saved_mb": round(space_saved, 2)
        }

    except Exception as e:
        logger.error(f"Database vacuum failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def repair_database():
    """Attempt to repair database corruption"""
    try:
        logger.info("🔧 Starting database repair...")

        # Create backup before repair
        backup_path = backup_database()
        if not backup_path:
            logger.warning("Could not create backup before repair")

        with engine.connect() as conn:
            # Check database integrity
            result = conn.execute(text("PRAGMA integrity_check")).fetchall()

            if len(result) == 1 and result[0][0] == "ok":
                logger.info("✅ Database integrity check passed")
                return {"success": True, "message": "Database is healthy"}

            # If integrity check failed, try to repair
            logger.warning("Database integrity issues found, attempting repair...")

            # Reindex all tables
            conn.execute(text("REINDEX"))

            # Vacuum to clean up
            conn.execute(text("VACUUM"))

            conn.commit()

            # Check integrity again
            result = conn.execute(text("PRAGMA integrity_check")).fetchall()

            if len(result) == 1 and result[0][0] == "ok":
                logger.info("✅ Database repair successful")
                return {"success": True, "message": "Database repaired successfully"}
            else:
                logger.error("❌ Database repair failed")
                return {"success": False, "message": "Database repair failed", "backup_created": backup_path}

    except Exception as e:
        logger.error(f"Database repair failed: {e}")
        return {"success": False, "error": str(e)}


def get_database_stats() -> dict:
    """Get detailed database statistics"""
    try:
        stats = {
            "database_file": Settings.database_path,
            "database_size_mb": 0,
            "tables": {},
            "indexes": [],
            "pragma_settings": {},
            "connection_info": {}
        }

        # Get file size
        db_path = Path(Settings.database_path)
        if db_path.exists():
            stats["database_size_mb"] = round(db_path.stat().st_size / (1024 * 1024), 2)

        with engine.connect() as conn:
            # Get table information
            inspector = inspect(engine)
            for table_name in inspector.get_table_names():
                try:
                    # Get row count
                    result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    row_count = result[0] if result else 0

                    # Get table info
                    columns = inspector.get_columns(table_name)
                    indexes = inspector.get_indexes(table_name)

                    stats["tables"][table_name] = {
                        "row_count": row_count,
                        "column_count": len(columns),
                        "index_count": len(indexes),
                        "columns": [col["name"] for col in columns],
                        "indexes": [idx["name"] for idx in indexes]
                    }
                except Exception as e:
                    stats["tables"][table_name] = {"error": str(e)}

            # Get pragma settings
            pragma_queries = [
                "journal_mode", "synchronous", "cache_size", "temp_store",
                "mmap_size", "page_size", "page_count", "freelist_count"
            ]

            for pragma in pragma_queries:
                try:
                    result = conn.execute(text(f"PRAGMA {pragma}")).fetchone()
                    stats["pragma_settings"][pragma] = result[0] if result else None
                except Exception:
                    stats["pragma_settings"][pragma] = "unknown"

            # Calculate database pages and free space
            if stats["pragma_settings"].get("page_size") and stats["pragma_settings"].get("page_count"):
                page_size = stats["pragma_settings"]["page_size"]
                page_count = stats["pragma_settings"]["page_count"]
                freelist_count = stats["pragma_settings"].get("freelist_count", 0)

                stats["connection_info"] = {
                    "total_pages": page_count,
                    "free_pages": freelist_count,
                    "used_pages": page_count - freelist_count,
                    "page_size_bytes": page_size,
                    "fragmentation_percent": round((freelist_count / page_count) * 100, 2) if page_count > 0 else 0
                }

        return stats

    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        return {"error": str(e)}


def optimize_database():
    """Optimize database performance"""
    try:
        logger.info("⚡ Optimizing database performance...")

        optimization_results = {
            "vacuum_completed": False,
            "analyze_completed": False,
            "indexes_rebuilt": False,
            "pragma_optimized": False,
            "space_saved_mb": 0
        }

        # Get size before optimization
        db_path = Path(settings.database_path)
        size_before = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0

        with engine.connect() as conn:
            # Vacuum database
            conn.execute(text("VACUUM"))
            optimization_results["vacuum_completed"] = True

            # Analyze tables for query planner
            conn.execute(text("ANALYZE"))
            optimization_results["analyze_completed"] = True

            # Rebuild indexes
            conn.execute(text("REINDEX"))
            optimization_results["indexes_rebuilt"] = True

            # Optimize pragma settings
            pragma_optimizations = [
                "PRAGMA optimize",
                "PRAGMA cache_size=10000",
                "PRAGMA temp_store=MEMORY",
                "PRAGMA mmap_size=268435456"
            ]

            for pragma_sql in pragma_optimizations:
                try:
                    conn.execute(text(pragma_sql))
                except Exception as e:
                    logger.warning(f"Could not execute {pragma_sql}: {e}")

            optimization_results["pragma_optimized"] = True
            conn.commit()

        # Calculate space saved
        size_after = db_path.stat().st_size / (1024 * 1024) if db_path.exists() else 0
        optimization_results["space_saved_mb"] = round(size_before - size_after, 2)

        logger.info(f"✅ Database optimization completed. Space saved: {optimization_results['space_saved_mb']} MB")

        return optimization_results

    except Exception as e:
        logger.error(f"Database optimization failed: {e}")
        return {"error": str(e)}


def reset_database():
    """Reset database (delete all data but keep structure)"""
    try:
        logger.warning("🗑️  Resetting database - ALL DATA WILL BE LOST!")

        # Create backup before reset
        backup_path = backup_database()
        logger.info(f"Backup created at: {backup_path}")

        with engine.connect() as conn:
            # Get all table names
            inspector = inspect(engine)
            tables = inspector.get_table_names()

            # Delete all data from tables (preserve structure)
            for table in tables:
                try:
                    conn.execute(text(f"DELETE FROM {table}"))
                    logger.info(f"✅ Cleared table: {table}")
                except Exception as e:
                    logger.error(f"Error clearing table {table}: {e}")

            # Reset auto-increment counters
            conn.execute(text("DELETE FROM sqlite_sequence"))

            # Vacuum to reclaim space
            conn.execute(text("VACUUM"))

            conn.commit()

        logger.info("✅ Database reset completed")

        return {
            "success": True,
            "backup_created": backup_path,
            "tables_cleared": len(tables)
        }

    except Exception as e:
        logger.error(f"Database reset failed: {e}")
        return {"success": False, "error": str(e)}


def migrate_database():
    """Run database migrations for schema updates"""
    try:
        logger.info("🔄 Running database migrations...")

        migration_results = {
            "columns_added": 0,
            "indexes_created": 0,
            "tables_updated": 0,
            "success": True
        }

        # Add missing columns
        add_missing_columns()
        migration_results["columns_added"] = 1  # Placeholder

        # Create missing indexes
        create_indexes()
        migration_results["indexes_created"] = 1  # Placeholder

        # Update table structures if needed
        with engine.connect() as conn:
            # Example: Update any legacy data formats
            # This is where you'd add specific migration logic

            # Ensure all documents have proper status
            conn.execute(text("""
                              UPDATE documents
                              SET processing_status = 'completed'
                              WHERE processing_status IS NULL
                                AND total_chunks > 0
                              """))

            conn.execute(text("""
                              UPDATE documents
                              SET processing_status = 'pending'
                              WHERE processing_status IS NULL
                              """))

            conn.commit()
            migration_results["tables_updated"] = 1

        logger.info("✅ Database migrations completed")
        return migration_results

    except Exception as e:
        logger.error(f"Database migration failed: {e}")
        return {"success": False, "error": str(e)}


# Auto-backup functionality
def setup_auto_backup():
    """Setup automatic database backups"""
    import threading
    import time

    def backup_worker():
        while True:
            try:
                # Wait for backup interval
                time.sleep(settings.backup_interval_hours * 3600)

                # Create backup
                backup_path = backup_database()
                if backup_path:
                    logger.info(f"✅ Automatic backup created: {backup_path}")
                else:
                    logger.error("❌ Automatic backup failed")

            except Exception as e:
                logger.error(f"Auto-backup worker error: {e}")
                time.sleep(3600)  # Wait 1 hour before retry

    if settings.enable_auto_backup:
        backup_thread = threading.Thread(target=backup_worker, daemon=True)
        backup_thread.start()
        logger.info(f"🔄 Auto-backup enabled (every {settings.backup_interval_hours} hours)")


# Initialize database on module import
if __name__ != "__main__":
    try:
        # Initialize database
        init_success = init_db()

        if init_success:
            # Setup auto-backup
            setup_auto_backup()

            # Log database health
            health = check_database_health()
            logger.info(
                f"📊 Database Health: {health['status']} - {health['total_documents']} documents, {health['total_chunks']} chunks")
        else:
            logger.error("❌ Database initialization failed!")

    except Exception as e:
        logger.error(f"Database module initialization error: {e}")