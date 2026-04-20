# Postgres CMS (React + FastAPI)

This project is a full-stack CMS designed to capture PostgreSQL internal behavior (EXPLAIN, pg_stat, VACUUM) as artifacts during normal user actions. Artifacts are stored in `postgres_cms_dataset/artifacts` and indexed in `experiment_results`.

## Project Structure

- `backend/` FastAPI service (asyncpg, JWT auth, artifact capture)
- `frontend/` React (Vite) UI
- `postgres_cms_dataset/` CSV data, `schema_and_load_all.sql`, and `artifacts/`
- `scripts/` helper scripts
- `docker-compose.yml` stack (db + backend + frontend)

## Requirements

- Docker and Docker Compose
- Ports available: `5432`, `8000`, `5173`

## Quick Start

1. Build and start services:

```bash
./scripts/start.sh
```

2. Load schema and data:

```bash
docker compose exec -T db bash -lc "cd /data && psql -U d551user -d d551 -f schema_and_load_all.sql"
docker compose exec -T backend psql -h db -U d551user -d d551 -f /backend/init_experiment_table.sql
```

If the feed shows `Results: 0`, reload the dataset with the same command above and then refresh the page.

3. Open the UI:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000

## Login Accounts

Use usernames from `postgres_cms_dataset/users.csv` (for example: `author1`, `editor1`, `admin1`).

Password is the same as the username.

## Running the Full Demo Script

This script waits for the services, reloads data when `articles` is empty, runs feed explain, performs edits, bulk status change, load test, and bundles artifacts into a zip.

```bash
./scripts/run_full_demo.sh
```

Output zip:

- `postgres_cms_dataset/artifacts_demo.zip`

## Key Features by Role

- Author: create articles, view all articles, edit own articles, basic analytics
- Editor: all author capabilities plus edit any article, flag comments, delete comments
- Admin: bulk operations, EXPLAIN runner, VACUUM, index control, load test, artifact downloads
- All users: advanced tag filter (ANY/ALL, sorted, paginated)
- Comment visibility: flagged comments are hidden from authors and remain visible to editors/admins

## Admin Operations (UI)

- Index modules:
  - `B-tree Benchmark Module (Category + Newest)`
  - `GIN Benchmark Module (Tag Array Filtering)`
- Storage modules:
  - `Load Test Module`
  - `Storage Maintenance Module`
- Run EXPLAIN: `Admin -> Index Modules -> B-tree EXPLAIN Runner`
- Drop/Create B-tree index: `Admin -> Index Modules -> B-tree Index Control`
- GIN query benchmark: `Admin -> Index Modules -> GIN Benchmark Query`
- GIN index control: `Admin -> Index Modules -> GIN Index Control`
- Load test: `Admin -> Storage Modules -> Load Test` (configurable `concurrency` and `ops`)
- Autovacuum toggle: `Admin -> Storage Modules -> Autovacuum`
- VACUUM: `Admin -> Storage Modules -> VACUUM`
- Bulk status change: `Admin -> Storage Modules -> Bulk Status Change` (Preview/Apply, source -> target)
- Metrics list: `Admin -> Experiment Results`

Artifacts are stored in:

- `postgres_cms_dataset/artifacts/`

## Tag Filter (GIN Index Demonstration)

Feed includes an Advanced Tag Filter that queries articles by tags using a materialized view with a GIN index:

- Mode `ANY` uses overlap (`&&`)
- Mode `ALL` uses containment (`@>`)

Admin users can toggle the GIN index on/off from the Feed page to compare execution plans.

If you update tags or article_tags, refresh the materialized view:

```bash
curl -X POST http://localhost:8000/api/admin/refresh_tags_index -H "Authorization: Bearer <admin_token>"
```

## API Notes

- Auth: `POST /api/auth/login` (token-based)
- Every feed/search query runs EXPLAIN and writes an artifact
- Admin-only endpoints are protected by role-based checks

## Rebuild and Reproduce

1. Verify dataset folder exists:

```bash
ls postgres_cms_dataset
```

2. Start services:

```bash
docker compose up -d --build
```

3. Import schema and data:

```bash
docker compose exec -T db bash -lc "cd /data && psql -U d551user -d d551 -f schema_and_load_all.sql"
docker compose exec -T backend psql -h db -U d551user -d d551 -f /backend/init_experiment_table.sql
```

The schema/load script rebuilds the dataset from a clean state. It drops dependent objects with `CASCADE`, recreates the tables, and reloads the CSV data.

4. Open the web UI:

```text
http://localhost:5173
```

5. Login as admin (from `users.csv`) and run:

- Feed -> optional Category ID / Author ID / Author Username filters, then "Refresh Feed" to collect EXPLAIN
- Admin -> EXPLAIN Runner for custom SQL
- Admin -> Bulk Status Change (Preview/Apply), then (optional) VACUUM

6. Download artifacts (admin only):

- Navigate to `postgres_cms_dataset/artifacts/`
- Optionally package with:

```bash
cd postgres_cms_dataset
zip -r artifacts_demo.zip artifacts
```

## Environment Variables

Backend service uses:

- `DATABASE_URL`: default `postgresql://d551user:d551pass@db:5432/d551`
- `ARTIFACT_DIR`: default `/data/artifacts`
- `JWT_SECRET`: default `devsecret`

Frontend service uses:

- `VITE_API_BASE`: default `http://localhost:8000`

## Notes

- EXPLAIN is restricted to SELECT statements only.
- VACUUM output is captured via `psql` in the backend container.
- Artifacts are written as text/JSON/CSV and indexed in `experiment_results`.
- `articles.current_revision_id` is maintained by application logic during create/edit flows; it is intentionally not enforced by a database foreign key.
- If you reload the dataset, rerun `schema_and_load_all.sql` instead of manually dropping tables.
