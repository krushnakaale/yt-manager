import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useLoad } from "../util.js";
import { Empty, ErrorNote, useUI } from "../ui.jsx";
import DownloadRow from "./DownloadRow.jsx";

const VIDEO_QUALITIES = [
  { id: "best", label: "Best Available (Max)" },
  { id: "1080p", label: "1080p (Full HD)" },
  { id: "720p", label: "720p (HD)" },
  { id: "480p", label: "480p (SD)" },
  { id: "360p", label: "360p (Data Saver)" },
];

const AUDIO_QUALITIES = [
  { id: "320k", label: "320 kbps (High Fidelity)" },
  { id: "192k", label: "192 kbps (Standard HQ)" },
  { id: "128k", label: "128 kbps (Normal)" },
];

export default function Downloads() {
  const { toast } = useUI();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState("video");
  const [quality, setQuality] = useState("best");
  const [customPath, setCustomPath] = useState("");
  const [busy, setBusy] = useState(false);

  // Playlist states
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [plStart, setPlStart] = useState("1");
  const [plEnd, setPlEnd] = useState("");
  const [plInfo, setPlInfo] = useState(null);
  const [checkingPl, setCheckingPl] = useState(false);

  const fileRef = useRef(null);
  const tasks = useLoad(() => api.get("/api/downloads?status=active"), [], 1000);
  const settings = useLoad(() => api.get("/api/settings"), []);

  const isPlaylistUrl = url.includes("list=") || url.includes("playlist");

  // When format switches, update quality default
  const changeFormat = (newFmt) => {
    setFormat(newFmt);
    setQuality(newFmt === "audio" ? "192k" : "best");
  };

  // Auto-detect playlist URL
  useEffect(() => {
    if (isPlaylistUrl && !isPlaylist) {
      setIsPlaylist(true);
    }
  }, [url]);

  const checkPlaylist = async () => {
    if (!url.trim()) return;
    setCheckingPl(true);
    try {
      const data = await api.get(`/api/downloads/playlist-info?url=${encodeURIComponent(url.trim())}`);
      setPlInfo(data);
      if (data.total && !plEnd) {
        setPlEnd(String(Math.min(data.total, 10)));
      }
      toast(`Found playlist: "${data.title}" (${data.total} items)`, "ok");
    } catch (e) {
      toast(e.message, "danger");
    }
    setCheckingPl(false);
  };

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        url: url.trim(),
        filename: name.trim() || null,
        format: format,
        quality: quality,
        custom_path: customPath.trim() || null,
        is_playlist: isPlaylist && isPlaylistUrl,
        playlist_start: isPlaylist && isPlaylistUrl ? parseInt(plStart, 10) || 1 : null,
        playlist_end: isPlaylist && isPlaylistUrl && plEnd ? parseInt(plEnd, 10) : null,
      };

      const res = await api.post("/api/downloads", payload);
      setUrl("");
      setName("");
      setIsPlaylist(false);
      setPlInfo(null);
      tasks.reload();

      if (res.queued) {
        toast(`Queued ${res.queued} items from "${res.playlist}"`, "ok");
      } else {
        toast(`Started ${format === "audio" ? "audio (MP3)" : "video"} download: ${res.filename}`, "ok");
      }
    } catch (er) {
      toast(er.message, "danger");
    }
    setBusy(false);
  };

  const chooseFolder = async () => {
    const p = await window.ytm?.selectFolder();
    if (!p) return;
    try {
      await api.put("/api/settings", { download_folder: p });
      settings.reload();
      toast("Default download folder updated", "ok");
    } catch (er) {
      toast(er.message, "danger");
    }
  };

  const chooseCustomFolder = async () => {
    const p = await window.ytm?.selectFolder();
    if (p) setCustomPath(p);
  };

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      await api.upload("/api/downloads/upload", f);
      toast(`Added ${f.name} to your folder`, "ok");
    } catch (er) {
      toast(er.message, "danger");
    }
  };

  const submitLabel = () => {
    if (busy) return "Starting…";
    if (isPlaylist && isPlaylistUrl) {
      const count = plEnd ? `${plStart} to ${plEnd}` : `from #${plStart}`;
      return `Download Playlist (${count})`;
    }
    return `Download ${format === "audio" ? "MP3 Music" : "Video"} (${quality})`;
  };

  return (
    <section>
      <h1>Download center</h1>
      <p className="muted">
        Download single YouTube videos, whole playlists/ranges, or direct files with custom quality & custom folders.
      </p>

      <form className="card" onSubmit={start}>
        <label>
          YouTube video, playlist, or direct file URL
          <input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=... or https://www.youtube.com/playlist?list=..."
          />
        </label>

        {/* Playlist Detection & Range Options */}
        {isPlaylistUrl && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "8px",
              padding: "0.8rem 1rem",
              margin: "0.4rem 0",
            }}
          >
            <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>🎵 YouTube Playlist Detected</span>
              <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", margin: 0 }}>
                <input
                  type="checkbox"
                  checked={isPlaylist}
                  onChange={(e) => setIsPlaylist(e.target.checked)}
                />
                <span>Download as Playlist Range</span>
              </label>
            </div>

            {isPlaylist && (
              <div style={{ marginTop: "0.8rem" }}>
                <div className="row wrap" style={{ gap: "1rem", alignItems: "flex-end" }}>
                  <label style={{ flex: 1, minWidth: "110px", margin: 0 }}>
                    From video #:
                    <input
                      type="number"
                      min="1"
                      value={plStart}
                      onChange={(e) => setPlStart(e.target.value)}
                      placeholder="1"
                      required={isPlaylist}
                    />
                  </label>
                  <label style={{ flex: 1, minWidth: "110px", margin: 0 }}>
                    To video #:
                    <input
                      type="number"
                      min={plStart || "1"}
                      value={plEnd}
                      onChange={(e) => setPlEnd(e.target.value)}
                      placeholder="e.g. 10 (blank for all)"
                    />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={checkingPl}
                    onClick={checkPlaylist}
                  >
                    {checkingPl ? "Checking…" : "Check Playlist Info"}
                  </button>
                </div>
                {plInfo && (
                  <p className="muted" style={{ margin: "0.5rem 0 0 0", fontSize: "0.88rem" }}>
                    Playlist: <strong>{plInfo.title}</strong> ({plInfo.total} total items available)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Format Selection (Video vs Music) */}
        <div className="row wrap" style={{ gap: "1.2rem", alignItems: "center", margin: "0.3rem 0" }}>
          <span className="muted" style={{ fontWeight: 600 }}>Format:</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="dl-format"
              value="video"
              checked={format === "video"}
              onChange={() => changeFormat("video")}
            />
            <span>🎬 Video (MP4)</span>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="dl-format"
              value="audio"
              checked={format === "audio"}
              onChange={() => changeFormat("audio")}
            />
            <span>🎵 Music / Audio (MP3)</span>
          </label>
        </div>

        {/* Quality Selection */}
        <div className="row wrap" style={{ gap: "1rem", alignItems: "center" }}>
          <label className="grow" style={{ margin: 0 }}>
            Quality:
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              {(format === "audio" ? AUDIO_QUALITIES : VIDEO_QUALITIES).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </label>

          {!isPlaylist && (
            <label className="grow" style={{ margin: 0 }}>
              Save as (optional):
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Use video title (${format === "audio" ? ".mp3" : ".mp4"})`}
                maxLength={200}
              />
            </label>
          )}
        </div>

        {/* Custom Folder Path */}
        <div className="row wrap" style={{ alignItems: "flex-end", gap: "0.5rem", marginTop: "0.3rem" }}>
          <label className="grow" style={{ margin: 0 }}>
            Custom destination folder (optional):
            <input
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder={`Default: ${settings.data?.download_folder || "Downloads"}`}
            />
          </label>
          {window.ytm && (
            <button type="button" className="btn" onClick={chooseCustomFolder}>
              Browse Folder…
            </button>
          )}
          {customPath && (
            <button type="button" className="btn" onClick={() => setCustomPath("")}>
              Clear
            </button>
          )}
        </div>

        <div className="row" style={{ marginTop: "0.5rem" }}>
          <button className="btn primary" disabled={busy} style={{ minWidth: "160px" }}>
            {submitLabel()}
          </button>
        </div>

        {/* Folder bar */}
        <div className="row wrap" style={{ marginTop: "0.6rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "0.6rem" }}>
          <span className="muted grow ell">
            Default folder: <span className="mono">{settings.data?.download_folder ?? "…"}</span>
          </span>
          {window.ytm && (
            <button type="button" className="btn" onClick={chooseFolder}>
              Change default folder
            </button>
          )}
          {window.ytm && settings.data && (
            <button
              type="button"
              className="btn"
              onClick={() => window.ytm.openFolder(customPath || settings.data.download_folder)}
            >
              Open folder
            </button>
          )}
          <button type="button" className="btn" onClick={() => fileRef.current.click()}>
            Add my own file
          </button>
          <input ref={fileRef} type="file" hidden onChange={upload} />
        </div>
      </form>

      <ErrorNote error={tasks.error} onRetry={tasks.reload} />
      {tasks.data && !tasks.data.length && (
        <Empty title="No active downloads" hint="Finished ones are listed under History." />
      )}
      {tasks.data?.map((t) => (
        <DownloadRow key={t.id} t={t} reload={tasks.reload} />
      ))}
    </section>
  );
}
