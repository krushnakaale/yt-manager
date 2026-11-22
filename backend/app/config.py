"""Central configuration. Everything sensitive comes from environment variables."""
import os
from pathlib import Path

DATA_DIR = Path(os.getenv("YTM_DATA_DIR", Path.home() / ".ytmanager")).expanduser()
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_DOWNLOAD_DIR = Path(
    os.getenv("YTM_DOWNLOAD_DIR", Path.home() / "YTManager" / "Downloads")
).expanduser()

DB_URL = f"sqlite:///{(DATA_DIR / 'ytmanager.db').as_posix()}"

API_TOKEN = os.getenv("YTM_TOKEN", "")          # per-launch secret (set by Electron)
YT_API_KEY = os.getenv("YTM_YT_API_KEY", "")    # optional, never sent to the frontend
STATIC_DIR = os.getenv("YTM_STATIC_DIR", "")    # built React app (served by backend in the .exe)

CORS_ORIGINS = [o for o in os.getenv(
    "YTM_CORS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost,https://localhost,capacitor://localhost",
).split(",") if o]

DEFAULT_MAX_DOWNLOAD_MB = 2048
DEFAULT_MAX_CONCURRENT = 2
MAX_DOWNLOAD_SECONDS = 60 * 60 * 3
MAX_UPLOAD_MB = 500
MAX_JSON_BODY = 5 * 1024 * 1024
RATE_LIMIT_PER_MIN = 600
ALLOWED_PORTS = {80, 443, 8080, 8443}
