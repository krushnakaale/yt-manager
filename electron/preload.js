// Narrow bridge: only these functions reach the page. No Node APIs are exposed.
const { contextBridge, ipcRenderer } = require("electron");

const cfg = ipcRenderer.sendSync("ytm:config") || {};

contextBridge.exposeInMainWorld("ytm", {
  apiBase: cfg.apiBase,
  token: cfg.token,
  platform: cfg.platform,
  selectFolder: () => ipcRenderer.invoke("ytm:select-folder"),
  openFolder: (p) => ipcRenderer.invoke("ytm:open-folder", String(p)),
  showItem: (p) => ipcRenderer.invoke("ytm:show-item", String(p)),
  openExternal: (url) => ipcRenderer.invoke("ytm:open-external", String(url)),
});
