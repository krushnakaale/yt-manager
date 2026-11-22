"""Authorized direct-file download manager.
Features: concurrency limit, progress + speed, pause/resume (HTTP Range), cancel, SSRF re-check on
every redirect, size and time limits, SHA-256 on completion, risky-extension warnings."""
import asyncio
import hashlib
import logging
from pathlib import Path

import httpx

from .config import DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_DOWNLOAD_MB, MAX_DOWNLOAD_SECONDS, YT_API_KEY
from .database import SessionLocal, get_setting, utcnow
from .models import DownloadTask
from .security import (RISKY_EXT, assert_public_url, is_youtube_url, parse_youtube_url,
                        safe_filename, unique_path)
from .youtube import fetch_metadata

log = logging.getLogger("ytm.downloader")
live: dict[int, dict] = {}          # task_id -> {"job": asyncio.Task, "speed": float, "reason": str|None}
_sem: asyncio.Semaphore | None = None


class DownloadError(Exception):
    pass


_main_loop: asyncio.AbstractEventLoop | None = None


def set_main_loop(loop: asyncio.AbstractEventLoop):
    global _main_loop
    _main_loop = loop


def _semaphore() -> asyncio.Semaphore:
    global _sem
    if _sem is None:
        db = SessionLocal()
        try:
            n = int(get_setting(db, "max_concurrent", DEFAULT_MAX_CONCURRENT))
        finally:
            db.close()
        _sem = asyncio.Semaphore(n)
    return _sem


def reset_semaphore():
    """Called after the concurrency setting changes (applies to newly started jobs)."""
    global _sem
    _sem = None


def speed_of(task_id: int) -> float:
    return live.get(task_id, {}).get("speed", 0.0)


def start(task_id: int):
    global _main_loop
    loop = None
    try:
        loop = asyncio.get_running_loop()
        _main_loop = loop
    except RuntimeError:
        loop = _main_loop

    if loop and loop.is_running():
        try:
            if asyncio.get_running_loop() is loop:
                live[task_id] = {"job": loop.create_task(_run(task_id)), "speed": 0.0, "reason": None}
                return
        except RuntimeError:
            pass

        def _schedule():
            live[task_id] = {"job": loop.create_task(_run(task_id)), "speed": 0.0, "reason": None}
        loop.call_soon_threadsafe(_schedule)
    else:
        log.error(f"Cannot start download task {task_id}: no running event loop")


def stop(task_id: int, reason: str) -> bool:
    j = live.get(task_id)
    if not j:
        return False
    j["reason"] = reason
    j["job"].cancel()
    return True


def part_path(t: DownloadTask) -> Path:
    return Path(t.destination + ".part")


async def _run(task_id: int):
    db = SessionLocal()
    try:
        async with _semaphore():
            t = db.get(DownloadTask, task_id)
            if not t or t.status != "queued":
                return
            t.status, t.error = "downloading", ""
            db.commit()
            if is_youtube_url(t.source_url):
                await _download_youtube(db, t)
            else:
                await _transfer(db, t)
    except asyncio.CancelledError:
        t = db.get(DownloadTask, task_id)
        if t:
            if live.get(task_id, {}).get("reason") == "pause":
                t.status = "paused"
            else:
                t.status = "cancelled"
                part_path(t).unlink(missing_ok=True)
                dest_p = Path(t.destination)
                for f in dest_p.parent.glob(f"{dest_p.stem}*.part"):
                    f.unlink(missing_ok=True)
                for f in dest_p.parent.glob(f"{dest_p.stem}*.ytdl"):
                    f.unlink(missing_ok=True)
            db.commit()
    except (DownloadError, ValueError) as e:
        _fail(db, task_id, str(e))
    except httpx.HTTPError as e:
        _fail(db, task_id, f"Network error: {type(e).__name__}")
    except OSError as e:
        _fail(db, task_id, f"File error: {e.strerror or type(e).__name__}")
    except Exception as e:
        log.exception("Unexpected download failure")
        _fail(db, task_id, f"Download error: {str(e)[:400]}")
    finally:
        live.pop(task_id, None)
        db.close()


