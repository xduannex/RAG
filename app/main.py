import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

app = FastAPI(title="RAG PDF Search API", version="1.0.0")


@app.on_event("startup")
def startup_event():
    """Initialize database on startup"""
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


logger = logging.getLogger(__name__)

# Global services
ollama_service = None
vector_store = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    # Startup
    try:
        from app.core.database import init_db
        init_db()  # This is a synchronous function, don't await it
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

    yield

    # Shutdown
    logger.info("Application shutdown completed")


app = FastAPI(
    title="RAG PDF Search API",
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
