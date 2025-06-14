import logging
import os
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import shutil
from datetime import datetime
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Initialize these as None first, will be set after settings import
engine = None
SessionLocal = None
SQLALCHEMY_DATABASE_URL = None


def initialize_database():
    """Initialize database connection after settings are available"""
    global engine, SessionLocal, SQLALCHEMY_DATABASE_URL

    try:
        # Import settings here to avoid circular import
        from app.config.settings import settings

        # Set database URL
        SQLALCHEMY_DATABASE_URL = settings.get_database_url()

        # Create engine with proper SQLite configuration
        engine = create_engine(
            SQLALCHEMY_DATABASE_URL,
            connect_args={
                "check_same_thread": False,
                "timeout": 30
            },
            poolclass=StaticPool,
            echo=settings.debug,
            pool_pre_ping=True
        )

        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

        logger.info(f"✅ Database engine initialized: {SQLALCHEMY_DATABASE_URL}")
        return True

    except Exception as e:
        logger.error(f"❌ Failed to initialize database engine: {e}")
        return False


# Import Base from models
from app.models.database_models import Base


def get_db():
    """Get database session"""
    if SessionLocal is None:
        initialize_database()

    if SessionLocal is None:
        raise RuntimeError("Database not initialized")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_engine():
    """Get database engine, initialize if needed"""
    if engine is None:
        initialize_database()

    if engine is None:
        raise RuntimeError("Database engine not initialized")

    return engine


def init_db() -> bool:
    """Initialize database with all tables and required data"""
    try:
        logger.info("🔧 Initializing database...")

        # Ensure database engine is initialized
        if engine is None:
            if not initialize_database():
                return False

        # Import settings
        from app.config.settings import settings

        # Ensure storage directory exists
        storage_dir = Path(settings.storage_path)
        storage_dir.mkdir(parents=True, exist_ok=True)

        # Ensure database file exists
        db_path = Path(settings.database_path)
        if not db_path.exists():
            db_path.touch()
            logger.info(f"✅ Created database file: {db_path}")

        # Create all tables
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created/verified")

        # Add missing columns for existing databases
        add_missing_columns()

        # Create indexes for performance
        create_indexes()

        # Verify database health
        health = check_database_health()
        if health['status'] == 'healthy':
            logger.info("✅ Database initialization completed successfully")
            return True
        else:
            logger.error(f"❌ Database health check failed: {health}")
            return False

    except Exception as e:
        logger.error(f"❌ Database initialization failed: {e}")
        return False

@contextmanager
def get_db_context():
    """Get database session for background tasks"""
    if SessionLocal is None:
        initialize_database()

    if SessionLocal is None:
        raise RuntimeError("Database not initialized")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def add_missing_columns():
    """Add missing columns to existing tables"""
    try:
        logger.info("🔧 Checking for missing database columns...")

        if engine is None:
            logger.error("Database engine not initialized")
            return

        with engine.connect() as conn:
            # Check if documents table exists
            inspector = inspect(engine)
            tables = inspector.get_table_names()

            if 'documents' in tables:
                columns = [col['name'] for col in inspector.get_columns('documents')]

                # Add missing columns
                missing_columns = [
                    ("file_hash", "VARCHAR(64)"),
                    ("processing_status", "VARCHAR(20) DEFAULT 'pending'"),
                    ("text_quality_score", "FLOAT"),
                    ("ocr_confidence", "FLOAT"),
                    ("content_hash", "VARCHAR(64)"),
                    ("language", "VARCHAR(10)"),
                    ("embedding_model", "VARCHAR(100)"),
                    ("processed_at", "DATETIME"),
                ]

                for col_name, col_type in missing_columns:
                    if col_name not in columns:
                        try:
                            conn.execute(text(f"ALTER TABLE documents ADD COLUMN {col_name} {col_type}"))
                            logger.info(f"✅ Added column: documents.{col_name}")
                        except Exception as e:
                            logger.warning(f"Could not add column {col_name}: {e}")

            # Check chunks table
            if 'chunks' in tables:
                columns = [col['name'] for col in inspector.get_columns('chunks')]

                missing_columns = [
                    ("content_hash", "VARCHAR(64)"),
                    ("start_char", "INTEGER"),
                    ("end_char", "INTEGER"),
                    ("language", "VARCHAR(10)"),
                    ("text_quality_score", "FLOAT"),
                    ("embedding_quality", "FLOAT"),
                    ("embedding_model", "VARCHAR(100)"),
                    ("processed_at", "DATETIME"),
                ]

                for col_name, col_type in missing_columns:
                    if col_name not in columns:
                        try:
                            conn.execute(text(f"ALTER TABLE chunks ADD COLUMN {col_name} {col_type}"))
                            logger.info(f"✅ Added column: chunks.{col_name}")
                        except Exception as e:
                            logger.warning(f"Could not add column {col_name}: {e}")

            conn.commit()

    except Exception as e:
        logger.error(f"Error adding missing columns: {e}")


