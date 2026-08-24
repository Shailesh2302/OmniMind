from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api.dependencies import API_KEY_DEP
from app.core.logger import app_logger
from app.schemas.embeddings import EmbeddingRequest, EmbeddingResponse, BatchEmbeddingRequest
from app.services.embedding_service import embedding_service

router = APIRouter(tags=["embeddings"])


@router.post("/embeddings", response_model=EmbeddingResponse)
async def generate_embedding(
    request: EmbeddingRequest,
    api_key: API_KEY_DEP,
) -> EmbeddingResponse:
    try:
        embedding = await embedding_service.embed_text(request.text)

        return EmbeddingResponse(
            embedding=embedding,
            model=embedding_service.model_name,
            dimensions=len(embedding),
        )
    except Exception as e:
        app_logger.error(f"Embedding failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate embedding")


@router.post("/embeddings/batch", response_model=List[EmbeddingResponse])
async def generate_batch_embeddings(
    request: BatchEmbeddingRequest,
    api_key: API_KEY_DEP,
) -> List[EmbeddingResponse]:
    try:
        embeddings = await embedding_service.embedTexts(request.texts)

        return [
            EmbeddingResponse(
                embedding=emb,
                model=embedding_service.model_name,
                dimensions=len(emb),
            )
            for emb in embeddings
        ]
    except Exception as e:
        app_logger.error(f"Batch embedding failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate embeddings")


class DocumentEmbeddingRequest(BaseModel):
    file_path: str


class DocumentEmbeddingResponse(BaseModel):
    chunks: int
    embeddings: List[List[float]]
    model: str
    dimensions: int


@router.post("/embeddings/documents", response_model=DocumentEmbeddingResponse)
async def embed_document_file(
    request: DocumentEmbeddingRequest,
    api_key: API_KEY_DEP,
) -> DocumentEmbeddingResponse:
    """Embed all chunks of a document. Returns every chunk's embedding."""
    from app.api.routes.documents import validate_readable_path

    safe_path = validate_readable_path(request.file_path)

    try:
        from app.loaders import pdf_loader, docx_loader, excel_loader

        if safe_path.endswith(".pdf"):
            chunks = await pdf_loader.load_file(safe_path)
        elif safe_path.endswith((".doc", ".docx")):
            chunks = await docx_loader.load_file(safe_path)
        elif safe_path.endswith((".xls", ".xlsx")):
            chunks = await excel_loader.load_file(safe_path)
        else:
            from app.services.chunker import chunker
            with open(safe_path, "r", encoding="utf-8", errors="ignore") as f:
                chunks = chunker.chunk_text(f.read())

        if not chunks:
            raise HTTPException(status_code=422, detail="No content extracted from document")

        embeddings = await embedding_service.embed_documents(chunks)

        return DocumentEmbeddingResponse(
            chunks=len(chunks),
            embeddings=embeddings,
            model=embedding_service.model_name,
            dimensions=len(embeddings[0]) if embeddings else 0,
        )
    except HTTPException:
        raise
    except Exception as e:
        app_logger.error(f"Document embedding failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to embed document")
