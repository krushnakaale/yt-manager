import shutil
import re
import random
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import downloader, youtube
from ..config import DEFAULT_DOWNLOAD_DIR, DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_DOWNLOAD_MB, YT_API_KEY
from ..database import get_db, get_setting, set_setting
from ..models import DownloadTask, Playlist, PlaylistItem, Subscription, Video, WatchHistory
from ..schemas import BackupIn, SettingsIn, SubscriptionIn, WatchIn
from ..security import parse_youtube_url, require_token, validate_download_folder
from .videos import _api_key

router = APIRouter(prefix="/api", dependencies=[Depends(require_token)], tags=["misc"])


# ------------------------------------------------------------------ watch history
@router.post("/history/watch", status_code=201)
def record_watch(body: WatchIn, db: Session = Depends(get_db)):
    if get_setting(db, "track_watch_history", "true").lower() != "true":
        return {"tracked": False}
    video = db.get(Video, body.video_id) if body.video_id is not None else None
    if not video and body.youtube_video_id:
        try:
            canonical, youtube_id = parse_youtube_url(f"https://youtu.be/{body.youtube_video_id}")
        except ValueError as e:
            raise HTTPException(400, str(e))
        if youtube_id != body.youtube_video_id:
            raise HTTPException(400, "Invalid YouTube video ID")
        video = db.query(Video).filter(Video.video_id == youtube_id).first()
        if not video:
            video = Video(
                source_url=canonical,
                video_id=youtube_id,
                title=(body.title or f"Video {youtube_id}").strip()[:300],
                thumbnail_url=body.thumbnail_url or youtube.thumb(youtube_id),
                channel_name=(body.channel_name or "").strip()[:200],
                category="General",
                history_only=True,
            )
            db.add(video)
            db.flush()
    if not video:
        raise HTTPException(404, "Video not found")
    db.flush()
    history_video_id = video.id
    progress = max(0, int(body.progress_seconds))
    duration = max(0, int(body.duration_seconds))
    is_completed = body.completed or (duration > 0 and progress >= duration * 0.95)
    item = db.query(WatchHistory).filter(WatchHistory.video_id == history_video_id).first()
    if item:
        item.watched_at = datetime.utcnow()
        item.progress_seconds = progress
        item.duration_seconds = duration
        item.completed = is_completed
    else:
        item = WatchHistory(video_id=history_video_id, progress_seconds=progress,
                            duration_seconds=duration, completed=is_completed)
        db.add(item)
    db.commit()
    return {
        "watched_at": item.watched_at.isoformat() + "Z",
        "progress_seconds": item.progress_seconds or 0,
        "duration_seconds": item.duration_seconds or 0,
        "completed": bool(item.completed),
        "video": video.to_dict(),
    }


@router.get("/history/watch")
def get_watch_history(db: Session = Depends(get_db)):
    rows = db.query(WatchHistory).order_by(WatchHistory.watched_at.desc()).limit(200).all()
    return [{
        "watched_at": r.watched_at.isoformat() + "Z",
        "progress_seconds": r.progress_seconds or 0,
        "duration_seconds": r.duration_seconds or 0,
        "completed": bool(r.completed),
        "video": r.video.to_dict(),
    } for r in rows]


@router.delete("/history/watch", status_code=204)
def clear_watch_history(db: Session = Depends(get_db)):
    db.query(WatchHistory).delete()
    db.commit()


# ------------------------------------------------------------------ subscriptions
@router.get("/subscriptions")
def list_subscriptions(db: Session = Depends(get_db)):
    return [{"id": s.id, "channel_name": s.channel_name, "channel_id": s.channel_id}
            for s in db.query(Subscription).order_by(Subscription.channel_name).all()]


@router.post("/subscriptions", status_code=201)
def add_subscription(body: SubscriptionIn, db: Session = Depends(get_db)):
    channel_id = None
    if body.channel_id:
        match = re.search(
            r"(?:youtube\.com/channel/)?(UC[A-Za-z0-9_-]{22})(?:/[^?#]*)?(?:\?[^#]*)?$",
            body.channel_id.strip())
        if not match:
            raise HTTPException(400, "Enter a YouTube channel ID (UC… with 24 characters) or /channel/ URL")
        channel_id = match.group(1)

    name = (body.channel_name or channel_id or "").strip()
    if not name:
        raise HTTPException(400, "Enter a channel name or channel ID")
    existing = db.query(Subscription).filter(Subscription.channel_name == name).first()
    if existing:
        if channel_id and not existing.channel_id:
            existing.channel_id = channel_id
            db.commit()
            return {"id": existing.id, "channel_name": existing.channel_name, "channel_id": existing.channel_id}
        raise HTTPException(409, "Already subscribed")
    if channel_id and db.query(Subscription).filter(Subscription.channel_id == channel_id).first():
        raise HTTPException(409, "Already following this channel")
    sub = Subscription(channel_name=name[:200], channel_id=channel_id)
    db.add(sub)
    db.commit()
    return {"id": sub.id, "channel_name": sub.channel_name, "channel_id": sub.channel_id}


@router.delete("/subscriptions/{subscription_id}", status_code=204)
def remove_subscription(subscription_id: int, db: Session = Depends(get_db)):
    sub = db.get(Subscription, subscription_id)
    if not sub:
        raise HTTPException(404, "Subscription not found")
    db.delete(sub)
    db.commit()


