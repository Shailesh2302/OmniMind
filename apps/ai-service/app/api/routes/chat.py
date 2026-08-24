from typing import Optional
import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.api.dependencies import API_KEY_DEP
from app.schemas.chat import ChatRequest, ChatResponse, StreamChatRequest
from app.services.rag_service import rag_service as rag_service_singleton
from app.services.llm_service import llm_service as llm_service_singleton

router = APIRouter(tags=["chat"])

RAG_SERVICE = rag_service_singleton
LLM_SERVICE = llm_service_singleton


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    user_id: str = Query(..., description="User ID for RAG context"),
    file_id: Optional[str] = Query(None, description="Specific file ID to search within"),
    api_key: API_KEY_DEP = None,
) -> ChatResponse:
    sources = []
    context = ""

    if user_id:
        rag_context = await RAG_SERVICE.get_relevant_context(
            query=request.message,
            user_id=user_id,
            collection=request.collection,
            file_id=file_id,
            limit=request.top_k or 5,
        )

        context = rag_context.context
        sources = [
            {
                "file_id": src.file_id,
                "text": src.text,
                "score": src.score,
                "metadata": src.metadata or {},
            }
            for src in rag_context.sources
        ]

    base_system = request.system_prompt or ""
    if context:
        enhanced_system = (
            f"{base_system}\n\nRelevant context from documents:\n{context}"
            if base_system
            else f"You are a helpful assistant. Use the following context to answer questions:\n\n{context}"
        )
    else:
        enhanced_system = base_system

    response = await LLM_SERVICE.generate_response(
        query=request.message,
        context=context,
        system_prompt=enhanced_system,
    )

    return ChatResponse(
        message=response,
        sources=sources,
        metadata={
            "collection": request.collection or f"user_{user_id}".replace("-", "_"),
            "file_id": file_id,
            "user_id": user_id,
            "chunks_retrieved": len(sources),
        },
    )


@router.post("/chat/stream")
async def stream_chat(
    request: StreamChatRequest,
    user_id: str = Query(..., description="User ID for RAG context"),
    file_id: Optional[str] = Query(None, description="Specific file ID to search within"),
    api_key: API_KEY_DEP = None,
) -> StreamingResponse:
    context = ""
    if user_id:
        rag_context = await RAG_SERVICE.get_relevant_context(
            query=request.message,
            user_id=user_id,
            collection=request.collection,
            file_id=file_id,
            limit=request.top_k or 5,
        )
        context = rag_context.context

    base_system = request.system_prompt or ""
    if context:
        enhanced_system = (
            f"{base_system}\n\nRelevant context from documents:\n{context}"
            if base_system
            else f"You are a helpful assistant. Use the following context to answer questions:\n\n{context}"
        )
    else:
        enhanced_system = base_system

    async def generate():
        async for chunk in LLM_SERVICE.generate_stream(
            query=request.message,
            context=context,
            system_prompt=enhanced_system,
        ):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.post("/chat/simple")
async def simple_chat(
    request: ChatRequest,
    api_key: API_KEY_DEP = None,
) -> ChatResponse:
    response = await LLM_SERVICE.generate_response(
        query=request.message,
        context="",
        system_prompt=request.system_prompt,
    )

    return ChatResponse(
        message=response,
        sources=[],
        metadata={},
    )


@router.get("/chat/history/{user_id}")
async def get_chat_history(
    user_id: str,
    limit: int = Query(10, ge=1, le=100),
    api_key: API_KEY_DEP = None,
) -> dict:
    # Chat history lives in the Node API's Postgres (Session/Message models).
    raise HTTPException(
        status_code=501,
        detail="Chat history is served by the main API at GET /api/chat/sessions",
    )