def create_indexes():
    """Create database indexes for better performance"""
    try:
        logger.info("🔧 Creating database indexes...")

        if engine is None:
            logger.error("Database engine not initialized")
            return

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

            # Search history indexes (if table exists)
            "CREATE INDEX IF NOT EXISTS idx_search_history_query_type ON search_history(query_type)",
            "CREATE INDEX IF NOT EXISTS idx_search_history_search_date ON search_history(search_date)",
            "CREATE INDEX IF NOT EXISTS idx_search_history_user_session ON search_history(user_session)",
            "CREATE INDEX IF NOT EXISTS idx_search_history_query_hash ON search_history(query_hash)",
        ]

        with engine.connect() as conn:
            for index_sql in indexes:
                try:
                    conn.execute(text(index_sql))
                except Exception as e:
                    logger.warning(f"Could not create index: {e}")

            conn.commit()
            logger.info("✅ Database indexes created/verified")

    except Exception as e:
        logger.error(f"Error creating indexes: {e}")


def check_database_health() -> dict:
    """Check database health and return status"""
    try:
        # Import settings
        from app.config.settings import settings

        health_info = {
            "status": "unknown",
            "database_file": settings.database_path,
            "database_exists": False,
            "database_size_mb": 0,
            "tables_count": 0,
            "total_documents": 0,
            "total_chunks": 0,
            "wal_mode": False,
            "connection_working": False
        }

        # Check if database file exists
        db_path = Path(settings.database_path)
        health_info["database_exists"] = db_path.exists()

        if db_path.exists():
            health_info["database_size_mb"] = round(db_path.stat().st_size / (1024 * 1024), 2)

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                health_info["status"] = "engine_failed"
                return health_info

        # Test database connection
        with engine.connect() as conn:
            health_info["connection_working"] = True

            # Check WAL mode
            result = conn.execute(text("PRAGMA journal_mode")).fetchone()
            health_info["wal_mode"] = result and result[0].upper() == 'WAL'

            # Count tables
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            health_info["tables_count"] = len(tables)

            # Count documents and chunks
            if 'documents' in tables:
                result = conn.execute(text("SELECT COUNT(*) FROM documents")).fetchone()
                health_info["total_documents"] = result[0] if result else 0

            if 'chunks' in tables:
                result = conn.execute(text("SELECT COUNT(*) FROM chunks")).fetchone()
                health_info["total_chunks"] = result[0] if result else 0

            # Overall health status
            if health_info["connection_working"] and health_info["database_exists"]:
                health_info["status"] = "healthy"
            else:
                health_info["status"] = "unhealthy"

        return health_info

    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return {
            "status": "error",
            "error": str(e),
            "database_file": getattr(settings, 'database_path', 'unknown') if 'settings' in locals() else 'unknown',
            "database_exists": False
        }


def backup_database() -> str:
    """Create a backup of the database"""
    try:
        from app.config.settings import settings

        if not Path(settings.database_path).exists():
            logger.error("Database file does not exist, cannot backup")
            return ""

        # Create backup directory
        backup_dir = Path(settings.backup_directory)
        backup_dir.mkdir(parents=True, exist_ok=True)

        # Create backup filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"database_backup_{timestamp}.db"
        backup_path = backup_dir / backup_filename

        # Copy database file
        shutil.copy2(settings.database_path, backup_path)

        logger.info(f"✅ Database backup created: {backup_path}")
        return str(backup_path)

    except Exception as e:
        logger.error(f"Database backup failed: {e}")
        return ""


def vacuum_database():
    """Vacuum database to reclaim space and optimize performance"""
    try:
        logger.info("🧹 Starting database vacuum...")

        from app.config.settings import settings

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                return {"success": False, "error": "Database engine not initialized"}

        # Get database size before vacuum
        db_path = Path(settings.database_path)
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


