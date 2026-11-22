const KEY = "ytm.theme";

const SEMANTIC_DARK = { danger: "#ff6b7a", ok: "#4ade80", warn: "#fbbf24" };
const SEMANTIC_LIGHT = { danger: "#b4232f", ok: "#15803d", warn: "#92580a" };

export const PRESETS = {
  hacker: { label: "Hacker Green", note: "Near-black with terminal green",
    base: { bg: "#050a07", surface: "#0b130d", text: "#d6f5de", muted: "#8aab94", accent: "#3dff86", ...SEMANTIC_DARK } },
  cyberpunk: { label: "Cyberpunk", note: "Deep violet-black, neon accent",
    base: { bg: "#0a0714", surface: "#140f26", text: "#efe9ff", muted: "#a99fd0", accent: "#00e5ff", ...SEMANTIC_DARK } },
  dark: { label: "Dark", note: "Neutral and easy on the eyes",
    base: { bg: "#121316", surface: "#1b1d21", text: "#e8eaed", muted: "#9ca3af", accent: "#6ea8fe", ...SEMANTIC_DARK } },
  light: { label: "Light", note: "Bright, for daytime",
    base: { bg: "#f5f6f8", surface: "#ffffff", text: "#15171a", muted: "#566070", accent: "#0b63c4", ...SEMANTIC_LIGHT } },
  custom: { label: "Custom", note: "Pick your own colours",
    base: { bg: "#101114", surface: "#191b20", text: "#e8eaed", muted: "#9ca3af", accent: "#ff9f1c", ...SEMANTIC_DARK } },
};
export const NEON_ACCENTS = ["#00e5ff", "#ff2bd6", "#a66bff", "#3dff86", "#ffd60a"];
export const DEFAULT_THEME = { preset: "hacker", accent: null, bg: null, surface: null, reducedMotion: false };

// ---- colour maths (WCAG contrast) -----------------------------------------
const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (h) => {
  const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const inkFor = (accent) => (contrast(accent, "#000000") >= contrast(accent, "#ffffff") ? "#000000" : "#ffffff");

/** Resolve a saved theme into concrete colours. */
export function resolve(theme) {
  const t = { ...DEFAULT_THEME, ...theme };
  const base = (PRESETS[t.preset] || PRESETS.hacker).base;
  const custom = t.preset === "custom";
  return {
    ...base,
    accent: t.accent || base.accent,
    bg: custom && t.bg ? t.bg : base.bg,
    surface: custom && t.surface ? t.surface : base.surface,
  };
}

export function cssVars(theme) {
  const c = resolve(theme);
  return {
    "--bg": c.bg, "--surface": c.surface, "--text": c.text, "--muted": c.muted, "--accent": c.accent,
    "--accent-ink": inkFor(c.accent), "--danger": c.danger, "--ok": c.ok, "--warn": c.warn,
    colorScheme: lum(c.bg) < 0.4 ? "dark" : "light",
  };
}

export function applyTheme(theme) {
  const root = document.documentElement;
  const vars = cssVars(theme);
  for (const [k, v] of Object.entries(vars)) k.startsWith("--") ? root.style.setProperty(k, v) : (root.style[k] = v);
  root.dataset.motion = theme.reducedMotion ? "reduced" : "full";
}

export function loadTheme() {
  try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULT_THEME }; }
}
export function saveTheme(t) { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage unavailable */ } }
