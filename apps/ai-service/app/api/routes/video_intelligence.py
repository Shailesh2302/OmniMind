from typing import Optional, List, Dict, Any
import json
from pydantic import BaseModel, Field
from fastapi import APIRouter, Query
from app.api.dependencies import API_KEY_DEP
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service
from app.core.logger import app_logger

router = APIRouter(tags=["video-intelligence"])


class HighlightSegment(BaseModel):
    start_sec: float
    end_sec: float
    importance_score: float = Field(ge=0, le=1)
    category: str
    summary: str
    keywords: List[str]


class MomentDetectionRequest(BaseModel):
    file_id: str
    user_id: str
    collection: Optional[str] = None
    query: Optional[str] = None
    top_k: int = Field(default=5, ge=1, le=20)


class MomentDetectionResponse(BaseModel):
    file_id: str
    moments: List[HighlightSegment]
    total_duration_sec: float
    transcript_segments: List[Dict[str, Any]]


class SmartHighlightsRequest(BaseModel):
    file_id: str
    user_id: str
    collection: Optional[str] = None
    categories: List[str] = Field(
        default=["explanation", "key_insight", "important_moment", "discussion", "action"],
        description="Categories to detect"
    )
    max_highlights: int = Field(default=5, ge=1, le=20)


class SmartHighlightsResponse(BaseModel):
    file_id: str
    highlights: List[HighlightSegment]
    video_summary: str
    topics_covered: List[str]


@router.post("/video/moments", response_model=MomentDetectionResponse)
async def detect_important_moments(
    request: MomentDetectionRequest,
    api_key: API_KEY_DEP = None,
) -> MomentDetectionResponse:
    """
    Detect important moments in a video based on context retrieval.
    Features 19, 21, 22: AI-Powered Important Moment Detection, 
    Context-Aware Timestamp Detection, Smart Video Intelligence
    """
    try:
        collection = request.collection or f"user_{request.user_id}".replace("-", "_")
        
        if request.query:
            rag_context = await rag_service.get_relevant_context(
                query=request.query,
                user_id=request.user_id,
                collection=collection,
                file_id=request.file_id,
                limit=request.top_k,
            )
            context_text = rag_context.context
            sources = rag_context.sources
        else:
            rag_context = await rag_service.get_relevant_context(
                query="important moments key points explanations",
                user_id=request.user_id,
                collection=collection,
                file_id=request.file_id,
                limit=request.top_k,
            )
            context_text = rag_context.context
            sources = rag_context.sources

        if not sources:
            return MomentDetectionResponse(
                file_id=request.file_id,
                moments=[],
                total_duration_sec=0,
                transcript_segments=[]
            )

        prompt = f"""Analyze the following video transcript segments and identify the most important moments.

TRANSCRIPT SEGMENTS:
{context_text}

For each important moment, provide:
1. start_sec: The start timestamp in seconds
2. end_sec: The end timestamp in seconds
3. importance_score: A score from 0 to 1 (higher = more important)
4. category: One of: explanation, key_insight, important_moment, discussion, action
5. summary: A brief description of what happens
6. keywords: Key topics/terms mentioned

Return ONLY a JSON array with the format:
[
  {{"start_sec": 0, "end_sec": 30, "importance_score": 0.9, "category": "explanation", "summary": "...", "keywords": ["topic1", "topic2"]}}
]

Identify up to {request.top_k} most important moments. Focus on:
- Key explanations and concepts
- Important decisions or actions
- Memorable quotes or insights
- Turning points in the content
"""

        response = await llm_service.generate_response(
            query="Identify important moments in this video transcript",
            context=context_text,
            system_prompt=prompt,
        )

        import json
        import re
        
        moments = []
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        if json_match:
            try:
                moments_data = json.loads(json_match.group())
                for m in moments_data:
                    moments.append(HighlightSegment(**m))
            except Exception as e:
                app_logger.warning(f"Failed to parse moments: {e}")

        transcript_segments = []
        for src in sources:
            if hasattr(src, 'metadata') and src.metadata:
                if 'segments' in src.metadata:
                    transcript_segments = src.metadata['segments']
                    break

        total_duration = 0
        if transcript_segments:
            total_duration = max(s.get('end_sec', 0) for s in transcript_segments)

        return MomentDetectionResponse(
            file_id=request.file_id,
            moments=moments,
            total_duration_sec=total_duration,
            transcript_segments=transcript_segments
        )

    except Exception as e:
        app_logger.error(f"Error detecting moments: {e}")
        raise


