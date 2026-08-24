from typing import List, Optional, Dict, Any
from dataclasses import dataclass

from app.services.embedding_service import embedding_service
from app.services.vector_service import vector_service
from app.core.logger import app_logger
from app.core.config import get_settings

settings = get_settings()


@dataclass
class Source:
    text: str
    score: float
    file_id: Optional[str] = None
    chunk_id: Optional[str] = None
    metadata: Dict[str, Any] = None


@dataclass
class RAGContext:
    context: str
    sources: List[Source]


class RAGService:
    def __init__(self):
        self.max_context_chunks = 10
        app_logger.info("RAG Service initialized")

    async def get_relevant_context(
        self,
        query: str,
        user_id: str,
        collection: Optional[str] = None,
        file_id: Optional[str] = None,
        limit: int = 5,
    ) -> RAGContext:
        collection = collection or f"user_{user_id}".replace("-", "_")

        app_logger.info(
            f"Getting context: query={query[:50]}..., collection={collection}, file_id={file_id}"
        )

        try:
            query_embedding = await embedding_service.embed_query(query)

            filter_conditions = {"file_id": file_id} if file_id else None

            # When the caller pins a specific file, fetch its best chunks
            # regardless of similarity (transcripts may be in another language
            # than the query). Only open-ended cross-file searches filter.
            score_threshold = 0.0 if file_id else 0.3

            results = await vector_service.search(
                collection_name=collection,
                query_embedding=query_embedding,
                limit=limit,
                score_threshold=score_threshold,
                filter_conditions=filter_conditions,
            )

            if not results:
                app_logger.info("No relevant context found")
                return RAGContext(context="", sources=[])

            sources = []
            context_parts = []

            for result in results:
                payload = result.get("payload", {})
                text = payload.get("text", "")

                if text:
                    context_parts.append(text)
                    sources.append(
                        Source(
                            text=text,
                            score=result.get("score", 0.0),
                            file_id=payload.get("file_id"),
                            chunk_id=payload.get("chunk_index"),
                            metadata=payload.get("metadata", {}),
                        )
                    )

            context = "\n\n".join(context_parts)

            app_logger.info(f"Retrieved {len(sources)} source chunks")
            return RAGContext(context=context, sources=sources)

        except Exception as e:
            app_logger.error(f"Error getting relevant context: {e}")
            return RAGContext(context="", sources=[])

    async def search_with_sources(
        self,
        query: str,
        user_id: str,
        collection: Optional[str] = None,
        file_id: Optional[str] = None,
        limit: int = 10,
    ) -> List[Source]:
        rag_context = await self.get_relevant_context(
            query=query,
            user_id=user_id,
            collection=collection,
            file_id=file_id,
            limit=limit,
        )
        return rag_context.sources

    async def index_document(
        self,
        collection: str,
        document_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        try:
            exists = await vector_service.collection_exists(collection)
            if not exists:
                await vector_service.create_collection(collection, settings.EMBEDDING_DIMENSION)

            chunks = self._chunk_text(text, chunk_size=settings.CHUNK_SIZE, overlap=settings.CHUNK_OVERLAP)

            embeddings = await embedding_service.embed_documents(chunks)

            payloads = [
                {
                    "text": chunk,
                    "document_id": document_id,
                    **(metadata or {}),
                }
                for chunk in chunks
            ]

            await vector_service.insert(
                collection_name=collection,
                vectors=embeddings,
                payloads=payloads,
            )

            app_logger.info(f"Indexed {len(chunks)} chunks for document {document_id}")
            return True
        except Exception as e:
            app_logger.error(f"Error indexing document: {e}")
            return False

    async def delete_document(self, collection: str, document_id: str) -> bool:
        try:
            await vector_service.delete_by_filter(collection, {"document_id": document_id})
            app_logger.info(f"Deleted chunks for document {document_id}")
            return True
        except Exception as e:
            app_logger.error(f"Error deleting document: {e}")
            return False

    async def delete_file(self, user_id: str, file_id: str) -> bool:
        collection = f"user_{user_id}".replace("-", "_")
        app_logger.info(f"Deleting all chunks for file: {file_id} in collection: {collection}")

        try:
            exists = await vector_service.collection_exists(collection)
            if not exists:
                app_logger.warning(f"Collection does not exist: {collection}")
                return True
            await vector_service.delete_by_filter(collection, {"file_id": file_id})
            app_logger.info(f"Deleted chunks for file {file_id}")
            return True
        except Exception as e:
            app_logger.error(f"Error deleting file: {e}")
            return False

    def _chunk_text(
        self,
        text: str,
        chunk_size: int = None,
        overlap: int = None,
    ) -> List[str]:
        chunk_size = chunk_size or settings.CHUNK_SIZE
        overlap = overlap or settings.CHUNK_OVERLAP

        chunks = []
        start = 0
        text_length = len(text)

        while start < text_length:
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start += chunk_size - overlap

        return chunks


rag_service = RAGService()