def get_database_connection_info() -> dict:
    """Get database connection information"""
    try:
        from app.config.settings import settings

        # Ensure engine is initialized
        if engine is None:
            initialize_database()

        return {
            "database_url": SQLALCHEMY_DATABASE_URL or "Not initialized",
            "database_path": settings.database_path,
            "engine_initialized": engine is not None,
            "engine_info": {
                "name": engine.name if engine else "N/A",
                "driver": engine.driver if engine else "N/A",
                "echo": engine.echo if engine else "N/A",
                "pool_size": getattr(engine.pool, 'size', 'N/A') if engine else "N/A",
                "pool_checked_out": getattr(engine.pool, 'checkedout', 'N/A') if engine else "N/A",
                "pool_overflow": getattr(engine.pool, 'overflow', 'N/A') if engine else "N/A",
                "pool_checked_in": getattr(engine.pool, 'checkedin', 'N/A') if engine else "N/A"
            },
            "connection_test": "success"
        }
    except Exception as e:
        return {
                        "database_url": SQLALCHEMY_DATABASE_URL or "Not initialized",
            "database_path": getattr(settings, 'database_path', 'unknown') if 'settings' in locals() else 'unknown',
            "engine_initialized": engine is not None,
            "connection_test": "failed",
            "error": str(e)
        }


def auto_initialize():
    """Auto-initialize database on module import"""
    if os.getenv("TESTING") or __name__ == "__main__":
        return

    try:
        success = initialize_database()
        if success:
            logger.info("🎉 Database engine auto-initialized successfully")
        else:
            logger.warning("⚠️  Database engine auto-initialization failed")
    except Exception as e:
        logger.error(f"Error during database auto-initialization: {e}")


def repair_database():
    """Attempt to repair database corruption"""
    try:
        logger.info("🔧 Starting database repair...")

        from app.config.settings import settings

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                return {"success": False, "error": "Database engine not initialized"}

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
        from app.config.settings import settings

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                return {"error": "Database engine not initialized"}

        stats = {
            "database_file": settings.database_path,
            "database_size_mb": 0,
            "tables": {},
            "indexes": [],
            "pragma_settings": {},
            "connection_info": {}
        }

        # Get file size
        db_path = Path(settings.database_path)
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
                    "total_size_bytes": page_size * page_count,
                    "free_space_bytes": page_size * freelist_count,
                    "utilization_percent": round(((page_count - freelist_count) / page_count) * 100, 2) if page_count > 0 else 0
                }

        return stats

    except Exception as e:
        logger.error(f"Error getting database stats: {e}")
        return {"error": str(e)}


def optimize_database():
    """Optimize database performance"""
    try:
        logger.info("⚡ Optimizing database performance...")

        from app.config.settings import settings

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                return {"success": False, "error": "Database engine not initialized"}

        optimization_results = {
            "success": False,
            "actions_taken": [],
            "size_before_mb": 0,
            "size_after_mb": 0,
            "space_saved_mb": 0
        }

        # Get initial size
        db_path = Path(settings.database_path)
        if db_path.exists():
            optimization_results["size_before_mb"] = round(db_path.stat().st_size / (1024 * 1024), 2)

        with engine.connect() as conn:
            # Enable WAL mode for better concurrency
            current_mode = conn.execute(text("PRAGMA journal_mode")).fetchone()
            if current_mode and current_mode[0].upper() != 'WAL':
                conn.execute(text("PRAGMA journal_mode=WAL"))
                optimization_results["actions_taken"].append("Enabled WAL mode")

            # Optimize synchronous setting
            conn.execute(text("PRAGMA synchronous=NORMAL"))
            optimization_results["actions_taken"].append("Set synchronous=NORMAL")

            # Increase cache size
            conn.execute(text("PRAGMA cache_size=10000"))
            optimization_results["actions_taken"].append("Increased cache size")

            # Enable memory-mapped I/O
            conn.execute(text("PRAGMA mmap_size=268435456"))  # 256MB
            optimization_results["actions_taken"].append("Enabled memory-mapped I/O")

            # Optimize temp store
            conn.execute(text("PRAGMA temp_store=MEMORY"))
            optimization_results["actions_taken"].append("Set temp store to memory")

            # Update table statistics
            conn.execute(text("ANALYZE"))
            optimization_results["actions_taken"].append("Updated table statistics")

            # Vacuum to reclaim space
            conn.execute(text("VACUUM"))
            optimization_results["actions_taken"].append("Vacuumed database")

            conn.commit()

        # Get final size
        if db_path.exists():
            optimization_results["size_after_mb"] = round(db_path.stat().st_size / (1024 * 1024), 2)
            optimization_results["space_saved_mb"] = optimization_results["size_before_mb"] - optimization_results["size_after_mb"]

        optimization_results["success"] = True
        logger.info(f"✅ Database optimization completed. Space saved: {optimization_results['space_saved_mb']:.2f} MB")

        return optimization_results

    except Exception as e:
        logger.error(f"Database optimization failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "actions_taken": []
        }


