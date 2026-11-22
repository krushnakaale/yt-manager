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
  const go = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setRes(await api.get(`/api/search/youtube?q=${encodeURIComponent(q)}`)); } catch (er) { toast(er.message, "danger"); }
    setBusy(false);
  };
  const add = async (r) => {
    try { await api.post("/api/videos", { url: r.url }); toast("Saved to library", "ok"); onAdded(); } catch (er) { toast(er.message, "danger"); }
  };
  return (
    <div className="card">
      <form className="row" onSubmit={go}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search YouTube metadata (uses your API quota)" aria-label="Search YouTube" />
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
    </div>
  );
}

export default function Library() {
  const { toast, confirm, openExternal } = useUI();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [sort, setSort] = useState("newest");
  const [links, setLinks] = useState("");
  const [cat, setCat] = useState("General");
  const [tags, setTags] = useState("");
  const [adding, setAdding] = useState(false);
  const [showYT, setShowYT] = useState(false);
  const [preview, setPreview] = useState(null);
  const [edit, setEdit] = useState(null);

  const params = new URLSearchParams({ q, category, sort, favorite });
  const vids = useLoad(() => api.get(`/api/videos?${params}`), [q, category, favorite, sort]);
  const cats = useLoad(() => api.get("/api/categories"), []);
  const pls = useLoad(() => api.get("/api/playlists"), []);
  const reloadAll = () => { vids.reload(); cats.reload(); };

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
    await api.del(`/api/videos/${v.id}`); toast("Removed"); reloadAll();
  };
  const toggleFav = async (v) => { await api.patch(`/api/videos/${v.id}`, { favorite: !v.favorite }); vids.reload(); };
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
    <section>
      <h1>Video library</h1>
      <form className="card" onSubmit={add}>
        <label>Add YouTube links (one per line, or several at once)
          <textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        </label>
        <div className="row">
          <label className="grow">Category<input value={cat} onChange={(e) => setCat(e.target.value)} list="cats" maxLength={60} /></label>
          <label className="grow">Tags<input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="lecture, python" /></label>
          <button className="btn primary self-end" disabled={adding}>{adding ? "Saving…" : "Save links"}</button>
        </div>
        <datalist id="cats">{cats.data?.map((c) => <option key={c} value={c} />)}</datalist>
      </form>

      <div className="row wrap toolbar">
        <input id="lib-search" className="grow" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, channel, tags, notes" aria-label="Search library" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>{cats.data?.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option><option value="channel">Channel A–Z</option>
        </select>
        <button className={"btn" + (favorite ? " on" : "")} aria-pressed={favorite} onClick={() => setFavorite(!favorite)}>★ Favourites</button>
        <button className={"btn" + (showYT ? " on" : "")} aria-pressed={showYT} onClick={() => setShowYT(!showYT)}>Search YouTube</button>
      </div>
      {showYT && <YouTubeSearch onAdded={reloadAll} />}
      <ErrorNote error={vids.error} onRetry={vids.reload} />

      {vids.data && !vids.data.length && (
        <Empty title={q || category || favorite ? "No videos match these filters" : "Your library is empty"}
               hint={q || category || favorite ? "Clear a filter to see more." : "Paste a YouTube link above to save your first video."} />
      )}
      <div className="grid">
        {vids.data?.map((v) => (
          <article className="vcard" key={v.id}>
            <button className="thumb" onClick={() => setPreview(v)} aria-label={`Preview ${v.title}`}>
              <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            </button>
            <div className="vbody">
              <h3 title={v.title}>{v.title}</h3>
              <div className="muted">{v.channel_name}</div>
              <div className="chips"><span className="chip">{v.category}</span>{v.tags.map((t) => <span className="chip alt" key={t}>#{t}</span>)}</div>
              {v.notes && <p className="muted clamp">{v.notes}</p>}
              <div className="row wrap actions">
                <button className="btn" onClick={() => toggleFav(v)} aria-pressed={v.favorite} aria-label="Toggle favourite">{v.favorite ? "★" : "☆"}</button>
                <button className="btn" onClick={() => setPreview(v)}>Preview</button>
                <button className="btn" onClick={() => downloadVideo(v, "video")}>🎬 Video</button>
                <button className="btn" onClick={() => downloadVideo(v, "audio")}>🎵 MP3</button>
                <button className="btn" onClick={() => setEdit(v)}>Edit</button>
                <button className="btn" onClick={() => openExternal(v.source_url)}>YouTube</button>
                <button className="btn danger" onClick={() => remove(v)}>Remove</button>
              </div>
              <select aria-label={`Add ${v.title} to playlist`} value="" onChange={(e) => addToPlaylist(v, e.target.value)}>
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
