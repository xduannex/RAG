import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, Response
from fastapi.responses import HTMLResponse
from app.core.database import engine
from app.models.database_models import Base
import uvicorn
import os

from app.config.settings import settings
from app.core.database import init_db
from app.services.ollama_service import OllamaService
from app.services.vector_store import VectorStore

# Import your existing routes
from app.api.routes import pdf, search, admin, health, bulk_upload

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

logger = logging.getLogger(__name__)

# Global services
ollama_service = None
vector_store = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    # Startup
    try:
        from app.core.database import init_db, check_database_health

        # Initialize database (add missing columns)
        logger.info("Initializing database...")
        init_success = init_db()

        if init_success:
            # Check health
            health = check_database_health()
            logger.info(f"Database health: {health}")
        else:
            logger.error("Database initialization failed")

    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

    yield

    # Shutdown
    logger.info("Application shutdown completed")


app = FastAPI(
    title="RAG PDF Search API",
    version="1.0.0",
    lifespan=lifespan
)

# Enhanced CORS middleware for network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        # Network access - replace with your actual network IPs
        "http://192.168.1.*:3000",  # Common local network range
        "http://192.168.0.*:3000",  # Common local network range
        "http://10.0.0.*:3000",  # Common local network range
        # Allow all origins for development (remove in production)
        "*"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Origin",
        "Cache-Control",
        "Pragma",
        "X-Custom-Header"
    ],
    expose_headers=["*"],
)


# Additional CORS handling middleware for complex requests
@app.middleware("http")
async def cors_handler(request, call_next):
    # Handle preflight requests
    if request.method == "OPTIONS":
        response = Response()
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, HEAD, PATCH"
        response.headers[
            "Access-Control-Allow-Headers"] = "Accept, Accept-Language, Content-Language, Content-Type, Authorization, X-Requested-With, Origin, Cache-Control, Pragma"
        response.headers["Access-Control-Max-Age"] = "86400"
        return response

    # Process the request
    response = await call_next(request)

    # Add CORS headers to all responses
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"

    return response


# Request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(f"Request: {request.method} {request.url} from {request.client.host if request.client else 'unknown'}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response


# Include API routes from separate files
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(pdf.router, prefix="/pdf", tags=["PDFs"])
app.include_router(search.router, prefix="/search", tags=["Search"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(bulk_upload.router, prefix="/bulk", tags=["Bulk Upload"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with basic info"""
    return {
        "message": "RAG PDF Search API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "cors": "enabled"
    }


# CORS test endpoint
@app.get("/cors-test")
async def cors_test():
    """Test endpoint to verify CORS is working"""
    return {
        "message": "CORS is working!",
        "timestamp": "2024-01-01T00:00:00Z",
        "status": "success"
    }


# Serve static files if directory exists
static_dir = "static"
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


def main():
    """Main entry point"""
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",  # Changed from settings.host to allow network access
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )


if __name__ == "__main__":
    main()
