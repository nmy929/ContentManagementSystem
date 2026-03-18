import asyncio
import json
import os
import re
import subprocess
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import aiofiles
import asyncpg
import jwt
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://d551user:d551pass@db:5432/d551")
JWT_SECRET = os.getenv("JWT_SECRET", "devsecret")
ARTIFACT_DIR = os.getenv("ARTIFACT_DIR", "/data/artifacts")

DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_USER = os.getenv("DB_USER", "d551user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "d551pass")
DB_NAME = os.getenv("DB_NAME", "d551")

ROLE_AUTHOR = "author"
ROLE_EDITOR = "editor"
ROLE_ADMIN = "admin"

app = FastAPI(title="Postgres CMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"]
,
    allow_credentials=True,
    allow_methods=["*"]
,
    allow_headers=["*"]
)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str


class ArticleCreate(BaseModel):
    title: str
    content: str
    category_id: int
    tags: List[int] = []
    status: str


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class CommentCreate(BaseModel):
    content: str


class BulkUnpublishRequest(BaseModel):
    category_id: int
    older_than_days: int


class IndexRequest(BaseModel):
    index_sql: str


class ExplainRequest(BaseModel):
    sql: str
    label: str


class VacuumRequest(BaseModel):
    table: str


class LoadTestRequest(BaseModel):
    target: str
    concurrency: int
    ops: int


async def get_pool() -> asyncpg.pool.Pool:
    return app.state.pool


@app.on_event("startup")
async def startup() -> None:
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    app.state.pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)


@app.on_event("shutdown")
async def shutdown() -> None:
    await app.state.pool.close()


def create_token(payload: Dict[str, Any]) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


def require_roles(*roles: str):
    async def _dependency(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing token")
        token = authorization.split(" ", 1)[1]
        payload = decode_token(token)
        if payload.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return payload

    return _dependency


def utcnow() -> datetime:
    # Use naive UTC to match TIMESTAMP WITHOUT TIME ZONE columns in the dataset.
    return datetime.utcnow()


def safe_filename(prefix: str, ext: str = "txt") -> str:
    stamp = utcnow().strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}_{stamp}_{uuid.uuid4().hex}.{ext}"


async def write_artifact(text: str, prefix: str, ext: str = "txt") -> str:
    filename = safe_filename(prefix, ext)
    path = os.path.join(ARTIFACT_DIR, filename)
    async with aiofiles.open(path, "w", encoding="utf-8") as f:
        await f.write(text)
    return filename


async def insert_experiment(
    conn: asyncpg.Connection,
    operation: str,
    params: Dict[str, Any],
    explain_text: Optional[str],
    artifact_path: Optional[str],
) -> int:
    row = await conn.fetchrow(
        """
        INSERT INTO experiment_results (operation, params, explain_text, artifact_path)
        VALUES ($1, $2::jsonb, $3, $4)
        RETURNING id
        """,
        operation,
        json.dumps(params),
        explain_text,
        artifact_path,
    )
    return row["id"]


def only_select_sql(sql: str) -> bool:
    return bool(re.match(r"^\s*(select|with)\b", sql, re.IGNORECASE))


async def run_explain(
    conn: asyncpg.Connection,
    sql: str,
    params: List[Any],
    operation: str,
    op_params: Dict[str, Any],
) -> Dict[str, Any]:
    explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {sql}"
    rows = await conn.fetch(explain_sql, *params)
    explain_text = "\n".join([r[0] for r in rows])
    artifact = await write_artifact(explain_text, f"explain_{operation}")
    exp_id = await insert_experiment(conn, operation, op_params, explain_text, artifact)
    return {"id": exp_id, "artifact": artifact, "explain_text": explain_text}


async def capture_pg_stat(conn: asyncpg.Connection) -> str:
    rows = await conn.fetch(
        """
        SELECT relname, n_live_tup, n_dead_tup
        FROM pg_stat_user_tables
        ORDER BY relname
        """
    )
    lines = ["relname,n_live_tup,n_dead_tup"]
    for r in rows:
        lines.append(f"{r['relname']},{r['n_live_tup']},{r['n_dead_tup']}")
    return "\n".join(lines)


