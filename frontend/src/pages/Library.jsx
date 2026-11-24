import { useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, Modal, PreviewModal, useUI } from "../ui.jsx";

function EditModal({ video, onClose, onSaved }) {
  const { toast } = useUI();
  const [f, setF] = useState({ title: video.title, category: video.category, tags: video.tags.join(", "), notes: video.notes });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    try { await api.patch(`/api/videos/${video.id}`, f); onSaved(); onClose(); } catch (e) { toast(e.message, "danger"); }
  };
  return (
    <Modal title="Edit video" onClose={onClose}>
      <label>Title<input value={f.title} onChange={set("title")} maxLength={300} /></label>
      <label>Category<input value={f.category} onChange={set("category")} maxLength={60} /></label>
      <label>Tags (comma separated)<input value={f.tags} onChange={set("tags")} /></label>
      <label>Notes<textarea rows={3} value={f.notes} onChange={set("notes")} /></label>
      <div className="row end"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save changes</button></div>
    </Modal>
  );
}

function YouTubeSearch({ onAdded }) {
  const { toast } = useUI();
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const go = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setSearched(true);
    try { setRes(await api.get(`/api/search/youtube?q=${encodeURIComponent(q)}`)); }
    catch (er) { setRes([]); toast(er.message, "danger"); }
    finally { setBusy(false); }
  };
  const add = async (r) => {
    try { await api.post("/api/videos", { url: r.url }); toast("Saved to library", "ok"); onAdded(); } catch (er) { toast(er.message, "danger"); }
  };
  return (
    <div className="library-youtube-search">
      <form className="row wrap" onSubmit={go}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, channels, or topics" aria-label="Search YouTube" />
        <button className="btn" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </form>
      <div className="list">
        {res.map((r) => (
          <div className="line" key={r.video_id}>
            <img src={r.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="mini" />
            <div className="grow"><strong>{r.title}</strong><div className="muted">{r.channel_name}</div></div>
            <button className="btn" onClick={() => add(r)}>Save</button>
          </div>
        ))}
      </div>
      {searched && !busy && !res.length && <p className="muted">No YouTube results found. Try a different search.</p>}
    </div>
  );
}

