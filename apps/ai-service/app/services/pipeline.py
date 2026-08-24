from typing import Optional, Dict, Any
import os
import tempfile
import asyncio

from app.services.document_service import document_service, DocumentResult
from app.services.whisper_service import whisper_service, TranscriptionResult
from app.services.audio_extract import audio_extractor
from app.services.chunker import chunker
from app.services.embedding_service import embedding_service
from app.services.vector_service import vector_service
from app.core.logger import app_logger
from app.core.config import get_settings

settings = get_settings()


class ProcessingPipeline:
    def __init__(self):
        self.chunk_size = settings.CHUNK_SIZE
        self.chunk_overlap = settings.CHUNK_OVERLAP
        app_logger.info("Processing Pipeline initialized")

    async def process_document(
        self,
        file_path: str,
        file_id: str,
        user_id: str,
        mime_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        app_logger.info(
            f"Processing document: file_id={file_id}, user_id={user_id}, type={mime_type}"
        )

        try:
            if mime_type and mime_type.startswith("audio/"):
                result = await self._process_audio(file_path, file_id, user_id, metadata)
            elif mime_type and mime_type.startswith("video/"):
                result = await self._process_video(file_path, file_id, user_id, metadata)
            else:
                result = await self._process_document_file(
                    file_path, file_id, user_id, mime_type, metadata
                )

            app_logger.info(f"Document processed successfully: {file_id}")
            return result

        except Exception as e:
            app_logger.error(f"Error processing document: {e}")
            raise

    async def _process_document_file(
        self,
        file_path: str,
        file_id: str,
        user_id: str,
        mime_type: Optional[str],
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        collection = f"user_{user_id}".replace("-", "_")

        doc_result: DocumentResult = await document_service.extract(file_path, mime_type)

        return await self._index_chunks(
            chunks=doc_result.chunks,
            file_id=file_id,
            user_id=user_id,
            collection=collection,
            metadata={
                **doc_result.metadata,
                "file_type": mime_type or "unknown",
                **(metadata or {}),
            },
        )

    async def _process_audio(
        self,
        file_path: str,
        file_id: str,
        user_id: str,
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        app_logger.info(f"Processing audio file: {file_path}")

        collection = f"user_{user_id}".replace("-", "_")

        transcript: TranscriptionResult = await whisper_service.transcribe(file_path)

        chunks = chunker.chunk_text(transcript.text)

        segment_metadata = [
            {
                "start_sec": seg.start_sec,
                "end_sec": seg.end_sec,
                "text": seg.text,
            }
            for seg in transcript.segments
        ]

        return await self._index_chunks(
            chunks=chunks,
            file_id=file_id,
            user_id=user_id,
            collection=collection,
            metadata={
                "transcript_language": transcript.language,
                "transcript_duration": transcript.duration_sec,
                "segments": segment_metadata,
                "file_type": "audio",
                **(metadata or {}),
            },
        )

    async def _process_video(
        self,
        file_path: str,
        file_id: str,
        user_id: str,
        metadata: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        app_logger.info(f"Processing video file: {file_path}")

        audio_path = await audio_extractor.extract_audio(file_path, output_format="mp3")

        try:
            result = await self._process_audio(audio_path, file_id, user_id, metadata)
            result["metadata"]["video_processed"] = True
            return result
        finally:
            if os.path.exists(audio_path):
                os.unlink(audio_path)

    async def _index_chunks(
        self,
        chunks: list,
        file_id: str,
        user_id: str,
        collection: str,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        app_logger.info(f"Indexing {len(chunks)} chunks for file: {file_id}")

        exists = await vector_service.collection_exists(collection)
        if not exists:
            await vector_service.create_collection(collection, settings.EMBEDDING_DIMENSION)

        embeddings = await embedding_service.embed_documents(chunks)

        payloads = [
            {
                "text": chunk,
                "file_id": file_id,
                "user_id": user_id,
                "chunk_index": i,
                "metadata": metadata,
            }
            for i, chunk in enumerate(chunks)
        ]

        await vector_service.insert(
            collection_name=collection,
            vectors=embeddings,
            payloads=payloads,
        )

        app_logger.info(f"Indexed {len(chunks)} chunks to collection: {collection}")

        return {
            "status": "indexed",
            "file_id": file_id,
            "user_id": user_id,
            "collection": collection,
            "chunks_indexed": len(chunks),
            "metadata": metadata,
        }

    async def process_transcription_and_index(
        self,
        audio_path: str,
        file_id: str,
        user_id: str,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        collection = f"user_{user_id}".replace("-", "_")

        transcript: TranscriptionResult = await whisper_service.transcribe(
            audio_path, language=language
        )

        chunks = chunker.chunk_text(transcript.text)

        return await self._index_chunks(
            chunks=chunks,
            file_id=file_id,
            user_id=user_id,
            collection=collection,
            metadata={
                "transcript_language": transcript.language,
                "transcript_duration": transcript.duration_sec,
                "file_type": "transcription",
            },
        )


pipeline = ProcessingPipeline()