# ------------------------------------------------------------------ settings
def _settings(db) -> dict:
    return {
        "download_folder": get_setting(db, "download_folder", str(DEFAULT_DOWNLOAD_DIR)),
        "max_download_mb": int(get_setting(db, "max_download_mb", DEFAULT_MAX_DOWNLOAD_MB)),
        "max_concurrent": int(get_setting(db, "max_concurrent", DEFAULT_MAX_CONCURRENT)),
        "yt_api_key_set": bool(_api_key(db)),     # the key itself is never returned
        "track_watch_history": get_setting(db, "track_watch_history", "true").lower() == "true",
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
    if body.track_watch_history is not None:
        set_setting(db, "track_watch_history", str(body.track_watch_history).lower())
    return _settings(db)


# ------------------------------------------------------------------ stats & storage
@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    counts = dict(db.query(DownloadTask.status, func.count()).group_by(DownloadTask.status).all())
    events = [{"kind": "video", "text": f"saved  {v.title}", "at": v.created_at.isoformat() + "Z"}
              for v in db.query(Video).filter(Video.history_only.is_(False)).order_by(Video.id.desc()).limit(8)]
    for t in db.query(DownloadTask).order_by(DownloadTask.id.desc()).limit(8):
        events.append({"kind": "download", "text": f"{t.status:<11}{t.filename}",
                       "at": (t.completed_at or t.created_at).isoformat() + "Z"})
    events.sort(key=lambda e: e["at"], reverse=True)
    return {
        "videos": db.query(func.count(Video.id)).filter(Video.history_only.is_(False)).scalar(),
        "favorites": db.query(func.count(Video.id)).filter(
            Video.history_only.is_(False), Video.favorite.is_(True)).scalar(),
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
    vids = db.query(Video).filter(
        Video.history_only.is_(False),
        Video.title.ilike(like) | Video.channel_name.ilike(like) | Video.tags.ilike(like),
    ).limit(30)
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


@router.get("/feed/youtube")
async def youtube_feed(mode: str = "popular", region: str = "IN", category: str = "",
                       page_token: str = "", q: str = "", refresh: bool = False,
                       db: Session = Depends(get_db)):
    if mode not in {"popular", "rss", "search"}:
        raise HTTPException(400, "Feed mode must be popular, search, or rss")
    if len(page_token) > 1024:
        raise HTTPException(400, "Invalid page token")
    if len(q) > 100:
        raise HTTPException(400, "Search term is too long")

    key = _api_key(db)
    if mode == "rss":
        channels = [{"channel_id": sub.channel_id, "channel_name": sub.channel_name}
                    for sub in db.query(Subscription).filter(Subscription.channel_id.isnot(None))
                    .order_by(Subscription.channel_name).limit(20).all()]
        if not channels:
            return {"source": "rss", "videos": [], "channels": [],
                    "next_page_token": "", "category": category, "query": ""}
        try:
            videos = await youtube.subscribed_videos(channels)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        if refresh:
            random.SystemRandom().shuffle(videos)
        return {"source": "rss", "videos": videos, "channels": channels,
                "next_page_token": "", "category": category, "query": ""}

    if not key:
        raise HTTPException(400, "Add a YouTube Data API key in Settings for YouTube popular videos and search")
    region = region.upper()
    if len(region) != 2 or not (region.isascii() and region.isalpha()):
        raise HTTPException(400, "Region must be a two-letter country code")
    if category and category not in {"10", "17", "20", "22", "23", "24", "26", "27", "28"}:
        raise HTTPException(400, "Unsupported YouTube category")
    if mode == "search" and not q.strip():
        raise HTTPException(400, "Enter a search term")
    try:
        if mode == "search":
            result = await youtube.search_page(q.strip(), region, category, key, page_token)
        else:
            result = await youtube.popular(region, category, key, page_token)
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    if refresh:
        random.SystemRandom().shuffle(result["videos"])
    return {"source": "youtube_search" if mode == "search" else "youtube_api",
            "videos": result["videos"], "channels": [],
            "next_page_token": result["next_page_token"], "category": category,
            "query": q.strip() if mode == "search" else ""}


# ------------------------------------------------------------------ backup / restore
@router.get("/backup")
def backup(db: Session = Depends(get_db)):
    return {
        "version": 1,
        "videos": [v.to_dict() for v in db.query(Video).order_by(Video.id)],
        "playlists": [{"name": p.name, "description": p.description,
                       "videos": [i.video.video_id for i in p.items if i.video]}
                      for p in db.query(Playlist).order_by(Playlist.id)],
        "watch_history": [{
            "video_id": r.video.video_id,
            "progress_seconds": r.progress_seconds or 0,
            "duration_seconds": r.duration_seconds or 0,
            "completed": bool(r.completed),
        } for r in db.query(WatchHistory).order_by(WatchHistory.watched_at.desc()).all()],
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
                     notes=str(v.get("notes") or "")[:2000], favorite=bool(v.get("favorite")),
                     history_only=bool(v.get("history_only"))))
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
    restored_watch = 0
    for row in getattr(body, "watch_history", []):
        video = db.query(Video).filter(Video.video_id == str(row.get("video_id") or "")).first()
        if not video:
            continue
        progress = max(0, int(row.get("progress_seconds") or 0))
        duration = max(0, int(row.get("duration_seconds") or 0))
        completed = bool(row.get("completed"))
        if duration > 0:
            completed = completed or progress >= duration * 0.95
        item = db.query(WatchHistory).filter(WatchHistory.video_id == video.id).first()
        if item:
            item.progress_seconds = progress
            item.duration_seconds = duration
            item.completed = completed
        else:
            db.add(WatchHistory(video_id=video.id, progress_seconds=progress,
                                duration_seconds=duration, completed=completed))
        restored_watch += 1
    db.commit()
    return {"videos_added": added, "videos_skipped": skipped, "playlists_created": made,
            "watch_history_restored": restored_watch}
