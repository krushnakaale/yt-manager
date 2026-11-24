import { useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, useUI } from "../ui.jsx";
import DownloadRow from "./DownloadRow.jsx";

export default function History() {
  const { confirm, toast } = useUI();
  const [status, setStatus] = useState("finished");
  const tasks = useLoad(() => api.get(`/api/downloads?status=${status}`), [status], 4000);
  const watched = useLoad(() => api.get("/api/history/watch"), []);
  const clear = async () => {
    if (!(await confirm("Clear the list of finished downloads? Files on disk are not deleted.", "Clear list", true))) return;
    await api.del("/api/downloads/finished"); toast("History cleared"); tasks.reload();
  };
  return (
    <section>
      <h1>History</h1>
      <h2>Recently watched</h2>
      <div className="row wrap" style={{ marginBottom: "12px" }}>
        {watched.data?.length ? watched.data.slice(0, 12).map((row) => (
          <button className="mini-history" key={row.video.id} onClick={() => location.hash = "#/dashboard"} title={row.video.title}>
            <img src={row.video.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
            <span>{row.video.title}</span>
          </button>
        )) : <div className="muted">Videos you preview will appear here.</div>}
        {watched.data?.length > 0 && <button className="btn danger" onClick={async () => {
          if (await confirm("Clear watch history?", "Clear", true)) { await api.del("/api/history/watch"); watched.reload(); toast("Watch history cleared"); }
        }}>Clear watch history</button>}
      </div>
      <h2>Download history</h2>
      <div className="row wrap toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="finished">All finished</option><option value="completed">Completed</option>
          <option value="failed">Failed</option><option value="cancelled">Cancelled</option>
        </select>
        <span className="grow" />
        <button className="btn danger" onClick={clear}>Clear history</button>
      </div>
      <ErrorNote error={tasks.error} onRetry={tasks.reload} />
      {tasks.data && !tasks.data.length && <Empty title="Nothing here yet" hint="Completed, failed and cancelled downloads appear in this list." />}
      {tasks.data?.map((t) => <DownloadRow key={t.id} t={t} reload={tasks.reload} />)}
    </section>
  );
}
