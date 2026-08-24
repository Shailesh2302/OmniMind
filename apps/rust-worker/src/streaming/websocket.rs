use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::mpsc;
use tokio::net::TcpListener;
use tracing::{info, error, debug};

use crate::AppState;

pub struct WebSocketManager {
    clients: HashMap<String, mpsc::Sender<String>>,
}

impl WebSocketManager {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
        }
    }

    pub async fn register_client(&mut self, id: String, sender: mpsc::Sender<String>) {
        self.clients.insert(id.clone(), sender);
        debug!("Client registered: {}", id);
    }

    pub async fn unregister_client(&mut self, id: &str) {
        self.clients.remove(id);
        debug!("Client unregistered: {}", id);
    }

    pub async fn broadcast(&self, message: &str) {
        for (_, sender) in &self.clients {
            let _ = sender.send(message.to_string()).await;
        }
    }
}

pub async fn run_websocket_server(app_state: Arc<AppState>) -> anyhow::Result<()> {
    let addr = format!("{}:{}", app_state.config.ws_host, app_state.config.ws_port);
    let listener = TcpListener::bind(&addr).await?;
    info!("WebSocket server listening on ws://{}", addr);

    loop {
        let (stream, addr) = listener.accept().await?;
        info!("New WebSocket connection from: {}", addr);

        let app_state = app_state.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_ws_connection(stream, app_state).await {
                error!("WebSocket error: {}", e);
            }
        });
    }
}

async fn handle_ws_connection(
    _stream: tokio::net::TcpStream,
    _app_state: Arc<AppState>,
) -> anyhow::Result<()> {
    info!("WebSocket connection handled");
    Ok(())
}