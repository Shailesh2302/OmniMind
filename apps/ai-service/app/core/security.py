from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader
import secrets

from app.core.config import get_settings

settings = get_settings()

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    if not settings.SECURITY_ENABLED:
        return "disabled"

    if not settings.SECURITY_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="API key not configured",
        )

    if not api_key or not secrets.compare_digest(api_key, settings.SECURITY_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    return api_key