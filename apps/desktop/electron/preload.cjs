const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenpet", {
  getUsageSnapshot: () => ipcRenderer.invoke("usage:get-snapshot"),
  refreshUsageSnapshot: () => ipcRenderer.invoke("usage:refresh-snapshot"),
  getAppSettings: () => ipcRenderer.invoke("app:get-settings"),
  setAppSetting: (key, enabled) => ipcRenderer.invoke("app:set-setting", key, enabled),
  openConsole: () => ipcRenderer.send("app:open-console"),
  quit: () => ipcRenderer.send("app:quit"),
  togglePopover: () => ipcRenderer.send("pet:toggle-popover"),
  startDrag: () => ipcRenderer.invoke("pet:start-drag"),
  endDrag: () => ipcRenderer.invoke("pet:end-drag"),
  close: () => ipcRenderer.send("pet:close"),
});
