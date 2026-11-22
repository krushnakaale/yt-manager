from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import downloader
from ..config import DEFAULT_DOWNLOAD_DIR, MAX_UPLOAD_MB, YT_API_KEY
from ..database import SessionLocal, get_db, get_setting, utcnow
from ..models import DownloadTask
from ..schemas import DownloadIn
from ..security import (RISKY_EXT, assert_public_url, filename_from_url, is_inside, is_youtube_url,
                        parse_youtube_url, require_token, safe_filename, unique_path, validate_download_folder)
from ..youtube import fetch_metadata

router = APIRouter(prefix="/api/downloads", dependencies=[Depends(require_token)], tags=["downloads"])
FINISHED = ("completed", "failed", "cancelled")


def download_folder(db) -> Path:
    return validate_download_folder(get_setting(db, "download_folder", str(DEFAULT_DOWNLOAD_DIR)))


def _task(db, tid) -> DownloadTask:
    t = db.get(DownloadTask, tid)
    if not t:
        raise HTTPException(404, "Download not found")
    return t


def _out(t):
    return t.to_dict(speed=downloader.speed_of(t.id))


@router.get("")
def list_tasks(status: str = "", db: Session = Depends(get_db)):
    qs = db.query(DownloadTask)
    if status == "active":
        qs = qs.filter(DownloadTask.status.in_(("queued", "downloading", "paused")))
    elif status == "finished":
        qs = qs.filter(DownloadTask.status.in_(FINISHED))
    elif status:
        qs = qs.filter(DownloadTask.status == status)
    return [_out(t) for t in qs.order_by(DownloadTask.id.desc()).limit(500)]


