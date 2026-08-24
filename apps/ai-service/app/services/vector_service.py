from typing import List, Optional, Dict, Any
import asyncio
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, Filter, FieldCondition, MatchValue, PayloadSchemaType
from app.core.config import get_settings
from app.core.logger import app_logger

settings = get_settings()


class VectorService:
    def __init__(self):
        host = settings.QDRANT_HOST
        if host.startswith("http"):
            url = host
        elif "cloud.qdrant.io" in host:
            url = f"https://{host}"
        else:
            url = f"http://{host}:{settings.QDRANT_PORT or 6333}"

        self.client = QdrantClient(
            url=url,
            api_key=settings.QDRANT_API_KEY or None,
        )
        app_logger.info(f"Vector service initialized: {url}")

    async def ensure_payload_indexes(self, collection_name: str) -> None:
        for field in ["file_id", "user_id", "document_id"]:
            try:
                await asyncio.to_thread(
                    self.client.create_payload_index,
                    collection_name=collection_name,
                    field_name=field,
                    field_schema=PayloadSchemaType.KEYWORD,
                )
            except Exception:
                pass

    async def create_collection(
        self,
        collection_name: str,
        vector_size: int = 1536,
        distance: Distance = Distance.COSINE,
    ) -> bool:
        try:
            await asyncio.to_thread(
                self.client.create_collection,
                collection_name=collection_name,
                vectors_config=VectorParams(
                    size=vector_size,
                    distance=distance,
                ),
            )
            await self.ensure_payload_indexes(collection_name)
            app_logger.info(f"Collection created: {collection_name}")
            return True
        except Exception as e:
            app_logger.error(f"Error creating collection {collection_name}: {e}")
            return False

    async def delete_collection(self, collection_name: str) -> bool:
        try:
            await asyncio.to_thread(self.client.delete_collection, collection_name=collection_name)
            app_logger.info(f"Collection deleted: {collection_name}")
            return True
        except Exception as e:
            app_logger.error(f"Error deleting collection {collection_name}: {e}")
            return False

    async def insert(
        self,
        collection_name: str,
        vectors: List[List[float]],
        payloads: List[Dict[str, Any]],
        ids: Optional[List[str]] = None,
    ) -> bool:
        try:
            points = []
            for i in range(len(vectors)):
                point_id = str(ids[i]) if ids and ids[i] is not None else str(uuid.uuid4())
                points.append({
                    "id": point_id,
                    "vector": vectors[i],
                    "payload": payloads[i],
                })
            await asyncio.to_thread(self.client.upsert, 
                collection_name=collection_name,
                points=points,
            )
            app_logger.info(f"Inserted {len(vectors)} vectors into {collection_name}")
            return True
        except Exception as e:
            app_logger.error(f"Error inserting vectors: {e}")
            return False

    async def search(
        self,
        collection_name: str,
        query_embedding: List[float],
        limit: int = 10,
        score_threshold: float = 0.0,
        filter_conditions: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        try:
            search_filter = None
            if filter_conditions:
                await self.ensure_payload_indexes(collection_name)
                search_filter = Filter(
                    must=[
                        FieldCondition(
                            key=key,
                            match=MatchValue(value=value),
                        )
                        for key, value in filter_conditions.items()
                    ]
                )

            results = await asyncio.to_thread(self.client.query_points, 
                collection_name=collection_name,
                query=query_embedding,
                limit=limit,
                score_threshold=score_threshold if score_threshold > 0 else None,
                query_filter=search_filter,
                with_payload=True,
            )

            points = getattr(results, "points", []) or []

            return [
                {
                    "id": r.id,
                    "score": r.score,
                    "payload": r.payload,
                }
                for r in points
            ]
        except Exception as e:
            app_logger.error(f"Error searching: {e}")
            return []

    async def delete_points(self, collection_name: str, ids: List[str]) -> bool:
        try:
            await asyncio.to_thread(self.client.delete, collection_name=collection_name, points_selector=ids)
            return True
        except Exception as e:
            app_logger.error(f"Error deleting points: {e}")
            return False

    async def delete_by_filter(self, collection_name: str, filter_conditions: Dict[str, Any]) -> int:
        """Delete all points matching the given payload conditions. Returns count deleted."""
        try:
            from qdrant_client.models import FilterSelector

            search_filter = Filter(
                must=[
                    FieldCondition(key=key, match=MatchValue(value=value))
                    for key, value in filter_conditions.items()
                ]
            )
            try:
                count_result = await asyncio.to_thread(self.client.count, 
                    collection_name=collection_name,
                    count_filter=search_filter,
                    exact=True,
                )
                deleted = count_result.count
            except Exception:
                deleted = 0

            await asyncio.to_thread(self.client.delete, collection_name=collection_name, points_selector=FilterSelector(filter=search_filter))
            app_logger.info(f"Deleted {deleted} points by filter from {collection_name}: {filter_conditions}")
            return deleted
        except Exception as e:
            app_logger.error(f"Error deleting by filter: {e}")
            return 0

    async def collection_exists(self, collection_name: str) -> bool:
        try:
            client_collections = await asyncio.to_thread(self.client.get_collections)
            collections = client_collections.collections
            return any(c.name == collection_name for c in collections)
        except Exception as e:
            app_logger.error(f"Error checking collection: {e}")
            return False

    async def list_collections(self) -> list:
        try:
            client_collections = await asyncio.to_thread(self.client.get_collections)
            collections = client_collections.collections
            return [c.name for c in collections]
        except Exception as e:
            app_logger.error(f"Error listing collections: {e}")
            return []

    async def get_collection_points(
        self,
        collection_name: str,
        file_id: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        try:
            from qdrant_client.models import Filter as QdrantFilter, FieldCondition, MatchValue

            filter_cond = None
            if file_id:
                await self.ensure_payload_indexes(collection_name)
                filter_cond = QdrantFilter(
                    must=[FieldCondition(key="file_id", match=MatchValue(value=file_id))]
                )

            results = await asyncio.to_thread(self.client.scroll, 
                collection_name=collection_name,
                limit=limit,
                scroll_filter=filter_cond,
                with_payload=True,
            )

            points = []
            if results and len(results) > 0:
                points = results[0] if isinstance(results[0], list) else []

            return [
                {
                    "id": str(r.id),
                    "payload": r.payload,
                }
                for r in points
            ]
        except Exception as e:
            app_logger.error(f"Error getting collection points: {e}")
            return []


vector_service = VectorService()