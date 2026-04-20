#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/6] Starting containers"
docker compose up -d --build

echo "[2/6] Waiting for database"
until docker compose exec -T db pg_isready -U d551user -d d551 >/dev/null 2>&1; do
  sleep 2
  echo "Waiting for db..."
done

echo "[3/6] Waiting for backend"
until curl -s http://localhost:8000/docs >/dev/null 2>&1; do
  sleep 2
  echo "Waiting for backend..."
done

echo "[4/7] Loading schema and data if needed"
ARTICLE_COUNT=$(docker compose exec -T db psql -U d551user -d d551 -tAc "SELECT COUNT(*) FROM articles;" 2>/dev/null || echo "0")
ARTICLE_COUNT=$(echo "$ARTICLE_COUNT" | tr -d '[:space:]')
if [[ -z "$ARTICLE_COUNT" || "$ARTICLE_COUNT" == "0" ]]; then
  docker compose exec -T db psql -U d551user -d d551 -f /data/schema_and_load_all.sql
fi

docker compose exec -T backend psql -h db -U d551user -d d551 -f /backend/init_experiment_table.sql >/dev/null

ARTICLE_ID=$(docker compose exec -T db psql -U d551user -d d551 -tAc "SELECT article_id FROM articles ORDER BY article_id LIMIT 1;")
ARTICLE_ID=$(echo "$ARTICLE_ID" | tr -d '[:space:]')

ADMIN_TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin1","password":"admin1"}' | \
  python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

echo "[5/7] Running feed explain"
curl -s "http://localhost:8000/api/articles?limit=5&offset=0" \
  -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null

echo "[6/7] Generating edits"
for i in $(seq 1 10); do
  curl -s -X PUT "http://localhost:8000/api/articles/$ARTICLE_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"title\":\"Demo Edit $i\",\"content\":\"Edit $i content\"}" >/dev/null
  sleep 0.2
done

echo "[7/7] Bulk status change and load test"
curl -s -X POST http://localhost:8000/api/admin/bulk_status_change/apply \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"category_id":1,"source_status":"published","target_status":"draft"}' >/dev/null

curl -s -X POST http://localhost:8000/api/admin/run_load_test \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"target":"article_view","concurrency":200,"ops":10000}' >/dev/null

sleep 5

ARTIFACT_ZIP="$ROOT_DIR/postgres_cms_dataset/artifacts_demo.zip"
cd "$ROOT_DIR/postgres_cms_dataset"
zip -r "${ARTIFACT_ZIP}" artifacts >/dev/null

echo "Demo complete. Artifacts zip: $ARTIFACT_ZIP"
