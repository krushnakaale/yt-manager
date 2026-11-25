import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import {
  clearSearchHistory, fmtBytes, getSearchHistory, isAutoplayEnabled, isElectron,
  isSearchHistoryEnabled, setAutoplayEnabled, setSearchHistoryEnabled, useLoad,
} from "../util.js";
import { NEON_ACCENTS, PRESETS, contrast, cssVars, resolve } from "../theme.js";
import { useUI } from "../ui.jsx";

function Ratio({ label, a, b }) {
  const r = contrast(a, b);
  return <span className={r >= 4.5 ? "ok" : "err"}>{label}: {r.toFixed(1)}:1 {r >= 4.5 ? "readable" : "low contrast"}</span>;
}

function Appearance({ theme, changeTheme, resetTheme }) {
  const { toast } = useUI();
  const [draft, setDraft] = useState(theme);
  const c = resolve(draft);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const dirty = JSON.stringify(draft) !== JSON.stringify(theme);

  return (
    <div className="card">
      <h2>Appearance</h2>
      <div className="presets" role="radiogroup" aria-label="Theme">
        {Object.entries(PRESETS).map(([id, p]) => (
          <button key={id} role="radio" aria-checked={draft.preset === id} className={"preset" + (draft.preset === id ? " on" : "")}
                  onClick={() => set({ preset: id, accent: null, bg: null, surface: null })}>
            <span className="swatch" style={{ background: p.base.bg, borderColor: p.base.accent }}><i style={{ background: p.base.accent }} /></span>
            <strong>{p.label}</strong><span className="muted">{p.note}</span>
          </button>
        ))}
      </div>

      <div className="row wrap">
        <label>Accent colour
          <input type="color" value={c.accent} onChange={(e) => set({ accent: e.target.value })} />
        </label>
        {(draft.preset === "cyberpunk" || draft.preset === "hacker") && (
          <div className="row" aria-label="Neon accent suggestions">
            {NEON_ACCENTS.map((a) => <button key={a} className="dot" style={{ background: a }} aria-label={`Use accent ${a}`} onClick={() => set({ accent: a })} />)}
          </div>
        )}
        {draft.preset === "custom" && <>
          <label>Background<input type="color" value={c.bg} onChange={(e) => set({ bg: e.target.value })} /></label>
          <label>Surface<input type="color" value={c.surface} onChange={(e) => set({ surface: e.target.value })} /></label>
        </>}
      </div>

      <div className="preview" style={cssVars(draft)} aria-label="Live preview">
        <div className="pv-bar"><strong>ytm_</strong><span className="muted">live preview</span></div>
        <div className="pv-card">
          <strong>Sample video title</strong>
          <span className="muted">Channel name · Category</span>
          <div className="row"><button className="btn primary" tabIndex={-1}>Primary</button><button className="btn" tabIndex={-1}>Secondary</button></div>
        </div>
      </div>
      <p className="muted">
        <Ratio label="Text on background" a={c.text} b={c.bg} /> · <Ratio label="Accent on background" a={c.accent} b={c.bg} />
      </p>

      <label className="check"><input type="checkbox" checked={draft.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> Reduce motion (turns off the blinking cursor and transitions)</label>
      <div className="row end">
        <button className="btn" onClick={() => { resetTheme(); setDraft({ preset: "hacker", accent: null, bg: null, surface: null, reducedMotion: false }); toast("Theme reset to default"); }}>Reset to default</button>
        <button className="btn primary" disabled={!dirty} onClick={() => { changeTheme(draft); toast("Theme applied", "ok"); }}>Apply theme</button>
      </div>
      <p className="muted">Your theme is remembered on this device only.</p>
    </div>
  );
}

function Downloads() {
  const { toast } = useUI();
  const s = useLoad(() => api.get("/api/settings"), []);
  const storage = useLoad(() => api.get("/api/storage"), []);
  const [folder, setFolder] = useState("");
  const save = async (patch) => { try { await api.put("/api/settings", patch); s.reload(); storage.reload(); toast("Saved", "ok"); } catch (e) { toast(e.message, "danger"); } };
  const pick = async () => { const p = await window.ytm.selectFolder(); if (p) save({ download_folder: p }); };
  if (!s.data) return null;
  return (
    <div className="card">
      <h2>Downloads and storage</h2>
      <div className="row">
        <label className="grow">Download folder
          <input defaultValue={s.data.download_folder} onChange={(e) => setFolder(e.target.value)} />
        </label>
        {isElectron() && <button className="btn self-end" onClick={pick}>Browse…</button>}
        <button className="btn self-end" disabled={!folder} onClick={() => save({ download_folder: folder })}>Save folder</button>
      </div>
      <div className="row">
        <label className="grow">Largest allowed file (MB)<input type="number" min={1} max={20000} defaultValue={s.data.max_download_mb} onBlur={(e) => save({ max_download_mb: Number(e.target.value) })} /></label>
        <label className="grow">Simultaneous downloads<input type="number" min={1} max={5} defaultValue={s.data.max_concurrent} onBlur={(e) => save({ max_concurrent: Number(e.target.value) })} /></label>
      </div>
      {storage.data && <p className="muted">Used by this app: {fmtBytes(storage.data.app_used)}{storage.data.disk_free != null && ` · ${fmtBytes(storage.data.disk_free)} free on disk`}</p>}
    </div>
  );
}

function YouTubeApi() {
  const { toast, openExternal } = useUI();
  const s = useLoad(() => api.get("/api/settings"), []);
  const [key, setKey] = useState("");
  const [checking, setChecking] = useState(false);
  const save = async (v) => { try { await api.put("/api/settings", { yt_api_key: v }); setKey(""); s.reload(); toast(v ? "API key saved on the backend" : "API key removed", "ok"); } catch (e) { toast(e.message, "danger"); } };
  const test = async () => {
    setChecking(true);
    try {
      const feed = await api.get("/api/feed/youtube?mode=popular&region=IN");
      toast(`YouTube API works — loaded ${feed.videos.length} videos`, "ok");
    } catch (e) {
      toast(e.message, "danger");
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="card">
      <h2>YouTube Data API</h2>
      <p className="muted">A key enables the Home feed of popular videos across YouTube and YouTube search. It is stored by the backend only and is never returned to this screen.</p>
      <ol className="api-setup-steps">
        <li><button className="text-link" onClick={() => openExternal("https://console.cloud.google.com/apis/library/youtube.googleapis.com")}>Enable YouTube Data API v3 in Google Cloud</button> for a project.</li>
        <li><button className="text-link" onClick={() => openExternal("https://console.cloud.google.com/apis/credentials")}>Open Credentials</button> and create an API key.</li>
        <li>Restrict the key to <strong>YouTube Data API v3</strong>, then paste it below and save.</li>
      </ol>
      <div className="row">
        <label className="grow">API key {s.data?.yt_api_key_set && <span className="ok">(a key is configured)</span>}
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste a new key" />
        </label>
        <button className="btn primary self-end" disabled={!key} onClick={() => save(key)}>Save key</button>
        {s.data?.yt_api_key_set && <button className="btn danger self-end" onClick={() => save("")}>Remove</button>}
      </div>
      {s.data?.yt_api_key_set && <div className="row end"><button className="btn" disabled={checking} onClick={test}>{checking ? "Testing…" : "Test Home feed"}</button></div>}
    </div>
  );
}

function Backup() {
  const { toast } = useUI();
  const ref = useRef(null);
  const exportData = async () => {
    const data = await api.get("/api/backup");
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `ytmanager-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); URL.revokeObjectURL(url);
  };
  const importData = async (e) => {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try {
      const r = await api.post("/api/backup/restore", JSON.parse(await f.text()));
      toast(`Restored: ${r.videos_added} videos added, ${r.videos_skipped} skipped, ${r.playlists_created} playlists created`, "ok");
    } catch (er) { toast("Restore failed: " + er.message, "danger"); }
  };
  return (
    <div className="card">
      <h2>Backup</h2>
      <p className="muted">Export your library and playlists to a JSON file, or merge a backup into this device. Existing videos are never overwritten.</p>
      <div className="row"><button className="btn" onClick={exportData}>Export backup</button><button className="btn" onClick={() => ref.current.click()}>Import backup</button><input ref={ref} type="file" accept="application/json" hidden onChange={importData} /></div>
    </div>
  );
}

function Connection() {
  const { toast } = useUI();
  const [srv, setSrv] = useState(localStorage.getItem("ytm.server") || "");
  const [tok, setTok] = useState(localStorage.getItem("ytm.token") || "");
  const save = () => { localStorage.setItem("ytm.server", srv.trim()); localStorage.setItem("ytm.token", tok.trim()); toast("Saved. Reloading…"); setTimeout(() => location.reload(), 600); };
  return (
    <div className="card">
      <h2>Server connection</h2>
      <p className="muted">The Android app talks to your YT Manager backend. Enter its address (for example https://ytm.example.com) and access token.</p>
      <div className="row">
        <label className="grow">Server address<input value={srv} onChange={(e) => setSrv(e.target.value)} placeholder="http://192.168.1.10:8000" /></label>
        <label className="grow">Access token<input type="password" value={tok} onChange={(e) => setTok(e.target.value)} /></label>
        <button className="btn primary self-end" onClick={save}>Save</button>
      </div>
    </div>
  );
}

function Playback() {
  const { toast } = useUI();
  const [autoPlay, setAutoPlay] = useState(isAutoplayEnabled);
  const toggle = (enabled) => {
    setAutoplayEnabled(enabled);
    setAutoPlay(enabled);
    toast(enabled ? "Autoplay enabled" : "Autoplay disabled", "ok");
  };
  return (
    <div className="card">
      <h2>Playback</h2>
      <label className="check privacy-toggle">
        <input type="checkbox" checked={autoPlay} onChange={(e) => toggle(e.target.checked)} />
        <span><strong>Automatically play next video</strong><small>When a video ends, play the next item in the current feed, library, playlist, or watch-history list. This preference is saved on this device.</small></span>
      </label>
    </div>
  );
}

function Privacy() {
  const { toast, confirm } = useUI();
  const settings = useLoad(() => api.get("/api/settings"), []);
  const [trackSearchHistory, setTrackSearchHistory] = useState(isSearchHistoryEnabled);
  const [searchCount, setSearchCount] = useState(() => getSearchHistory().length);
  const [savingWatchHistory, setSavingWatchHistory] = useState(false);

  useEffect(() => {
    const sync = () => {
      setTrackSearchHistory(isSearchHistoryEnabled());
      setSearchCount(getSearchHistory().length);
    };
    window.addEventListener("ytm-search-history-change", sync);
    return () => window.removeEventListener("ytm-search-history-change", sync);
  }, []);

  const toggleSearchHistory = (enabled) => {
    setSearchHistoryEnabled(enabled);
    setTrackSearchHistory(enabled);
    toast(enabled ? "Search history suggestions enabled" : "Search history suggestions disabled", "ok");
  };
  const clearSearches = async () => {
    if (!(await confirm("Clear all saved search queries on this device?", "Clear search history", true))) return;
    clearSearchHistory();
    setSearchCount(0);
    toast("Search history cleared", "ok");
  };
  const toggleWatchHistory = async (enabled) => {
    setSavingWatchHistory(true);
    try {
      await api.put("/api/settings", { track_watch_history: enabled });
      await settings.reload();
      toast(enabled ? "Watch history tracking enabled" : "Watch history tracking disabled", "ok");
    } catch (e) {
      toast(e.message, "danger");
    } finally {
      setSavingWatchHistory(false);
    }
  };

  return (
    <div className="card privacy-settings">
      <h2>Privacy</h2>
      <label className="check privacy-toggle">
        <input type="checkbox" checked={trackSearchHistory} onChange={(e) => toggleSearchHistory(e.target.checked)} />
        <span><strong>Save search history</strong><small>Show recent searches while the search box is focused. Turning this off stops new saves; existing searches stay until cleared.</small></span>
      </label>
      <div className="row end privacy-action">
        <span className="muted grow">{searchCount} saved searches</span>
        <button className="btn" disabled={!searchCount} onClick={clearSearches}>Clear search history</button>
      </div>
      <label className="check privacy-toggle">
        <input
          type="checkbox"
          checked={settings.data?.track_watch_history ?? true}
          disabled={!settings.data || savingWatchHistory}
          onChange={(e) => toggleWatchHistory(e.target.checked)}
        />
        <span><strong>Track watch history and playback progress</strong><small>When off, new videos and progress are not saved. Existing history is kept until cleared from History.</small></span>
      </label>
      <p className="muted privacy-disclosure">Your library and playlists stay on this device. Requests to YouTube are used for video metadata, thumbnails, the embedded player, and URLs you choose to download. There are no ads or analytics.</p>
    </div>
  );
}

export default function Settings(props) {
  return (
    <section className="settings-page">
      <h1>Settings</h1>
      <Appearance {...props} />
      <Downloads />
      <YouTubeApi />
      <Backup />
      <Playback />
      {!isElectron() && <Connection />}
      <Privacy />
    </section>
  );
}
