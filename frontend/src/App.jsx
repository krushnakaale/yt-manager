import { useEffect, useState } from "react";
import { UIProvider } from "./ui.jsx";
import { api } from "./api.js";
import { applyTheme, loadTheme, saveTheme, DEFAULT_THEME } from "./theme.js";
import Dashboard from "./pages/Dashboard.jsx";
import Library from "./pages/Library.jsx";
import Playlists from "./pages/Playlists.jsx";
import Downloads from "./pages/Downloads.jsx";
import History from "./pages/History.jsx";
import Settings from "./pages/Settings.jsx";
import About from "./pages/About.jsx";

const NAV = [
  ["dashboard", "Home", "⌂", Dashboard],
  ["library", "Library", "▦", Library],
  ["playlists", "Playlists", "☷", Playlists],
  ["downloads", "Downloads", "↓", Downloads],
  ["history", "History", "◷", History],
  ["settings", "Settings", "⚙", Settings],
  ["about", "About", "i", About],
];

const parse = () => {
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const [, page = "dashboard", arg] = path.split("/");
  return {
    page: NAV.some((n) => n[0] === page) ? page : "dashboard",
    arg,
    query: new URLSearchParams(query).get("q") || "",
  };
};

export default function App() {
  const [route, setRoute] = useState(parse);
  const [theme, setTheme] = useState(() => { const t = loadTheme(); applyTheme(t); return t; });
  const [online, setOnline] = useState(true);
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => setGlobalSearch(route.query), [route.query]);

  // Backend health check
  useEffect(() => {
    let alive = true;
    const ping = async () => alive && setOnline(await api.health());
    ping();
    const id = setInterval(ping, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // "/" jumps to library search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      e.preventDefault();
      location.hash = "#/library";
      setTimeout(() => document.getElementById("lib-search")?.focus(), 50);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeTheme = (t) => { setTheme(t); saveTheme(t); applyTheme(t); };
  const resetTheme = () => changeTheme({ ...DEFAULT_THEME });

  const submitSearch = (e) => {
    e.preventDefault();
    const q = globalSearch.trim();
    location.hash = q ? `#/dashboard?q=${encodeURIComponent(q)}` : "#/dashboard";
  };

  const Page = NAV.find((n) => n[0] === route.page)[3];

  return (
    <UIProvider>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main").focus(); }}>Skip to content</a>
      <div className="shell">
        <header className="topbar">
          <button className="menu-button" aria-label="Menu">☰</button>
          <a className="yt-brand" href="#/dashboard" aria-label="Home"><span className="yt-mark">▶</span><strong>StreamLocal</strong></a>
          <form className="global-search" onSubmit={submitSearch}>
            <input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Search" aria-label="Search videos" />
            <button type="submit" aria-label="Submit search">⌕</button>
          </form>
          <button className="avatar" aria-label="Account">YK</button>
        </header>
        <nav className="side" aria-label="Main">
          {NAV.map(([id, label, icon]) => (
            <a key={id} href={`#/${id}`} className={route.page === id ? "active" : ""} aria-current={route.page === id ? "page" : undefined}>
              <span className="nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>
            </a>
          ))}
        </nav>
        <main id="main" tabIndex={-1}>
          {!online && <div className="banner danger" role="alert">Backend is not reachable. Check that the API is running, or the server address in Settings.</div>}
          <Page arg={route.arg} query={route.query} theme={theme} changeTheme={changeTheme} resetTheme={resetTheme} />
        </main>
      </div>
    </UIProvider>
  );
}