@router.post("/video/highlights", response_model=SmartHighlightsResponse)
async def generate_smart_highlights(
    request: SmartHighlightsRequest,
    api_key: API_KEY_DEP = None,
) -> SmartHighlightsResponse:
    """
    Generate AI-powered highlights and content summaries from video.
    Features 20, 23: AI Highlight Clip Generation, AI-Powered Content Highlighting
    """
    try:
        collection = request.collection or f"user_{request.user_id}".replace("-", "_")

        rag_context = await rag_service.get_relevant_context(
            query="key insights important explanations highlights summaries",
            user_id=request.user_id,
            collection=collection,
            file_id=request.file_id,
            limit=request.max_highlights * 2,
        )

        if not rag_context.sources:
            return SmartHighlightsResponse(
                file_id=request.file_id,
                highlights=[],
                video_summary="No content available for analysis.",
                topics_covered=[]
            )

        context_text = rag_context.context

        categories_str = ", ".join(request.categories)
        
        prompt = f"""Analyze this video content and generate smart highlights with AI-curated content.

CONTENT ANALYSIS:
{context_text}

Generate highlights focusing on:
- {categories_str}

For each highlight provide:
1. start_sec: Timestamp start
2. end_sec: Timestamp end  
3. importance_score: 0-1 importance rating
4. category: The detected category type
5. summary: What makes this moment important
6. keywords: Related topics

Also provide:
- video_summary: A comprehensive summary of the entire video (2-3 sentences)
- topics_covered: List of main topics/themes covered

Return as JSON:
{{
  "highlights": [...],
  "video_summary": "...",
  "topics_covered": [...]
}}

Limit highlights to {request.max_highlights} most impactful moments.
"""

        response = await llm_service.generate_response(
            query="Generate smart highlights and video summary",
            context=context_text,
            system_prompt=prompt,
        )

        import json
        import re

        highlights = []
        video_summary = "Content analysis complete."
        topics_covered = []

        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                if "highlights" in data:
                    for h in data["highlights"]:
                        highlights.append(HighlightSegment(**h))
                if "video_summary" in data:
                    video_summary = data["video_summary"]
                if "topics_covered" in data:
                    topics_covered = data["topics_covered"]
            except Exception as e:
                app_logger.warning(f"Failed to parse highlights: {e}")

        return SmartHighlightsResponse(
            file_id=request.file_id,
            highlights=highlights,
            video_summary=video_summary,
            topics_covered=topics_covered
        )

    except Exception as e:
        app_logger.error(f"Error generating highlights: {e}")
        raise


@router.get("/video/topics")
async def detect_topics(
    file_id: str = Query(..., description="File ID to analyze"),
    user_id: str = Query(..., description="User ID"),
    collection: Optional[str] = Query(None, description="Collection name"),
    api_key: API_KEY_DEP = None,
) -> dict:
    """
    Detect topics discussed in a video.
    Feature 22: Smart Video Intelligence - Topic detection
    """
    try:
        collection = collection or f"user_{user_id}".replace("-", "_")

        rag_context = await rag_service.get_relevant_context(
            query="main topics themes subjects discussed",
            user_id=user_id,
            collection=collection,
            file_id=file_id,
            limit=10,
        )

        if not rag_context.context:
            return {"file_id": file_id, "topics": [], "summary": ""}

        prompt = f"""Analyze this content and identify the main topics/themes discussed.

CONTENT:
{rag_context.context}

Return a JSON with:
{{
  "topics": ["topic1", "topic2", "topic3"],
  "summary": "Brief 2-sentence summary of the content",
  "key_themes": ["theme1", "theme2"]
}}
"""

        response = await llm_service.generate_response(
            query="Identify main topics in this video",
            context=rag_context.context,
            system_prompt=prompt,
        )

        import json
        import re

        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                return {
                    "file_id": file_id,
                    "topics": data.get("topics", []),
                    "summary": data.get("summary", ""),
                    "key_themes": data.get("key_themes", [])
                }
            except Exception:
                pass

        return {"file_id": file_id, "topics": [], "summary": "", "key_themes": []}

    except Exception as e:
        app_logger.error(f"Error detecting topics: {e}")
        raise

