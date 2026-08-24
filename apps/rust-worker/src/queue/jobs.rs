use std::sync::Arc;
use tracing::info;

use crate::queue::redis_client::RedisClient;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct JobParameters {
    #[serde(default, rename = "userId")]
    pub user_id: Option<String>,
    #[serde(default, rename = "mimeType")]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub start_time: Option<f64>,
    #[serde(default)]
    pub end_time: Option<f64>,
    #[serde(default)]
    pub duration: Option<f64>,
    #[serde(default)]
    pub clip_id: Option<String>,
    #[serde(default)]
    pub thumbnail_time: Option<f64>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub format: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct QueueJob {
    pub id: String,
    /// Node's queue service serializes this field as "type".
    #[serde(rename = "type", alias = "job_type")]
    pub job_type: String,
    #[serde(default)]
    pub video_id: String,
    pub input_path: String,    #[serde(default)]
    pub output_path: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub parameters: Option<JobParameters>,
}

pub struct JobQueue {
    redis: Arc<RedisClient>,
    queue_key: String,
}

impl JobQueue {
    pub fn new(redis: Arc<RedisClient>) -> Self {
        Self::with_queue(redis, "aether:video:queue")
    }

    pub fn with_queue(redis: Arc<RedisClient>, queue_key: &str) -> Self {
        Self {
            redis,
            queue_key: queue_key.to_string(),
        }
    }

    pub async fn push(&self, job: QueueJob) -> anyhow::Result<()> {
        let job_json = serde_json::to_string(&job)?;
        self.redis.lpush(&self.queue_key, &job_json).await?;
        info!("Job pushed to queue: {}", job.id);
        Ok(())
    }

    pub async fn pop(&self) -> anyhow::Result<Option<QueueJob>> {
        match self.redis.brpop(&self.queue_key, 5.0).await? {
            Some(data) => {
                let job: QueueJob = serde_json::from_str(&data)?;
                Ok(Some(job))
            }
            None => Ok(None),
        }
    }
}