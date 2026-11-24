"""Permitted metadata only: official oEmbed endpoint and (optionally) YouTube Data API v3.
This module never downloads video streams."""
import asyncio
import xml.etree.ElementTree as ET

import httpx

OEMBED = "https://www.youtube.com/oembed"
API = "https://www.googleapis.com/youtube/v3"
RSS = "https://www.youtube.com/feeds/videos.xml"
ATOM = "{http://www.w3.org/2005/Atom}"
MEDIA = "{http://search.yahoo.com/mrss/}"
YOUTUBE_ATOM = "{http://www.youtube.com/xml/schemas/2015}"


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


async def search_page(query: str, region_code: str, category_id: str, api_key: str,
                      page_token: str = "", max_results: int = 50) -> dict:
    params = {"part": "snippet", "type": "video", "maxResults": max_results,
              "q": query, "regionCode": region_code}
    if category_id:
        params["videoCategoryId"] = category_id
    if page_token:
        params["pageToken"] = page_token
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{API}/search", headers={"x-goog-api-key": api_key}, params=params)
    except httpx.HTTPError as e:
        raise RuntimeError("Could not reach the YouTube API") from e
    if r.status_code != 200:
        raise RuntimeError("YouTube API rejected the request (check the key or the daily quota)")
    payload = r.json()
    out = []
    for item in payload.get("items", []):
        video_id = item.get("id", {}).get("videoId")
        if not video_id:
            continue
        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (thumbnails.get("high") or thumbnails.get("medium")
                     or thumbnails.get("default") or {}).get("url", thumb(video_id))
        out.append({
            "video_id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": snippet.get("title", ""),
            "channel_name": snippet.get("channelTitle", ""),
            "thumbnail_url": thumbnail,
            "view_count": "0",
            "published_at": snippet.get("publishedAt", ""),
            "category_id": category_id,
        })
    return {"videos": out, "next_page_token": payload.get("nextPageToken", "")}


async def popular(region_code: str, category_id: str, api_key: str, page_token: str = "",
                  max_results: int = 50) -> dict:
    params = {"part": "snippet,statistics", "chart": "mostPopular",
              "maxResults": max_results, "regionCode": region_code}
    if category_id:
        params["videoCategoryId"] = category_id
    if page_token:
        params["pageToken"] = page_token
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{API}/videos", headers={"x-goog-api-key": api_key}, params=params)
    except httpx.HTTPError as e:
        raise RuntimeError("Could not reach the YouTube API") from e
    if r.status_code != 200:
        raise RuntimeError("YouTube API rejected the request (check the key or the daily quota)")
    out = []
    payload = r.json()
    for item in payload.get("items", []):
        video_id = item.get("id")
        if not video_id:
            continue
        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (thumbnails.get("high") or thumbnails.get("medium")
                     or thumbnails.get("default") or {}).get("url", thumb(video_id))
        out.append({
            "video_id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": snippet.get("title", ""),
            "channel_name": snippet.get("channelTitle", ""),
            "thumbnail_url": thumbnail,
            "view_count": item.get("statistics", {}).get("viewCount", "0"),
            "published_at": snippet.get("publishedAt", ""),
            "category_id": snippet.get("categoryId", ""),
        })
    return {"videos": out, "next_page_token": payload.get("nextPageToken", "")}


async def _channel_feed(client: httpx.AsyncClient, channel_id: str, channel_name: str) -> list[dict]:
    try:
        response = await client.get(RSS, params={"channel_id": channel_id})
        response.raise_for_status()
        root = ET.fromstring(response.content)
    except (httpx.HTTPError, ET.ParseError) as e:
        raise RuntimeError(f"Could not load YouTube RSS for {channel_name}") from e

    feed_title = root.findtext(f"{ATOM}title", default=channel_name)
    name = feed_title.removesuffix(" - Videos") or channel_name
    videos = []
    for entry in root.findall(f"{ATOM}entry"):
        video_id = entry.findtext(f"{YOUTUBE_ATOM}videoId")
        if not video_id:
            continue
        group = entry.find(f"{MEDIA}group")
        image = group.find(f"{MEDIA}thumbnail") if group is not None else None
        community = group.find(f"{MEDIA}community") if group is not None else None
        statistics = community.find(f"{MEDIA}statistics") if community is not None else None
        videos.append({
            "video_id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": entry.findtext(f"{ATOM}title", default=""),
            "channel_name": name,
            "thumbnail_url": image.get("url") if image is not None else thumb(video_id),
            "published_at": entry.findtext(f"{ATOM}published", default=""),
            "view_count": statistics.get("views", "0") if statistics is not None else "0",
        })
    return videos


async def subscribed_videos(channels: list[dict]) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        feeds = await asyncio.gather(
            *(_channel_feed(client, c["channel_id"], c["channel_name"]) for c in channels))
    videos = [video for feed in feeds for video in feed]
    return sorted(videos, key=lambda video: video["published_at"], reverse=True)
