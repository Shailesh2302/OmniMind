import tempfile
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.dependencies import API_KEY_DEP
from app.core.logger import app_logger
from app.schemas.transcription import TranscriptionRequest, TranscriptionResponse
from app.services.whisper_service import whisper_service, TranscriptionResult
from app.services.audio_extract import audio_extractor
from app.api.routes.documents import validate_readable_path, MAX_UPLOAD_SIZE

router = APIRouter(tags=["transcription"])


class VideoTranscriptionResponse(BaseModel):
    text: str
    segments: list
    language: str
    duration: Optional[float] = None
    video_processed: bool = True


@router.post("/transcription", response_model=TranscriptionResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    api_key: API_KEY_DEP = None,
) -> TranscriptionResponse:
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)")
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=os.path.splitext(file.filename or "")[1]
        ) as tmp_file:
            tmp_file.write(content)
            tmp_path = tmp_file.name

        try:
            result: TranscriptionResult = await whisper_service.transcribe(
                audio_path=tmp_path,
                language=language,
            )

            segments = [
                {
                    "start": seg.start_sec,
                    "end": seg.end_sec,
                    "text": seg.text,
                }
                for seg in result.segments
            ]

            return TranscriptionResponse(
                text=result.text,
                language=result.language,
                duration=result.duration_sec,
                segments=segments,
            )
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as e:
        app_logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail="Failed to transcribe audio")


@router.post("/transcription/from-video", response_model=VideoTranscriptionResponse)
async def transcribe_video(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    api_key: API_KEY_DEP = None,
) -> VideoTranscriptionResponse:
    try:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_SIZE // (1024 * 1024)} MB)")
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=os.path.splitext(file.filename or "")[1]
        ) as tmp_file:
            tmp_file.write(content)
            video_path = tmp_file.name

        try:
            audio_path = await audio_extractor.extract_audio(video_path)

            try:
                result: TranscriptionResult = await whisper_service.transcribe(
                    audio_path=audio_path,
                    language=language,
                )

                segments = [
                    {
                        "start": seg.start_sec,
                        "end": seg.end_sec,
                        "text": seg.text,
                    }
                    for seg in result.segments
                ]

                return VideoTranscriptionResponse(
                    text=result.text,
                    language=result.language,
                    duration=result.duration_sec,
                    segments=segments,
                    video_processed=True,
                )
            finally:
                if os.path.exists(audio_path):
                    os.unlink(audio_path)
        finally:
            if os.path.exists(video_path):
                os.unlink(video_path)

    except Exception as e:
        app_logger.error(f"Video transcription error: {e}")
        raise HTTPException(status_code=500, detail="Failed to transcribe video")


@router.post("/transcription/from-url", response_model=TranscriptionResponse)
async def transcribe_from_url(
    request: TranscriptionRequest,
    api_key: API_KEY_DEP = None,
) -> TranscriptionResponse:
    safe_path = validate_readable_path(request.audio_path)
    try:
        result: TranscriptionResult = await whisper_service.transcribe(
            audio_path=safe_path,
            language=request.language,
        )

        segments = [
            {
                "start": seg.start_sec,
                "end": seg.end_sec,
                "text": seg.text,
            }
            for seg in result.segments
        ]

        return TranscriptionResponse(
            text=result.text,
            language=result.language,
            duration=result.duration_sec,
            segments=segments,
        )
    except Exception as e:
        app_logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail="Failed to transcribe audio")


@router.get("/transcription/models")
async def list_models(api_key: API_KEY_DEP = None) -> JSONResponse:
    models = whisper_service.get_available_models()

    return JSONResponse(
        content={
            "models": models,
            "current_model": whisper_service.model_name,
        }
    )