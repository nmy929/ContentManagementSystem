#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Starting database"
docker compose up -d db

echo "[2/6] Waiting for PostgreSQL to be ready"
until docker compose exec -T db pg_isready -U d551user -d d551 >/dev/null 2>&1; do
  echo "waiting for db..."
  sleep 2
done

echo "[3/6] Building and starting backend + frontend"
docker compose up -d --build backend frontend

echo "[4/6] Waiting for backend API"
until curl -s http://localhost:8000/docs >/dev/null 2>&1; do
  echo "waiting for backend..."
  sleep 2
done

echo "[5/6] Loading schema and dataset"
docker compose exec -T -w /data db psql -U d551user -d d551 -f /data/schema_and_load_all.sql

echo "[6/6] Initializing experiment table"
docker compose exec -T -e PGPASSWORD=d551pass backend psql -h db -U d551user -d d551 -f /backend/init_experiment_table.sql

echo "Deployment complete."
echo "Frontend: http://localhost:5173"
echo "Backend API docs: http://localhost:8000/docs"
echo
docker compose ps
