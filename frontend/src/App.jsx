import { useEffect, useState } from "react";
import { PlayerProvider, UIProvider } from "./ui.jsx";
import { api } from "./api.js";
import { getSearchHistory, isSearchHistoryEnabled, recordSearch } from "./util.js";
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
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistoryEnabled, setSearchHistoryEnabled] = useState(isSearchHistoryEnabled);
  const [searchHistory, setSearchHistory] = useState(getSearchHistory);

  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => setGlobalSearch(route.query), [route.query]);
  useEffect(() => {
    const syncSearchHistory = () => {
      setSearchHistoryEnabled(isSearchHistoryEnabled());
      setSearchHistory(getSearchHistory());
    };
    window.addEventListener("ytm-search-history-change", syncSearchHistory);
    return () => window.removeEventListener("ytm-search-history-change", syncSearchHistory);
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
      setTimeout(() => document.getElementById("global-search")?.focus(), 50);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeTheme = (t) => { setTheme(t); saveTheme(t); applyTheme(t); };
  const resetTheme = () => changeTheme({ ...DEFAULT_THEME });

  const submitSearch = (e) => {
    e.preventDefault();
    const q = globalSearch.trim();
    if (q) setSearchHistory(recordSearch(q));
    setSearchFocused(false);
    location.hash = q ? `#/dashboard?q=${encodeURIComponent(q)}` : "#/dashboard";
  };
  const suggestions = searchHistoryEnabled
    ? searchHistory.filter((item) => !globalSearch.trim() || item.toLowerCase().includes(globalSearch.trim().toLowerCase())).slice(0, 6)
    : [];
  const chooseSuggestion = (query) => {
    setGlobalSearch(query);
    setSearchFocused(false);
    location.hash = `#/dashboard?q=${encodeURIComponent(query)}`;
  };

  const Page = NAV.find((n) => n[0] === route.page)[3];

  return (
    <UIProvider>
      <PlayerProvider>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main").focus(); }}>Skip to content</a>
      <div className="shell">
        <header className="topbar">
          <a className="yt-brand" href="#/dashboard" aria-label="Home"><span className="yt-mark">▶</span><strong>StreamLocal</strong></a>
          <form className={"global-search" + (globalSearch ? " has-value" : "")} onSubmit={submitSearch}>
            <span className="global-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <circle cx="10.8" cy="10.8" r="6.8" />
                <path d="m16 16 4.5 4.5" />
              </svg>
            </span>
            <input
              id="global-search"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
              onKeyDown={(e) => { if (e.key === "Escape") setSearchFocused(false); }}
              placeholder="Search videos, channels, playlists..."
              aria-label="Search videos"
              aria-expanded={searchFocused && suggestions.length > 0}
              aria-controls="search-history-suggestions"
            />
            {searchFocused && suggestions.length > 0 && (
              <div className="search-history-suggestions" id="search-history-suggestions" role="listbox" aria-label="Recent searches">
                <div className="search-history-heading">Recent searches</div>
                {suggestions.map((item) => (
                  <button type="button" role="option" aria-selected="false" key={item}
                    onClick={() => chooseSuggestion(item)}>
                    <span aria-hidden="true">◷</span><span>{item}</span>
                  </button>
                ))}
              </div>
            )}
            <kbd className="search-shortcut" aria-hidden="true">/</kbd>
            {globalSearch && (
              <button
                className="global-search-clear"
                type="button"
                onClick={() => { setGlobalSearch(""); location.hash = "#/dashboard"; }}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
            <button className="global-search-submit" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h13M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
          <div className={"backend-status " + (online ? "online" : "offline")} title={online ? "Backend connected" : "Backend not reachable"}>
            <span aria-hidden="true" />
            {online ? "Connected" : "Offline"}
          </div>
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
      </PlayerProvider>
    </UIProvider>
  );
}
