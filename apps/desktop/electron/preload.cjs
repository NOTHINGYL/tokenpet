const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("quotapet", {
  getUsageSnapshot: () => ipcRenderer.invoke("usage:get-snapshot"),
  togglePopover: () => ipcRenderer.send("pet:toggle-popover"),
  startDrag: () => ipcRenderer.invoke("pet:start-drag"),
  endDrag: () => ipcRenderer.invoke("pet:end-drag"),
  close: () => ipcRenderer.send("pet:close"),
});
