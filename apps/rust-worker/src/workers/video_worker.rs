use std::sync::Arc;
use std::path::Path;
use tracing::{info, error, warn};
use tokio::fs;
use futures::StreamExt;
use tokio::io::AsyncWriteExt;

use crate::queue::jobs::QueueJob;
use crate::AppState;
use crate::ffmpeg::Ffmpeg;

pub struct VideoWorker {
    app_state: Arc<AppState>,
}

impl VideoWorker {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self { app_state }
    }

    fn get_storage_path(&self) -> String {
        self.app_state.config.storage_path.clone()
    }

    fn resolve_file_path(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        let p = Path::new(path);
        if p.is_absolute() && p.exists() {
            return path.to_string();
        }

        // Candidate roots to try, in order.
        let mut candidates: Vec<String> = Vec::new();

        // 1. As-is relative to worker CWD.
        candidates.push(path.to_string());

        // 2. Under the API's storage root (uploads live in apps/api/storage).
        let api_storage = std::env::var("API_STORAGE_PATH")
            .unwrap_or_else(|_| "../api/storage".to_string());
        let api_storage = api_storage.trim_end_matches('/');

        // 2a. <api_storage>/<full relative path> (handles "storage/uploads/x.mp4")
        candidates.push(format!("{}/{}", api_storage, path));

        // 2b. <api_storage>/uploads/<basename> (handles bare filenames)
        if let Some(name) = p.file_name() {
            candidates.push(format!("{}/uploads/{}", api_storage, name.to_string_lossy()));
        }

        for candidate in &candidates {
            if Path::new(candidate).exists() {
                return candidate.clone();
            }
        }

        // Nothing exists - return best guess for error reporting.
        candidates.last().cloned().unwrap_or_else(|| path.to_string())
    }

    /// Streams the remote file to disk instead of buffering it fully in memory.
    async fn download_if_url(&self, url: &str, local_path: &str) -> anyhow::Result<()> {
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Ok(());
        }

        info!("Downloading file from {} to {}", url, local_path);

        let response = self.app_state_http().get(url).send().await?;
        if !response.status().is_success() {
            anyhow::bail!("Failed to download file: HTTP {}", response.status());
        }

        if let Some(parent) = Path::new(local_path).parent() {
            fs::create_dir_all(parent).await?;
        }

        let mut file = fs::File::create(local_path).await?;
        let mut stream = response.bytes_stream();
        let mut total: u64 = 0;

        while let Some(chunk) = stream.next().await {
            let bytes = chunk?;
            total += bytes.len() as u64;
            file.write_all(&bytes).await?;
        }
        file.flush().await?;

        info!("File downloaded successfully ({} bytes)", total);
        Ok(())
    }

    fn app_state_http(&self) -> reqwest::Client {
        // A plain client per call is cheap relative to network I/O and keeps
        // this struct simple; timeouts come from reqwest defaults.
        reqwest::Client::new()
    }

    async fn send_to_transcription(&self, audio_path: &str) -> anyhow::Result<String> {
        info!("Sending audio to transcription service: {}", audio_path);

        let bytes = fs::read(audio_path).await?;

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| anyhow::anyhow!("Failed to create multipart part: {}", e))?;

        let form = reqwest::multipart::Form::new()
            .part("file", part);

        let url = format!(
            "{}/api/v1/transcription",
            self.app_state.config.ai_service_url.trim_end_matches('/')
        );

        let response = self.app_state_http()
            .post(url)
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Transcription service failed: HTTP {} - {}", status, body);
        }

        let result: serde_json::Value = response.json().await?;
        let text = result.get("text")
            .or_else(|| result.get("transcription"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        info!("Transcription received ({} chars)", text.len());
        Ok(text)
    }

    fn require_service_key(&self) -> anyhow::Result<&str> {
        let key = &self.app_state.config.service_key;
        if key.is_empty() {
            anyhow::bail!("SERVICE_API_KEY is not configured - cannot call internal API");
        }
        Ok(key)
    }

    async fn index_in_qdrant(
        &self,
        client: &reqwest::Client,
        file_id: &str,
        user_id: &str,
        text: &str,
        metadata: serde_json::Value,
    ) -> anyhow::Result<()> {
        info!("Indexing transcript for file: {}", file_id);

        let payload = serde_json::json!({
            "fileId": file_id,
            "userId": user_id,
            "text": text,
            "metadata": metadata,
        });

        let url = format!(
            "{}/api/internal/search/index",
            self.app_state.config.api_url.trim_end_matches('/')
        );

        let response = client
            .post(url)
            .header("x-service-key", self.require_service_key()?)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Qdrant indexing failed: HTTP {} - {}", status, body);
        }

        info!("Transcript indexed in Qdrant successfully");
        Ok(())
    }

    async fn update_file_status(
        &self,
        client: &reqwest::Client,
        file_id: &str,
        status: &str,
    ) -> anyhow::Result<()> {
        info!("Updating file status to {}: {}", status, file_id);

        let url = format!(
            "{}/api/internal/files/{}/status",
            self.app_state.config.api_url.trim_end_matches('/'),
            file_id
        );

        let response = client
            .post(url)
            .header("x-service-key", self.require_service_key()?)
            .json(&serde_json::json!({ "status": status }))
            .send()
            .await?;

        if !response.status().is_success() {
            let status_code = response.status();
            let body = response.text().await.unwrap_or_default();
            warn!("Failed to update file status: HTTP {} - {}", status_code, body);
        } else {
            info!("File status updated to {}", status);
        }

        Ok(())
    }

    pub async fn process(&self, job: QueueJob) -> anyhow::Result<()> {
        info!("Processing video job: {}", job.id);

        let input_path = self.resolve_file_path(&job.input_path);
        let file_id = job.video_id.clone();
        let storage_path = self.get_storage_path();

        let video_path = if input_path.starts_with("http://") || input_path.starts_with("https://") {
            let api_storage = std::env::var("API_STORAGE_PATH").unwrap_or_else(|_| "../api/storage".to_string());
            let temp_path = format!("{}/uploads/temp_{}.mp4", api_storage.trim_end_matches('/'), job.id);
            self.download_if_url(&input_path, &temp_path).await?;
            temp_path
        } else {
            input_path.clone()
        };

        info!("Processing video file: {}", video_path);

        let ffmpeg = Ffmpeg::new(None);

        let audio_dir = format!("{}/audio", storage_path.trim_end_matches('/')); // worker-local scratch
        fs::create_dir_all(&audio_dir).await?;
        let audio_path = format!("{}/{}.wav", audio_dir, job.id);

        info!("Extracting audio from video...");
        // Videos without an audio track cannot be transcribed - finish gracefully.
        if let Err(e) = ffmpeg.extract_audio(&video_path, &audio_path).await {
            warn!("Audio extraction failed (video may have no audio track): {}", e);
            info!("Skipping transcription - completing job without transcript");

            let thumb_dir = format!(
                "{}/thumbnails",
                std::env::var("API_STORAGE_PATH")
                    .unwrap_or_else(|_| "../api/storage".to_string())
                    .trim_end_matches('/')
            );
            fs::create_dir_all(&thumb_dir).await?;
            let thumbnail_path = format!("{}/{}.jpg", thumb_dir, file_id);
            if let Err(e) = ffmpeg.generate_thumbnail(&video_path, &thumbnail_path, 0.0).await {
                warn!("Thumbnail generation failed (non-fatal): {}", e);
            }

            let http = self.app_state_http();
            self.update_file_status(&http, &file_id, "COMPLETED").await?;
            info!("Video job {} completed (no audio track)", job.id);
            return Ok(());
        }

        info!("Sending audio for transcription...");
        let transcription = self.send_to_transcription(&audio_path).await?;

        let metadata = serde_json::json!({
            "jobId": job.id,
            "videoId": file_id,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        // Resolve the owning user from the job parameters (set at upload time).
        let user_id = job.parameters
            .as_ref()
            .and_then(|p| p.user_id.as_deref())
            .unwrap_or("")
            .to_string();

        let http = self.app_state_http();

        if transcription.trim().is_empty() {
            error!("Job {}: transcription produced no text", job.id);
            let _ = self.update_file_status(&http, &file_id, "FAILED").await;
            let _ = fs::remove_file(&audio_path).await;
            anyhow::bail!("Empty transcription - marking job failed");
        }

        if let Err(e) = self.index_in_qdrant(&http, &file_id, &user_id, &transcription, metadata).await {
            error!("Job {}: indexing failed: {}", job.id, e);
            let _ = self.update_file_status(&http, &file_id, "FAILED").await;
            let _ = fs::remove_file(&audio_path).await;
            return Err(e);
        }

        let thumb_dir = format!(
            "{}/thumbnails",
            std::env::var("API_STORAGE_PATH")
                .unwrap_or_else(|_| "../api/storage".to_string())
                .trim_end_matches('/')
        );
        fs::create_dir_all(&thumb_dir).await?;

        let thumbnail_path = format!("{}/{}.jpg", thumb_dir, file_id);
        info!("Generating thumbnail...");
        if let Err(e) = ffmpeg.generate_thumbnail(&video_path, &thumbnail_path, 0.0).await {
            // Non-fatal: the transcript is indexed, keep going.
            warn!("Thumbnail generation failed (non-fatal): {}", e);
        }

        let _ = fs::remove_file(&audio_path).await;

        self.update_file_status(&http, &file_id, "COMPLETED").await?;

        info!("Video job {} completed successfully", job.id);
        Ok(())
    }
}
