import os
from typing import List, Union, Optional
from openai import AsyncOpenAI
from app.core.config import get_settings
from app.core.logger import app_logger

settings = get_settings()

MAX_BATCH_SIZE = 50


class EmbeddingService:
    def __init__(self):
        self._client: Optional[AsyncOpenAI] = None
        self.model = settings.NVIDIA_EMBEDDING_MODEL
        self.dimension = settings.EMBEDDING_DIMENSION
        app_logger.info(f"Embedding Service initialized with model: {self.model}")

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            if not settings.NVIDIA_API_KEY:
                app_logger.warning("NVIDIA_API_KEY not set - embeddings will fail at runtime")
            self._client = AsyncOpenAI(
                base_url=settings.NVIDIA_BASE_URL,
                api_key=settings.NVIDIA_API_KEY,
            )
        return self._client

    @property
    def model_name(self) -> str:
        return self.model

    async def embed_text(self, text: str) -> List[float]:
        try:
            response = await self.client.embeddings.create(
                model=self.model,
                input=text,
            )
            return response.data[0].embedding
        except Exception as e:
            app_logger.error(f"Embedding error for text: {e}")
            raise

    async def embedTexts(self, texts: List[str]) -> List[List[float]]:
        try:
            response = await self.client.embeddings.create(
                model=self.model,
                input=texts,
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            app_logger.error(f"Batch embedding error: {e}")
            raise

    async def embed_query(self, query: str) -> List[float]:
        return await self.embed_text(query)

    async def embed_documents(self, documents: List[str]) -> List[List[float]]:
        if not documents:
            return []

        all_embeddings = []
        for i in range(0, len(documents), MAX_BATCH_SIZE):
            batch = documents[i : i + MAX_BATCH_SIZE]
            try:
                embeddings = await self.embedTexts(batch)
                all_embeddings.extend(embeddings)
            except Exception as e:
                app_logger.warning(f"Batch embedding failed, trying individually: {e}")
                for doc in batch:
                    try:
                        embedding = await self.embed_text(doc)
                        all_embeddings.append(embedding)
                    except Exception as inner_e:
                        app_logger.error(f"Failed to embed document: {inner_e}")
                        all_embeddings.append([0.0] * self.dimension)

        return all_embeddings


embedding_service = EmbeddingService()