#!/usr/bin/env python3
"""
Reset and initialize the database
Enhanced version with better error handling, backup options, and comprehensive schema
"""
import os
import shutil
import sqlite3
import json
from pathlib import Path
from datetime import datetime
import argparse
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def backup_existing_data(storage_dir: Path, backup_dir: Path = None):
    """Create backup of existing data before reset"""
    if backup_dir is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = Path(f"./backups/backup_{timestamp}")

    backup_dir.mkdir(parents=True, exist_ok=True)

    db_path = storage_dir / "app.db"
    chroma_path = storage_dir / "chroma_db"
    pdfs_path = storage_dir / "pdfs"

    backup_created = False

    # Backup SQLite database
    if db_path.exists():
        shutil.copy2(db_path, backup_dir / "app.db")
        logger.info(f"✅ Backed up SQLite database to: {backup_dir / 'app.db'}")
        backup_created = True

    # Backup ChromaDB
    if chroma_path.exists():
        shutil.copytree(chroma_path, backup_dir / "chroma_db")
        logger.info(f"✅ Backed up ChromaDB to: {backup_dir / 'chroma_db'}")
        backup_created = True

    # Backup PDFs (optional, can be large)
    if pdfs_path.exists() and any(pdfs_path.iterdir()):
        pdf_backup_path = backup_dir / "pdfs"
        pdf_backup_path.mkdir(exist_ok=True)

        # Only backup first 10 PDFs to save space (you can modify this)
        pdf_files = list(pdfs_path.glob("*.pdf"))[:10]
        for pdf_file in pdf_files:
            shutil.copy2(pdf_file, pdf_backup_path / pdf_file.name)

        if pdf_files:
            logger.info(f"✅ Backed up {len(pdf_files)} PDFs to: {pdf_backup_path}")
            backup_created = True

    if backup_created:
        # Create backup manifest
        manifest = {
            "backup_date": datetime.now().isoformat(),
            "original_path": str(storage_dir),
            "backup_path": str(backup_dir),
            "files_backed_up": {
                "database": (backup_dir / "app.db").exists(),
                "chroma_db": (backup_dir / "chroma_db").exists(),
                "pdfs": (backup_dir / "pdfs").exists()
            }
        }

        with open(backup_dir / "backup_manifest.json", 'w') as f:
            json.dump(manifest, f, indent=2)

        logger.info(f"🎯 Backup completed: {backup_dir}")
        return backup_dir
    else:
        logger.info("ℹ️  No existing data found to backup")
        return None

