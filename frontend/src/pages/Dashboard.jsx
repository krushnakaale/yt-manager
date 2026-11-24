import { api } from "../api.js";
import { useLoad } from "../util.js";
import { ErrorNote, PreviewModal, useUI } from "../ui.jsx";
import { useCallback, useEffect, useRef, useState } from "react";

const FEED_CATEGORIES = [
  { id: "", label: "For you" },
  { id: "10", label: "Music" },
  { id: "20", label: "Gaming" },
  { id: "27", label: "Education" },
  { id: "28", label: "Technology" },
  { id: "17", label: "Sports" },
  { id: "24", label: "Entertainment" },
];

export default function Dashboard({ query = "" }) {
  const { toast } = useUI();
  const [category, setCategory] = useState("");
  const [sourceMode, setSourceMode] = useState("popular");
  const searchTerm = query.trim();
  const effectiveMode = searchTerm ? "search" : sourceMode;
  const feed = useLoad(() => {
    const params = new URLSearchParams({ mode: effectiveMode, region: "IN", category });
    if (searchTerm) params.set("q", searchTerm);
    return api.get(`/api/feed/youtube?${params}`);
  }, [effectiveMode, category, searchTerm]);
  const subscriptions = useLoad(() => api.get("/api/subscriptions"), []);
  const [channelId, setChannelId] = useState("");
  const [preview, setPreview] = useState(null);
  const [moreVideos, setMoreVideos] = useState([]);
  const [nextPageToken, setNextPageToken] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinel = useRef(null);
  const feedKey = useRef(`${effectiveMode}:${category}:${searchTerm}`);
  const expectedSource = effectiveMode === "search" ? "youtube_search"
    : effectiveMode === "popular" ? "youtube_api" : "rss";
  const feedMatches = feed.data?.source === expectedSource
    && feed.data.category === category && feed.data.query === searchTerm;
  const videos = feedMatches ? feed.data.videos || [] : [];
  const isRssFeed = effectiveMode === "rss";
  const isSearchFeed = effectiveMode === "search";
  const displayedVideos = [...videos, ...moreVideos];

  useEffect(() => {
    feedKey.current = `${effectiveMode}:${category}:${searchTerm}`;
    setMoreVideos([]);
    setNextPageToken(feedMatches
      ? feed.data.next_page_token || "" : "");
  }, [feed.data, feedMatches, category, effectiveMode, searchTerm]);
  const download = async (v) => {
    try {
      await api.post("/api/downloads", { url: v.url, filename: `${v.title}.mp4`, format: "video" });
      toast("Download added", "ok");
    } catch (e) { toast(e.message, "danger"); }
  };
  const save = async (v) => {
    try {
      await api.post("/api/videos", { url: v.url });
      toast("Saved to your library", "ok");
    } catch (e) { toast(e.message.includes("already") ? "Already in your library" : e.message, e.message.includes("already") ? "info" : "danger"); }
  };
  const addChannel = async (e) => {
    e.preventDefault();
    try {
      await api.post("/api/subscriptions", { channel_id: channelId.trim() });
      setChannelId("");
      await Promise.all([subscriptions.reload(), feed.reload()]);
      toast("Channel added to Home feed", "ok");
    } catch (e) { toast(e.message, "danger"); }
  };
  const removeChannel = async (id) => {
    try {
      await api.del(`/api/subscriptions/${id}`);
      await Promise.all([subscriptions.reload(), feed.reload()]);
      toast("Channel removed from Home feed", "ok");
    } catch (e) { toast(e.message, "danger"); }
  };
  const loadMore = useCallback(async () => {
    if (!nextPageToken || loadingMore) return;
    const requestedKey = `${effectiveMode}:${category}:${searchTerm}`;
    const params = new URLSearchParams({
      mode: effectiveMode, region: "IN", category, page_token: nextPageToken,
    });
    if (searchTerm) params.set("q", searchTerm);
    setLoadingMore(true);
    try {
      const page = await api.get(`/api/feed/youtube?${params}`);
      if (feedKey.current !== requestedKey) return;
      const seen = new Set([...videos, ...moreVideos].map((video) => video.video_id));
      setMoreVideos((current) => current.concat(page.videos.filter((video) => !seen.has(video.video_id))));
      setNextPageToken(page.next_page_token || "");
    } catch (e) {
      toast(e.message, "danger");
    } finally {
      setLoadingMore(false);
    }
  }, [nextPageToken, loadingMore, effectiveMode, category, searchTerm, videos, moreVideos, toast]);
  useEffect(() => {
    if (!nextPageToken || loadingMore || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: "700px 0px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [nextPageToken, loadingMore, loadMore]);
  const formatViews = (count) => `${Number(count || 0).toLocaleString()} views`;

  return (
    <section>
      {!searchTerm && <div className="feed-modes" role="group" aria-label="Home feed source">
        <button className={"feed-chip" + (sourceMode === "popular" ? " active" : "")} onClick={() => setSourceMode("popular")}>All YouTube popular</button>
        <button className={"feed-chip" + (sourceMode === "rss" ? " active" : "")} onClick={() => setSourceMode("rss")}>My channels (RSS)</button>
      </div>}
      {effectiveMode !== "rss" && <div className="feed-chips" aria-label="YouTube video categories">
        {FEED_CATEGORIES.map((item) => <button key={item.id} className={"feed-chip" + (category === item.id ? " active" : "")} onClick={() => setCategory(item.id)}>{item.label}</button>)}
      </div>}
      <div className="home-heading">
        <div>
          <h1>{isSearchFeed ? `Search results for “${searchTerm}”`
            : isRssFeed ? "Latest from your channels" : "Popular across YouTube · India"}</h1>
          <p className="muted">{isSearchFeed ? "Search YouTube and filter results by topic"
            : isRssFeed ? "Channel updates via YouTube RSS · No API key needed"
              : "Popular videos from channels across India · Choose a topic"}</p>
        </div>
        <div className="row">
          {isSearchFeed && <button className="btn" onClick={() => { location.hash = "#/dashboard"; }}>Clear search</button>}
          <button className="btn" onClick={feed.reload} disabled={!feed.data}>Refresh</button>
        </div>
      </div>
      <ErrorNote error={feed.error} onRetry={feed.reload} />
      {(effectiveMode === "popular" || isSearchFeed) && feed.error?.includes("API key") && (
        <div className="card feed-setup">
          <strong>YouTube API key required for Home feed and search</strong>
          <p className="muted">Add your key in Settings. It stays on the backend; then videos and search results load from YouTube.</p>
          <a className="btn primary" href="#/settings">Open Settings</a>
        </div>
      )}
      {isRssFeed && (
        <div className="card feed-setup">
          <strong>Add channels to your Home feed</strong>
          <p className="muted">Paste a YouTube channel ID (starts with UC) or a youtube.com/channel/… URL. YouTube RSS only provides new videos from channels you follow; it cannot provide global recommendations without an API key.</p>
          <form className="row wrap" onSubmit={addChannel}>
            <input className="grow" value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="UC… or https://www.youtube.com/channel/UC…" aria-label="YouTube channel ID or URL" required />
            <button className="btn primary">Add channel</button>
          </form>
          {subscriptions.data?.filter((s) => s.channel_id).map((s) => (
            <div className="row wrap feed-subscription" key={s.id}>
              <span className="grow">{s.channel_name}</span>
              <span className="muted mono">{s.channel_id}</span>
              <button className="btn danger" onClick={() => removeChannel(s.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      {!feedMatches && !feed.error && <div className="empty"><strong>Loading YouTube videos…</strong><span className="muted">{isSearchFeed ? "Searching YouTube." : isRssFeed ? "Getting the latest from your channels." : "Getting popular videos across YouTube."}</span></div>}
      {displayedVideos.length ? (
        <div className="youtube-grid">
          {displayedVideos.map((v) => (
            <article className="youtube-card" key={v.video_id}>
              <button className="youtube-thumb" onClick={() => setPreview({ ...v, source_url: v.url })} aria-label={`Play ${v.title}`}>
                <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <span className="play-overlay">▶</span>
              </button>
              <div className="youtube-meta">
                <div className="channel-avatar">{(v.channel_name || "Y").slice(0, 1).toUpperCase()}</div>
                <div className="youtube-copy">
                  <h3 title={v.title}>{v.title}</h3>
                  <span>{v.channel_name || "Unknown channel"}</span>
                  <span>{[v.view_count && v.view_count !== "0" ? formatViews(v.view_count) : "", v.published_at ? new Date(v.published_at).toLocaleDateString() : ""].filter(Boolean).join(" · ")}</span>
                  <div className="youtube-actions always-visible">
                    <button onClick={() => setPreview({ ...v, source_url: v.url })}>Watch</button>
                    <button onClick={() => save(v)}>Save</button>
                    <button onClick={() => download(v)}>Download</button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        feed.data && <div className="empty"><strong>{isRssFeed ? "No channel videos yet" : "No popular videos found"}</strong><span className="muted">{isRssFeed ? "Add one or more YouTube channel IDs above to see their latest uploads." : "Try another topic or refresh the feed."}</span></div>
      )}
      <div className="feed-sentinel" ref={sentinel} aria-hidden="true" />
      {effectiveMode !== "rss" && feedMatches && nextPageToken && (
        <div className="row end load-more">
          <button className="btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading more…" : "Load more videos"}
          </button>
        </div>
      )}
      {preview && <PreviewModal video={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
