from pathlib import Path
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base, utcnow


def iso(dt):
    return dt.isoformat() + "Z" if dt else None


class Video(Base):
    __tablename__ = "videos"
    id = Column(Integer, primary_key=True)
    source_url = Column(String(500), nullable=False)
    video_id = Column(String(20), nullable=False, unique=True, index=True)
    title = Column(String(300), nullable=False, default="")
    thumbnail_url = Column(String(500), default="")
    channel_name = Column(String(200), default="")
    category = Column(String(60), default="General", index=True)
    tags = Column(String(300), default="")
    notes = Column(Text, default="")
    favorite = Column(Boolean, default=False)
    history_only = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "source_url": self.source_url, "video_id": self.video_id,
            "title": self.title, "thumbnail_url": self.thumbnail_url,
            "channel_name": self.channel_name, "category": self.category,
            "tags": [t for t in (self.tags or "").split(",") if t], "notes": self.notes or "",
            "favorite": bool(self.favorite), "history_only": bool(self.history_only),
            "created_at": iso(self.created_at),
        }


class Playlist(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(String(300), default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    items = relationship("PlaylistItem", cascade="all, delete-orphan", order_by="PlaylistItem.position")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "description": self.description or "",
                "count": len(self.items), "created_at": iso(self.created_at), "updated_at": iso(self.updated_at)}


class PlaylistItem(Base):
    __tablename__ = "playlist_items"
    __table_args__ = (UniqueConstraint("playlist_id", "video_id"),)
    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, default=0)
    video = relationship("Video")


class DownloadTask(Base):
    __tablename__ = "download_tasks"
    id = Column(Integer, primary_key=True)
    source_url = Column(String(2000), nullable=False)
    filename = Column(String(200), nullable=False)
    destination = Column(String(1000), nullable=False)  # full final path
    status = Column(String(20), default="queued", index=True)
    bytes_received = Column(Integer, default=0)
    total_bytes = Column(Integer, default=0)
    error = Column(String(500), default="")
    warning = Column(String(300), default="")
    quality = Column(String(20), default="best")
    sha256 = Column(String(64), default="")
    created_at = Column(DateTime, default=utcnow)
    completed_at = Column(DateTime)

    def to_dict(self, speed=0.0):
        exists = Path(self.destination).exists() if self.status == "completed" else None
        return {
            "id": self.id, "source_url": self.source_url, "filename": self.filename,
            "destination": self.destination, "folder": str(Path(self.destination).parent),
            "status": self.status, "bytes_received": self.bytes_received or 0,
            "total_bytes": self.total_bytes or 0, "speed": speed, "error": self.error or "",
            "warning": self.warning or "", "quality": self.quality or "best",
            "sha256": self.sha256 or "",
            "file_exists": exists, "created_at": iso(self.created_at), "completed_at": iso(self.completed_at),
        }


class AppSetting(Base):
    __tablename__ = "app_settings"
    key = Column(String(60), primary_key=True)
    value = Column(Text, default="")
    updated_at = Column(DateTime, default=utcnow)


class WatchHistory(Base):
    __tablename__ = "watch_history"
    id = Column(Integer, primary_key=True)
    video_id = Column(Integer, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    watched_at = Column(DateTime, default=utcnow)
    progress_seconds = Column(Integer, default=0)
    duration_seconds = Column(Integer, default=0)
    completed = Column(Boolean, default=False)
    video = relationship("Video")


class Subscription(Base):
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True)
    channel_name = Column(String(200), nullable=False, unique=True, index=True)
    channel_id = Column(String(60), nullable=True, unique=True, index=True)
    created_at = Column(DateTime, default=utcnow)
