import logging
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect

from .config import CORS_ORIGINS, MAX_JSON_BODY, MAX_UPLOAD_MB, RATE_LIMIT_PER_MIN, STATIC_DIR
from .database import Base, SessionLocal, engine
from .models import DownloadTask
from .routes import downloads, misc, playlists, videos
from . import downloader

# httpx logs full request URLs at INFO; keep them (and any keys/tokens in them) out of logs.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

Base.metadata.create_all(engine)
if "channel_id" not in {column["name"] for column in inspect(engine).get_columns("subscriptions")}:
    with engine.begin() as connection:
        connection.exec_driver_sql("ALTER TABLE subscriptions ADD COLUMN channel_id VARCHAR(60)")
with engine.begin() as connection:
    connection.exec_driver_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_subscriptions_channel_id ON subscriptions (channel_id)")
with SessionLocal() as _db:       # downloads that were running when the app closed become resumable
    _db.query(DownloadTask).filter(DownloadTask.status.in_(("queued", "downloading"))).update(
        {"status": "paused"}, synchronize_session=False)
    _db.commit()

app = FastAPI(title="YT Manager API", version="1.0.0", docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["Content-Type", "X-YTM-Token"])

_hits: dict[str, deque] = defaultdict(deque)


@app.middleware("http")
async def limits(request: Request, call_next):
    # simple sliding-window rate limit
    ip = request.client.host if request.client else "?"
    now, q = time.monotonic(), _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= RATE_LIMIT_PER_MIN:
        return JSONResponse({"detail": "Too many requests. Slow down."}, status_code=429)
    q.append(now)
    # request size limit
    cap = MAX_UPLOAD_MB * 1048576 + 65536 if request.url.path.endswith("/downloads/upload") else MAX_JSON_BODY
    if int(request.headers.get("content-length") or 0) > cap:
        return JSONResponse({"detail": "Request body too large"}, status_code=413)
    try:
        resp = await call_next(request)
    except Exception:
        logging.getLogger("ytm").exception("Unhandled error")
        return JSONResponse({"detail": "Internal error"}, status_code=500)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.on_event("startup")
async def startup_event():
    import asyncio
    downloader.set_main_loop(asyncio.get_running_loop())


for r in (videos.router, playlists.router, downloads.router, misc.router):
    app.include_router(r)

if STATIC_DIR and Path(STATIC_DIR).is_dir():          # packaged desktop build: backend also serves the UI
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="ui")
