import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Use your existing database
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./storage/app.db")

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def add_missing_columns():
    """Add only the missing columns to existing tables"""
    try:
        with SessionLocal() as db:
            # Check existing columns
            result = db.execute(text("PRAGMA table_info(pdfs)"))
            existing_columns = [row[1] for row in result.fetchall()]
            logger.info(f"Existing columns: {existing_columns}")

            # Only the columns that are missing from your existing schema
            required_columns = {
                'title': 'VARCHAR(255)',
                'category': 'VARCHAR(100)',
                'description': 'TEXT',
                'status': 'VARCHAR(50) DEFAULT "uploaded"',
                'processing_error': 'TEXT',
                'created_at': 'DATETIME DEFAULT CURRENT_TIMESTAMP',
                'updated_at': 'DATETIME DEFAULT CURRENT_TIMESTAMP'
            }

            # Add missing columns
            added_columns = []
            for column_name, column_def in required_columns.items():
                if column_name not in existing_columns:
                    try:
                        sql = f"ALTER TABLE pdfs ADD COLUMN {column_name} {column_def}"
                        db.execute(text(sql))
                        db.commit()
                        added_columns.append(column_name)
                        logger.info(f"✅ Added column: {column_name}")
                    except Exception as e:
                        logger.warning(f"Could not add column {column_name}: {e}")

            if added_columns:
                logger.info(f"Added {len(added_columns)} new columns: {added_columns}")
            else:
                logger.info("All required columns already exist")

            # Create other tables if they don't exist
            try:
                # Create chunks table if it doesn't exist
                db.execute(text("""
                                CREATE TABLE IF NOT EXISTS chunks
                                (
                                    id
                                    INTEGER
                                    PRIMARY
                                    KEY
                                    AUTOINCREMENT,
                                    pdf_id
                                    INTEGER
                                    NOT
                                    NULL,
                                    chunk_index
                                    INTEGER
                                    NOT
                                    NULL,
                                    content
                                    TEXT
                                    NOT
                                    NULL,
                                    page_number
                                    INTEGER,
                                    chunk_meta
                                    TEXT,
                                    created_at
                                    DATETIME
                                    DEFAULT
                                    CURRENT_TIMESTAMP,
                                    FOREIGN
                                    KEY
                                (
                                    pdf_id
                                ) REFERENCES pdfs
                                (
                                    id
                                )
                                    )
                                """))

                # Create search_history table if it doesn't exist
                db.execute(text("""
                                CREATE TABLE IF NOT EXISTS search_history
                                (
                                    id
                                    INTEGER
                                    PRIMARY
                                    KEY
                                    AUTOINCREMENT,
                                    query
                                    TEXT
                                    NOT
                                    NULL,
                                    query_type
                                    VARCHAR
                                (
                                    50
                                ) DEFAULT 'search',
                                    results_count INTEGER DEFAULT 0,
                                    response_time REAL,
                                    search_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                                    user_session VARCHAR
                                (
                                    100
                                ),
                                    search_meta TEXT
                                    )
                                """))

                db.commit()
                logger.info("✅ Created additional tables")

            except Exception as e:
                logger.warning(f"Could not create additional tables: {e}")

            return True

    except Exception as e:
        logger.error(f"Error adding missing columns: {e}")
        return False


def init_db() -> bool:
    """Initialize database with your existing schema"""
    try:
        logger.info("Initializing database with existing schema...")

        # Add missing columns to existing tables
        success = add_missing_columns()

        if success:
            logger.info("✅ Database initialization completed successfully")
        else:
            logger.warning("⚠️ Database initialization completed with warnings")

        return success

    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        return False


def check_database_health() -> dict:
    """Check database health and return status"""
    try:
        with SessionLocal() as db:
            # Test basic query
            db.execute(text("SELECT 1"))

            # Count records in pdfs table
            result = db.execute(text("SELECT COUNT(*) FROM pdfs"))
            pdf_count = result.scalar()

            # Check if we have processed PDFs
            result = db.execute(text("SELECT COUNT(*) FROM pdfs WHERE processed = 1"))
            processed_count = result.scalar()

            return {
                "status": "healthy",
                "message": "Database is operational",
                "total_pdfs": pdf_count,
                "processed_pdfs": processed_count
            }

    except Exception as e:
        return {
            "status": "unhealthy",
            "message": f"Database error: {str(e)}"
        }
