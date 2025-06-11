import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config.settings import settings

logger = logging.getLogger(__name__)

# Create engine based on database URL
if settings.database_url.startswith("sqlite"):
    # SQLite specific configuration
    engine = create_engine(
        settings.database_url,
        connect_args={
            "check_same_thread": False,
            "timeout": 30
        },
        poolclass=StaticPool,
        echo=settings.debug
    )
else:
    # PostgreSQL or other databases
    engine = create_engine(
        settings.database_url,
        echo=settings.debug
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def init_db():
    """Initialize database tables"""
    try:
        logger.info("Initializing database...")

        # Import all models to ensure they are registered
        from app.models import database_models

        # Create all tables
        Base.metadata.create_all(bind=engine)

        logger.info("Database tables created successfully")

        # Test database connection
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            logger.info("Database connection test successful")
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            raise
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise


def get_db_info():
    """Get database information"""
    return {
        "url": settings.database_url.split("://")[0] + "://[hidden]",  # Hide credentials
        "echo": settings.debug,
        "tables": list(Base.metadata.tables.keys())
    }