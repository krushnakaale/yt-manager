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
  ["dashboard", "Dashboard", Dashboard],
  ["library", "Library", Library],
  ["playlists", "Playlists", Playlists],
  ["downloads", "Downloads", Downloads],
  ["history", "History", History],
  ["settings", "Settings", Settings],
  ["about", "About", About],
];

const parse = () => {
  const [, page = "dashboard", arg] = location.hash.split("/");
  return { page: NAV.some((n) => n[0] === page) ? page : "dashboard", arg };
};

export default function App() {
  const [route, setRoute] = useState(parse);
  const [theme, setTheme] = useState(() => { const t = loadTheme(); applyTheme(t); return t; });
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

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

  const Page = NAV.find((n) => n[0] === route.page)[2];

  return (
    <UIProvider>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main").focus(); }}>Skip to content</a>
      <div className="shell">
        <nav className="side" aria-label="Main">
          <div className="brand" aria-label="YT Manager">ytm<span className="cursor">_</span></div>
          {NAV.map(([id, label]) => (
            <a key={id} href={`#/${id}`} className={route.page === id ? "active" : ""} aria-current={route.page === id ? "page" : undefined}>{label}</a>
          ))}
          <div className="hint muted">Press / to search</div>
        </nav>
        <main id="main" tabIndex={-1}>
          {!online && <div className="banner danger" role="alert">Backend is not reachable. Check that the API is running, or the server address in Settings.</div>}
          <Page arg={route.arg} theme={theme} changeTheme={changeTheme} resetTheme={resetTheme} />
        </main>
      </div>
    </UIProvider>
  );
}