def reset_database():
    """Reset database (delete all data but keep structure)"""
    try:
        logger.warning("🗑️  Resetting database...")

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                return {"success": False, "error": "Database engine not initialized"}

        # Create backup before reset
        backup_path = backup_database()

        with engine.connect() as conn:
            # Get all table names
            inspector = inspect(engine)
            tables = inspector.get_table_names()

            # Delete all data from tables (in reverse order to handle foreign keys)
            tables_to_clear = ['chunks', 'search_history', 'user_sessions', 'system_logs', 'processing_queue', 'documents']

            for table in tables_to_clear:
                if table in tables:
                    try:
                        conn.execute(text(f"DELETE FROM {table}"))
                        logger.info(f"✅ Cleared table: {table}")
                    except Exception as e:
                        logger.warning(f"Could not clear table {table}: {e}")

            # Reset auto-increment counters
            for table in tables_to_clear:
                if table in tables:
                    try:
                        conn.execute(text(f"DELETE FROM sqlite_sequence WHERE name='{table}'"))
                    except Exception:
                        pass  # sqlite_sequence might not exist

            conn.commit()

        # Vacuum to reclaim space
        vacuum_database()

        logger.info("✅ Database reset completed")
        return {
            "success": True,
            "backup_created": backup_path,
            "message": "Database reset successfully"
        }

    except Exception as e:
        logger.error(f"Database reset failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }


def migrate_legacy_data():
    """Migrate data from legacy table structures"""
    try:
        logger.info("🔄 Checking for legacy data migration...")

        # Ensure engine is initialized
        if engine is None:
            if not initialize_database():
                return {"success": False, "error": "Database engine not initialized"}

        migration_results = {
            "success": False,
            "migrations_performed": [],
            "documents_migrated": 0,
            "chunks_migrated": 0
        }

        with engine.connect() as conn:
            inspector = inspect(engine)
            tables = inspector.get_table_names()

            # Check if legacy 'pdfs' table exists
            if 'pdfs' in tables and 'documents' in tables:
                # Migrate from pdfs to documents table
                try:
                    # Check if there's data in pdfs table that's not in documents
                    result = conn.execute(text("""
                        SELECT COUNT(*)
                        FROM pdfs p
                        LEFT JOIN documents d ON p.id = d.id
                        WHERE d.id IS NULL
                    """)).fetchone()

                    legacy_count = result[0] if result else 0

                    if legacy_count > 0:
                        # Migrate data
                        conn.execute(text("""
                            INSERT INTO documents (id, filename, original_filename, file_path, file_type,
                                                   file_size,
                                                   title, category, description, total_pages,
                                                   total_chunks,
                                                   status, processing_status, created_at, updated_at)
                            SELECT p.id,
                                   p.filename,
                                   p.filename,
                                   p.file_path,
                                   'pdf',
                                   p.file_size,
                                   p.title,
                                   p.category,
                                   p.description,
                                   p.total_pages,
                                   p.chunk_count,
                                   CASE WHEN p.processed THEN 'completed' ELSE 'uploaded' END,
                                   CASE WHEN p.processed THEN 'completed' ELSE 'pending' END,
                                   p.upload_date,
                                   p.upload_date
                            FROM pdfs p
                            LEFT JOIN documents d ON p.id = d.id
                            WHERE d.id IS NULL
                        """))

                        migration_results["documents_migrated"] = legacy_count
                        migration_results["migrations_performed"].append(
                            f"Migrated {legacy_count} documents from pdfs table")

                except Exception as e:
                    logger.warning(f"Could not migrate pdfs table: {e}")

            # Update processing_status for existing documents
            try:
                result = conn.execute(text("""
                    UPDATE documents
                    SET processing_status = CASE
                                                WHEN status = 'completed' THEN 'completed'
                                                WHEN status = 'processing' THEN 'processing'
                                                WHEN status = 'error' THEN 'failed'
                                                ELSE 'pending'
                        END
                    WHERE processing_status IS NULL
                       OR processing_status = ''
                """))

                if result.rowcount > 0:
                    migration_results["migrations_performed"].append(
                        f"Updated processing_status for {result.rowcount} documents")

            except Exception as e:
                logger.warning(f"Could not update processing_status: {e}")

            conn.commit()

        migration_results["success"] = True

        if migration_results["migrations_performed"]:
            logger.info(f"✅ Legacy data migration completed: {migration_results['migrations_performed']}")
        else:
            logger.info("✅ No legacy data migration needed")

        return migration_results

    except Exception as e:
        logger.error(f"Legacy data migration failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "migrations_performed": []
        }


# Call auto-initialize when module is imported
auto_initialize()

