import { api } from "../api.js";
import { fmtBytes, fmtDate, fmtSpeed, isAndroid, pct } from "../util.js";
import { saveToDevice } from "../native.js";
import { useUI } from "../ui.jsx";

const LABEL = { queued: "Queued", downloading: "Downloading", paused: "Paused", completed: "Completed", failed: "Failed", cancelled: "Cancelled" };

export default function DownloadRow({ t, reload }) {
  const { toast, confirm } = useUI();
  const act = (fn) => async () => { try { await fn(); } catch (e) { toast(e.message, "danger"); } reload(); };
  const live = ["queued", "downloading"].includes(t.status);
  const missing = t.status === "completed" && t.file_exists === false;

  const removeFile = async () => {
    if (!(await confirm(`Delete “${t.filename}” from your device? This cannot be undone.`, "Delete file", true))) return;
    await api.del(`/api/downloads/${t.id}/file?confirm=true`); toast("File deleted"); reload();
  };
  const save = async () => { try { await saveToDevice(t); toast("Saved to Documents/YTManager", "ok"); } catch (e) { toast("Could not save: " + e.message, "danger"); } };

  return (
    <div className={"card dl " + t.status}>
      <div className="row" style={{ alignItems: "center", gap: "0.5rem" }}>
        <strong className="grow ell" title={t.filename}>{t.filename}</strong>
        {t.quality && <span className="chip alt" style={{ fontSize: "0.75rem" }}>{t.quality}</span>}
        <span className={"badge " + t.status}>{LABEL[t.status]}</span>
      </div>
      {["queued", "downloading", "paused"].includes(t.status) && (
        <>
          <div className="bar" role="progressbar" aria-valuenow={pct(t)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress for ${t.filename}`}>
            <i style={{ width: `${t.total_bytes ? pct(t) : t.status === "downloading" ? 12 : 0}%` }} />
          </div>
          <div className="muted">
            {fmtBytes(t.bytes_received)}{t.total_bytes ? ` of ${fmtBytes(t.total_bytes)} (${pct(t)}%)` : " (size unknown)"} {fmtSpeed(t.speed)}
          </div>
        </>
      )}
      {t.status === "completed" && <div className="muted">{fmtBytes(t.total_bytes)} · {fmtDate(t.completed_at)} · {t.folder}</div>}
      {t.sha256 && <div className="muted mono" title={t.sha256}>sha256 {t.sha256.slice(0, 16)}…</div>}
      {t.error && <div className="err">{t.error}</div>}
      {t.warning && <div className="warnnote">Untrusted file: {t.warning}</div>}
      {missing && <div className="warnnote">File not found. It was moved or deleted outside the app.</div>}
      <div className="row wrap actions">
        {t.status === "downloading" && <button className="btn" onClick={act(() => api.post(`/api/downloads/${t.id}/pause`))}>Pause</button>}
        {["paused", "failed"].includes(t.status) && <button className="btn" onClick={act(() => api.post(`/api/downloads/${t.id}/resume`))}>{t.status === "failed" ? "Retry" : "Resume"}</button>}
        {["queued", "downloading", "paused", "failed"].includes(t.status) && <button className="btn danger" onClick={act(() => api.post(`/api/downloads/${t.id}/cancel`))}>Cancel</button>}
        {t.status === "completed" && !missing && window.ytm && <>
          <button className="btn" onClick={() => window.ytm.showItem(t.destination)}>Show in folder</button>
        </>}
        {t.status === "completed" && !missing && isAndroid() && <button className="btn" onClick={save}>Save to device</button>}
        {t.status === "completed" && !missing && <button className="btn danger" onClick={removeFile}>Delete file</button>}
        {!live && <button className="btn" onClick={act(() => api.del(`/api/downloads/${t.id}`))}>Remove from list</button>}
      </div>
    </div>
  );
}
