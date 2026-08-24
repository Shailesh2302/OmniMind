#!/bin/bash

echo "🚀 Starting Aether All Services..."
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Resolve repo root regardless of caller CWD
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start services in background
start_services() {
    # Start Web (Next.js)
    echo -e "${GREEN}[1/4]${NC} Starting Web (Next.js)..."
    cd "$ROOT/apps/web"
    pnpm run dev > /tmp/aether-web.log 2>&1 &
    WEB_PID=$!
    echo "Web PID: $WEB_PID"

    # Start API (Node.js)
    echo -e "${GREEN}[2/4]${NC} Starting API (Node.js)..."
    cd "$ROOT/apps/api"
    pnpm run dev > /tmp/aether-api.log 2>&1 &
    API_PID=$!
    echo "API PID: $API_PID"

    # Start AI Service (Python)
    echo -e "${GREEN}[3/4]${NC} Starting AI Service (Python)..."
    cd "$ROOT/apps/ai-service"
    if [ -x "./venv/bin/python" ]; then PY=./venv/bin/python; else PY=python; fi
    $PY -m uvicorn app.main:app --host 0.0.0.0 --port 3002 --reload > /tmp/aether-ai.log 2>&1 &
    AI_PID=$!
    echo "AI PID: $AI_PID"

    # Start Rust Worker
    echo -e "${GREEN}[4/4]${NC} Starting Rust Worker..."
    cd "$ROOT/apps/rust-worker"
    cargo run --release > /tmp/aether-rust.log 2>&1 &
    RUST_PID=$!
    echo "Rust PID: $RUST_PID"

    echo ""
    echo "======================================"
    echo -e "${GREEN}✅ All services started!${NC}"
    echo ""
    echo "Access URLs:"
    echo -e "  🌐 Web:     ${YELLOW}http://localhost:3000${NC}"
    echo -e "  📡 API:     ${YELLOW}http://localhost:3001${NC}"
    echo -e "  🤖 AI:      ${YELLOW}http://localhost:3002${NC}"
    echo -e "  📚 Qdrant:  ${YELLOW}http://localhost:6333${NC}"
    echo ""
    echo "Logs:"
    echo "  Web:  /tmp/aether-web.log"
    echo "  API:  /tmp/aether-api.log"
    echo "  AI:   /tmp/aether-ai.log"
    echo "  Rust: /tmp/aether-rust.log"
    echo ""
    echo "To stop all services, run: pkill -f 'next dev\|uvicorn\|cargo run'"
}

# Stop all services
stop_services() {
    echo "Stopping all Aether services..."
    pkill -f "next dev" 2>/dev/null
    pkill -f "uvicorn" 2>/dev/null
    pkill -f "cargo run" 2>/dev/null
    echo "✅ All services stopped!"
}

# Show logs
show_logs() {
    echo "=== Web Logs ==="
    tail -20 /tmp/aether-web.log 2>/dev/null || echo "No logs yet"
    echo ""
    echo "=== API Logs ==="
    tail -20 /tmp/aether-api.log 2>/dev/null || echo "No logs yet"
    echo ""
    echo "=== AI Logs ==="
    tail -20 /tmp/aether-ai.log 2>/dev/null || echo "No logs yet"
    echo ""
    echo "=== Rust Worker Logs ==="
    tail -20 /tmp/aether-rust.log 2>/dev/null || echo "No logs yet"
}

# Main command
case "${1:-start}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 2
        start_services
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "Usage: ./run-all.sh [start|stop|restart|logs]"
        echo "  start   - Start all services (default)"
        echo "  stop    - Stop all services"
        echo "  restart - Restart all services"
        echo "  logs    - Show recent logs"
        ;;
esac