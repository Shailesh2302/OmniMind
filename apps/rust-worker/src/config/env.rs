use std::env;

#[derive(Clone)]
pub struct Config {
    pub redis_url: String,
    pub redis_host: String,
    pub redis_port: u16,
    pub queue_name: String,
    pub ws_host: String,
    pub ws_port: u16,
    pub storage_path: String,
    /// Base URL of the Node API
    pub api_url: String,
    /// Base URL of the Python AI service
    pub ai_service_url: String,
    /// Shared secret for the API's internal endpoints
    pub service_key: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            redis_host: env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".to_string()),
            redis_port: env::var("REDIS_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(6379),
            queue_name: env::var("QUEUE_NAME").unwrap_or_else(|_| "aether:video:queue".to_string()),
            ws_host: env::var("WS_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            ws_port: env::var("WS_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(9000),
            storage_path: env::var("STORAGE_BASE_PATH")
                .or_else(|_| env::var("STORAGE_PATH"))
                .unwrap_or_else(|_| "./storage".to_string()),
            api_url: env::var("API_URL").unwrap_or_else(|_| "http://localhost:3001".to_string()),
            ai_service_url: env::var("AI_SERVICE_URL").unwrap_or_else(|_| "http://localhost:3002".to_string()),
            service_key: env::var("SERVICE_API_KEY").unwrap_or_default(),
        })
    }
}