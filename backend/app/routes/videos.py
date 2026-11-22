from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..config import YT_API_KEY
from ..database import get_db, get_setting
from ..models import Video
from ..schemas import VideoIn, VideoPatch
from ..security import parse_youtube_url, require_token
from ..youtube import fetch_metadata

router = APIRouter(prefix="/api", dependencies=[Depends(require_token)], tags=["videos"])


def _clean_tags(raw: str) -> str:
    seen, out = set(), []
    for t in (raw or "").split(","):
        t = t.strip().lower()[:30]
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return ",".join(out[:10])


def _api_key(db) -> str:
    return get_setting(db, "yt_api_key", "") or YT_API_KEY


async def add_video(db: Session, url: str, category="General", tags="", notes="") -> Video:
    try:
        canonical, vid = parse_youtube_url(url)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if db.query(Video).filter(Video.video_id == vid).first():
        raise HTTPException(409, "This video is already in your library")
    meta = await fetch_metadata(vid, canonical, _api_key(db))
    v = Video(source_url=canonical, video_id=vid, title=meta["title"] or f"Video {vid}",
              channel_name=meta["channel_name"], thumbnail_url=meta["thumbnail_url"],
              category=(category or "General").strip()[:60] or "General", tags=_clean_tags(tags), notes=notes)
    db.add(v)
    db.commit()
    return v


@router.get("/videos")
def list_videos(q: str = "", category: str = "", favorite: bool = False, sort: str = "newest",
                db: Session = Depends(get_db)):
    qs = db.query(Video)
    if q:
        like = f"%{q.strip()}%"
        qs = qs.filter(or_(Video.title.ilike(like), Video.channel_name.ilike(like),
                           Video.tags.ilike(like), Video.notes.ilike(like)))
    if category:
        qs = qs.filter(Video.category == category)
    if favorite:
        qs = qs.filter(Video.favorite.is_(True))
    order = {"newest": Video.created_at.desc(), "oldest": Video.created_at.asc(),
             "title": func.lower(Video.title).asc(), "channel": func.lower(Video.channel_name).asc()}
    return [v.to_dict() for v in qs.order_by(order.get(sort, order["newest"]), Video.id.desc()).limit(1000)]


@router.get("/categories")
def categories(db: Session = Depends(get_db)):
    return [c for (c,) in db.query(Video.category).distinct().order_by(Video.category) if c]


@router.post("/videos", status_code=201)
async def create_video(body: VideoIn, db: Session = Depends(get_db)):
    return (await add_video(db, body.url, body.category, body.tags, body.notes)).to_dict()


@router.patch("/videos/{vid}")
def update_video(vid: int, body: VideoPatch, db: Session = Depends(get_db)):
    v = db.get(Video, vid)
    if not v:
        raise HTTPException(404, "Video not found")
    data = body.model_dump(exclude_unset=True)
    if "tags" in data:
        data["tags"] = _clean_tags(data["tags"])
    if data.get("title") is not None and not data["title"].strip():
        raise HTTPException(400, "Title cannot be empty")
    for k, val in data.items():
        if val is not None:
            setattr(v, k, val)
    db.commit()
    return v.to_dict()


@router.post("/videos/{vid}/refresh")
async def refresh_video(vid: int, db: Session = Depends(get_db)):
    v = db.get(Video, vid)
    if not v:
        raise HTTPException(404, "Video not found")
    meta = await fetch_metadata(v.video_id, v.source_url, _api_key(db))
    if meta["title"]:
        v.title, v.channel_name, v.thumbnail_url = meta["title"], meta["channel_name"], meta["thumbnail_url"]
        db.commit()
    return v.to_dict()


@router.delete("/videos/{vid}", status_code=204)
def delete_video(vid: int, db: Session = Depends(get_db)):
    v = db.get(Video, vid)
    if not v:
        raise HTTPException(404, "Video not found")
    from ..models import PlaylistItem
    db.query(PlaylistItem).filter(PlaylistItem.video_id == vid).delete()
    db.delete(v)
    db.commit()
