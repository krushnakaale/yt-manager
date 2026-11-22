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


class BackupIn(BaseModel):
    version: int = 1
    videos: list[dict] = Field(default_factory=list, max_length=5000)
    playlists: list[dict] = Field(default_factory=list, max_length=500)
