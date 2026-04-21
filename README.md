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

Run one command from the project root:

```bash
./scripts/start.sh
```

What `./scripts/start.sh` does:

1. Starts `db`
2. Waits until PostgreSQL is ready
3. Builds and starts `backend` and `frontend`
4. Waits until backend API is reachable
5. Loads schema + CSV dataset from `postgres_cms_dataset/schema_and_load_all.sql`
6. Initializes `experiment_results` from `backend/init_experiment_table.sql`

Open:

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

## Login Accounts

Use usernames from `postgres_cms_dataset/users.csv`:

- `user001` to `user050`: `author`
- `user051` to `user058`: `editor`
- `user059` to `user060`: `admin`
- Password = username (for all accounts)

## Key Features by Role

- All users: `Feed module`
- Admin `<INDEX MODULE>`: `B-tree Benchmark Module (Category + Newest)` with `B-tree Index Control` and `B-tree EXPLAIN Runner`;  `GIN Benchmark Module (Tag Array Filtering)` with `GIN Benchmark Query`, `GIN Index Control`, and `GIN EXPLAIN and Result Summary`
- Admin `<STORAGE MODULE>`: `Load Test Module` (`Load Test`) and `Storage Maintenance Module` (`Autovacuum`, `VACUUM`, `Bulk Status Change`)
- Admin `<EXPERIMENT RESULTS>`: artifact list and downloads

Artifacts are stored in:

- `postgres_cms_dataset/artifacts/`

## Tag Filter (GIN Index Demonstration)

Feed includes an Advanced Tag Filter that queries articles by tags using a materialized view with a GIN index:

- Mode `ANY` uses overlap (`&&`)
- Mode `ALL` uses containment (`@>`)

Admin users can toggle the GIN index on/off from the Admin GIN benchmark module to compare execution plans.

If you update tags or article_tags, refresh the materialized view:

```bash
curl -X POST http://localhost:8000/api/admin/refresh_tags_index -H "Authorization: Bearer <admin_token>"
```

## API Notes

- Auth:
- `POST /api/auth/login` returns JWT token
- Send token as `Authorization: Bearer <token>`

- Core endpoints:
- `GET /api/articles`
- `GET /api/articles/{id}`
- `GET /api/search`
- `GET /api/tags`
- `GET /api/categories`

- Admin benchmark endpoints:
- `POST /api/admin/run_explain`
- `GET /api/admin/category_index/status`
- `POST /api/admin/category_index/create`
- `POST /api/admin/category_index/drop`
- `POST /api/admin/gin_benchmark`
- `POST /api/admin/tags_index/create`
- `POST /api/admin/tags_index/drop`
- `POST /api/admin/refresh_tags_index`

- Storage/maintenance endpoints:
- `POST /api/admin/run_load_test`
- `POST /api/admin/run_vacuum`
- `POST /api/admin/set_autovacuum`
- `POST /api/admin/bulk_status_change/preview`
- `POST /api/admin/bulk_status_change/apply`

- Metrics/artifacts:
- `GET /api/metrics/latest`
- `GET /api/metrics/artifact/{filename}`

## Environment Variables

Backend service uses:

- `DATABASE_URL`: default `postgresql://d551user:d551pass@db:5432/d551`
- `ARTIFACT_DIR`: default `/data/artifacts`
- `JWT_SECRET`: default `devsecret`

Frontend service uses:

- `VITE_API_BASE`: default `http://localhost:8000`

## Notes

- EXPLAIN is restricted to `SELECT` statements only.
- `schema_and_load_all.sql` reloads the dataset from a clean state.
- `articles_tag_index` is a materialized view; use `Refresh Tag Index` after tag mapping changes.
- Artifacts are written to `postgres_cms_dataset/artifacts/` and indexed in `experiment_results`.
