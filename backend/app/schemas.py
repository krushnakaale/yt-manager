from pydantic import BaseModel, Field


class VideoIn(BaseModel):
    url: str = Field(max_length=500)
    category: str = Field(default="General", max_length=60)
    tags: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=2000)


class VideoPatch(BaseModel):
    title: str | None = Field(default=None, max_length=300)
    category: str | None = Field(default=None, max_length=60)
    tags: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=2000)
    favorite: bool | None = None


class VideoFavoriteIn(BaseModel):
    favorite: bool


class PlaylistIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)


class PlaylistPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)


class ItemIn(BaseModel):
    video_id: int


class OrderIn(BaseModel):
    video_ids: list[int] = Field(max_length=2000)


class DownloadIn(BaseModel):
    url: str = Field(max_length=2000)
    filename: str | None = Field(default=None, max_length=200)
    format: str | None = Field(default="video", max_length=20)
    quality: str | None = Field(default="best", max_length=20)
    custom_path: str | None = Field(default=None, max_length=500)
    is_playlist: bool = Field(default=False)
    playlist_start: int | None = Field(default=None, ge=1)
    playlist_end: int | None = Field(default=None, ge=1)


class SettingsIn(BaseModel):
    download_folder: str | None = Field(default=None, max_length=500)
    max_download_mb: int | None = Field(default=None, ge=1, le=20000)
    max_concurrent: int | None = Field(default=None, ge=1, le=5)
    yt_api_key: str | None = Field(default=None, max_length=200)  # write-only
    track_watch_history: bool | None = None


class BackupIn(BaseModel):
    version: int = 1
    videos: list[dict] = Field(default_factory=list, max_length=5000)
    playlists: list[dict] = Field(default_factory=list, max_length=500)
    watch_history: list[dict] = Field(default_factory=list, max_length=5000)


class WatchIn(BaseModel):
    video_id: int | None = None
    youtube_video_id: str | None = Field(default=None, max_length=20)
    title: str | None = Field(default=None, max_length=300)
    channel_name: str | None = Field(default=None, max_length=200)
    thumbnail_url: str | None = Field(default=None, max_length=500)
    progress_seconds: float = Field(default=0, ge=0, le=604800)
    duration_seconds: float = Field(default=0, ge=0, le=604800)
    completed: bool = False


class SubscriptionIn(BaseModel):
    channel_name: str | None = Field(default=None, max_length=200)
    channel_id: str | None = Field(default=None, max_length=500)
