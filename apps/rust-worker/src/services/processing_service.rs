use std::sync::Arc;
use tracing::info;
use crate::types::ProcessingStatus;
use crate::queue::jobs::QueueJob;
use crate::queue::jobs::JobQueue;
use crate::queue::jobs::JobParameters;
use crate::AppState;

pub struct ProcessingService {
    app_state: Arc<AppState>,
}

impl ProcessingService {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self { app_state }
    }

    pub async fn queue_video_processing(
        &self,
        video_id: &str,
        input_path: &str,
    ) -> anyhow::Result<String> {
        let job = QueueJob {
            id: format!("job-{}", video_id),
            job_type: "VideoProcess".to_string(),
            video_id: video_id.to_string(),
            input_path: input_path.to_string(),
            output_path: None,
            status: "pending".to_string(),
            parameters: None,
        };

        let queue = JobQueue::new(self.app_state.redis.clone());
        queue.push(job).await?;

        info!("Queued video processing: {}", video_id);
        Ok(video_id.to_string())
    }

    pub async fn queue_clip_generation(
        &self,
        video_id: &str,
        clip_id: &str,
        start_time: f64,
        duration: f64,
    ) -> anyhow::Result<String> {
        let job = QueueJob {
            id: format!("clip-{}", clip_id),
            job_type: "ClipGenerate".to_string(),
            video_id: video_id.to_string(),
            input_path: String::new(),
            output_path: Some(format!("/tmp/aether/clips/{}.mp4", clip_id)),
            status: "pending".to_string(),
            parameters: Some(JobParameters {
                user_id: None,
                mime_type: None,
                start_time: Some(start_time),
                end_time: Some(start_time + duration),
                duration: Some(duration),
                clip_id: Some(clip_id.to_string()),
                thumbnail_time: None,
                quality: Some("medium".to_string()),
                format: Some("mp4".to_string()),
            }),
        };

        let queue = JobQueue::with_queue(self.app_state.redis.clone(), "aether:clip:queue");
        queue.push(job).await?;

        info!("Queued clip generation: {} for video: {}", clip_id, video_id);
        Ok(clip_id.to_string())
    }
}