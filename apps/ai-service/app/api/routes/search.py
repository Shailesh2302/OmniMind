from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies import API_KEY_DEP
from app.core.logger import app_logger
from app.services.vector_service import vector_service
from app.services.embedding_service import embedding_service


class SearchRequest(BaseModel):
    query: str
    collection: Optional[str] = None
    limit: Optional[int] = Field(default=10, ge=1, le=100)
    score_threshold: Optional[float] = Field(default=0.0, ge=0.0, le=1.0)
    filter: Optional[dict] = None


class SearchResult(BaseModel):
    id: str
    score: float
    text: str
    metadata: dict


class SearchResponse(BaseModel):
    results: list
    total: int
    query: str


router = APIRouter(tags=["search"])


@router.post("/search", response_model=SearchResponse)
async def semantic_search(
    request: SearchRequest,
    api_key: API_KEY_DEP,
) -> SearchResponse:
    try:
        query_embedding = await embedding_service.embed_text(request.query)

        results = await vector_service.search(
            query_embedding=query_embedding,
            collection_name=request.collection or "default",
            limit=request.limit or 10,
            score_threshold=request.score_threshold or 0.0,
            filter_conditions=request.filter,
        )

        search_results = [
            SearchResult(
                id=str(result["id"]),
                score=result["score"],
                text=result["payload"].get("text", ""),
                metadata=result["payload"].get("metadata", {}),
            )
            for result in results
        ]

        return SearchResponse(
            results=search_results,
            total=len(search_results),
            query=request.query,
        )
    except Exception as e:
        app_logger.error(f"Semantic search failed: {e}")
        raise HTTPException(status_code=500, detail="Search failed")


class IndexTextRequest(BaseModel):
    text: str
    collection: str
    payload: Optional[dict] = None
    file_id: Optional[str] = None


@router.post("/search/index")
async def index_document(
    request: IndexTextRequest,
    api_key: API_KEY_DEP,
) -> dict:
    try:
        embedding = await embedding_service.embed_text(request.text)

        payload = {"text": request.text, **(request.payload or {})}
        if request.file_id:
            payload.setdefault("file_id", request.file_id)

        ok = await vector_service.insert(
            vectors=[embedding],
            collection_name=request.collection,
            payloads=[payload],
        )

        if not ok:
            raise HTTPException(status_code=500, detail="Failed to index text")

        return {"status": "indexed", "collection": request.collection}
    except HTTPException:
        raise
    except Exception as e:
        app_logger.error(f"Indexing failed: {e}")
        raise HTTPException(status_code=500, detail="Indexing failed")


@router.delete("/search/collection/{collection_name}")
async def delete_collection(
    collection_name: str,
    api_key: API_KEY_DEP,
) -> dict:
    try:
        await vector_service.delete_collection(collection_name)
        return {"status": "deleted", "collection": collection_name}
    except Exception as e:
        app_logger.error(f"Collection deletion failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete collection")
