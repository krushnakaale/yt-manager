"""Permitted metadata only: official oEmbed endpoint and (optionally) YouTube Data API v3.
This module never downloads video streams."""
import httpx

OEMBED = "https://www.youtube.com/oembed"
API = "https://www.googleapis.com/youtube/v3"


def thumb(video_id: str) -> str:
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


async def fetch_metadata(video_id: str, canonical_url: str, api_key: str = "") -> dict:
    async with httpx.AsyncClient(timeout=10) as c:
        if api_key:
            try:
                r = await c.get(f"{API}/videos", params={"part": "snippet", "id": video_id},
                                headers={"x-goog-api-key": api_key})  # header keeps the key out of URLs/logs
                items = r.json().get("items") if r.status_code == 200 else None
                if items:
                    s = items[0]["snippet"]
                    th = s.get("thumbnails", {})
                    best = (th.get("high") or th.get("medium") or th.get("default") or {}).get("url", thumb(video_id))
                    return {"title": s.get("title", ""), "channel_name": s.get("channelTitle", ""), "thumbnail_url": best}
            except (httpx.HTTPError, ValueError, KeyError):
                pass
        try:
            r = await c.get(OEMBED, params={"url": canonical_url, "format": "json"})
            if r.status_code == 200:
                d = r.json()
                return {"title": d.get("title", ""), "channel_name": d.get("author_name", ""),
                        "thumbnail_url": thumb(video_id)}
        except (httpx.HTTPError, ValueError):
            pass
    return {"title": "", "channel_name": "", "thumbnail_url": thumb(video_id)}


async def search(query: str, api_key: str, max_results: int = 12) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{API}/search", headers={"x-goog-api-key": api_key},
                        params={"part": "snippet", "type": "video", "maxResults": max_results, "q": query})
    if r.status_code != 200:
        raise RuntimeError("YouTube API rejected the request (check the key or the daily quota)")
    out = []
    for it in r.json().get("items", []):
        vid = it.get("id", {}).get("videoId")
        if not vid:
            continue
        s = it["snippet"]
        out.append({"video_id": vid, "url": f"https://www.youtube.com/watch?v={vid}", "title": s.get("title", ""),
                    "channel_name": s.get("channelTitle", ""), "thumbnail_url": thumb(vid)})
    return out
