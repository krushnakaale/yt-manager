const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export function apiBase() {
  if (window.ytm?.apiBase) return window.ytm.apiBase;                     // Electron: local sidecar
  const saved = ls("ytm.server");                                          // Android: configured in Settings
  if (saved) return saved.replace(/\/+$/, "");
  return "http://127.0.0.1:8000";                                          // dev server default
}
const token = () => window.ytm?.token || ls("ytm.token") || "";

async function raw(path, { method = "GET", body, form } = {}) {
  const headers = { "X-YTM-Token": token() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(apiBase() + path, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new Error(`Cannot reach the YT Manager backend at ${apiBase()}`);
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : j.detail?.[0]?.msg || msg;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res;
}
const json = async (p, o) => { const r = await raw(p, o); return r.status === 204 ? null : r.json(); };

export const api = {
  get: (p) => json(p),
  post: (p, body = {}) => json(p, { method: "POST", body }),
  patch: (p, body) => json(p, { method: "PATCH", body }),
  put: (p, body) => json(p, { method: "PUT", body }),
  del: (p) => json(p, { method: "DELETE" }),
  upload: (p, file) => { const f = new FormData(); f.append("file", file); return json(p, { method: "POST", form: f }); },
  blob: async (p) => (await raw(p)).blob(),
  health: () => fetch(apiBase() + "/api/health").then((r) => r.ok).catch(() => false),
};
