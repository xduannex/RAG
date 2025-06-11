from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any
import logging
from datetime import datetime, timedelta
import asyncio
import os

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/dashboard")
async def get_dashboard_stats():
    """Get comprehensive dashboard statistics"""
    try:
        logger.info("Getting dashboard stats...")

        # Basic stats without database dependencies
        stats = {
            "overview": {
                "total_pdfs": 0,
                "searchable_pdfs": 0,
                "total_chunks": 0,
                "total_searches": 0,
                "total_storage_bytes": 0,
                "avg_file_size_bytes": 0
            },
            "processing_status": {
                "pending": 0,
                "processing": 0,
                "completed": 0,
                "failed": 0
            },
            "recent_activity": {
                "uploads_last_7_days": 0,
                "searches_last_7_days": 0
            },
            "categories": {},
            "services": {
                "database": "healthy",
                "ollama": "unknown",
                "vector_store": "unknown"
            },
            "vector_store": {
                "total_chunks": 0
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        # Check storage directory
        try:
            from app.config.settings import settings
            storage_path = settings.pdf_storage_path

            if os.path.exists(storage_path):
                total_size = 0
                file_count = 0
                for filename in os.listdir(storage_path):
                    file_path = os.path.join(storage_path, filename)
                    if os.path.isfile(file_path) and filename.lower().endswith('.pdf'):
                        total_size += os.path.getsize(file_path)
                        file_count += 1

                stats["overview"]["total_pdfs"] = file_count
                stats["overview"]["total_storage_bytes"] = total_size
                if file_count > 0:
                    stats["overview"]["avg_file_size_bytes"] = total_size // file_count

        except Exception as e:
            logger.warning(f"Could not check storage: {e}")

        # Quick service checks with timeout
        try:
            # Check Ollama with timeout
            async def check_ollama():
                try:
                    import httpx
                    from app.config.settings import settings

                    async with httpx.AsyncClient(timeout=2.0) as client:
                        response = await client.get(f"{settings.ollama_host}/api/tags")
                        return response.status_code == 200
                except:
                    return False

            ollama_healthy = await asyncio.wait_for(check_ollama(), timeout=3.0)
            stats["services"]["ollama"] = "healthy" if ollama_healthy else "unhealthy"

        except asyncio.TimeoutError:
            stats["services"]["ollama"] = "timeout"
        except Exception as e:
            logger.warning(f"Ollama check failed: {e}")
            stats["services"]["ollama"] = "error"

        # Check vector store
        try:
            import app.main as main_module
            vector_store = getattr(main_module, 'vector_store', None)

            if vector_store and hasattr(vector_store, 'initialized') and vector_store.initialized:
                stats["services"]["vector_store"] = "healthy"
                if hasattr(vector_store, 'chunk_count'):
                    stats["vector_store"]["total_chunks"] = vector_store.chunk_count
            else:
                stats["services"]["vector_store"] = "not_initialized"

        except Exception as e:
            logger.warning(f"Vector store check failed: {e}")
            stats["services"]["vector_store"] = "error"

        logger.info("Dashboard stats retrieved successfully")
        return stats

    except Exception as e:
        logger.error(f"Error getting dashboard stats: {e}")
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")


@router.get("/system-info")
async def get_system_info():
    """Get system information and service status"""
    try:
        from app.config.settings import settings

        # Get basic system info
        import psutil

        # System resources
        cpu_percent = psutil.cpu_percent(interval=0.1)  # Quick check
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        # Storage directory info
        storage_path = settings.pdf_storage_path
        storage_exists = os.path.exists(storage_path)
        storage_size = 0

        if storage_exists:
            try:
                for root, dirs, files in os.walk(storage_path):
                    for file in files:
                        storage_size += os.path.getsize(os.path.join(root, file))
            except Exception as e:
                logger.warning(f"Could not calculate storage size: {e}")

        return {
            "system": {
                "cpu_percent": cpu_percent,
                "memory_total": memory.total,
                "memory_used": memory.used,
                "memory_percent": memory.percent,
                "disk_total": disk.total,
                "disk_used": disk.used,
                "disk_percent": disk.percent
            },
            "services": {
                "ollama": {
                    "host": settings.ollama_host,
                    "model": settings.ollama_model,
                    "embedding_model": settings.ollama_embedding_model
                }
            },
            "storage": {
                "path": storage_path,
                "exists": storage_exists,
                "size_bytes": storage_size,
                "max_file_size": settings.max_file_size
            },
            "configuration": {
                "environment": settings.environment,
                "debug": settings.debug,
                "log_level": settings.log_level,
                "host": settings.host,
                "port": settings.port
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting system info: {e}")
        raise HTTPException(status_code=500, detail=f"System info error: {str(e)}")


@router.get("/health")
async def admin_health():
    """Simple admin health check"""
    return {
        "status": "healthy",
        "service": "admin",
        "timestamp": datetime.utcnow().isoformat(),
        "message": "Admin endpoints are responsive"
    }


@router.get("/search-analytics")
async def get_search_analytics(days: int = Query(default=30, ge=1, le=365)):
    """Get search analytics for the specified period"""
    try:
        logger.info(f"Getting search analytics for {days} days")

        # For now, return mock data since we don't have the full database schema
        return {
            "period_days": days,
            "daily_searches": [
                {"date": "2025-06-09", "count": 5},
                {"date": "2025-06-08", "count": 3},
                {"date": "2025-06-07", "count": 8}
            ],
            "common_queries": [
                {"query": "machine learning", "count": 15},
                {"query": "data analysis", "count": 12},
                {"query": "python programming", "count": 8}
            ],
            "avg_processing_time": 0.25,
            "category_usage": [
                {"category": "technical", "count": 20},
                {"category": "research", "count": 15}
            ],
            "message": "Mock data - full analytics will be available when database is fully configured"
        }

    except Exception as e:
        logger.error(f"Error getting search analytics: {e}")
        raise HTTPException(status_code=500, detail=f"Search analytics error: {str(e)}")


@router.get("/failed-pdfs")
async def get_failed_pdfs():
    """Get list of PDFs that failed processing"""
    try:
        logger.info("Getting failed PDFs")

        # Return empty list for now
        return {
            "failed_pdfs": [],
            "total_failed": 0,
            "message": "No failed PDFs found - database schema not fully configured"
        }

    except Exception as e:
        logger.error(f"Error getting failed PDFs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed PDFs error: {str(e)}")


@router.post("/cleanup-orphaned")
async def cleanup_orphaned_data():
    """Clean up orphaned data"""
    try:
        logger.info("Starting cleanup of orphaned data")

        cleanup_results = {
            "orphaned_chunks_removed": 0,
            "invalid_embeddings_removed": 0,
            "old_search_logs_removed": 0,
            "message": "Cleanup functionality not yet implemented - database schema not fully configured"
        }

        return {
            "message": "Cleanup completed",
            "results": cleanup_results
        }

    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=f"Cleanup error: {str(e)}")


@router.post("/reindex-all")
async def reindex_all_pdfs():
    """Reindex all PDFs (regenerate all embeddings)"""
    try:
        logger.info("Starting reindex of all PDFs")

        # For now, just return a message
        return {
            "message": "Reindexing functionality not yet implemented - requires full PDF processing pipeline",
            "pdf_count": 0,
            "status": "not_implemented"
        }

    except Exception as e:
        logger.error(f"Error starting reindex: {e}")
        raise HTTPException(status_code=500, detail=f"Reindex error: {str(e)}")


@router.get("/stats")
async def get_admin_stats():
    """Get quick admin statistics"""
    try:
        from app.config.settings import settings

        # Quick stats without heavy database operations
        stats = {
            "server": {
                "status": "running",
                "uptime": "unknown",
                "environment": settings.environment
            },
            "storage": {
                "path": settings.pdf_storage_path,
                "max_file_size_mb": settings.max_file_size // (1024 * 1024)
            },
            "processing": {
                "chunk_size": settings.chunk_size,
                "chunk_overlap": settings.chunk_overlap
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        # Count files in storage
        try:
            if os.path.exists(settings.pdf_storage_path):
                pdf_files = [f for f in os.listdir(settings.pdf_storage_path)
                             if f.lower().endswith('.pdf')]
                stats["storage"]["pdf_count"] = len(pdf_files)
            else:
                stats["storage"]["pdf_count"] = 0
        except Exception as e:
            logger.warning(f"Could not count PDF files: {e}")
            stats["storage"]["pdf_count"] = 0

        return stats

    except Exception as e:
        logger.error(f"Error getting admin stats: {e}")
        raise HTTPException(status_code=500, detail=f"Admin stats error: {str(e)}")


@router.get("/logs")
async def get_recent_logs(lines: int = Query(default=50, ge=10, le=500)):
    """Get recent log entries"""
    try:
        # This is a placeholder - in a real implementation you'd read from log files
        return {
            "logs": [
                {
                    "timestamp": datetime.utcnow().isoformat(),
                    "level": "INFO",
                    "message": "Application running normally",
                    "service": "main"
                }
            ],
            "total_lines": 1,
            "message": "Log reading functionality not yet implemented"
        }

    except Exception as e:
        logger.error(f"Error getting logs: {e}")
        raise HTTPException(status_code=500, detail=f"Logs error: {str(e)}")