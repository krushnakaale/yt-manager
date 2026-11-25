import { useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, PreviewModal, useUI } from "../ui.jsx";
import DownloadRow from "./DownloadRow.jsx";

export default function History() {
  const { confirm, toast } = useUI();
  const [status, setStatus] = useState("finished");
  const [preview, setPreview] = useState(null);
  const [previewQueue, setPreviewQueue] = useState([]);
  const [watchQuery, setWatchQuery] = useState("");
  const [activeSection, setActiveSection] = useState("watch");
  const tasks = useLoad(() => api.get(`/api/downloads?status=${status}`), [status], 4000);
  const watched = useLoad(() => api.get("/api/history/watch"), []);
  const visibleWatched = (watched.data || []).filter(({ video }) => {
    const query = watchQuery.trim().toLowerCase();
    return !query || `${video.title} ${video.channel_name}`.toLowerCase().includes(query);
  });
  const openPreview = (video) => {
    setPreview(video);
    setPreviewQueue(visibleWatched.map((row) => ({
      ...row.video,
      progress_seconds: row.progress_seconds || 0,
    })));
  };
  const clear = async () => {
    if (!(await confirm("Clear the list of finished downloads? Files on disk are not deleted.", "Clear list", true))) return;
    await api.del("/api/downloads/finished"); toast("History cleared"); tasks.reload();
  };
  const clearWatchHistory = async () => {
    if (!(await confirm("Clear your watch history and saved playback progress?", "Clear history", true))) return;
    try {
      await api.del("/api/history/watch");
      watched.reload();
      toast("Watch history cleared", "ok");
    } catch (e) {
      toast(e.message, "danger");
    }
  };
  return (
    <section className="history-page">
      <header className="history-page-heading">
        <div>
          <h1>History</h1>
          <p className="muted">Pick up where you left off or revisit something you watched.</p>
        </div>
      </header>

      <div className="history-tabs" role="tablist" aria-label="History sections">
        <button id="watch-history-tab" className={activeSection === "watch" ? "active" : ""}
          role="tab" aria-selected={activeSection === "watch"} aria-controls="watch-history-panel"
          onClick={() => setActiveSection("watch")}>Watch history</button>
        <button id="download-history-tab" className={activeSection === "downloads" ? "active" : ""}
          role="tab" aria-selected={activeSection === "downloads"} aria-controls="download-history-panel"
          onClick={() => setActiveSection("downloads")}>Download history</button>
      </div>

      {activeSection === "watch" && <section id="watch-history-panel" className="history-section" role="tabpanel"
        aria-labelledby="watch-history-tab" tabIndex={0}>
        <div className="history-section-heading">
          <div>
            <h2 id="watch-history-title">Watch history</h2>
            <span className="muted">{watched.data?.length || 0} videos</span>
          </div>
          <div className="row wrap history-tools">
            <label className="history-search">
              <span className="sr-only">Search watch history</span>
              <span aria-hidden="true">⌕</span>
              <input value={watchQuery} onChange={(e) => setWatchQuery(e.target.value)} placeholder="Search watch history" />
            </label>
            {watched.data?.length > 0 && <button className="btn" onClick={clearWatchHistory}>Clear watch history</button>}
          </div>
        </div>
        <ErrorNote error={watched.error} onRetry={watched.reload} />
        {watched.data && visibleWatched.length === 0 && (
          <Empty
            title={watchQuery ? "No matching videos" : "Your watch history is empty"}
            hint={watchQuery ? "Try another title or channel name." : "Videos you play from Home, Search, or your library will show up here."}
          />
        )}
        <div className="watch-history-list">
          {visibleWatched.map((row) => {
            const progress = row.duration_seconds
              ? Math.min(100, Math.max(0, row.progress_seconds / row.duration_seconds * 100))
              : 0;
            const resumable = row.progress_seconds > 5 && !row.completed;
            return (
              <article className="watch-history-item" key={row.video.id}>
                <button className="watch-history-thumb" onClick={() => openPreview({
                  ...row.video,
                  progress_seconds: resumable ? row.progress_seconds : 0,
                })} aria-label={`${resumable ? "Continue" : "Watch"} ${row.video.title}`}>
                  <img src={row.video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  <span className="watch-history-play" aria-hidden="true">▶</span>
                  {row.duration_seconds > 0 && <span className="watch-progress-track">
                    <i className={row.completed ? "complete" : ""} style={{ width: `${row.completed ? 100 : progress}%` }} />
                  </span>}
                </button>
                <div className="watch-history-copy">
                  <h3 title={row.video.title}>{row.video.title}</h3>
                  <p className="muted">{row.video.channel_name || "Unknown channel"}</p>
                  <p className="watch-history-meta">
                    {resumable ? `Watched ${Math.round(progress)}%` : row.completed ? "Watched" : "In watch history"}
                    {row.watched_at && ` · ${new Date(row.watched_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button className="btn watch-history-action" onClick={() => openPreview({
                  ...row.video,
                  progress_seconds: resumable ? row.progress_seconds : 0,
                })}>{resumable ? "Continue" : "Watch again"}</button>
              </article>
            );
          })}
        </div>
      </section>}

      {activeSection === "downloads" && <section id="download-history-panel" className="history-section download-history-section"
        role="tabpanel" aria-labelledby="download-history-tab" tabIndex={0}>
        <div className="history-section-heading">
          <div>
            <h2 id="download-history-title">Download history</h2>
            <span className="muted">Your completed and cancelled downloads</span>
          </div>
          <div className="row wrap history-tools">
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter downloads by status">
              <option value="finished">All finished</option><option value="completed">Completed</option>
              <option value="failed">Failed</option><option value="cancelled">Cancelled</option>
            </select>
            <button className="btn" onClick={clear}>Clear list</button>
          </div>
        </div>
        <ErrorNote error={tasks.error} onRetry={tasks.reload} />
        {tasks.data && !tasks.data.length && <Empty title="No downloads in this view" hint="Completed, failed and cancelled downloads appear here." />}
        {tasks.data?.map((t) => <DownloadRow key={t.id} t={t} reload={tasks.reload} />)}
      </section>}
      {preview && <PreviewModal video={preview} queue={previewQueue} onClose={() => setPreview(null)} />}
    </section>
  );
}
