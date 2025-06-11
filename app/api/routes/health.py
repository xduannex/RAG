import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.ollama_service import OllamaService
from app.services.vector_store import VectorStore
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health_check():
    """Simple health check endpoint"""
    try:
        # Check if we can connect to database
        from app.core.database import SessionLocal
        from sqlalchemy import text

        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db_status = "healthy"
            db_error = None
        except Exception as e:
            db_status = "unhealthy"
            db_error = str(e)
        finally:
            db.close()

        # Determine overall status
        overall_status = "healthy" if db_status == "healthy" else "unhealthy"

        return {
            "status": overall_status,
            "database": db_status,
            "database_error": db_error,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "database": "unhealthy",
            "database_error": str(e),
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }


@router.get("/health/detailed")
async def detailed_health_check(db: Session = Depends(get_db)):
    """Detailed health check including all services"""
    health_status = {
        "status": "healthy",
        "services": {},
        "timestamp": None
    }

    # Check database connection
    try:
        db.execute("SELECT 1")
        health_status["services"]["database"] = {"status": "healthy"}
    except Exception as e:
        health_status["services"]["database"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "unhealthy"

    # Check Ollama service
    try:
        ollama_service = OllamaService()
        ollama_healthy = await ollama_service.health_check()
        if ollama_healthy:
            health_status["services"]["ollama"] = {"status": "healthy"}
        else:
            health_status["services"]["ollama"] = {"status": "unhealthy", "error": "Models not available"}
            health_status["status"] = "degraded"
        await ollama_service.close()
    except Exception as e:
        health_status["services"]["ollama"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "unhealthy"

    # Check vector store
    try:
        vector_store = VectorStore()
        stats = vector_store.get_collection_stats()
        health_status["services"]["vector_store"] = {
            "status": "healthy",
            "stats": stats
        }
    except Exception as e:
        health_status["services"]["vector_store"] = {"status": "unhealthy", "error": str(e)}
        health_status["status"] = "unhealthy"

    from datetime import datetime
    health_status["timestamp"] = datetime.utcnow().isoformat()

    return health_status