import { useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, useUI } from "../ui.jsx";
import DownloadRow from "./DownloadRow.jsx";

export default function History() {
  const { confirm, toast } = useUI();
  const [status, setStatus] = useState("finished");
  const tasks = useLoad(() => api.get(`/api/downloads?status=${status}`), [status], 4000);
  const clear = async () => {
    if (!(await confirm("Clear the list of finished downloads? Files on disk are not deleted.", "Clear list", true))) return;
    await api.del("/api/downloads/finished"); toast("History cleared"); tasks.reload();
  };
  return (
    <section>
      <h1>Download history</h1>
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
