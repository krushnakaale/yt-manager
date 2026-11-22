"""Validation helpers: URL parsing, SSRF protection, safe filenames and paths."""
import ipaddress
import re
import secrets
import socket
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from fastapi import Header, HTTPException

from .config import ALLOWED_PORTS, API_TOKEN

# ---------------------------------------------------------------- API token
def require_token(x_ytm_token: str = Header(default="")):
    """Per-launch secret: only the Electron shell (or a configured Android client) knows it."""
    if API_TOKEN and not secrets.compare_digest(x_ytm_token, API_TOKEN):
        raise HTTPException(401, "Invalid or missing API token")


# ---------------------------------------------------------------- YouTube URLs
YT_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def parse_youtube_url(raw: str) -> tuple[str, str]:
    """Return (canonical_url, video_id) or raise ValueError."""
    raw = (raw or "").strip()
    u = urlparse(raw if "://" in raw else "https://" + raw)
    host = (u.hostname or "").lower()
    if u.scheme not in ("http", "https") or host not in YT_HOSTS:
        raise ValueError("Only youtube.com and youtu.be links are supported")
    vid = None
    parts = [p for p in u.path.split("/") if p]
    if host == "youtu.be" and parts:
        vid = parts[0]
    elif parts and parts[0] in ("embed", "shorts", "live", "v") and len(parts) > 1:
        vid = parts[1]
    elif parts and parts[0] == "watch":
        vid = (parse_qs(u.query).get("v") or [None])[0]
    if not vid or not _ID.match(vid):
        raise ValueError("Could not find a valid video ID in this link")
    return f"https://www.youtube.com/watch?v={vid}", vid


def is_youtube_url(raw: str) -> bool:
    try:
        parse_youtube_url(raw)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------- SSRF guard
def _ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def assert_public_url(url: str) -> str:
    """Block non-http(s), credentials, odd ports and any host resolving to a non-public address.
    Called for the initial URL AND for every redirect hop."""
    u = urlparse(url)
    if u.scheme not in ("http", "https"):
        raise ValueError("Only http:// and https:// URLs are allowed")
    if u.username or u.password:
        raise ValueError("URLs containing credentials are not allowed")
    host = u.hostname
    if not host:
        raise ValueError("URL has no host")
    port = u.port or (443 if u.scheme == "https" else 80)
    if port not in ALLOWED_PORTS:
        raise ValueError(f"Port {port} is not allowed")
    try:
        literal = ipaddress.ip_address(host)
        addrs = [literal]
    except ValueError:
        try:
            infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except socket.gaierror:
            raise ValueError("Host name could not be resolved")
        addrs = [ipaddress.ip_address(i[4][0]) for i in infos]
    if not addrs or not all(_ip_is_public(a) for a in addrs):
        raise ValueError("Address is private, local or reserved and is blocked")
    return url


# ---------------------------------------------------------------- files & paths
_WIN_RESERVED = {"con", "prn", "aux", "nul", *(f"com{i}" for i in range(1, 10)), *(f"lpt{i}" for i in range(1, 10))}
RISKY_EXT = {".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".ps1", ".vbs", ".js", ".jar",
             ".apk", ".dll", ".sh", ".lnk", ".reg", ".hta"}


def safe_filename(name: str | None, fallback: str = "download") -> str:
    name = unquote(name or "").replace("\\", "/").split("/")[-1]
    name = re.sub(r"[^\w.\-() \[\]]", "_", name, flags=re.UNICODE).strip(" .")
    name = name[:120]
    if not name or name.split(".")[0].lower() in _WIN_RESERVED:
        name = fallback if not name else "_" + name
    return name


def filename_from_url(url: str) -> str:
    return safe_filename(Path(unquote(urlparse(url).path)).name)


def unique_path(folder: Path, filename: str) -> Path:
    p = folder / filename
    n = 1
    while p.exists() or Path(str(p) + ".part").exists():
        p = folder / f"{Path(filename).stem} ({n}){Path(filename).suffix}"
        n += 1
    return p


def is_inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


_BLOCKED_DIRS = ["/etc", "/bin", "/sbin", "/usr", "/boot", "/proc", "/sys", "/dev", "/system", "/var/lib",
                 "c:\\windows", "c:\\program files", "c:\\program files (x86)", "c:\\programdata"]


def validate_download_folder(raw: str) -> Path:
    """The folder must be absolute, creatable/writable and not a system location."""
    p = Path(raw).expanduser()
    if not p.is_absolute():
        raise ValueError("Download folder must be an absolute path")
    p = p.resolve()
    if p.parent == p:
        raise ValueError("Choose a folder, not a drive root")
    low = str(p).lower().replace("/", "\\") if ":" in str(p) else str(p).lower()
    for b in _BLOCKED_DIRS:
        if low == b or low.startswith(b.rstrip("\\/") + ("\\" if "\\" in b else "/")):
            raise ValueError("That is a protected system folder")
    p.mkdir(parents=True, exist_ok=True)
    probe = p / ".ytm_write_test"
    try:
        probe.write_text("ok")
        probe.unlink()
    except OSError:
        raise ValueError("Folder is not writable")
    return p
