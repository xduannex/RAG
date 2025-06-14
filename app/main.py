import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, Response
from app.core.database import engine
from app.models.database_models import Base
import uvicorn
import os

from app.config import settings
from app.core.database import init_db
from app.services.ollama_service import OllamaService
from app.services.vector_store import VectorStore
from app.services.chroma_service import ChromaService
from app.services.document_processor import DocumentProcessor

# Import your existing routes
from app.api.routes import pdf, search, admin, health, bulk_upload, documents, pdfs

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
chroma_service = None
document_processor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    global document_processor, vector_store, ollama_service, chroma_service

    # Startup
    try:
        from app.core.database import init_db, check_database_health

        # Re-initialize database (recreate tables if needed)
        logger.info("Re-initializing database...")

        # Drop and recreate all tables for fresh start
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        init_success = init_db()

        if init_success:
            # Check health
            health = check_database_health()
            logger.info(f"Database health: {health}")
        else:
            logger.error("Database initialization failed")
            raise Exception("Database initialization failed")

        # Initialize ChromaDB service (unified approach)
        logger.info("Initializing ChromaDB service...")
        chroma_service = ChromaService()
        chroma_init_success = await chroma_service.initialize()

        if chroma_init_success:
            logger.info("ChromaDB service initialized successfully")
            # Get collection stats
            stats = chroma_service.get_collection_stats()
            logger.info(f"ChromaDB stats: {stats}")
        else:
            logger.error("ChromaDB service initialization failed")
            raise Exception("ChromaDB service initialization failed")

        # Initialize legacy VectorStore (if still needed for backward compatibility)
        logger.info("Initializing legacy VectorStore...")
        vector_store = VectorStore()
        try:
            await vector_store.initialize()
            logger.info("Legacy VectorStore initialized successfully")
        except Exception as e:
            logger.warning(f"Legacy VectorStore initialization failed: {e}")
            # Don't fail startup if legacy vector store fails

        # Initialize Ollama service
        logger.info("Initializing Ollama service...")
        ollama_service = OllamaService()
        ollama_success = await ollama_service.initialize()

        if ollama_success:
            logger.info("Ollama service initialized successfully")
            models = await ollama_service.get_available_models()
            logger.info(f"Available Ollama models: {models}")
        else:
            logger.warning("Ollama service not available - RAG will work with search only")

        # Initialize document processor
        logger.info("Initializing document processor...")
        document_processor = DocumentProcessor()

        # Log supported file types
        logger.info(f"Supported file types: {list(document_processor.supported_types.keys())}")

        # Make services available globally and in app state
        app.state.vector_store = vector_store
        app.state.chroma_service = chroma_service
        app.state.ollama_service = ollama_service
        app.state.document_processor = document_processor

        logger.info("All services initialized successfully")

    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

    yield

    # Shutdown
    logger.info("Shutting down services...")

    # Cleanup ChromaDB connections
    if chroma_service:
        try:
            if hasattr(chroma_service, 'close'):
                await chroma_service.close()
            logger.info("ChromaDB service closed")
        except Exception as e:
            logger.error(f"Error closing ChromaDB service: {e}")

    # Cleanup legacy VectorStore
    if vector_store:
        try:
            if hasattr(vector_store, 'close'):
                await vector_store.close()
            logger.info("Legacy VectorStore closed")
        except Exception as e:
            logger.error(f"Error closing vector store: {e}")

    # Cleanup Ollama service
    if ollama_service:
        try:
            if hasattr(ollama_service, 'close'):
                await ollama_service.close()
            logger.info("Ollama service closed")
        except Exception as e:
            logger.error(f"Error closing Ollama service: {e}")

    logger.info("Application shutdown completed")


app = FastAPI(
    title="RAG Document Search API",
    version="1.0.0",
    description="Universal document search API supporting PDF, images, text files, and more",
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
        "http://192.168.1.*:3000",
        "http://192.168.0.*:3000",
        "http://10.0.0.*:3000",
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
app.include_router(pdfs.router, prefix="/api/pdfs", tags=["PDF Management"])

# New universal documents route
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with basic info"""
    return {
        "message": "RAG Document Search API",
        "version": "1.0.0",
        "description": "Universal document search supporting multiple file types",
        "supported_types": settings.allowed_file_types,
        "docs": "/docs",
        "health": "/health",
        "cors": "enabled",
        "services": {
            "vector_store": "ChromaDB",
            "llm": "Ollama",
            "database": "SQLite/PostgreSQL"
        }
    }


# Add database reset endpoint for development
@app.post("/admin/reset-database")
async def reset_database():
    """Reset database - USE WITH CAUTION"""
    try:
        logger.warning("Resetting database...")

        # Drop and recreate all tables
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        # Re-initialize
        init_success = init_db()

        if init_success:
            return {"message": "Database reset successfully", "status": "success"}
        else:
            raise HTTPException(status_code=500, detail="Database reset failed")

    except Exception as e:
        logger.error(f"Database reset error: {e}")
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")


# Add ChromaDB reset endpoint
@app.post("/admin/reset-chromadb")
async def reset_chromadb():
    """Reset ChromaDB collections - USE WITH CAUTION"""
    try:
        global chroma_service

        if not chroma_service:
            raise HTTPException(status_code=500, detail="ChromaDB service not initialized")

        logger.warning("Resetting ChromaDB...")

        # Reset ChromaDB collections
        if hasattr(chroma_service, 'reset_collection'):
            result = chroma_service.reset_collection()
            if not result:
                raise HTTPException(status_code=500, detail="ChromaDB reset failed")
        else:
            # Reinitialize ChromaDB service
            chroma_service = ChromaService()
            await chroma_service.initialize()

        return {"message": "ChromaDB reset successfully", "status": "success"}

    except Exception as e:
        logger.error(f"ChromaDB reset error: {e}")
        raise HTTPException(status_code=500, detail=f"ChromaDB reset failed: {str(e)}")


# Service status endpoint
@app.get("/status")
async def get_status():
    """Get status of all services"""
    global chroma_service, ollama_service, vector_store, document_processor

    # Check ChromaDB status
    chroma_status = "disconnected"
    if chroma_service and chroma_service.is_initialized:
        try:
            stats = chroma_service.get_collection_stats()
            chroma_status = f"connected ({stats.get('total_documents', 0)} documents)"
        except:
            chroma_status = "error"

    # Check Ollama status
    ollama_status = "disconnected"
    if ollama_service:
        try:
            is_available = await ollama_service.is_available()
            if is_available:
                models = await ollama_service.get_available_models()
                ollama_status = f"connected ({len(models)} models)"
            else:
                ollama_status = "unavailable"
        except:
            ollama_status = "error"

    return {
        "database": "connected" if engine else "disconnected",
        "chroma_service": chroma_status,
        "vector_store": "connected" if vector_store else "disconnected",
        "ollama_service": ollama_status,
        "document_processor": "initialized" if document_processor else "not initialized"
    }


# File types endpoint
@app.get("/supported-types")
async def get_supported_types():
    """Get list of supported file types"""
    return {
        "supported_types": settings.allowed_file_types,
        "max_file_size": settings.max_file_size,
        "ocr_enabled": settings.enable_ocr
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
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )


if __name__ == "__main__":
    main()
