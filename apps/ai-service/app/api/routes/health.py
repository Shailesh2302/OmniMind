from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.logger import app_logger
from app.services.vector_service import vector_service

settings = get_settings()

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check() -> JSONResponse:
    # Deliberately unauthenticated so container healthchecks work.
    return JSONResponse(
        content={
            "status": "healthy",
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
        }
    )


@router.get("/health/ready")
async def readiness_check() -> JSONResponse:
    try:
        collections = await vector_service.list_collections()

        return JSONResponse(
            content={
                "status": "ready",
                "qdrant_connected": True,
                "collections": collections,
            }
        )
    except Exception as e:
        app_logger.error(f"Readiness check failed: {str(e)}")
        return JSONResponse(
            content={
                "status": "not ready",
                "qdrant_connected": False,
            },
            status_code=503,
        )
