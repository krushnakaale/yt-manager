import { api } from "../api.js";
import { fmtBytes, fmtClock, useLoad } from "../util.js";
import { ErrorNote } from "../ui.jsx";

export default function Dashboard() {
  const stats = useLoad(() => api.get("/api/stats"), [], 3000);
  const storage = useLoad(() => api.get("/api/storage"), [], 15000);
  const s = stats.data, st = storage.data;
  const usedPct = st?.disk_total ? Math.max(1, Math.round((st.app_used / st.disk_total) * 100)) : 0;

  const cards = s && [
    ["Saved videos", s.videos, `${s.favorites} favourites`],
    ["Playlists", s.playlists, ""],
    ["Completed downloads", s.completed, s.failed ? `${s.failed} failed` : ""],
    ["Active tasks", s.active, s.active ? "running or paused" : "nothing running"],
  ];

  return (
    <section>
      <h1>Dashboard</h1>
      <ErrorNote error={stats.error} onRetry={stats.reload} />
      <div className="cards">
        {cards?.map(([label, n, sub]) => (
          <div className="card stat" key={label}><span className="muted">{label}</span><strong>{n}</strong><span className="muted">{sub}</span></div>
        ))}
        <div className="card stat">
          <span className="muted">Storage used by this app</span>
          <strong>{st ? fmtBytes(st.app_used) : "…"}</strong>
          <div className="bar" aria-hidden="true"><i style={{ width: `${usedPct}%` }} /></div>
          <span className="muted">{st?.disk_free != null ? `${fmtBytes(st.disk_free)} free on disk` : "free space unavailable"}</span>
        </div>
      </div>

      <h2>Activity</h2>
      <div className="terminal" role="log" aria-label="Recent activity">
        {s?.recent?.length ? s.recent.map((e, i) => (
          <div key={i}><span className="muted">{fmtClock(e.at)}</span> <span className={e.kind === "video" ? "t-video" : "t-dl"}>{e.kind === "video" ? "lib" : "dl "}</span> {e.text}</div>
        )) : <div className="muted">No activity yet. Add a video link in the Library to get started.</div>}
        <div><span className="muted">{st?.folder ? `saving to ${st.folder}` : ""}</span></div>
      </div>
    </section>
  );
}