class VideoSummaryRequest(BaseModel):
    file_id: str
    user_id: str
    collection: Optional[str] = None


class VideoSummaryResponse(BaseModel):
    file_id: str
    summary: str
    topics: List[str]
    key_themes: List[str]
    duration_sec: float


@router.post("/summary", response_model=VideoSummaryResponse)
async def generate_video_summary(
    request: VideoSummaryRequest,
    api_key: API_KEY_DEP = None,
) -> VideoSummaryResponse:
    """
    Generate a comprehensive summary of the video content.
    """
    try:
        collection = request.collection or f"user_{request.user_id}".replace("-", "_")
        
        rag_context = await rag_service.get_relevant_context(
            query="main topics key points summary",
            user_id=request.user_id,
            collection=collection,
            file_id=request.file_id,
            limit=10,
        )
        
        if not rag_context.context.strip():
            return VideoSummaryResponse(
                file_id=request.file_id,
                summary="No transcript available for this video yet. Upload a video with an audio track and wait for processing to complete.",
                topics=[],
                key_themes=[],
                duration_sec=0,
            )

        prompt = f"""You are a professional video analyst. Analyze the transcript below and produce a genuinely useful summary.

TRANSCRIPT (may be in any language; write your answer in English):
{rag_context.context}

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{{
  "summary": "A detailed 3-5 sentence summary describing what happens in the video, who speaks, and what they say",
  "topics": ["3-6 concrete topics discussed"],
  "key_themes": ["2-4 overarching themes"]
}}

Rules:
- Base everything strictly on the transcript.
- If the transcript is short or low-quality, say so explicitly inside the summary instead of answering vaguely.
- Never answer with placeholders like "..." - always write full sentences."""

        response = await llm_service.generate_response(
            query="Generate the JSON summary now.",
            context=rag_context.context,
            system_prompt=prompt,
        )
        
        import json
        import re
        
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                total_duration = 0
                if rag_context.sources:
                    for source in rag_context.sources:
                        if hasattr(source, 'metadata') and source.metadata:
                            dur = source.metadata.get('transcript_duration', 0)
                            if dur > total_duration:
                                total_duration = dur
                
                return VideoSummaryResponse(
                    file_id=request.file_id,
                    summary=data.get("summary", ""),
                    topics=data.get("topics", []),
                    key_themes=data.get("key_themes", []),
                    duration_sec=total_duration
                )
            except Exception as e:
                app_logger.error(f"Error parsing summary JSON: {e}")
        
        return VideoSummaryResponse(
            file_id=request.file_id,
            summary="Unable to generate summary",
            topics=[],
            key_themes=[],
            duration_sec=0
        )
        
    except Exception as e:
        app_logger.error(f"Error generating summary: {e}")
        raise


class VideoAskRequest(BaseModel):
    file_id: str
    user_id: str
    question: str
    collection: Optional[str] = None


