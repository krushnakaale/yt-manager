import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);

export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const toast = useCallback((msg, kind = "info") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const confirm = useCallback((message, okLabel = "Confirm", danger = false) =>
    new Promise((res) => setDialog({ message, okLabel, danger, res })), []);

  const answer = (v) => { dialog.res(v); setDialog(null); };

  /** External links never open on their own: always ask first. */
  const openExternal = useCallback(async (url) => {
    if (!(await confirm(`Open this link in your browser?\n${url}`, "Open"))) return;
    if (window.ytm?.openExternal) window.ytm.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  }, [confirm]);

  return (
    <Ctx.Provider value={{ toast, confirm, openExternal }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={"toast " + t.kind}>{t.msg}</div>)}
      </div>
      {dialog && (
        <Modal title="Please confirm" onClose={() => answer(false)}>
          <p className="pre">{dialog.message}</p>
          <div className="row end">
            <button className="btn" onClick={() => answer(false)}>Cancel</button>
            <button className={"btn " + (dialog.danger ? "danger" : "primary")} onClick={() => answer(true)}>{dialog.okLabel}</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function PreviewModal({ video, onClose }) {
  const { openExternal } = useUI();
  return (
    <Modal title={video.title} onClose={onClose} wide>
      <div className="player">
        <iframe
          title={video.title}
          src={`https://www.youtube-nocookie.com/embed/${video.video_id}?rel=0`}
          allow="encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <p className="muted">{video.channel_name}. Playback uses YouTube's official embedded player; if the owner blocks embedding, use “Open on YouTube”.</p>
      <div className="row end"><button className="btn" onClick={() => openExternal(video.source_url)}>Open on YouTube</button></div>
    </Modal>
  );
}

export function Empty({ title, hint, children }) {
  return <div className="empty"><strong>{title}</strong>{hint && <span className="muted">{hint}</span>}{children}</div>;
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return <div className="banner danger" role="alert">{error}{onRetry && <button className="btn" onClick={onRetry}>Retry</button>}</div>;
}