def extract_playlist_items(url: str, start: int = 1, end: int | None = None) -> tuple[str, int, list[dict]]:
    import yt_dlp
    ydl_opts = {
        "extract_flat": "in_playlist",
        "quiet": True,
        "no_warnings": True,
        "js_runtimes": {"node": {}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        title = info.get("title") or "Playlist"
        entries = list(info.get("entries", []))
        total = len(entries)
        s_idx = max(0, (start or 1) - 1)
        e_idx = end if (end is not None and end >= (start or 1)) else total
        selected = entries[s_idx:e_idx]
        items = [{"id": e.get("id"), "title": e.get("title") or f"Video {e.get('id')}", "url": f"https://www.youtube.com/watch?v={e.get('id')}"}
                 for e in selected if e.get("id")]
        return title, total, items


def resolve_folder(custom_path: str | None, db) -> Path:
    if custom_path and custom_path.strip():
        p = Path(custom_path.strip()).expanduser()
        p.mkdir(parents=True, exist_ok=True)
        return p
    return download_folder(db)


@router.get("/playlist-info")
async def get_playlist_info(url: str):
    import asyncio
    try:
        title, total, _ = await asyncio.to_thread(extract_playlist_items, url.strip(), 1, 1)
        return {"title": title, "total": total}
    except Exception as e:
        raise HTTPException(400, f"Could not load playlist info: {str(e)[:200]}")


@router.post("", status_code=201)
async def create(body: DownloadIn, db: Session = Depends(get_db)):
    url = body.url.strip()
    try:
        await downloader_asserts(url)
        folder = resolve_folder(body.custom_path, db)
    except ValueError as e:
        raise HTTPException(400, str(e))

    fmt = (body.format or "video").lower()
    is_audio = fmt in ("audio", "music", "mp3")
    ext = ".mp3" if is_audio else ".mp4"
    quality = (body.quality or ("192k" if is_audio else "best")).strip()

    # Playlist download
    is_pl_url = "list=" in url.lower() or "playlist" in url.lower()
    if body.is_playlist or (is_pl_url and (body.playlist_start or body.playlist_end)):
        import asyncio
        start_num = body.playlist_start or 1
        end_num = body.playlist_end
        try:
            pl_title, total, items = await asyncio.to_thread(extract_playlist_items, url, start_num, end_num)
        except Exception as e:
            raise HTTPException(400, f"Playlist extraction failed: {str(e)[:300]}")

        if not items:
            raise HTTPException(400, f"No items found in playlist range {start_num} to {end_num or total}")

        created = []
        for it in items:
            it_name = safe_filename(it["title"]) + ext
            dest = unique_path(folder, it_name)
            t = DownloadTask(source_url=it["url"], filename=dest.name, destination=str(dest),
                             status="queued", quality=quality)
            db.add(t)
            created.append(t)
        db.commit()
        for t in created:
            downloader.start(t.id)
        return {"playlist": pl_title, "queued": len(created), "items": [_out(t) for t in created]}

    # Single download
    if is_youtube_url(url):
        try:
            canonical, vid = parse_youtube_url(url)
            url = canonical
            if body.filename:
                base_name = safe_filename(body.filename)
                if not base_name.lower().endswith(ext):
                    base_name = Path(base_name).stem + ext
            else:
                api_key = get_setting(db, "yt_api_key", "") or YT_API_KEY
                meta = await fetch_metadata(vid, canonical, api_key)
                title = meta.get("title") or f"YouTube_{vid}"
                base_name = safe_filename(title) + ext
            dest = unique_path(folder, base_name)
        except Exception:
            name = safe_filename(body.filename) if body.filename else filename_from_url(url)
            dest = unique_path(folder, name)
    else:
        name = safe_filename(body.filename) if body.filename else filename_from_url(url)
        dest = unique_path(folder, name)

    t = DownloadTask(source_url=url, filename=dest.name, destination=str(dest), status="queued", quality=quality)
    if dest.suffix.lower() in RISKY_EXT:
        t.warning = "Executable or script file type. Only open it if you trust the source."
    db.add(t)
    db.commit()
    downloader.start(t.id)
    return _out(t)


async def downloader_asserts(url: str):
    import asyncio
    await asyncio.to_thread(assert_public_url, url)


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bring a file you already own into the managed folder."""
    try:
        folder = download_folder(db)
    except ValueError as e:
        raise HTTPException(400, str(e))
    dest = unique_path(folder, safe_filename(file.filename))
    limit, size = MAX_UPLOAD_MB * 1048576, 0
    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(1 << 20):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"File is larger than {MAX_UPLOAD_MB} MB")
                f.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    t = DownloadTask(source_url="local-file", filename=dest.name, destination=str(dest), status="completed",
                     bytes_received=size, total_bytes=size, completed_at=utcnow(),
                     sha256=downloader._sha256(dest))
    if dest.suffix.lower() in RISKY_EXT:
        t.warning = "Executable or script file type. Only open it if you trust the source."
    db.add(t)
    db.commit()
    return _out(t)


@router.post("/{tid}/pause")
async def pause(tid: int, db: Session = Depends(get_db)):
    t = _task(db, tid)
    if t.status not in ("queued", "downloading") or not downloader.stop(tid, "pause"):
        raise HTTPException(409, "Only running downloads can be paused")
    return {"ok": True}


@router.post("/{tid}/resume")
async def resume(tid: int, db: Session = Depends(get_db)):
    t = _task(db, tid)
    if t.status not in ("paused", "failed") or tid in downloader.live:
        raise HTTPException(409, "This download cannot be resumed")
    t.status, t.error = "queued", ""
    db.commit()
    downloader.start(tid)
    return _out(t)


@router.post("/{tid}/cancel")
async def cancel(tid: int, db: Session = Depends(get_db)):
    t = _task(db, tid)
    if t.status in ("completed", "cancelled"):
        raise HTTPException(409, "Nothing to cancel")
    if not downloader.stop(tid, "cancel"):
        t.status = "cancelled"
        downloader.part_path(t).unlink(missing_ok=True)
        db.commit()
    return {"ok": True}


@router.get("/{tid}/file")
def get_file(tid: int, db: Session = Depends(get_db)):
    """Lets the Android app copy a finished file from the server to the phone."""
    t = _task(db, tid)
    p = Path(t.destination)
    if t.status != "completed" or not p.exists() or not is_inside(p, download_folder(db)):
        raise HTTPException(404, "File is not available")
    return FileResponse(p, filename=t.filename)


@router.delete("/finished", status_code=204)
def clear_history(db: Session = Depends(get_db)):
    db.query(DownloadTask).filter(DownloadTask.status.in_(FINISHED)).delete(synchronize_session=False)
    db.commit()


@router.delete("/{tid}", status_code=204)
def delete_record(tid: int, db: Session = Depends(get_db)):
    t = _task(db, tid)
    if t.status in ("queued", "downloading"):
        raise HTTPException(409, "Cancel the download first")
    downloader.part_path(t).unlink(missing_ok=True)
    db.delete(t)
    db.commit()


@router.delete("/{tid}/file")
def delete_file(tid: int, confirm: bool = False, db: Session = Depends(get_db)):
    if not confirm:
        raise HTTPException(400, "Deleting a file requires confirm=true")
    t = _task(db, tid)
    p = Path(t.destination)
    if not is_inside(p, download_folder(db)):
        raise HTTPException(403, "File is outside the managed download folder")
    p.unlink(missing_ok=True)
    return {"ok": True}
