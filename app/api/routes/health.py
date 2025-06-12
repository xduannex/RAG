import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.ollama_service import OllamaService
from app.services.vector_store import VectorStore
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
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

        response_data = {
            "status": overall_status,
            "database": db_status,
            "database_error": db_error,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        }

        # Return appropriate HTTP status code
        if overall_status == "unhealthy":
            from fastapi import HTTPException
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=503,  # Service Unavailable
                content=response_data
            )

        return response_data

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        error_response = {
            "status": "unhealthy",
            "database": "unhealthy",
            "database_error": str(e),
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z"
        }

        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,  # Service Unavailable
            content=error_response
        )


@router.get("/detailed")
async def detailed_health_check(db: Session = Depends(get_db)):
    """Detailed health check including all services"""
    health_status = {
        "status": "healthy",
        "services": {},
        "timestamp": None
    }

    # Check database connection
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
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

    health_status["timestamp"] = datetime.datetime.utcnow().isoformat() + "Z"

    return health_status