@router.post("/ask")
async def ask_about_video(
    request: VideoAskRequest,
    api_key: API_KEY_DEP = None,
):
    """
    Answer questions about the video content with streaming response.
    Uses Server-Sent Events (SSE) for streaming.
    """
    from fastapi.responses import StreamingResponse
    import asyncio
    
    async def event_generator():
        try:
            collection = request.collection or f"user_{request.user_id}".replace("-", "_")
            
            rag_context = await rag_service.get_relevant_context(
                query=request.question,
                user_id=request.user_id,
                collection=collection,
                file_id=request.file_id,
                limit=5,
            )
            
            prompt = f"""You are an AI assistant helping users understand video content.
Based on the following context from the video, answer the user's question.

CONTEXT:
{rag_context.context}

QUESTION: {request.question}

Provide a helpful, accurate answer. If the context doesn't contain enough information to answer, say so.
"""
            
            response = await llm_service.generate_response(
                query=request.question,
                context=rag_context.context,
                system_prompt=prompt,
            )
            
            yield f"data: {json.dumps({'content': response})}\n\n"
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            app_logger.error(f"Error in ask about video: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


class VideoStatusResponse(BaseModel):
    file_id: str
    status: str
    progress: float
    transcript_ready: bool
    indexed: bool
    moments_detected: int
    highlights_generated: int


@router.get("/status")
async def get_video_status(
    file_id: str = Query(...),
    user_id: str = Query(...),
    api_key: API_KEY_DEP = None,
) -> VideoStatusResponse:
    """
    Get the processing status of a video.
    """
    try:
        from app.services.vector_service import vector_service
        
        collection = f"user_{user_id}".replace("-", "_")
        collection_exists = await vector_service.collection_exists(collection)
        
        status = "processing"
        progress = 0.0
        transcript_ready = False
        indexed = False
        moments_detected = 0
        highlights_generated = 0
        
        if collection_exists:
            points = await vector_service.get_collection_points(collection, file_id, limit=1)
            if points:
                transcript_ready = True
                indexed = True
                status = "ready"
        
        return VideoStatusResponse(
            file_id=file_id,
            status=status if status == "ready" else ("not_indexed" if not collection_exists else "processing"),
            progress=1.0 if transcript_ready else 0.0,
            transcript_ready=transcript_ready,
            indexed=indexed,
            moments_detected=moments_detected,
            highlights_generated=highlights_generated
        )
        
    except Exception as e:
        app_logger.error(f"Error getting video status: {e}")
        return VideoStatusResponse(
            file_id=file_id,
            status="unknown",
            progress=0.0,
            transcript_ready=False,
            indexed=False,
            moments_detected=0,
            highlights_generated=0
        )


class SmartClipsRequest(BaseModel):
    file_id: str
    user_id: str
    collection: Optional[str] = None
    max_clips: int = Field(default=5, ge=1, le=20)


class SmartClip(BaseModel):
    start_sec: float
    end_sec: float
    title: str
    description: str
    importance_score: float
    category: str


class SmartClipsResponse(BaseModel):
    file_id: str
    clips: List[SmartClip]


@router.post("/smart-clips", response_model=SmartClipsResponse)
async def generate_smart_clips(
    request: SmartClipsRequest,
    api_key: API_KEY_DEP = None,
) -> SmartClipsResponse:
    """
    Generate smart clips from the video based on important moments.
    """
    try:
        collection = request.collection or f"user_{request.user_id}".replace("-", "_")
        
        rag_context = await rag_service.get_relevant_context(
            query="important moments key points highlights",
            user_id=request.user_id,
            collection=collection,
            file_id=request.file_id,
            limit=request.max_clips * 2,
        )
        
        prompt = f"""Analyze the following video content and identify the best clips to extract.

CONTENT:
{rag_context.context}

Return a JSON with an array of clips:
{{
  "clips": [
    {{
      "start_sec": 120.5,
      "end_sec": 180.0,
      "title": "Clip Title",
      "description": "Brief description of this clip",
      "importance_score": 0.85,
      "category": "explanation"
    }}
  ]
}}

Generate {request.max_clips} clips that are:
1. Important/impactful moments
2. Self-contained sections
3. At least 30 seconds long
"""
        
        response = await llm_service.generate_response(
            query="Generate smart clips",
            context=rag_context.context,
            system_prompt=prompt,
        )
        
        import json
        import re
        
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                data = json.loads(json_match.group())
                clips = [
                    SmartClip(**clip) for clip in data.get("clips", [])
                ]
                return SmartClipsResponse(file_id=request.file_id, clips=clips)
            except Exception as e:
                app_logger.error(f"Error parsing clips JSON: {e}")
        
        return SmartClipsResponse(file_id=request.file_id, clips=[])
        
    except Exception as e:
        app_logger.error(f"Error generating smart clips: {e}")
        raise