export default function Library() {
  const { toast, confirm } = useUI();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [sort, setSort] = useState("newest");
  const [links, setLinks] = useState("");
  const [cat, setCat] = useState("General");
  const [tags, setTags] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAddLinks, setShowAddLinks] = useState(false);
  const [showYT, setShowYT] = useState(false);
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null);

  const params = new URLSearchParams({ q, category, sort, favorite });
  const vids = useLoad(() => api.get(`/api/videos?${params}`), [q, category, favorite, sort]);
  const cats = useLoad(() => api.get("/api/categories"), []);
  const pls = useLoad(() => api.get("/api/playlists"), []);
  const subscriptions = useLoad(() => api.get("/api/subscriptions"), []);
  const stats = useLoad(() => api.get("/api/stats"), []);
  const reloadAll = () => { vids.reload(); cats.reload(); stats.reload(); };
  const toggleSubscription = async (channelName) => {
    if (!channelName) return;
    const sub = subscriptions.data?.find((s) => s.channel_name === channelName);
    try {
      if (sub) {
        await api.del(`/api/subscriptions/${sub.id}`);
        toast("Unsubscribed", "ok");
      } else {
        await api.post("/api/subscriptions", { channel_name: channelName });
        toast("Subscribed", "ok");
      }
      subscriptions.reload();
    } catch (e) { toast(e.message, "danger"); }
  };

  const add = async (e) => {
    e.preventDefault();
    const urls = links.split(/\s+/).filter(Boolean);
    if (!urls.length) return;
    setAdding(true);
    let ok = 0; const problems = [];
    for (const url of urls) {
      try { await api.post("/api/videos", { url, category: cat || "General", tags }); ok++; }
      catch (er) { problems.push(er.message); }
    }
    setAdding(false);
    if (ok) toast(`Saved ${ok} video${ok > 1 ? "s" : ""}`, "ok");
    if (problems.length) toast(`${problems.length} not added: ${[...new Set(problems)].join("; ")}`, "danger");
    if (!problems.length) setLinks("");
    reloadAll();
  };

  const remove = async (v) => {
    if (!(await confirm(`Remove “${v.title}” from your library? It will also leave any playlists.`, "Remove", true))) return;
    try { await api.del(`/api/videos/${v.id}`); toast("Removed from library", "ok"); reloadAll(); }
    catch (e) { toast(e.message, "danger"); }
  };
  const toggleFav = async (v) => {
    try { await api.patch(`/api/videos/${v.id}`, { favorite: !v.favorite }); vids.reload(); stats.reload(); }
    catch (e) { toast(e.message, "danger"); }
  };
  const addToPlaylist = async (v, pid) => {
    if (!pid) return;
    try { await api.post(`/api/playlists/${pid}/items`, { video_id: v.id }); toast("Added to playlist", "ok"); pls.reload(); }
    catch (e) { toast(e.message, "danger"); }
  };
  const downloadVideo = async (v, format = "video") => {
    try {
      const ext = format === "audio" ? ".mp3" : ".mp4";
      await api.post("/api/downloads", {
        url: v.source_url,
        filename: v.title ? `${v.title}${ext}` : null,
        format,
      });
      toast(`Download queued (${format === "audio" ? "MP3 Music" : "MP4 Video"}): ${v.title}`, "ok");
    } catch (e) {
      toast(e.message, "danger");
    }
  };

  return (
    <section className="library-page">
      <header className="page-heading">
        <div>
          <h1>Your library</h1>
          <p className="muted">Saved videos, favourites and playlists in one place.</p>
        </div>
        <div className="row wrap">
          <button className={"btn" + (showYT ? " on" : "")} aria-pressed={showYT} onClick={() => setShowYT(!showYT)}>
            {showYT ? "Close YouTube search" : "Find videos"}
          </button>
          <button className="btn primary" onClick={() => setShowAddLinks(!showAddLinks)}>
            {showAddLinks ? "Close" : "Add videos"}
          </button>
        </div>
      </header>

      <div className="library-summary">
        <div className="library-stat"><span>Saved videos</span><strong>{stats.data?.videos ?? vids.data?.length ?? "—"}</strong></div>
        <div className="library-stat"><span>Favourites</span><strong>{stats.data?.favorites ?? "—"}</strong></div>
        <div className="library-stat"><span>Playlists</span><strong>{pls.data?.length ?? "—"}</strong></div>
      </div>

      {showYT && <div className="card library-panel">
        <div className="section-heading"><div><h2>Find videos on YouTube</h2><p className="muted">Search and save videos to your library.</p></div>
          <button className="btn ghost" onClick={() => setShowYT(false)} aria-label="Close YouTube search">✕</button>
        </div>
        <YouTubeSearch onAdded={reloadAll} />
      </div>}
      {showAddLinks && <form className="card library-panel" onSubmit={add}>
        <div className="section-heading"><div><h2>Add YouTube links</h2><p className="muted">Paste one or more links to keep them in your library.</p></div></div>
        <label>Video links
          <textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder={"https://www.youtube.com/watch?v=…\nhttps://youtu.be/…"} />
        </label>
        <div className="row wrap">
          <label className="grow">Category<input value={cat} onChange={(e) => setCat(e.target.value)} list="cats" maxLength={60} /></label>
          <label className="grow">Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lecture, python" /></label>
          <button className="btn primary self-end" disabled={adding}>{adding ? "Saving…" : "Save to library"}</button>
        </div>
        <datalist id="cats">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
      </form>}

      <div className="library-controls">
        <input id="lib-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your saved videos" aria-label="Search library" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>{cats.data?.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Recently added</option><option value="oldest">Oldest added</option>
          <option value="title">Title A–Z</option><option value="channel">Channel A–Z</option>
        </select>
        <button className={"btn" + (favorite ? " on" : "")} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}>
          {favorite ? "★ Favourites" : "☆ Favourites"}
        </button>
      </div>
      <ErrorNote error={vids.error} onRetry={vids.reload} />
      <div className="library-results">
        <strong>{vids.data ? `${vids.data.length} ${vids.data.length === 1 ? "video" : "videos"}` : "Loading library…"}</strong>
        {category && <span className="chip">{category}</span>}
        {favorite && <span className="chip alt">Favourites</span>}
      </div>

      {vids.data && !vids.data.length && (
        <Empty title={q || category || favorite ? "No videos match these filters" : "Your library is empty"}
               hint={q || category || favorite ? "Clear a filter to see more." : "Add a video link or find a video on YouTube to get started."}>
          {!q && !category && !favorite && <div className="row wrap"><button className="btn primary" onClick={() => setShowAddLinks(true)}>Add videos</button><button className="btn" onClick={() => setShowYT(true)}>Find videos</button></div>}
        </Empty>
      )}
      <div className="library-grid">
        {vids.data?.map((v) => (
          <article className="library-card" key={v.id}>
            <button className="library-thumb" onClick={() => setPreview(v)} aria-label={`Play ${v.title}`}>
              <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span className="library-play-overlay">▶ Play</span>
              {v.favorite && <span className="library-favourite-badge">★ Favourite</span>}
            </button>
            <div className="library-card-body">
              <div className="library-card-heading">
                <div className="channel-avatar">{(v.channel_name || "Y").slice(0, 1).toUpperCase()}</div>
                <div className="grow">
                  <h3 title={v.title}>{v.title}</h3>
                  <span className="muted">{v.channel_name || "Unknown channel"}</span>
                  <span className="muted library-date">{v.created_at ? `Added ${new Date(v.created_at).toLocaleDateString()}` : ""}</span>
                </div>
                <button className="btn ghost library-favourite" onClick={() => toggleFav(v)} aria-pressed={v.favorite} aria-label={v.favorite ? "Remove from favourites" : "Add to favourites"}>
                  {v.favorite ? "★" : "☆"}
                </button>
              </div>
              <div className="chips"><span className="chip">{v.category || "General"}</span>{v.tags.map((t) => <span className="chip alt" key={t}>#{t}</span>)}</div>
              {v.notes && <p className="muted clamp">{v.notes}</p>}
              {v.channel_name && <button className={"btn library-subscribe" + (subscriptions.data?.some((s) => s.channel_name === v.channel_name) ? " on" : "")}
                onClick={() => toggleSubscription(v.channel_name)}>
                {subscriptions.data?.some((s) => s.channel_name === v.channel_name) ? "Subscribed" : "Subscribe to channel"}
              </button>}
              <div className="row wrap library-card-actions">
                <button className="btn primary" onClick={() => setPreview(v)}>Play</button>
                <button className="btn" onClick={() => downloadVideo(v, "video")}>🎬 Video</button>
                <button className="btn" onClick={() => downloadVideo(v, "audio")}>🎵 MP3</button>
                <button className="btn" onClick={() => setEdit(v)}>Edit details</button>
                <button className="btn danger" onClick={() => remove(v)}>Remove</button>
              </div>
              <select className="library-add-playlist" aria-label={`Add ${v.title} to playlist`} value="" onChange={(e) => addToPlaylist(v, e.target.value)}>
                <option value="">Add to playlist…</option>{pls.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </article>
        ))}
      </div>
      {preview && <PreviewModal video={preview} onClose={() => setPreview(null)} />}
      {edit && <EditModal video={edit} onClose={() => setEdit(null)} onSaved={reloadAll} />}
    </section>
  );
}
