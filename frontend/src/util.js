import { useCallback, useEffect, useRef, useState } from "react";

const SEARCH_HISTORY_KEY = "ytm.search-history";
const SEARCH_TRACKING_KEY = "ytm.track-search-history";
const SEARCH_HISTORY_EVENT = "ytm-search-history-change";
const AUTOPLAY_KEY = "ytm.autoplay";

export function isAutoplayEnabled() {
  try { return localStorage.getItem(AUTOPLAY_KEY) !== "false"; }
  catch { return false; }
}

export function setAutoplayEnabled(enabled) {
  try { localStorage.setItem(AUTOPLAY_KEY, String(Boolean(enabled))); }
  catch { /* Autoplay preference is optional when storage is unavailable. */ }
}

export function isSearchHistoryEnabled() {
  try { return localStorage.getItem(SEARCH_TRACKING_KEY) !== "false"; }
  catch { return false; }
}

export function getSearchHistory() {
  try {
    const items = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
    return Array.isArray(items) ? items.filter((item) => typeof item === "string").slice(0, 20) : [];
  } catch { return []; }
}

export function recordSearch(query) {
  const term = query.trim().slice(0, 100);
  if (!term || !isSearchHistoryEnabled()) return getSearchHistory();
  const items = [term, ...getSearchHistory().filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 20);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(SEARCH_HISTORY_EVENT));
  } catch { /* Search can continue even when local storage is unavailable. */ }
  return items;
}

export function setSearchHistoryEnabled(enabled) {
  try {
    localStorage.setItem(SEARCH_TRACKING_KEY, String(Boolean(enabled)));
    window.dispatchEvent(new Event(SEARCH_HISTORY_EVENT));
  } catch { /* The preference is device-local and optional. */ }
}

export function clearSearchHistory() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    window.dispatchEvent(new Event(SEARCH_HISTORY_EVENT));
  } catch { /* The search field remains usable without local history. */ }
}

export function fmtBytes(n) {
  if (n == null) return "unknown";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}
export const fmtSpeed = (b) => (b > 0 ? `${fmtBytes(b)}/s` : "");
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
export const fmtClock = (iso) => new Date(iso).toLocaleTimeString([], { hour12: false });
export const pct = (t) => (t.total_bytes ? Math.min(100, Math.round((t.bytes_received / t.total_bytes) * 100)) : 0);

/** Load data once, optionally poll. */
export function useLoad(fn, deps = [], pollMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const result = await fn();
      if (id !== requestId.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e.message);
    }
  }, deps);
  useEffect(() => {
    run();
    if (!pollMs) return () => { requestId.current++; };
    const id = setInterval(run, pollMs);
    return () => {
      clearInterval(id);
      requestId.current++;
    };
  }, [run, pollMs]);
  return { data, error, reload: run };
}

export const isElectron = () => !!window.ytm;
export const isAndroid = () => !!window.Capacitor?.isNativePlatform?.();
