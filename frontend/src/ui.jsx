import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { isAutoplayEnabled } from "./util.js";

const Ctx = createContext(null);
export const useUI = () => useContext(Ctx);
const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

function watchIdentity(video) {
  if (Number.isInteger(video?.id)) return { video_id: video.id };
  if (!video?.video_id) return null;
  return {
    youtube_video_id: video.video_id,
    title: video.title,
    channel_name: video.channel_name,
    thumbnail_url: video.thumbnail_url,
  };
}

export function Modal({ title, onClose, children, wide, className = "", minimized = false, headerActions, overlayStyle }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div
      className={"overlay" + (minimized ? " mini-player-overlay" : "")}
      style={minimized ? overlayStyle : undefined}
      onMouseDown={(e) => !minimized && e.target === e.currentTarget && onClose()}
    >
      <div
        className={"modal" + (wide ? " wide" : "") + (className ? ` ${className}` : "") + (minimized ? " is-minimized" : "")}
        role="dialog" aria-modal={!minimized} aria-label={title} tabIndex={-1} ref={ref}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          {headerActions && <div className="modal-head-actions">{headerActions}</div>}
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const playerRef = useRef(null);

  const openPlayer = useCallback((video, onClose, queue = []) => {
    const next = { video, onClose, queue: queue.length ? queue : [video], minimized: false, autoplay: false };
    playerRef.current = next;
    setPlayer(next);
  }, []);
  const playNext = useCallback(() => {
    const current = playerRef.current;
    if (!current) return;
    const currentIndex = current.queue.findIndex((item) => item.video_id === current.video.video_id);
    const nextVideo = current.queue[currentIndex + 1];
    if (!nextVideo) return;
    const next = { ...current, video: nextVideo, autoplay: true };
    playerRef.current = next;
    setPlayer(next);
  }, []);
  const closePlayer = useCallback(() => {
    const current = playerRef.current;
    playerRef.current = null;
    setPlayer(null);
    current?.onClose?.();
  }, []);
  const toggleMinimized = useCallback(() => {
    setPlayer((current) => {
      if (!current) return current;
      const next = { ...current, minimized: !current.minimized };
      playerRef.current = next;
      return next;
    });
  }, []);

  return (
    <PlayerCtx.Provider value={{ openPlayer }}>
      {children}
      {player && <PlayerWindow
        key={player.video.video_id}
        video={player.video}
        minimized={player.minimized}
        autoplay={player.autoplay}
        onClose={closePlayer}
        onToggleMinimized={toggleMinimized}
        onEnded={playNext}
      />}
    </PlayerCtx.Provider>
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

function PlayerWindow({ video, minimized, autoplay, onClose, onToggleMinimized, onEnded }) {
  const { toast } = useUI();
  const playerRef = useRef(null);
  const playerIdRef = useRef(`ytm-player-${video?.video_id || "unknown"}-${Math.random().toString(36).slice(2)}`);
  const [fullscreen, setFullscreen] = useState(false);
  const playerId = playerIdRef.current;
  const historyErrorShown = useRef(false);
  const endedRef = useRef(false);
  const progressSeconds = Number(video?.progress_seconds || 0);
  const [miniSize, setMiniSize] = useState(() => ({
    width: Math.min(360, Math.max(220, window.innerWidth - 24)),
    height: Math.min(260, Math.max(180, window.innerHeight - 100)),
  }));
  const resizeStart = useRef(null);

  const startResize = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStart.current = {
      x: event.clientX,
      y: event.clientY,
      width: miniSize.width,
      height: miniSize.height,
    };
  };
  const resizePlayer = (event) => {
    if (!resizeStart.current) return;
    const maxWidth = Math.max(220, Math.min(640, window.innerWidth - 24));
    const maxHeight = Math.max(180, Math.min(560, window.innerHeight - 100));
    setMiniSize({
      width: Math.min(maxWidth, Math.max(220, resizeStart.current.width - event.clientX + resizeStart.current.x)),
      height: Math.min(maxHeight, Math.max(180, resizeStart.current.height - event.clientY + resizeStart.current.y)),
    });
  };
  const stopResize = () => { resizeStart.current = null; };
  const resizeByKeyboard = (event) => {
    const step = event.shiftKey ? 40 : 16;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    setMiniSize((size) => ({
      width: Math.min(Math.max(220, window.innerWidth - 24), Math.max(220, size.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0))),
      height: Math.min(Math.max(180, window.innerHeight - 100), Math.max(180, size.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0))),
    }));
  };

  useEffect(() => {
    const identity = watchIdentity(video);
    if (!identity) return;
    api.post("/api/history/watch", identity).catch((error) => {
      if (historyErrorShown.current) return;
      historyErrorShown.current = true;
      toast(`Could not save watch history: ${error.message}`, "danger");
    });
  }, [video?.id, video?.video_id, video?.title, video?.channel_name, video?.thumbnail_url, toast]);

  useEffect(() => {
    if (!video?.video_id) return;
    let player = null;
    let poll = null;
    let destroyed = false;
    const identity = watchIdentity(video);

    const saveProgress = () => {
      if (!identity || !player || destroyed) return;
      try {
        const progress = Math.max(0, Number(player.getCurrentTime?.() || 0));
        const duration = Math.max(0, Number(player.getDuration?.() || 0));
        if (progress > 0) {
          api.post("/api/history/watch", {
            ...identity,
            progress_seconds: progress,
            duration_seconds: duration,
            completed: duration > 0 && progress >= duration * 0.95,
          }).catch((error) => {
            if (historyErrorShown.current) return;
            historyErrorShown.current = true;
            toast(`Could not save watch progress: ${error.message}`, "danger");
          });
        }
      } catch { /* The YouTube player may be unavailable while closing. */ }
    };

    const initPlayer = () => {
      if (!window.YT?.Player || destroyed) return;
      player = new window.YT.Player(playerId, {
        events: {
          onReady: (event) => {
            if (progressSeconds > 5) event.target.seekTo(progressSeconds, true);
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              clearInterval(poll);
              poll = setInterval(saveProgress, 5000);
            } else if (event.data === window.YT.PlayerState.PAUSED
              || event.data === window.YT.PlayerState.ENDED) {
              clearInterval(poll);
              poll = null;
              saveProgress();
              if (event.data === window.YT.PlayerState.ENDED && !endedRef.current) {
                endedRef.current = true;
                if (isAutoplayEnabled()) onEnded();
              }
            }
          },
        },
      });
    };

    if (!document.querySelector('script[data-ytm-youtube-api]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.ytmYoutubeApi = "1";
      document.head.appendChild(script);
    }
    if (window.YT?.Player) initPlayer();
    else {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        initPlayer();
      };
    }

    const saveOnClose = () => saveProgress();
    window.addEventListener("beforeunload", saveOnClose);
    return () => {
      saveProgress();
      destroyed = true;
      clearInterval(poll);
      window.removeEventListener("beforeunload", saveOnClose);
      try { player?.destroy?.(); } catch { /* Ignore player cleanup failures. */ }
    };
  }, [video?.video_id, video?.id, video?.title, video?.channel_name, video?.thumbnail_url,
    progressSeconds, playerId, toast, onEnded]);

  useEffect(() => {
    const updateFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    const player = playerRef.current;
    if (document.fullscreenElement !== player && !player?.requestFullscreen) {
      toast("Full-screen mode is not supported on this device.", "danger");
      return;
    }
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else await player.requestFullscreen();
    } catch (error) {
      toast(`Could not change full screen: ${error.message}`, "danger");
    }
  };

  return (
    <Modal
      title={video.title}
      onClose={onClose}
      wide={!minimized}
      minimized={minimized}
      overlayStyle={{ width: `${miniSize.width}px`, height: `${miniSize.height}px` }}
      className="player-modal"
      headerActions={<button
        className="btn ghost player-minimize"
        onClick={onToggleMinimized}
        aria-label={minimized ? "Restore player" : "Minimize player"}
        title={minimized ? "Restore player" : "Minimize player"}
      >{minimized ? "↗" : "−"}</button>}
    >
      <div className="player" ref={playerRef}>
        <iframe
          id={playerId}
          title={video.title}
          src={`https://www.youtube-nocookie.com/embed/${video.video_id}?rel=0&playsinline=1&enablejsapi=1${progressSeconds > 5 ? `&start=${Math.floor(progressSeconds)}` : ""}${autoplay ? "&autoplay=1" : ""}`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
        <button className="btn player-fullscreen" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}>
          {fullscreen ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      {minimized && <button
        className="mini-player-resize"
        onPointerDown={startResize}
        onPointerMove={resizePlayer}
        onPointerUp={stopResize}
        onPointerCancel={stopResize}
        onKeyDown={resizeByKeyboard}
        aria-label="Resize mini player"
        title="Drag to resize; use arrow keys for fine control"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 13 13 5M9 13l4-4M13 13v-1" /></svg>
      </button>}
      {!minimized && <p className="muted">{video.channel_name}. Playback stays in this app using YouTube's official player. Use its Picture-in-Picture control when available; YouTube background playback depends on YouTube and device support.</p>}
    </Modal>
  );
}

export function PreviewModal({ video, queue, onClose }) {
  const { openPlayer } = usePlayer();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    openPlayer(video, () => onCloseRef.current?.(), queue);
  }, [openPlayer, video?.id, video?.video_id]);

  return null;
}

export function Empty({ title, hint, children }) {
  return <div className="empty"><strong>{title}</strong>{hint && <span className="muted">{hint}</span>}{children}</div>;
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return <div className="banner danger" role="alert">{error}{onRetry && <button className="btn" onClick={onRetry}>Retry</button>}</div>;
}
