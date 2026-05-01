# Postgres CMS (React + FastAPI)

This project is a full-stack CMS designed to capture PostgreSQL internal behavior (EXPLAIN, pg_stat, VACUUM) as artifacts during normal user actions. Artifacts are stored in `postgres_cms_dataset/artifacts` and indexed in `experiment_results`.

## Project Structure

- `backend/` FastAPI service (asyncpg, JWT auth, artifact capture)
- `frontend/` React (Vite) UI
- `postgres_cms_dataset/` CSV data, `schema_and_load_all.sql`, and `artifacts/`
- `scripts/` helper scripts
- `docker-compose.yml` stack (db + backend + frontend)

## Set Up the Environment

Prepare a machine that can run Docker containers for the database, backend, and frontend.

- Docker
- Docker Compose
- Available local ports: `5432`, `8000`, `5173`

Clone the repository and move to the project root:

```bash
git clone <repository-url>
cd <your-cloned-repository-folder>
```

## Install Dependencies

This project uses Docker for all services, so local installation of Python, Node.js, npm, and PostgreSQL is not required. Dependencies are pulled and built by Docker Compose.

## Run the Application

Run the following command from the project root:

```bash
./scripts/start.sh
```

The script does the following:

1. Starts the PostgreSQL container.
2. Waits until PostgreSQL is ready.
3. Builds and starts the backend and frontend containers.
4. Waits until the backend API is reachable.
5. Loads the schema and CSV dataset from `postgres_cms_dataset/schema_and_load_all.sql`.
6. Initializes the `experiment_results` table from `backend/init_experiment_table.sql`.

After startup, open:

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

To stop the application:

```bash
docker compose down
```

## Login Accounts

Use usernames from `postgres_cms_dataset/users.csv`:

- `user001` to `user050`: `author`
- `user051` to `user058`: `editor`
- `user059` to `user060`: `admin`
- Password = username (for all accounts)

## Key Features by Role

- All users: `Feed`
- Admin `INDEX MODULE`: `B-tree Benchmark`, `B-tree Index Control`, `B-tree EXPLAIN Runner`, `GIN Benchmark`, `GIN Index Control`, `GIN EXPLAIN and Result Summary`
- Admin `STORAGE MODULE`: `Load Test`, `Autovacuum`, `VACUUM`, `Bulk Status Change`
- Admin `EXPERIMENT RESULTS`: artifact list and downloads

Artifacts are stored in:

- `postgres_cms_dataset/artifacts/`

## Reproduce the Results

1. Start the system with `./scripts/start.sh`.
2. Log in with one of the provided accounts from `postgres_cms_dataset/users.csv`.
3. Use an admin account such as `user059` or `user060` with password equal to the username.
4. Open the admin modules and run the benchmark or maintenance actions to be reproduced.
5. Collect the generated outputs from the UI or from `postgres_cms_dataset/artifacts/`.

Recommended workflows:

### Indexing Workflow

- B-tree benchmark workflow:
  1. Open Admin `INDEX MODULE` -> `B-tree Benchmark Module (Category + Newest)`.
  2. Purpose: compare query plans for `SELECT title, published_at FROM articles WHERE category_id = ? ORDER BY published_at DESC LIMIT 200` before and after the canonical B-tree index.
  3. First run without index: click `Drop Category+Published Indexes`, then in `B-tree EXPLAIN Runner` click `Use Demo Query` and `Run EXPLAIN`.
  4. Observe the result panel: focus on `Seq Scan`, and compare `cost` and `Execution Time`.
  5. Second run with index: click `Create Canonical Index`, then run the same EXPLAIN again.
  6. Observe the result panel: `Index Only Scan` appears because the index covers `category_id`, `published_at`, and included `title`, which matches the selected columns; compare `cost` and `Execution Time`.
  7. Third run: add `status` to `SELECT`, run EXPLAIN again, and explain that the planner may switch to `Index Scan` because `status` is not covered by the index; compare `cost` and `Execution Time`.