def run_vacuum_psql(table: str) -> str:
    cmd = [
        "psql",
        "-h",
        DB_HOST,
        "-p",
        str(DB_PORT),
        "-U",
        DB_USER,
        "-d",
        DB_NAME,
        "-c",
        f"VACUUM (VERBOSE, ANALYZE) {table};",
    ]
    env = os.environ.copy()
    env["PGPASSWORD"] = DB_PASSWORD
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env, check=False)
    return (proc.stdout or "") + (proc.stderr or "")


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, pool: asyncpg.pool.Pool = Depends(get_pool)) -> LoginResponse:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, username, role FROM users WHERE username = $1",
            payload.username,
        )
        if not row:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        token = create_token(
            {
                "user_id": row["user_id"],
                "username": row["username"],
                "role": row["role"],
                "iat": int(utcnow().timestamp()),
            }
        )
        return LoginResponse(token=token, role=row["role"])


@app.get("/api/articles")
async def get_articles(
    category: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    base_sql = (
        "SELECT article_id, title, published_at, author_id "
        "FROM articles WHERE status = 'published'"
    )
    params: List[Any] = []
    if category is not None:
        params.append(category)
        base_sql += f" AND category_id = ${len(params)}"
    params.extend([limit, offset])
    base_sql += f" ORDER BY published_at DESC LIMIT ${len(params)-1} OFFSET ${len(params)}"

    async with pool.acquire() as conn:
        rows = await conn.fetch(base_sql, *params)
        data = [dict(r) for r in rows]
        explain_info = await run_explain(
            conn,
            base_sql,
            params,
            "feed",
            {"category": category, "limit": limit, "offset": offset},
        )
    response: Dict[str, Any] = {"rows": data, "explain_artifact": explain_info["artifact"]}
    if user["role"] == ROLE_ADMIN:
        response["explain_text"] = explain_info["explain_text"]
    return response


@app.get("/api/articles/{article_id}")
async def get_article(
    article_id: int,
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT a.article_id, a.title, a.author_id, a.category_id, a.status,
                   a.published_at, a.views_count, r.content
            FROM articles a
            LEFT JOIN revisions r ON r.revision_id = a.current_rev
            WHERE a.article_id = $1
            """,
            article_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        return dict(row)


@app.post("/api/articles")
async def create_article(
    payload: ArticleCreate,
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    now = utcnow()
    slug = re.sub(r"[^a-z0-9]+", "-", payload.title.lower()).strip("-")
    async with pool.acquire() as conn:
        before = await capture_pg_stat(conn)
        async with conn.transaction():
            article_row = await conn.fetchrow(
                """
                INSERT INTO articles (author_id, category_id, status, title, slug, published_at, views_count, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $7)
                RETURNING article_id
                """,
                user["user_id"],
                payload.category_id,
                payload.status,
                payload.title,
                slug,
                now if payload.status == "published" else None,
                now,
            )
            article_id = article_row["article_id"]
            revision_row = await conn.fetchrow(
                """
                INSERT INTO revisions (article_id, editor_id, title, content, created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING revision_id
                """,
                article_id,
                user["user_id"],
                payload.title,
                payload.content,
                now,
            )
            await conn.execute(
                "UPDATE articles SET current_rev = $1 WHERE article_id = $2",
                revision_row["revision_id"],
                article_id,
            )
            if payload.tags:
                values = [(article_id, tag_id) for tag_id in payload.tags]
                await conn.executemany(
                    "INSERT INTO article_tags (article_id, tag_id) VALUES ($1, $2)",
                    values,
                )

        after = await capture_pg_stat(conn)
        artifact = await write_artifact(before + "\n\n" + after, "pgstat_article_create", "csv")
        await insert_experiment(
            conn,
            "article_create",
            {"article_id": article_id, "user_id": user["user_id"]},
            None,
            artifact,
        )

    return {"article_id": article_id}


@app.put("/api/articles/{article_id}")
async def update_article(
    article_id: int,
    payload: ArticleUpdate,
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    now = utcnow()
    async with pool.acquire() as conn:
        before = await capture_pg_stat(conn)
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT a.article_id, a.title, r.content
                FROM articles a
                LEFT JOIN revisions r ON r.revision_id = a.current_rev
                WHERE a.article_id = $1
                """,
                article_id,
            )
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            title = payload.title or row["title"]
            content = payload.content if payload.content is not None else (row["content"] or "")
            revision_row = await conn.fetchrow(
                """
                INSERT INTO revisions (article_id, editor_id, title, content, created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING revision_id
                """,
                article_id,
                user["user_id"],
                title,
                content,
                now,
            )
            await conn.execute(
                "UPDATE articles SET current_rev = $1, updated_at = $2 WHERE article_id = $3",
                revision_row["revision_id"],
                now,
                article_id,
            )

        after = await capture_pg_stat(conn)
        artifact = await write_artifact(before + "\n\n" + after, "pgstat_article_edit", "csv")
        await insert_experiment(
            conn,
            "article_edit",
            {"article_id": article_id, "user_id": user["user_id"]},
            None,
            artifact,
        )

    return {"status": "ok"}


@app.post("/api/articles/{article_id}/view")
async def record_view(
    article_id: int,
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO article_views (article_id, viewer_id, viewed_at) VALUES ($1, $2, NOW())",
            article_id,
            user["user_id"],
        )
    return {"status": "ok"}


@app.post("/api/articles/{article_id}/comments")
async def add_comment(
    article_id: int,
    payload: CommentCreate,
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO comments (article_id, user_id, content, created_at, is_flagged) VALUES ($1, $2, $3, $4, false)",
            article_id,
            user["user_id"],
            payload.content,
            utcnow(),
        )
    return {"status": "ok"}


@app.delete("/api/comments/{comment_id}")
async def delete_comment(
    comment_id: int,
    user: Dict[str, Any] = Depends(require_roles(ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM comments WHERE comment_id = $1", comment_id)
    return {"status": "ok"}


@app.get("/api/search")
async def search_articles(
    q: str,
    limit: int = Query(20, ge=1, le=100),
    user: Dict[str, Any] = Depends(require_roles(ROLE_AUTHOR, ROLE_EDITOR, ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    sql = (
        "SELECT a.article_id, a.title, a.published_at, a.author_id "
        "FROM articles a WHERE a.title ILIKE $1 ORDER BY a.published_at DESC LIMIT $2"
    )
    params = [f"%{q}%", limit]
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
        explain_info = await run_explain(
            conn,
            sql,
            params,
            "search",
            {"q": q, "limit": limit},
        )
    response = {"rows": [dict(r) for r in rows], "explain_artifact": explain_info["artifact"]}
    if user["role"] == ROLE_ADMIN:
        response["explain_text"] = explain_info["explain_text"]
    return response


@app.post("/api/admin/bulk_unpublish")
async def bulk_unpublish(
    payload: BulkUnpublishRequest,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    cutoff = utcnow() - timedelta(days=payload.older_than_days)
    async with pool.acquire() as conn:
        before = await capture_pg_stat(conn)
        result = await conn.execute(
            """
            UPDATE articles
            SET status = 'archived'
            WHERE category_id = $1 AND published_at < $2
            """,
            payload.category_id,
            cutoff,
        )
        after = await capture_pg_stat(conn)
        vacuum_output = run_vacuum_psql("articles")
        artifact_text = "-- pg_stat_before --\n" + before + "\n\n-- pg_stat_after --\n" + after + "\n\n-- vacuum --\n" + vacuum_output
        artifact = await write_artifact(artifact_text, "bulk_unpublish")
        exp_id = await insert_experiment(
            conn,
            "bulk_unpublish",
            {"category_id": payload.category_id, "older_than_days": payload.older_than_days},
            None,
            artifact,
        )
    return {"status": "ok", "result": result, "artifact": artifact, "experiment_id": exp_id}


@app.post("/api/admin/drop_index")
async def drop_index(
    payload: IndexRequest,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    sql = payload.index_sql.strip()
    if not sql.lower().startswith("drop index"):
        raise HTTPException(status_code=400, detail="Only DROP INDEX is allowed")
    async with pool.acquire() as conn:
        before = await conn.fetchval("SELECT pg_total_relation_size('articles')")
        await conn.execute(sql)
        after = await conn.fetchval("SELECT pg_total_relation_size('articles')")
        artifact = await write_artifact(
            f"before_size={before}\nafter_size={after}",
            "drop_index",
        )
        exp_id = await insert_experiment(
            conn,
            "drop_index",
            {"sql": sql},
            None,
            artifact,
        )
    return {"status": "ok", "artifact": artifact, "experiment_id": exp_id}


@app.post("/api/admin/create_index")
async def create_index(
    payload: IndexRequest,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    sql = payload.index_sql.strip()
    if not sql.lower().startswith("create index"):
        raise HTTPException(status_code=400, detail="Only CREATE INDEX is allowed")
    async with pool.acquire() as conn:
        before = await conn.fetchval("SELECT pg_total_relation_size('articles')")
        await conn.execute(sql)
        after = await conn.fetchval("SELECT pg_total_relation_size('articles')")
        artifact = await write_artifact(
            f"before_size={before}\nafter_size={after}",
            "create_index",
        )
        exp_id = await insert_experiment(
            conn,
            "create_index",
            {"sql": sql},
            None,
            artifact,
        )
    return {"status": "ok", "artifact": artifact, "experiment_id": exp_id}


@app.post("/api/admin/run_explain")
async def run_explain_custom(
    payload: ExplainRequest,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    if not only_select_sql(payload.sql):
        raise HTTPException(status_code=400, detail="Only SELECT statements are allowed")
    async with pool.acquire() as conn:
        explain_info = await run_explain(
            conn,
            payload.sql,
            [],
            payload.label,
            {"label": payload.label},
        )
    return {
        "status": "ok",
        "artifact": explain_info["artifact"],
        "experiment_id": explain_info["id"],
        "explain_text": explain_info["explain_text"],
    }


@app.post("/api/admin/run_vacuum")
async def run_vacuum(
    payload: VacuumRequest,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    table = payload.table
    vacuum_output = run_vacuum_psql(table)
    async with pool.acquire() as conn:
        artifact = await write_artifact(vacuum_output, f"vacuum_{table}")
        exp_id = await insert_experiment(
            conn,
            "vacuum",
            {"table": table},
            None,
            artifact,
        )
    return {"status": "ok", "artifact": artifact, "experiment_id": exp_id}


async def load_test_job(target: str, concurrency: int, ops: int, pool: asyncpg.pool.Pool) -> None:
    start = utcnow()
    errors = 0
    async with pool.acquire() as conn:
        bounds = await conn.fetchrow("SELECT MIN(article_id) AS min_id, MAX(article_id) AS max_id FROM articles")
        user_bounds = await conn.fetchrow("SELECT MIN(user_id) AS min_id FROM users")
    min_id = bounds["min_id"] or 1
    max_id = bounds["max_id"] or 1
    viewer_id = user_bounds["min_id"] or 1

    sem = asyncio.Semaphore(concurrency)

    async def insert_one(i: int) -> None:
        nonlocal errors
        async with sem:
            try:
                article_id = min_id + (i % max(1, (max_id - min_id + 1)))
                async with pool.acquire() as conn:
                    await conn.execute(
                        "INSERT INTO article_views (article_id, viewer_id, viewed_at) VALUES ($1, $2, $3)",
                        article_id,
                        viewer_id,
                        utcnow(),
                    )
            except Exception:
                errors += 1

    await asyncio.gather(*[insert_one(i) for i in range(ops)])
    end = utcnow()
    duration = (end - start).total_seconds()
    tps = ops / duration if duration > 0 else 0
    result = {
        "target": target,
        "concurrency": concurrency,
        "ops": ops,
        "duration_sec": duration,
        "tps": tps,
        "errors": errors,
        "started_at": start.isoformat(),
        "ended_at": end.isoformat(),
    }
    async with pool.acquire() as conn:
        artifact = await write_artifact(json.dumps(result, indent=2), "load_test", "json")
        await insert_experiment(conn, "load_test", result, None, artifact)


@app.post("/api/admin/run_load_test")
async def run_load_test(
    payload: LoadTestRequest,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    background_tasks.add_task(load_test_job, payload.target, payload.concurrency, payload.ops, pool)
    return {"status": "queued"}


@app.get("/api/metrics/latest")
async def metrics_latest(
    operation: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
    pool: asyncpg.pool.Pool = Depends(get_pool),
) -> Dict[str, Any]:
    async with pool.acquire() as conn:
        if operation:
            rows = await conn.fetch(
                "SELECT * FROM experiment_results WHERE operation = $1 ORDER BY created_at DESC LIMIT $2",
                operation,
                limit,
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM experiment_results ORDER BY created_at DESC LIMIT $1",
                limit,
            )
    return {"rows": [dict(r) for r in rows]}


@app.get("/api/metrics/artifact/{filename}")
async def get_artifact(
    filename: str,
    user: Dict[str, Any] = Depends(require_roles(ROLE_ADMIN)),
) -> FileResponse:
    path = os.path.join(ARTIFACT_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path, filename=filename)
