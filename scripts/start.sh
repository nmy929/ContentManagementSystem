#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose up -d --build

echo "Services are starting. Frontend: http://localhost:5173  Backend: http://localhost:8000"
