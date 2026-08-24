#!/bin/bash
# Start exactly one aether rust worker with proper env
cd /home/shailesh/Desktop/aether/apps/rust-worker
exec env \
  REDIS_URL=redis://localhost:6379 \
  API_URL=http://localhost:3001 \
  AI_SERVICE_URL=http://localhost:3002 \
  SERVICE_API_KEY=aether-internal-dev-key \
  STORAGE_BASE_PATH=./storage \
  API_STORAGE_PATH=../api/storage \
  ./target/release/aether-rust-worker