async def _download_youtube(db, t: DownloadTask):
    loop = asyncio.get_running_loop()
    last_commit = [loop.time()]
    cancelled = [False]

    # If the filename was generic (like "watch" or "download"), update with actual YouTube metadata
    if is_youtube_url(t.source_url) and (Path(t.filename).stem.lower() in ("watch", "download", "") or not Path(t.filename).suffix):
        try:
            canonical, vid = parse_youtube_url(t.source_url)
            api_key = get_setting(db, "yt_api_key", "") or YT_API_KEY
            meta = await fetch_metadata(vid, canonical, api_key)
            if meta.get("title"):
                new_dest = unique_path(Path(t.destination).parent, safe_filename(meta["title"]) + ".mp4")
                t.filename = new_dest.name
                t.destination = str(new_dest)
                db.commit()
        except Exception:
            pass

    def hook(d):
        if live.get(t.id, {}).get("reason") in ("cancel", "pause"):
            cancelled[0] = True
            raise DownloadError("Download stopped by user")

        status = d.get("status")
        if status == "downloading":
            dl = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            spd = d.get("speed") or 0.0
            live.setdefault(t.id, {})["speed"] = spd
            now = loop.time()
            if now - last_commit[0] >= 0.5:
                t.bytes_received = dl
                if total:
                    t.total_bytes = total
                try:
                    db.commit()
                except Exception:
                    pass
                last_commit[0] = now
        elif status == "finished":
            dl = d.get("downloaded_bytes") or 0
            total = d.get("total_bytes") or dl or 0
            if total:
                t.bytes_received = total
                t.total_bytes = total
            try:
                db.commit()
            except Exception:
                pass

    folder = Path(t.destination).parent
    dest_stem = Path(t.filename).stem
    if dest_stem.lower() in ("watch", "download", ""):
        dest_stem = f"video_{t.id}"

    try:
        import imageio_ffmpeg
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ffmpeg_exe = None

    canonical_url = t.source_url
    try:
        canonical_url, _ = parse_youtube_url(t.source_url)
    except Exception:
        pass

    is_audio = Path(t.filename).suffix.lower() == ".mp3" or t.destination.lower().endswith(".mp3")

    quality = (getattr(t, "quality", "best") or "best").lower().strip()

    ydl_opts = {
        "outtmpl": str(folder / f"{dest_stem}.%(ext)s"),
        "progress_hooks": [hook],
        "quiet": True,
        "no_warnings": True,
        "overwrites": True,
        "noplaylist": True,
        "js_runtimes": {"node": {}},
    }
    if is_audio:
        kbps = quality.replace("k", "").replace("kbps", "")
        if kbps not in ("320", "256", "192", "128", "96", "64"):
            kbps = "192"
        ydl_opts["format"] = "bestaudio/best"
        ydl_opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": kbps,
        }]
    else:
        if quality == "1080p":
            ydl_opts["format"] = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best"
        elif quality == "720p":
            ydl_opts["format"] = "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]/best"
        elif quality == "480p":
            ydl_opts["format"] = "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]/best"
        elif quality == "360p":
            ydl_opts["format"] = "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]/best"
        else:
            ydl_opts["format"] = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"

    if ffmpeg_exe:
        ydl_opts["ffmpeg_location"] = ffmpeg_exe

    def run_ydl():
        import yt_dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(canonical_url, download=True)
            real_file = ydl.prepare_filename(info)
            if is_audio:
                target_mp3 = str(Path(real_file).with_suffix(".mp3"))
                if Path(target_mp3).exists():
                    return target_mp3
                candidate = str(folder / f"{dest_stem}.mp3")
                if Path(candidate).exists():
                    return candidate
            ext = info.get("ext", "mp4")
            candidate = str(Path(real_file).with_suffix(f".{ext}"))
            if Path(candidate).exists():
                return candidate
            if Path(real_file).exists():
                return real_file
            for p in folder.glob(f"{dest_stem}.*"):
                if not p.name.endswith(".part") and not p.name.endswith(".ytdl"):
                    return str(p)
            return real_file

    try:
        final_file = await asyncio.to_thread(run_ydl)
    except DownloadError:
        if live.get(t.id, {}).get("reason") in ("cancel", "pause"):
            raise asyncio.CancelledError()
        raise
    except Exception as e:
        if cancelled[0] or live.get(t.id, {}).get("reason") in ("cancel", "pause"):
            raise asyncio.CancelledError()
        raise DownloadError(f"YouTube download failed: {str(e)[:300]}")

    final_path = Path(final_file)
    if not final_path.exists():
        raise DownloadError("Downloaded file could not be found on disk")

    t.destination = str(final_path)
    t.filename = final_path.name
    size = final_path.stat().st_size
    t.bytes_received = t.total_bytes = size
    digest = await asyncio.to_thread(_sha256, final_path)
    t.sha256 = digest
    t.status = "completed"
    t.completed_at = utcnow()
    db.commit()