def reset_database(create_backup: bool = True, keep_pdfs: bool = False):
    """Reset all databases and storage with enhanced options"""

    # Paths
    storage_dir = Path("./storage")
    db_path = storage_dir / "app.db"
    chroma_path = storage_dir / "chroma_db"
    pdfs_path = storage_dir / "pdfs"

    logger.info("🗑️  Starting database reset...")

    # Create backup if requested
    backup_path = None
    if create_backup and (db_path.exists() or chroma_path.exists()):
        try:
            backup_path = backup_existing_data(storage_dir)
        except Exception as e:
            logger.error(f"❌ Backup failed: {e}")
            response = input("Continue without backup? (y/N): ")
            if response.lower() != 'y':
                logger.info("Reset cancelled")
                return False

    # 1. Remove SQLite database
    if db_path.exists():
        try:
            os.remove(db_path)
            logger.info(f"✅ Deleted SQLite database: {db_path}")
        except Exception as e:
            logger.error(f"❌ Failed to delete database: {e}")
            return False

    # 2. Remove ChromaDB
    if chroma_path.exists():
        try:
            shutil.rmtree(chroma_path)
            logger.info(f"✅ Deleted ChromaDB: {chroma_path}")
        except Exception as e:
            logger.error(f"❌ Failed to delete ChromaDB: {e}")
            return False

    # 3. Handle PDFs based on keep_pdfs flag
    if not keep_pdfs and pdfs_path.exists():
        try:
            for file in pdfs_path.glob("*"):
                if file.is_file():
                    os.remove(file)
            logger.info(f"✅ Cleaned PDFs directory: {pdfs_path}")
        except Exception as e:
            logger.warning(f"⚠️  Some PDFs could not be deleted: {e}")
    elif keep_pdfs:
        logger.info(f"ℹ️  Keeping existing PDFs in: {pdfs_path}")

    # 4. Ensure directories exist
    try:
        storage_dir.mkdir(exist_ok=True)
        pdfs_path.mkdir(exist_ok=True)

        # Create additional directories
        (storage_dir / "temp").mkdir(exist_ok=True)
        (storage_dir / "logs").mkdir(exist_ok=True)

        logger.info("✅ Storage directories created/verified")
    except Exception as e:
        logger.error(f"❌ Failed to create directories: {e}")
        return False

    # 5. Initialize fresh SQLite database with comprehensive schema
    logger.info("🔧 Creating fresh database schema...")

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON")

        # Create PDFs table with enhanced schema
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
                file_hash TEXT UNIQUE,
                title TEXT,
                category TEXT,
                description TEXT,
                status TEXT DEFAULT 'uploaded',
                processing_error TEXT,
                processing_started_at DATETIME,
                processing_completed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                -- PDF specific metadata
                pdf_pages INTEGER,
                pdf_author TEXT,
                pdf_subject TEXT,
                pdf_creator TEXT,
                pdf_producer TEXT,
                pdf_creation_date TEXT,

                -- Processing statistics
                total_words INTEGER DEFAULT 0,
                total_characters INTEGER DEFAULT 0,
                avg_chunk_size INTEGER DEFAULT 0,

                -- Quality metrics
                text_quality_score REAL DEFAULT 0.0,
                ocr_confidence REAL DEFAULT 0.0,

                -- Version control
                version INTEGER DEFAULT 1,
                parent_id INTEGER REFERENCES pdfs(id),

                UNIQUE(file_hash)
            )
        """)

        # Create chunks table with enhanced schema
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pdf_id INTEGER NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                page_number INTEGER,
                chunk_meta TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                -- Enhanced chunk metadata
                word_count INTEGER DEFAULT 0,
                char_count INTEGER DEFAULT 0,
                sentence_count INTEGER DEFAULT 0,

                -- Position information
                start_char INTEGER,
                end_char INTEGER,

                -- Content analysis
                keywords TEXT,  -- JSON array of keywords
                summary TEXT,
                language TEXT DEFAULT 'en',

                -- Vector information
                embedding_model TEXT,
                embedding_created_at DATETIME,

                -- Quality metrics
                readability_score REAL DEFAULT 0.0,

                FOREIGN KEY (pdf_id) REFERENCES pdfs (id) ON DELETE CASCADE,
                UNIQUE(pdf_id, chunk_index)
            )
        """)

        # Create search history table with enhanced tracking
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS search_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                query TEXT NOT NULL,
                query_type TEXT DEFAULT 'search',
                results_count INTEGER DEFAULT 0,
                response_time REAL,
                search_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                user_session TEXT,
                search_meta TEXT,

                -- Enhanced search metadata
                search_filters TEXT,  -- JSON of applied filters
                result_quality_score REAL DEFAULT 0.0,
                user_feedback INTEGER,  -- 1-5 rating
                clicked_results TEXT,  -- JSON array of clicked result IDs

                -- RAG specific fields
                rag_model TEXT,
                rag_response TEXT,
                rag_sources TEXT,  -- JSON array of source chunks
                rag_confidence REAL DEFAULT 0.0,

                -- Performance metrics
                vector_search_time REAL DEFAULT 0.0,
                llm_response_time REAL DEFAULT 0.0,
                total_tokens INTEGER DEFAULT 0
            )
        """)

        # Create system logs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                level TEXT NOT NULL,
                component TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT,  -- JSON for structured data
                user_session TEXT,
                request_id TEXT,

                -- Performance tracking
                execution_time REAL,
                memory_usage INTEGER,

                -- Error tracking
                error_type TEXT,
                stack_trace TEXT
            )
        """)

        # Create user sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                user_agent TEXT,

                -- Session statistics
                total_searches INTEGER DEFAULT 0,
                total_uploads INTEGER DEFAULT 0,
                total_time_spent INTEGER DEFAULT 0,  -- seconds

                -- Preferences
                preferred_search_type TEXT DEFAULT 'search',
                preferred_model TEXT,
                settings TEXT  -- JSON for user preferences
            )
        """)

        # Create processing queue table for background tasks
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS processing_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_type TEXT NOT NULL,
                task_data TEXT NOT NULL,  -- JSON data for the task
                status TEXT DEFAULT 'pending',  -- pending, processing, completed, failed
                priority INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                completed_at DATETIME,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0,
                max_retries INTEGER DEFAULT 3,

                -- Task metadata
                estimated_duration INTEGER,  -- seconds
                actual_duration INTEGER,  -- seconds
                worker_id TEXT,

                UNIQUE(task_type, task_data)
            )
        """)

        # Create system statistics table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                metric_unit TEXT,
                tags TEXT,  -- JSON for additional metadata

                -- System resource metrics
                cpu_percent REAL,
                memory_percent REAL,
                disk_percent REAL,

                -- Application metrics
                active_connections INTEGER,
                queue_size INTEGER,
                cache_hit_rate REAL
            )
        """)

        # Create comprehensive indexes for better performance
        indexes = [
            # PDFs table indexes
            "CREATE INDEX IF NOT EXISTS idx_pdfs_status ON pdfs(status)",
            "CREATE INDEX IF NOT EXISTS idx_pdfs_processed ON pdfs(processed)",
            "CREATE INDEX IF NOT EXISTS idx_pdfs_file_hash ON pdfs(file_hash)",
            "CREATE INDEX IF NOT EXISTS idx_pdfs_category ON pdfs(category)",
            "CREATE INDEX IF NOT EXISTS idx_pdfs_upload_date ON pdfs(upload_date)",
            "CREATE INDEX IF NOT EXISTS idx_pdfs_processing_status ON pdfs(status, processed)",

            # Chunks table indexes
            "CREATE INDEX IF NOT EXISTS idx_chunks_pdf_id ON chunks(pdf_id)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_page_number ON chunks(page_number)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_word_count ON chunks(word_count)",
            "CREATE INDEX IF NOT EXISTS idx_chunks_embedding_model ON chunks(embedding_model)",

            # Search history indexes
            "CREATE INDEX IF NOT EXISTS idx_search_query_type ON search_history(query_type)",
            "CREATE INDEX IF NOT EXISTS idx_search_date ON search_history(search_date)",
            "CREATE INDEX IF NOT EXISTS idx_search_session ON search_history(user_session)",
            "CREATE INDEX IF NOT EXISTS idx_search_performance ON search_history(response_time, results_count)",

            # System logs indexes
            "CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level)",
            "CREATE INDEX IF NOT EXISTS idx_logs_component ON system_logs(component)",
            "CREATE INDEX IF NOT EXISTS idx_logs_session ON system_logs(user_session)",

            # User sessions indexes
            "CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON user_sessions(session_id)",
            "CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON user_sessions(last_activity)",

            # Processing queue indexes
            "CREATE INDEX IF NOT EXISTS idx_queue_status ON processing_queue(status)",
            "CREATE INDEX IF NOT EXISTS idx_queue_priority ON processing_queue(priority, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_queue_task_type ON processing_queue(task_type)",

            # System stats indexes
            "CREATE INDEX IF NOT EXISTS idx_stats_timestamp ON system_stats(timestamp)",
            "CREATE INDEX IF NOT EXISTS idx_stats_metric ON system_stats(metric_name, timestamp)"
        ]

        for index_sql in indexes:
            cursor.execute(index_sql)

        # Create triggers for automatic timestamp updates
        triggers = [
            """
            CREATE TRIGGER IF NOT EXISTS update_pdfs_timestamp 
            AFTER UPDATE ON pdfs
            BEGIN
                UPDATE pdfs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
            """,
            """
            CREATE TRIGGER IF NOT EXISTS update_session_activity
            AFTER UPDATE ON user_sessions
            BEGIN
                                UPDATE user_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END
            """
        ]

        for trigger_sql in triggers:
            cursor.execute(trigger_sql)

        # Insert initial system configuration
        cursor.execute("""
            INSERT OR IGNORE INTO system_stats (metric_name, metric_value, metric_unit, tags)
            VALUES 
                ('database_version', 2.0, 'version', '{"component": "database", "reset_date": "' || datetime('now') || '"}'),
                ('schema_version', 1.0, 'version', '{"component": "schema"}'),
                ('total_resets', 1, 'count', '{"component": "maintenance"}')
        """)

        conn.commit()
        conn.close()

        logger.info("✅ Fresh database schema created with:")
        logger.info("   - Enhanced PDFs table with metadata")
        logger.info("   - Comprehensive chunks table")
        logger.info("   - Detailed search history tracking")
        logger.info("   - System logs and monitoring")
        logger.info("   - User session management")
        logger.info("   - Background processing queue")
        logger.info("   - Performance indexes and triggers")

    except Exception as e:
        logger.error(f"❌ Database creation failed: {e}")
        return False

    # 6. Create configuration files if they don't exist
    create_default_configs()

    logger.info("🎉 Database reset complete!")

    if backup_path:
        logger.info(f"💾 Backup available at: {backup_path}")

    logger.info("\nNext steps:")
    logger.info("1. Start your server: uvicorn app.main:app --reload")
    logger.info("2. Upload some PDFs to test")
    logger.info("3. Try searching and RAG queries")
    logger.info("4. Monitor system health with: python scripts/health_monitor.py")

    return True

def create_default_configs():
    """Create default configuration files"""
    configs = {
        "monitor_config.json": {
            "alerts": {
                "email_enabled": False,
                "email_smtp_server": "smtp.gmail.com",
                "email_smtp_port": 587,
                "email_username": "",
                "email_password": "",
                "email_recipients": [],
                "response_time_threshold": 2.0,
                "cpu_threshold": 80.0,
                "memory_threshold": 85.0,
                "disk_threshold": 90.0,
                "error_rate_threshold": 10
            },
            "monitoring": {
                "check_interval": 60,
                "retention_days": 30,
                "enable_performance_tracking": True,
                "enable_resource_monitoring": True
            }
        },
        "logging_config.json": {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "standard": {
                    "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
                },
                "detailed": {
                    "format": "%(asctime)s [%(levelname)s] %(name)s:%(lineno)d: %(message)s"
                }
            },
            "handlers": {
                "default": {
                    "level": "INFO",
                    "formatter": "standard",
                    "class": "logging.StreamHandler"
                },
                "file": {
                    "level": "DEBUG",
                    "formatter": "detailed",
                    "class": "logging.handlers.RotatingFileHandler",
                    "filename": "storage/logs/app.log",
                    "maxBytes": 10485760,
                    "backupCount": 5
                }
            },
            "loggers": {
                "": {
                    "handlers": ["default", "file"],
                    "level": "INFO",
                    "propagate": False
                }
            }
        },
        "performance_config.json": {
            "chunking": {
                "chunk_size": 1000,
                "chunk_overlap": 200,
                "min_chunk_size": 100,
                "max_chunk_size": 2000
            },
            "embedding": {
                "batch_size": 32,
                "max_retries": 3,
                "timeout": 30
            },
            "search": {
                "default_limit": 10,
                "max_limit": 100,
                "similarity_threshold": 0.7
            },
            "processing": {
                "max_concurrent_uploads": 5,
                "processing_timeout": 300,
                "cleanup_interval": 3600
            }
        }
    }

    for filename, config in configs.items():
        config_path = Path(filename)
        if not config_path.exists():
            try:
                with open(config_path, 'w') as f:
                    json.dump(config, f, indent=2)
                logger.info(f"✅ Created default config: {filename}")
            except Exception as e:
                logger.warning(f"⚠️  Could not create {filename}: {e}")

def verify_reset():
    """Verify that the reset was successful"""
    storage_dir = Path("./storage")
    db_path = storage_dir / "app.db"

    if not db_path.exists():
        logger.error("❌ Database file not found after reset")
        return False

    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()

        # Check if all tables exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]

        expected_tables = [
            'pdfs', 'chunks', 'search_history', 'system_logs',
            'user_sessions', 'processing_queue', 'system_stats'
        ]

        missing_tables = [table for table in expected_tables if table not in tables]

        if missing_tables:
            logger.error(f"❌ Missing tables: {missing_tables}")
            return False

        # Check if indexes exist
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
        indexes = [row[0] for row in cursor.fetchall()]

        # Verify some key indexes exist
        key_indexes = ['idx_pdfs_status', 'idx_chunks_pdf_id', 'idx_search_date']
        missing_indexes = [idx for idx in key_indexes if idx not in indexes]

        if missing_indexes:
            logger.warning(f"⚠️  Missing indexes: {missing_indexes}")

        conn.close()

        logger.info("✅ Database verification successful")
        logger.info(f"   - Tables: {len(tables)} created")
        logger.info(f"   - Indexes: {len(indexes)} created")

        return True

    except Exception as e:
        logger.error(f"❌ Database verification failed: {e}")
        return False

def restore_from_backup(backup_path: str):
    """Restore database from backup"""
    backup_dir = Path(backup_path)

    if not backup_dir.exists():
        logger.error(f"❌ Backup directory not found: {backup_path}")
        return False

    manifest_path = backup_dir / "backup_manifest.json"
    if not manifest_path.exists():
        logger.error("❌ Backup manifest not found")
        return False

    try:
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)

        logger.info(f"📦 Restoring from backup created: {manifest['backup_date']}")

        storage_dir = Path("./storage")
        storage_dir.mkdir(exist_ok=True)

        # Restore database
        if manifest['files_backed_up']['database']:
            backup_db = backup_dir / "app.db"
            target_db = storage_dir / "app.db"
            shutil.copy2(backup_db, target_db)
            logger.info("✅ Database restored")

        # Restore ChromaDB
        if manifest['files_backed_up']['chroma_db']:
            backup_chroma = backup_dir / "chroma_db"
            target_chroma = storage_dir / "chroma_db"
            if target_chroma.exists():
                shutil.rmtree(target_chroma)
            shutil.copytree(backup_chroma, target_chroma)
            logger.info("✅ ChromaDB restored")

        # Restore PDFs
        if manifest['files_backed_up']['pdfs']:
            backup_pdfs = backup_dir / "pdfs"
            target_pdfs = storage_dir / "pdfs"
            target_pdfs.mkdir(exist_ok=True)

            for pdf_file in backup_pdfs.glob("*.pdf"):
                shutil.copy2(pdf_file, target_pdfs / pdf_file.name)

            logger.info("✅ PDFs restored")

        logger.info("🎉 Restore completed successfully")
        return True

    except Exception as e:
        logger.error(f"❌ Restore failed: {e}")
        return False

def list_backups():
    """List available backups"""
    backups_dir = Path("./backups")

    if not backups_dir.exists():
        logger.info("No backups directory found")
        return []

    backups = []
    for backup_dir in backups_dir.iterdir():
        if backup_dir.is_dir():
            manifest_path = backup_dir / "backup_manifest.json"
            if manifest_path.exists():
                try:
                    with open(manifest_path, 'r') as f:
                        manifest = json.load(f)
                    backups.append({
                        'path': str(backup_dir),
                        'date': manifest['backup_date'],
                        'files': manifest['files_backed_up']
                    })
                except Exception as e:
                    logger.warning(f"Could not read backup manifest in {backup_dir}: {e}")

    backups.sort(key=lambda x: x['date'], reverse=True)

    if backups:
        logger.info("Available backups:")
        for i, backup in enumerate(backups, 1):
            logger.info(f"  {i}. {backup['date']} - {backup['path']}")
            files = [k for k, v in backup['files'].items() if v]
            logger.info(f"     Contains: {', '.join(files)}")
    else:
        logger.info("No backups found")

    return backups

def main():
    """Main function with command line interface"""
    parser = argparse.ArgumentParser(description="Reset and manage RAG database")
    parser.add_argument("--no-backup", action="store_true", help="Skip creating backup")
    parser.add_argument("--keep-pdfs", action="store_true", help="Keep existing PDF files")
    parser.add_argument("--restore", type=str, help="Restore from backup directory")
    parser.add_argument("--list-backups", action="store_true", help="List available backups")
    parser.add_argument("--verify", action="store_true", help="Verify database integrity")
    parser.add_argument("--force", action="store_true", help="Force reset without confirmation")

    args = parser.parse_args()

    if args.list_backups:
        list_backups()
        return

    if args.verify:
        if verify_reset():
            logger.info("✅ Database is healthy")
        else:
            logger.error("❌ Database has issues")
        return

    if args.restore:
        if restore_from_backup(args.restore):
            logger.info("✅ Restore completed")
        else:
            logger.error("❌ Restore failed")
        return

    # Confirm reset unless forced
    if not args.force:
        logger.warning("⚠️  This will reset all data in the RAG database!")
        if args.no_backup:
            logger.warning("⚠️  No backup will be created!")

        response = input("Are you sure you want to continue? (y/N): ")
        if response.lower() != 'y':
            logger.info("Reset cancelled")
            return

    # Perform reset
    success = reset_database(
        create_backup=not args.no_backup,
        keep_pdfs=args.keep_pdfs
    )

    if success:
        # Verify the reset
        if verify_reset():
            logger.info("🎉 Reset completed and verified successfully!")
        else:
            logger.warning("⚠️  Reset completed but verification failed")
    else:
        logger.error("❌ Reset failed")

if __name__ == "__main__":
    main()

