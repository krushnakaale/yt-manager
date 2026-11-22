import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import downloader, youtube
from ..config import DEFAULT_DOWNLOAD_DIR, DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_DOWNLOAD_MB, YT_API_KEY
from ..database import get_db, get_setting, set_setting
from ..models import DownloadTask, Playlist, PlaylistItem, Video
from ..schemas import BackupIn, SettingsIn
from ..security import parse_youtube_url, require_token, validate_download_folder
from .videos import _api_key

router = APIRouter(prefix="/api", dependencies=[Depends(require_token)], tags=["misc"])


# ------------------------------------------------------------------ settings
def _settings(db) -> dict:
    return {
        "download_folder": get_setting(db, "download_folder", str(DEFAULT_DOWNLOAD_DIR)),
        "max_download_mb": int(get_setting(db, "max_download_mb", DEFAULT_MAX_DOWNLOAD_MB)),
        "max_concurrent": int(get_setting(db, "max_concurrent", DEFAULT_MAX_CONCURRENT)),
        "yt_api_key_set": bool(_api_key(db)),     # the key itself is never returned
    }


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return _settings(db)


@router.put("/settings")
def put_settings(body: SettingsIn, db: Session = Depends(get_db)):
    if body.download_folder is not None:
        try:
            set_setting(db, "download_folder", str(validate_download_folder(body.download_folder)))
        except ValueError as e:
            raise HTTPException(400, str(e))
    if body.max_download_mb is not None:
        set_setting(db, "max_download_mb", str(body.max_download_mb))
    if body.max_concurrent is not None:
        set_setting(db, "max_concurrent", str(body.max_concurrent))
        downloader.reset_semaphore()
    if body.yt_api_key is not None:
        set_setting(db, "yt_api_key", body.yt_api_key.strip())
    return _settings(db)


# ------------------------------------------------------------------ stats & storage
@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    counts = dict(db.query(DownloadTask.status, func.count()).group_by(DownloadTask.status).all())
    events = [{"kind": "video", "text": f"saved  {v.title}", "at": v.created_at.isoformat() + "Z"}
              for v in db.query(Video).order_by(Video.id.desc()).limit(8)]
    for t in db.query(DownloadTask).order_by(DownloadTask.id.desc()).limit(8):
        events.append({"kind": "download", "text": f"{t.status:<11}{t.filename}",
                       "at": (t.completed_at or t.created_at).isoformat() + "Z"})
    events.sort(key=lambda e: e["at"], reverse=True)
    return {
        "videos": db.query(func.count(Video.id)).scalar(),
        "favorites": db.query(func.count(Video.id)).filter(Video.favorite.is_(True)).scalar(),
        "playlists": db.query(func.count(Playlist.id)).scalar(),
        "completed": counts.get("completed", 0),
        "failed": counts.get("failed", 0),
        "active": sum(counts.get(s, 0) for s in ("queued", "downloading", "paused")),
        "recent": events[:10],
    }


@router.get("/storage")
def storage(db: Session = Depends(get_db)):
    folder = Path(_settings(db)["download_folder"])
    used = sum(t.total_bytes or 0 for t in db.query(DownloadTask).filter(DownloadTask.status == "completed")
               if Path(t.destination).exists())
    try:
        du = shutil.disk_usage(folder if folder.exists() else folder.anchor or "/")
        free, total = du.free, du.total
    except OSError:
        free = total = None
    return {"folder": str(folder), "app_used": used, "disk_free": free, "disk_total": total}


# ------------------------------------------------------------------ search
@router.get("/search")
def search_local(q: str, db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    vids = db.query(Video).filter(Video.title.ilike(like) | Video.channel_name.ilike(like) | Video.tags.ilike(like)).limit(30)
    pls = db.query(Playlist).filter(Playlist.name.ilike(like)).limit(15)
    return {"videos": [v.to_dict() for v in vids], "playlists": [p.to_dict() for p in pls]}


@router.get("/search/youtube")
async def search_youtube(q: str, db: Session = Depends(get_db)):
    key = _api_key(db)
    if not key:
        raise HTTPException(400, "Add a YouTube Data API key in Settings to search YouTube")
    try:
        return await youtube.search(q.strip()[:100], key)
    except RuntimeError as e:
        raise HTTPException(502, str(e))


# ------------------------------------------------------------------ backup / restore
@router.get("/backup")
def backup(db: Session = Depends(get_db)):
    return {
        "version": 1,
        "videos": [v.to_dict() for v in db.query(Video).order_by(Video.id)],
        "playlists": [{"name": p.name, "description": p.description,
                       "videos": [i.video.video_id for i in p.items if i.video]}
                      for p in db.query(Playlist).order_by(Playlist.id)],
    }


@router.post("/backup/restore")
def restore(body: BackupIn, db: Session = Depends(get_db)):
    added = skipped = 0
    for v in body.videos:
        try:
            canonical, vid = parse_youtube_url(str(v.get("source_url") or v.get("video_id") and
                                                   f"https://youtu.be/{v['video_id']}"))
        except ValueError:
            skipped += 1
            continue
        if db.query(Video).filter(Video.video_id == vid).first():
            skipped += 1
            continue
        tags = v.get("tags", "")
        db.add(Video(source_url=canonical, video_id=vid, title=str(v.get("title") or f"Video {vid}")[:300],
                     thumbnail_url=youtube.thumb(vid), channel_name=str(v.get("channel_name") or "")[:200],
                     category=str(v.get("category") or "General")[:60],
                     tags=",".join(tags) if isinstance(tags, list) else str(tags)[:300],
                     notes=str(v.get("notes") or "")[:2000], favorite=bool(v.get("favorite"))))
        added += 1
    db.commit()
    made = 0
    for pl in body.playlists:
        name = str(pl.get("name") or "").strip()[:100]
        if not name or db.query(Playlist).filter(Playlist.name == name).first():
            continue
        p = Playlist(name=name, description=str(pl.get("description") or "")[:300])
        db.add(p)
        db.flush()
        pos = 0
        for vid in pl.get("videos", []):
            v = db.query(Video).filter(Video.video_id == str(vid)).first()
            if v:
                db.add(PlaylistItem(playlist_id=p.id, video_id=v.id, position=pos))
                pos += 1
        made += 1
    db.commit()
    return {"videos_added": added, "videos_skipped": skipped, "playlists_created": made}