- GIN benchmark workflow:
  1. Open Admin `INDEX MODULE` -> `GIN Benchmark Module (Tag Array Filtering)`.
  2. Purpose: compare `Seq Scan` vs `Bitmap Index Scan + Bitmap Heap Scan` using the same SQL with/without GIN.
  3. Choose a tag preset (`Rare` or `Common`), choose `ALL` or `ANY`, and set benchmark runs.
  4. Click `Run without Index (Drop GIN)`, then click `Run Query`.
  5. In the summary panel, you can observe:
     - `Scan Type: Seq Scan`
     - `Index Used: N/A`
     - `Median execution time`
  6. Click `Run with Index (Create GIN)`, then run the same query again.
  7. In the summary panel, you can observe:
     - `Scan Type: Bitmap Heap Scan + Bitmap Index Scan`
     - `Index Used: idx_articles_tagids_gin`
     - Lower median execution time.

### Storage Workflow

Use the Admin `STORAGE MODULE` to reproduce MVCC behavior, WAL growth, dead tuple generation, and tuple version changes.

1. Open the Admin page and go to the storage section.
2. In `Load Test`, capture the `Before` snapshot and record the tuple count and WAL Log Sequence Number (LSN).
3. Run the load test with `100` concurrency and `1000` operations.
4. Capture the `After` snapshot and confirm that the tuple count increases by `1000` and the WAL LSN increases significantly.
5. Move to `Bulk Status Change` and turn `Autovacuum` off.
6. Set the target status to `archived`, apply the category filter, and use `before date` to target articles published more than one year ago.
7. Preview the first 5 tuples and inspect `ctid`, `xmin`, and `xmax`.
8. Confirm that the dead tuple count is `0`, then apply the bulk status change.
9. Verify that the dead tuple count increases to several thousand rows, then run `VACUUM`.
10. Confirm that the dead tuple count returns to `0`.
11. Review the tuple metadata again and confirm that `ctid` changes, `xmin` reflects the update transaction, and the current visible rows show `xmax = 0`.

`ctid` shows the physical row location, `xmin` shows the transaction that created the visible row version, and `xmax` indicates whether an older row version has been invalidated. Together, these checks show that PostgreSQL `UPDATE` creates a new row version under MVCC, while `VACUUM` removes obsolete tuples later.

To reproduce from a clean state, rerun:

```bash
./scripts/start.sh
```

Because the startup script reloads `postgres_cms_dataset/schema_and_load_all.sql`, the dataset is reset before experiments run.

## Data and Dataset Instructions

The dataset is loaded automatically by `./scripts/start.sh`.

- Source files are in `postgres_cms_dataset/`:
  - `schema_and_load_all.sql`
  - CSV files used by the SQL `COPY` commands
- During startup, the script runs:
  - `schema_and_load_all.sql` inside `/data` in the `db` container
  - `init_experiment_table.sql` from the `backend` container


## API Notes

Use this section as a quick endpoint map when testing from UI, curl, or Postman.

- Auth: `POST /api/auth/login`
- Core content: `GET /api/articles`, `GET /api/articles/{id}`, `GET /api/search`, `GET /api/tags`, `GET /api/categories`
- Index benchmarks: `POST /api/admin/run_explain`, `GET /api/admin/category_index/status`, `POST /api/admin/category_index/create`, `POST /api/admin/category_index/drop`, `POST /api/admin/gin_benchmark`, `POST /api/admin/tags_index/create`, `POST /api/admin/tags_index/drop`, `POST /api/admin/refresh_tags_index`
- Storage and maintenance: `POST /api/admin/run_load_test`, `POST /api/admin/run_vacuum`, `POST /api/admin/set_autovacuum`, `POST /api/admin/bulk_status_change/preview`, `POST /api/admin/bulk_status_change/apply`
- Metrics and artifacts: `GET /api/metrics/latest`, `GET /api/metrics/artifact/{filename}`

Use `Authorization: Bearer <token>` for authenticated requests.

## Notes

- EXPLAIN is restricted to `SELECT` statements only.
- `schema_and_load_all.sql` resets and reloads the dataset.
- `articles_tag_index` is a materialized view; use `Refresh Tag Index` after tag mapping changes.
- Artifacts are written to `postgres_cms_dataset/artifacts/` and indexed in `experiment_results`.
