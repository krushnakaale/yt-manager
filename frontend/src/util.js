import { useCallback, useEffect, useState } from "react";

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    try { setData(await fn()); setError(""); } catch (e) { setError(e.message); }
  }, deps);
  useEffect(() => {
    run();
    if (!pollMs) return;
    const id = setInterval(run, pollMs);
    return () => clearInterval(id);
  }, [run, pollMs]);
  return { data, error, reload: run };
}

export const isElectron = () => !!window.ytm;
export const isAndroid = () => !!window.Capacitor?.isNativePlatform?.();
