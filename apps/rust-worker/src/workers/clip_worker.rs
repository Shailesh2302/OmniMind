use std::sync::Arc;
use std::path::Path;
use tracing::info;
use tokio::fs;
use reqwest::Client;
use tokio::io::AsyncReadExt;

use crate::queue::jobs::QueueJob;
use crate::AppState;
use crate::ffmpeg::Ffmpeg;

pub struct ClipWorker {
    app_state: Arc<AppState>,
    http_client: Client,
}

impl ClipWorker {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self {
            app_state,
            http_client: Client::new(),
        }
    }

    fn get_storage_path(&self) -> String {
        std::env::var("STORAGE_BASE_PATH")
            .unwrap_or_else(|_| "/home/shailesh/Desktop/aether/storage".to_string())
    }

    fn resolve_file_path(&self, path: &str) -> String {
        if path.starts_with("http://") || path.starts_with("https://") {
            return path.to_string();
        }
        if Path::new(path).is_absolute() {
            return path.to_string();
        }
        let storage = self.get_storage_path();
        format!("{}/uploads/{}", storage, path)
    }

    async fn upload_clip(&self, clip_path: &str, file_id: &str) -> anyhow::Result<String> {
        info!("Uploading clip to API: {}", clip_path);

        let mut file = tokio::fs::File::open(clip_path).await?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).await?;

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name("clip.mp4")
            .mime_str("video/mp4")
            .map_err(|e| anyhow::anyhow!("Failed to create multipart part: {}", e))?;

        let form = reqwest::multipart::Form::new()
            .text("fileId", file_id.to_string())
            .part("file", part);

        let url = format!(
            "{}/api/clips/upload",
            self.app_state.config.api_url.trim_end_matches('/')
        );
        let response = self.http_client
            .post(url)
            .header("x-service-key", &self.app_state.config.service_key)
            .multipart(form)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Clip upload failed: HTTP {} - {}", status, body);
        }

        let result: serde_json::Value = response.json().await?;
        let clip_url = result.get("url")
            .or_else(|| result.get("path"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        info!("Clip uploaded: {}", clip_url);
        Ok(clip_url)
    }

    async fn create_clip_record(&self, file_id: &str, clip_url: &str, start_time: f64, end_time: f64, duration: f64) -> anyhow::Result<()> {
        info!("Creating clip record in database");

        let payload = serde_json::json!({
            "fileId": file_id,
            "url": clip_url,
            "startTime": start_time,
            "endTime": end_time,
            "duration": duration,
        });

        let url = format!(
            "{}/api/clips",
            self.app_state.config.api_url.trim_end_matches('/')
        );
        let response = self.http_client
            .post(url)
            .header("x-service-key", &self.app_state.config.service_key)
            .json(&payload)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create clip record: HTTP {} - {}", status, body);
        }

        info!("Clip record created successfully");
        Ok(())
    }

    pub async fn process(&self, job: QueueJob) -> anyhow::Result<()> {
        info!("Processing clip job: {}", job.id);

        let start_time = job.parameters.as_ref()
            .and_then(|p| p.start_time)
            .unwrap_or(0.0);
        let end_time = job.parameters.as_ref()
            .and_then(|p| p.end_time)
            .unwrap_or(10.0);
        let file_id = &job.video_id;

        let input_path = self.resolve_file_path(&job.input_path);
        let storage_path = self.get_storage_path();

        let video_path = if input_path.starts_with("http://") || input_path.starts_with("https://") {
            let temp_path = format!("{}/uploads/temp_clip_{}.mp4", storage_path, job.id);
            let response = self.http_client.get(&input_path).send().await?;
            if !response.status().is_success() {
                anyhow::bail!("Failed to download source video: HTTP {}", response.status());
            }
            let bytes = response.bytes().await?;
            fs::create_dir_all(format!("{}/uploads", storage_path)).await?;
            fs::write(&temp_path, bytes).await?;
            temp_path
        } else {
            input_path.clone()
        };

        let clips_dir = format!("{}/clips", storage_path);
        fs::create_dir_all(&clips_dir).await?;

        let clip_path = format!("{}/{}.mp4", clips_dir, job.id);

        info!("Generating clip from {}s to {}s...", start_time, end_time);
        let ffmpeg = Ffmpeg::new(None);
        ffmpeg.generate_clip(&video_path, &clip_path, start_time, end_time).await?;

        info!("Uploading clip...");
        let clip_url = self.upload_clip(&clip_path, file_id).await?;

        let duration = end_time - start_time;
        self.create_clip_record(file_id, &clip_url, start_time, end_time, duration).await?;

        let _ = fs::remove_file(&clip_path).await;

        info!("Clip job {} completed successfully", job.id);
        Ok(())
    }
}