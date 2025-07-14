import logging
import asyncio
from contextlib import asynccontextmanager
from typing import List

from chromadb.app import app
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
from app.services.chroma_service import ChromaService, get_chroma_service
from app.services.document_processor import DocumentProcessor

# Import your existing routes
from app.api.routes import pdf, search, admin, health, documents, pdfs

if os.path.exists("uploads"):
    app.mount("/storage/pdfs", StaticFiles(directory="uploads"), name="uploads")

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
rag_service = None


@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    try:
        logger.info("🚀 Starting application...")

        # Initialize ChromaDB
        from app.services.chroma_service import get_chroma_service
        chroma_service = get_chroma_service()

        if chroma_service:
            logger.info("🔍 Initializing ChromaDB...")
            success = await chroma_service.initialize()
            if success:
                logger.info("✅ ChromaDB initialized successfully")

                # Perform health check
                health = await chroma_service.health_check()
                logger.info(f"📊 ChromaDB health status: {health['status']}")

                if health['status'] not in ['healthy', 'degraded']:
                    logger.warning(f"⚠️ ChromaDB health issues: {health.get('errors', [])}")
            else:
                logger.error("❌ ChromaDB initialization failed")
        else:
            logger.error("❌ ChromaDB service not available")

    except Exception as e:
        logger.error(f"❌ Startup initialization failed: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    try:
        logger.info("🛑 Shutting down application...")

        from app.services.chroma_service import chroma_service
        if chroma_service:
            await chroma_service.close()
            logger.info("✅ ChromaDB service closed")

    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    global document_processor, vector_store, ollama_service, chroma_service, rag_service

    # Startup
    logger.info("🚀 Starting RAG application...")

    try:
        from app.core.database import init_db, check_database_health

        # Initialize database (DO NOT drop tables in production)
        logger.info("Initializing database...")

        # REMOVE THESE LINES - they drop all your data!
        # Base.metadata.drop_all(bind=engine)
        # Base.metadata.create_all(bind=engine)

        # Instead, use proper database initialization
        init_success = init_db()

        if init_success:
            # Check health
            health = check_database_health()
            logger.info(f"Database health: {health}")

            # Check if we have existing documents
            try:
                from app.models.database_models import Document
                from app.core.database import get_db

                # Get database session
                db = next(get_db())
                document_count = db.query(Document).count()
                logger.info(f"Found {document_count} existing documents in database")
                db.close()

            except Exception as e:
                logger.warning(f"Could not check existing documents: {e}")

        else:
            logger.error("Database initialization failed")
            raise Exception("Database initialization failed")

        # Rest of your initialization code remains the same...
        # Initialize ChromaDB service
        logger.info("Initializing ChromaDB service...")
        chroma_service = ChromaService()
        chroma_init_success = await chroma_service.initialize()

        if chroma_init_success:
            logger.info("✅ ChromaDB service initialized successfully")
            stats = chroma_service.get_collection_stats()
            logger.info(f"ChromaDB stats: {stats}")
        else:
            logger.error("❌ ChromaDB service initialization failed")
            raise Exception("ChromaDB service initialization failed")

        # Initialize legacy VectorStore (if still needed for backward compatibility)
        logger.info("Initializing legacy VectorStore...")
        vector_store = VectorStore()
        try:
            await vector_store.initialize()
            logger.info("✅ Legacy VectorStore initialized successfully")
        except Exception as e:
            logger.warning(f"Legacy VectorStore initialization failed: {e}")

        # Initialize Ollama service with retry logic
        logger.info("Initializing Ollama service...")
        from app.services.ollama_service import OllamaService

        # Create new instance with explicit parameters
        ollama_service = OllamaService(base_url="http://localhost:11434", timeout=30)

        ollama_success = False
        max_retries = 3

        for attempt in range(max_retries):
            logger.info(f"Attempting to connect to Ollama (attempt {attempt + 1}/{max_retries})")
            ollama_success = await ollama_service.initialize()

            if ollama_success:
                logger.info("✅ Ollama service initialized successfully")
                try:
                    models = await ollama_service.list_models()
                    if models:
                        model_names = [m.get('name', 'unknown') for m in models[:3]]
                        logger.info(f"📋 Available Ollama models: {', '.join(model_names)}")
                    else:
                        logger.warning("⚠️  No models found - you may need to pull a model first")
                except Exception as e:
                    logger.warning(f"Could not list models: {e}")
                break
            elif attempt < max_retries - 1:
                logger.info("⏳ Retrying Ollama connection in 5 seconds...")
                await asyncio.sleep(5)

        if not ollama_success:
            logger.warning("⚠️  Ollama service not available - RAG will work with search only")

        # Initialize document processor
        logger.info("Initializing document processor...")
        document_processor = DocumentProcessor()

        # Log supported file types
        logger.info(f"📄 Supported file types: {list(document_processor.supported_types.keys())}")

        # Initialize RAG service
        logger.info("Initializing RAG service...")
        try:
            from app.services.rag_service import RAGService
            rag_service = RAGService(
                chroma_service=chroma_service,
                ollama_service=ollama_service if ollama_success else None
            )
            logger.info("✅ RAG service initialized successfully")
        except Exception as e:
            logger.error(f"❌ RAG service initialization failed: {e}")
            # Create a minimal RAG service that works without Ollama
            rag_service = RAGService(
                chroma_service=chroma_service,
                ollama_service=None
            )
            logger.info("✅ RAG service initialized in search-only mode")

        # Make services available globally and in app state
        app.state.vector_store = vector_store
        app.state.chroma_service = chroma_service
        app.state.ollama_service = ollama_service
        app.state.document_processor = document_processor
        app.state.rag_service = rag_service

        # Log final status
        services_status = {
            "database": "✅ Connected",
            "chroma_db": "✅ Connected" if chroma_init_success else "❌ Failed",
            "ollama": "✅ Connected" if ollama_success else "⚠️  Search-only mode",
            "vector_store": "✅ Initialized",
            "document_processor": "✅ Initialized",
            "rag_service": "✅ Initialized"
        }

        logger.info("🎯 Service Status Summary:")
        for service, status in services_status.items():
            logger.info(f"  {service}: {status}")

        logger.info("✅ All services initialized successfully")

    except Exception as e:
        logger.error(f"❌ Startup error: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise

    yield

    # Shutdown code remains the same...
    logger.info("🛑 Shutting down services...")

    # Cleanup RAG service
    if 'rag_service' in locals() and rag_service:
        try:
            if hasattr(rag_service, 'close'):
                await rag_service.close()
            logger.info("✅ RAG service closed")
        except Exception as e:
            logger.error(f"Error closing RAG service: {e}")

    # Cleanup ChromaDB connections
    if chroma_service:
        try:
            if hasattr(chroma_service, 'close'):
                await chroma_service.close()
            logger.info("✅ ChromaDB service closed")
        except Exception as e:
            logger.error(f"Error closing ChromaDB service: {e}")

    # Cleanup legacy VectorStore
    if vector_store:
        try:
            if hasattr(vector_store, 'close'):
                await vector_store.close()
            logger.info("✅ Legacy VectorStore closed")
        except Exception as e:
            logger.error(f"Error closing vector store: {e}")

    # Cleanup Ollama service
    if ollama_service:
        try:
            if hasattr(ollama_service, 'close'):
                await ollama_service.close()
            logger.info("✅ Ollama service closed")
        except Exception as e:
            logger.error(f"Error closing Ollama service: {e}")

    logger.info("✅ Application shutdown completed")


app = FastAPI(
    title="RAG Document Search API",
    version="1.0.0",
    description="Universal document search API supporting PDF, images, text files, and more",
    docs_url=None,  # Disables Swagger UI
    redoc_url=None,  # Disables ReDoc
    openapi_url=None,  # Disables OpenAPI schema at /openapi.json
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
app.include_router(pdfs.router, prefix="/api/pdfs", tags=["PDF Management"])

# New universal documents route
app.include_router(documents.router, prefix="/documents", tags=["documents"])


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


@app.get("/debug/chroma-contents")
async def debug_chroma_contents():
    """Debug endpoint to see what's in ChromaDB"""
    chroma_service = get_chroma_service()
    if not chroma_service:
        raise HTTPException(status_code=500, detail="ChromaDB service not available")

    return await chroma_service.debug_collection_contents()


@app.post("/debug/chroma-search")
async def debug_chroma_search(query: str = "dennis"):
    """Debug endpoint to test ChromaDB search"""
    chroma_service = get_chroma_service()
    if not chroma_service:
        raise HTTPException(status_code=500, detail="ChromaDB service not available")

    return await chroma_service.test_embedding_search(query)


@app.post("/debug/chroma-keywords")
async def debug_chroma_keywords(keywords: List[str] = ["dennis", "document", "pdf"]):
    """Debug endpoint to search by keywords"""
    chroma_service = get_chroma_service()
    if not chroma_service:
        raise HTTPException(status_code=500, detail="ChromaDB service not available")

    return await chroma_service.search_by_content_keywords(keywords)

# Add database reset endpoint for development


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

    # Check Ollama status (without model check)
    ollama_status = "disconnected"
    if ollama_service:
        try:
            is_available = await ollama_service.is_available()
            if is_available:
                ollama_status = "connected"
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
@app.get("/debug/routes")
async def list_routes():
    """List all available routes for debugging"""
    routes = []
    for route in app.routes:
        if hasattr(route, 'methods') and hasattr(route, 'path'):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": getattr(route, 'name', 'unnamed')
            })
    return {"routes": routes}

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