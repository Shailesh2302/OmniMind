#![allow(unused_imports)]
#![allow(dead_code)]

mod config;
mod workers;
mod ffmpeg;
mod queue;
mod streaming;
mod services;
mod utils;
mod types;

use std::sync::Arc;
use tokio::signal;
use tokio::sync::RwLock;
use tracing::{info, error};

use crate::config::Config;
use crate::queue::redis_client::RedisClient;
use crate::streaming::websocket::WebSocketManager;
use crate::utils::logger::init_logging;
use crate::workers::QueueWorker;

pub struct AppState {
    pub config: Config,
    pub redis: Arc<RedisClient>,
    pub ws_manager: Arc<RwLock<WebSocketManager>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_logging();

    info!("Starting Aether Rust Worker");

    let config = Config::from_env()?;
    info!("Configuration loaded: Redis at {}, Queue: {}",
        config.redis_host, config.queue_name);

    let redis = Arc::new(RedisClient::new(&config.redis_url).await?);
    info!("Redis connection established");

    let ws_manager = Arc::new(RwLock::new(WebSocketManager::new()));
    info!("WebSocket manager initialized");

    let app_state = Arc::new(AppState {
        config: config.clone(),
        redis: redis.clone(),
        ws_manager,
    });

    let ws_handle = {
        let app_state = app_state.clone();
        tokio::spawn(async move {
            if let Err(e) = streaming::websocket::run_websocket_server(app_state).await {
                error!("WebSocket server error: {}", e);
            }
        })
    };

    let queue_worker = QueueWorker::new(app_state.clone());
    let _queue_handle = tokio::spawn(async move {
        if let Err(e) = queue_worker.start().await {
            error!("Queue worker error: {}", e);
        }
    });

    info!("Aether Rust Worker started successfully");
    info!("WebSocket server running on ws://{}:{}", config.ws_host, config.ws_port);
    info!("Queue worker processing jobs from Redis");
    info!("Ready to process video jobs from Redis queue");

    tokio::select! {
        _ = signal::ctrl_c() => {
            info!("Shutdown signal received");
        }
        _ = ws_handle => {}
    }

    info!("Shutting down Aether Rust Worker");
    Ok(())
}