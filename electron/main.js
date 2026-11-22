const { app, BrowserWindow, dialog, ipcMain, session, shell } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

let win = null, backend = null;
const cfg = { apiBase: "", token: crypto.randomBytes(32).toString("hex"), port: 0 };

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

function startBackend() {
  const staticDir = app.isPackaged ? path.join(process.resourcesPath, "frontend") : path.join(__dirname, "..", "frontend", "dist");
  const env = { ...process.env, YTM_PORT: String(cfg.port), YTM_TOKEN: cfg.token, YTM_DATA_DIR: app.getPath("userData"), YTM_STATIC_DIR: staticDir };
  if (app.isPackaged) {
    backend = spawn(path.join(process.resourcesPath, "backend", "ytm-backend.exe"), [], { env, windowsHide: true });
  } else {
    backend = spawn(process.env.PYTHON || "python", ["run.py"], { cwd: path.join(__dirname, "..", "backend"), env, windowsHide: true });
  }
  backend.on("error", (e) => dialog.showErrorBox("YT Manager", "Could not start the backend: " + e.message));
}

function waitForBackend(timeoutMs = 30000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(`${cfg.apiBase}/api/health`, (r) => { r.resume(); r.statusCode === 200 ? resolve() : retry(); }).on("error", retry);
    };
    const retry = () => (Date.now() - t0 > timeoutMs ? reject(new Error("Backend did not start in time")) : setTimeout(tick, 300));
    tick();
  });
}

// Only our own page (loopback origin) may use the privileged IPC handlers.
const trusted = (e) => { try { return new URL(e.senderFrame.url).origin === cfg.apiBase; } catch { return false; } };

function registerIpc() {
  ipcMain.on("ytm:config", (e) => { e.returnValue = (win && e.sender === win.webContents) ? { apiBase: cfg.apiBase, token: cfg.token, platform: process.platform } : null; });

  ipcMain.handle("ytm:select-folder", async (e) => {
    if (!trusted(e)) return null;
    const r = await dialog.showOpenDialog(win, { title: "Choose download folder", properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle("ytm:open-folder", async (e, p) => {
    if (!trusted(e) || typeof p !== "string") return false;
    try { if (fs.statSync(p).isDirectory()) { await shell.openPath(p); return true; } } catch { /* ignore */ }
    return false;
  });
  ipcMain.handle("ytm:show-item", (e, p) => {
    if (!trusted(e) || typeof p !== "string" || !fs.existsSync(p)) return false;
    shell.showItemInFolder(p);
    return true;
  });
  // The renderer already asked the user; this is a second native confirmation, https only.
  ipcMain.handle("ytm:open-external", async (e, url) => {
    if (!trusted(e) || typeof url !== "string") return false;
    let u; try { u = new URL(url); } catch { return false; }
    if (u.protocol !== "https:") return false;
    const r = await dialog.showMessageBox(win, { type: "question", buttons: ["Open", "Cancel"], defaultId: 1, cancelId: 1, message: "Open this link in your browser?", detail: u.href });
    if (r.response === 0) { await shell.openExternal(u.href); return true; }
    return false;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600, backgroundColor: "#050a07", title: "YT Manager",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));            // no popups
  win.webContents.on("will-navigate", (ev, url) => { if (new URL(url).origin !== cfg.apiBase) ev.preventDefault(); });
  win.webContents.on("will-attach-webview", (ev) => ev.preventDefault());
  win.loadURL(cfg.apiBase + "/");
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    cfg.port = await freePort();
    cfg.apiBase = `http://127.0.0.1:${cfg.port}`;
    registerIpc();
    startBackend();
    try { await waitForBackend(); } catch (e) { dialog.showErrorBox("YT Manager", e.message); return app.quit(); }
    createWindow();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { if (backend && !backend.killed) backend.kill(); });
}
