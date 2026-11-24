from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload

from ..database import get_db
from ..models import Playlist, PlaylistItem, Video
from ..schemas import ItemIn, OrderIn, PlaylistIn, PlaylistPatch
from ..security import require_token

router = APIRouter(prefix="/api/playlists", dependencies=[Depends(require_token)], tags=["playlists"])


def _get(db, pid) -> Playlist:
    p = db.get(Playlist, pid)
    if not p:
        raise HTTPException(404, "Playlist not found")
    return p


def _detail(p: Playlist) -> dict:
    d = p.to_dict()
    d["videos"] = [i.video.to_dict() for i in p.items if i.video]
    return d


@router.get("")
def list_playlists(db: Session = Depends(get_db)):
    playlists = (db.query(Playlist)
                 .options(selectinload(Playlist.items).joinedload(PlaylistItem.video))
                 .order_by(Playlist.name).all())
    return [{**p.to_dict(), "cover_thumbnails": [
        item.video.thumbnail_url for item in p.items
        if item.video and item.video.thumbnail_url
    ][:4]} for p in playlists]


@router.post("", status_code=201)
def create(body: PlaylistIn, db: Session = Depends(get_db)):
    p = Playlist(name=body.name.strip(), description=body.description.strip())
    if not p.name:
        raise HTTPException(400, "Name cannot be empty")
    db.add(p)
    db.commit()
    return p.to_dict()


@router.get("/{pid}")
def detail(pid: int, db: Session = Depends(get_db)):
    return _detail(_get(db, pid))


@router.patch("/{pid}")
def rename(pid: int, body: PlaylistPatch, db: Session = Depends(get_db)):
    p = _get(db, pid)
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "Name cannot be empty")
        p.name = body.name.strip()
    if body.description is not None:
        p.description = body.description.strip()
    db.commit()
    return p.to_dict()


@router.delete("/{pid}", status_code=204)
def delete(pid: int, db: Session = Depends(get_db)):
    db.delete(_get(db, pid))
    db.commit()


@router.post("/{pid}/items", status_code=201)
def add_item(pid: int, body: ItemIn, db: Session = Depends(get_db)):
    p = _get(db, pid)
    if not db.get(Video, body.video_id):
        raise HTTPException(404, "Video not found")
    if any(i.video_id == body.video_id for i in p.items):
        raise HTTPException(409, "Already in this playlist")
    db.add(PlaylistItem(playlist_id=pid, video_id=body.video_id, position=len(p.items)))
    db.commit()
    db.refresh(p)
    return _detail(p)


@router.delete("/{pid}/items/{video_id}")
def remove_item(pid: int, video_id: int, db: Session = Depends(get_db)):
    p = _get(db, pid)
    db.query(PlaylistItem).filter_by(playlist_id=pid, video_id=video_id).delete()
    db.commit()
    for n, it in enumerate(db.query(PlaylistItem).filter_by(playlist_id=pid).order_by(PlaylistItem.position)):
        it.position = n
    db.commit()
    db.refresh(p)
    return _detail(p)


@router.put("/{pid}/order")
def reorder(pid: int, body: OrderIn, db: Session = Depends(get_db)):
    p = _get(db, pid)
    by_vid = {i.video_id: i for i in p.items}
    if set(body.video_ids) != set(by_vid):
        raise HTTPException(400, "Order must contain exactly the playlist's videos")
    for pos, vid in enumerate(body.video_ids):
        by_vid[vid].position = pos
    db.commit()
    db.refresh(p)
    return _detail(p)
