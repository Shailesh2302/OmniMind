use std::sync::Arc;
use tracing::{info, error, warn};

use crate::queue::jobs::JobQueue;
use crate::AppState;
use crate::workers::{VideoWorker, ClipWorker};

pub struct QueueWorker {
    app_state: Arc<AppState>,
}

impl QueueWorker {
    pub fn new(app_state: Arc<AppState>) -> Self {
        Self { app_state }
    }

    async fn update_job_status(&self, job_id: &str, status: &str) {
        if let Err(e) = self.app_state.redis.hset(
            &format!("aether:job:{}", job_id),
            "status",
            status,
        ).await {
            warn!("Failed to update job status: {}", e);
        }
    }

    pub async fn start(&self) -> anyhow::Result<()> {
        info!("Starting queue worker");

        let queue = JobQueue::new(self.app_state.redis.clone());
        let video_worker = VideoWorker::new(self.app_state.clone());
        let clip_worker = ClipWorker::new(self.app_state.clone());

        loop {
            match queue.pop().await {
                Ok(Some(job)) => {
                    info!("Received job: {} ({})", job.id, job.job_type);

                    let job_type = job.job_type.clone();
                    let job_id = job.id.clone();

                    self.update_job_status(&job_id, "processing").await;

                    let result = match job_type.as_str() {
                        "VideoProcess" => {
                            video_worker.process(job).await
                        }
                        "ClipGenerate" => {
                            clip_worker.process(job).await
                        }
                        _ => {
                            warn!("Unknown job type: {}", job_type);
                            Err(anyhow::anyhow!("Unknown job type: {}", job_type))
                        }
                    };

                    match result {
                        Ok(_) => {
                            info!("Job {} completed successfully", job_id);
                            self.update_job_status(&job_id, "completed").await;
                        }
                        Err(e) => {
                            error!("Job {} failed: {}", job_id, e);
                            self.update_job_status(&job_id, "failed").await;
                        }
                    }
                }
                Ok(None) => {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                }
                Err(e) => {
                    error!("Failed to pop job from queue: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            }
        }
    }
}