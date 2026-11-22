import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, PreviewModal, useUI } from "../ui.jsx";

export default function Playlists({ arg }) {
  const { toast, confirm } = useUI();
  const list = useLoad(() => api.get("/api/playlists"), []);
  const selected = arg ? Number(arg) : null;
  const detail = useLoad(() => (selected ? api.get(`/api/playlists/${selected}`) : Promise.resolve(null)), [selected]);
  const [name, setName] = useState("");
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [preview, setPreview] = useState(null);

  useEffect(() => { if (detail.data) setDraft({ name: detail.data.name, description: detail.data.description }); }, [detail.data?.id, detail.data?.name]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { const p = await api.post("/api/playlists", { name }); setName(""); await list.reload(); location.hash = `#/playlists/${p.id}`; }
    catch (er) { toast(er.message, "danger"); }
  };
  const save = async () => {
    try { await api.patch(`/api/playlists/${selected}`, draft); toast("Saved", "ok"); list.reload(); detail.reload(); } catch (er) { toast(er.message, "danger"); }
  };
  const del = async () => {
    if (!(await confirm(`Delete the playlist “${detail.data.name}”? Your saved videos stay in the library.`, "Delete playlist", true))) return;
    await api.del(`/api/playlists/${selected}`); location.hash = "#/playlists"; list.reload();
  };
  const move = async (i, d) => {
    const ids = detail.data.videos.map((v) => v.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.put(`/api/playlists/${selected}/order`, { video_ids: ids }); detail.reload();
  };
  const remove = async (v) => { await api.del(`/api/playlists/${selected}/items/${v.id}`); detail.reload(); list.reload(); };

  return (
    <section>
      <h1>Playlists</h1>
      <ErrorNote error={list.error} onRetry={list.reload} />
      <div className="split">
        <div>
          <form className="row" onSubmit={create}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" aria-label="New playlist name" maxLength={100} />
            <button className="btn primary">Create</button>
          </form>
          <div className="list">
            {list.data?.map((p) => (
              <a key={p.id} href={`#/playlists/${p.id}`} className={"line link" + (p.id === selected ? " active" : "")}>
                <span className="grow">{p.name}</span><span className="muted">{p.count}</span>
              </a>
            ))}
            {list.data && !list.data.length && <Empty title="No playlists yet" hint="Name one above to start organizing." />}
          </div>
        </div>

        <div>
          {!selected && <Empty title="Select a playlist" hint="Its videos and ordering show up here." />}
          {selected && detail.error && <ErrorNote error={detail.error} />}
          {detail.data && (
            <>
              <div className="card">
                <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={100} /></label>
                <label>Description<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} maxLength={300} /></label>
                <div className="row end"><button className="btn danger" onClick={del}>Delete playlist</button><button className="btn primary" onClick={save}>Save changes</button></div>
              </div>
              {!detail.data.videos.length && <Empty title="This playlist is empty" hint="Use “Add to playlist…” on a video in the Library." />}
              <ol className="list ordered">
                {detail.data.videos.map((v, i) => (
                  <li className="line" key={v.id}>
                    <img src={v.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="mini" />
                    <div className="grow"><strong>{v.title}</strong><div className="muted">{v.channel_name}</div></div>
                    <button className="btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="btn" onClick={() => move(i, 1)} disabled={i === detail.data.videos.length - 1} aria-label="Move down">↓</button>
                    <button className="btn" onClick={() => setPreview(v)}>Play</button>
                    <button className="btn danger" onClick={() => remove(v)}>Remove</button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
      {preview && <PreviewModal video={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
