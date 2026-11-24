import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, PreviewModal, useUI } from "../ui.jsx";

function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) : "";
}

function PlaylistCover({ playlist, large = false }) {
  const thumbnails = playlist.cover_thumbnails || playlist.videos?.map((video) => video.thumbnail_url).filter(Boolean) || [];
  const count = playlist.count ?? playlist.videos?.length ?? 0;
  return (
    <div className={"playlist-cover" + (large ? " large" : "")} style={{ "--playlist-color": `hsl(${(playlist.id * 83) % 360} 45% 28%)` }}>
      {thumbnails.length > 0 && <div className="playlist-cover-mosaic" aria-hidden="true">
        {thumbnails.slice(0, 4).map((src, index) => <img src={src} alt="" key={`${src}-${index}`} loading="lazy" referrerPolicy="no-referrer" />)}
      </div>}
      <div className="playlist-cover-count"><strong>{count}</strong><span>{count === 1 ? "video" : "videos"}</span></div>
      <span className="playlist-cover-icon" aria-hidden="true">▶</span>
    </div>
  );
}

export default function Playlists({ arg }) {
  const { toast, confirm } = useUI();
  const list = useLoad(() => api.get("/api/playlists"), []);
  const selected = arg ? Number(arg) : null;
  const detail = useLoad(() => (selected ? api.get(`/api/playlists/${selected}`) : Promise.resolve(null)), [selected]);
  const [newPlaylist, setNewPlaylist] = useState({ name: "", description: "" });
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [preview, setPreview] = useState(null);
  const [editing, setEditing] = useState(false);
  const playlist = detail.data?.id === selected ? detail.data : null;

  useEffect(() => {
    if (playlist) {
      setDraft({ name: playlist.name, description: playlist.description });
      setEditing(false);
    }
  }, [playlist?.id, playlist?.name, playlist?.description]);

  const create = async (e) => {
    e.preventDefault();
    if (!newPlaylist.name.trim()) return;
    try {
      const p = await api.post("/api/playlists", newPlaylist);
      setNewPlaylist({ name: "", description: "" });
      await list.reload();
      location.hash = `#/playlists/${p.id}`;
    }
    catch (er) { toast(er.message, "danger"); }
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/api/playlists/${selected}`, draft);
      toast("Playlist details saved", "ok");
      setEditing(false);
      list.reload();
      detail.reload();
    } catch (er) { toast(er.message, "danger"); }
  };
  const del = async () => {
    if (!(await confirm(`Delete the playlist “${detail.data.name}”? Your saved videos stay in the library.`, "Delete playlist", true))) return;
    try { await api.del(`/api/playlists/${selected}`); location.hash = "#/playlists"; list.reload(); }
    catch (er) { toast(er.message, "danger"); }
  };
  const move = async (i, d) => {
    const ids = detail.data.videos.map((v) => v.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api.put(`/api/playlists/${selected}/order`, { video_ids: ids }); detail.reload(); }
    catch (er) { toast(er.message, "danger"); }
  };
  const remove = async (v) => {
    if (!(await confirm(`Remove “${v.title}” from this playlist?`, "Remove video", true))) return;
    try { await api.del(`/api/playlists/${selected}/items/${v.id}`); detail.reload(); list.reload(); }
    catch (er) { toast(er.message, "danger"); }
  };

  return (
    <section className="playlists-page">
      <header className="page-heading">
        <div>
          <h1>{playlist?.name || "Your playlists"}</h1>
          <p className="muted">{playlist ? "Manage the videos and details in this playlist." : "Create collections and keep your saved videos organized."}</p>
        </div>
        {selected && <a className="btn" href="#/playlists">All playlists</a>}
      </header>
      <ErrorNote error={list.error} onRetry={list.reload} />
      {!selected && <>
        <form className="card playlist-create" onSubmit={create}>
          <div><h2>Create a playlist</h2><p className="muted">Give it a name and optional description.</p></div>
          <label>Playlist name<input value={newPlaylist.name} onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })} placeholder="e.g. Weekend watchlist" aria-label="Playlist name" maxLength={100} required /></label>
          <label>Description<input value={newPlaylist.description} onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })} placeholder="What are you collecting?" aria-label="Playlist description" maxLength={300} /></label>
          <button className="btn primary self-end">Create playlist</button>
        </form>
        {list.data?.length > 0 && <div className="playlist-summary muted">{list.data.length} {list.data.length === 1 ? "playlist" : "playlists"} · {list.data.reduce((total, item) => total + item.count, 0)} videos saved</div>}
        {list.data && !list.data.length && <Empty title="Your playlists will live here" hint="Create your first playlist, then add saved videos from the Library.">
          <a className="btn" href="#/library">Browse your library</a>
        </Empty>}
        {!list.data && !list.error && <div className="empty"><strong>Loading playlists…</strong></div>}
        <div className="playlist-grid">
          {list.data?.map((p) => (
            <a key={p.id} href={`#/playlists/${p.id}`} className="playlist-card">
              <PlaylistCover playlist={p} />
              <div className="playlist-card-body">
                <h2>{p.name}</h2>
                <p className="muted">{p.description || "No description"}</p>
                <span className="muted">{p.count} {p.count === 1 ? "video" : "videos"}{p.updated_at ? ` · Updated ${dateLabel(p.updated_at)}` : ""}</span>
              </div>
            </a>
          ))}
        </div>
      </>}

      {selected && <div className="playlist-detail-layout">
        <aside className="playlist-sidebar">
          <div className="playlist-sidebar-heading"><strong>Your playlists</strong><a href="#/playlists">View all</a></div>
          {list.data?.map((p) => (
            <a key={p.id} href={`#/playlists/${p.id}`} className={"playlist-sidebar-link" + (p.id === selected ? " active" : "")}>
              <span className="playlist-sidebar-thumb">{p.cover_thumbnails?.[0] && <img src={p.cover_thumbnails[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />}</span>
              <span className="grow"><strong>{p.name}</strong><small>{p.count} {p.count === 1 ? "video" : "videos"}</small></span>
            </a>
          ))}
        </aside>
        <div className="playlist-detail-main">
          <ErrorNote error={detail.error} onRetry={detail.reload} />
          {!playlist && !detail.error && <div className="empty"><strong>Loading playlist…</strong></div>}
          {playlist && <>
            <div className="playlist-hero">
              <PlaylistCover playlist={playlist} large />
              <div className="playlist-hero-copy">
                <span className="eyebrow">PLAYLIST</span>
                <h2>{playlist.name}</h2>
                <p className="muted">{playlist.description || "A collection of videos saved to your library."}</p>
                <p className="muted">{playlist.videos.length} {playlist.videos.length === 1 ? "video" : "videos"}{playlist.created_at ? ` · Created ${dateLabel(playlist.created_at)}` : ""}</p>
                <div className="row wrap">
                  {playlist.videos.length > 0 && <button className="btn primary" onClick={() => setPreview(playlist.videos[0])}>Play first video</button>}
                  <button className="btn" onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit details"}</button>
                  <button className="btn danger" onClick={del}>Delete playlist</button>
                </div>
              </div>
            </div>
            {editing && <form className="card playlist-edit-form" onSubmit={save}>
              <h2>Edit playlist details</h2>
              <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} required /></label>
              <label>Description<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={300} /></label>
              <div className="row end"><button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button><button className="btn primary">Save changes</button></div>
            </form>}
            <div className="playlist-videos-heading"><h2>Videos</h2><span className="muted">Use the arrows to change the order.</span></div>
            {!playlist.videos.length && <Empty title="This playlist is empty" hint="Add saved videos from your Library to start watching here.">
              <a className="btn primary" href="#/library">Add videos from Library</a>
            </Empty>}
            <ol className="playlist-video-list">
              {playlist.videos.map((v, i) => (
                <li className="playlist-video-row" key={v.id}>
                  <span className="playlist-position">{String(i + 1).padStart(2, "0")}</span>
                  <button className="playlist-item-thumb" onClick={() => setPreview(v)} aria-label={`Play ${v.title}`}>
                    <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>▶</span>
                  </button>
                  <div className="playlist-item-copy"><h3 title={v.title}>{v.title}</h3><span className="muted">{v.channel_name || "Unknown channel"}</span></div>
                  <div className="row wrap playlist-item-actions">
                    <button className="btn" onClick={() => setPreview(v)}>Play</button>
                    <button className="btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${v.title} up`}>↑</button>
                    <button className="btn" onClick={() => move(i, 1)} disabled={i === playlist.videos.length - 1} aria-label={`Move ${v.title} down`}>↓</button>
                    <button className="btn danger" onClick={() => remove(v)}>Remove</button>
                  </div>
                </li>
              ))}
            </ol>
          </>}
        </div>
      </div>}
      {preview && <PreviewModal video={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
