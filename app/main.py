import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
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
    """Application lifespan manager"""
    global ollama_service, vector_store

    try:
        logger.info("Starting RAG PDF Search API...")

        # Initialize database
        await init_db()
        logger.info("Database initialized successfully")

        # Initialize Ollama service
        ollama_service = OllamaService()

        # Try to verify Ollama connection (but don't fail if it's not available)
        try:
            is_healthy = await ollama_service.health_check()
            if is_healthy:
                logger.info("Ollama service is healthy and ready")
            else:
                logger.warning("Ollama service is not fully ready - some features may be limited")
        except Exception as e:
            logger.warning(f"Could not verify Ollama service: {str(e)}")

        # Initialize vector store
        vector_store = VectorStore()
        await vector_store.initialize()

        # Get initial chunk count
        chunk_count = await vector_store.get_chunk_count()
        logger.info(f"Vector store initialized with {chunk_count} chunks")

        logger.info("Application startup completed successfully")

        yield

    except Exception as e:
        logger.error(f"Failed to start application: {str(e)}")
        raise
    finally:
        # Cleanup
        logger.info("Shutting down application...")

        # Close services safely
        try:
            if ollama_service:
                await ollama_service.close()
                logger.info("Ollama service closed")
        except Exception as e:
            logger.error(f"Error closing Ollama service: {e}")

        try:
            if vector_store:
                await vector_store.close()
                logger.info("Vector store closed")
        except Exception as e:
            logger.error(f"Error closing vector store: {e}")

        logger.info("Application shutdown completed")


# Create FastAPI app
app = FastAPI(
    title="RAG PDF Search API",
    description="A RAG-based PDF search and question-answering system",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*"  # Allow all origins for development
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

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
        "health": "/health"
    }

# Serve static files if directory exists
static_dir = "static"
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Request logging middleware
@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response

def main():
    """Main entry point"""
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )


if __name__ == "__main__":
    main()