def _fail(db, task_id: int, msg: str):
    t = db.get(DownloadTask, task_id)
    if t:
        t.status, t.error = "failed", msg[:480]
        db.commit()


async def _open_stream(client: httpx.AsyncClient, url: str, resume_from: int) -> httpx.Response:
    for _ in range(6):                                   # at most 5 redirects, each re-validated
        await asyncio.to_thread(assert_public_url, url)
        headers = {"Range": f"bytes={resume_from}-"} if resume_from else {}
        resp = await client.send(client.build_request("GET", url, headers=headers), stream=True)
        if resp.is_redirect:
            loc = resp.headers.get("location")
            await resp.aclose()
            if not loc:
                raise DownloadError("Redirect without a target")
            url = str(httpx.URL(url).join(loc))
            continue
        return resp
    raise DownloadError("Too many redirects")


async def _transfer(db, t: DownloadTask):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + MAX_DOWNLOAD_SECONDS
    max_bytes = int(get_setting(db, "max_download_mb", DEFAULT_MAX_DOWNLOAD_MB)) * 1024 * 1024
    part = part_path(t)
    resume_from = part.stat().st_size if part.exists() else 0

    timeout = httpx.Timeout(30.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "YTManager/1.0"}) as client:
        resp = await _open_stream(client, t.source_url, resume_from)
        try:
            if resp.status_code == 416:
                part.unlink(missing_ok=True)
                raise DownloadError("Saved partial file no longer matches the server. Press Resume to restart.")
            if resp.status_code not in (200, 206):
                raise DownloadError(f"Server answered with HTTP {resp.status_code}")
            if "text/html" in resp.headers.get("content-type", "").lower():
                raise DownloadError("This link opens a web page, not a downloadable file")

            if resp.status_code == 206 and resume_from and \
                    not resp.headers.get("content-range", "").startswith(f"bytes {resume_from}-"):
                part.unlink(missing_ok=True)
                raise DownloadError("Server resumed from a different position. Press Resume to restart.")
            mode = "ab" if resp.status_code == 206 else "wb"      # 200 = server ignored Range -> restart
            received = resume_from if mode == "ab" else 0

            length = int(resp.headers.get("content-length") or 0)
            total = received + length if length else 0
            if total and total > max_bytes:
                raise DownloadError(f"File is larger than the {max_bytes // 1048576} MB limit")
            t.total_bytes, t.bytes_received = total, received
            if Path(t.filename).suffix.lower() in RISKY_EXT:
                t.warning = "Executable or script file type. Only open it if you trust the source."
            db.commit()

            last_t, last_b, last_commit = loop.time(), received, loop.time()
            with open(part, mode) as f:
                async for chunk in resp.aiter_bytes(65536):
                    received += len(chunk)
                    if received > max_bytes:
                        raise DownloadError("Download exceeded the size limit and was stopped")
                    if loop.time() > deadline:
                        raise DownloadError("Download exceeded the time limit")
                    f.write(chunk)
                    now = loop.time()
                    if now - last_commit >= 0.5:
                        live[t.id]["speed"] = (received - last_b) / max(now - last_t, 0.001)
                        last_t, last_b, last_commit = now, received, now
                        t.bytes_received = received
                        db.commit()
            if total and received != total:
                raise DownloadError("Connection closed early. Press Resume to continue.")
        finally:
            await resp.aclose()

    digest = await asyncio.to_thread(_sha256, part)
    Path(t.destination).unlink(missing_ok=True)
    part.replace(t.destination)
    t.bytes_received = t.total_bytes = received
    t.sha256, t.status, t.completed_at = digest, "completed", utcnow()
    db.commit()


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()
