const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenpet", {
  getUsageSnapshot: () => ipcRenderer.invoke("qa:get-usage"),
  refreshUsageSnapshot: () => ipcRenderer.invoke("qa:refresh-usage"),
  getAppSettings: () => ipcRenderer.invoke("qa:get-settings"),
  setAppSetting: (key, value) => ipcRenderer.invoke("qa:set-setting", key, value),
  onAppSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("qa:settings-updated", listener);
    return () => ipcRenderer.removeListener("qa:settings-updated", listener);
  },
  openConsole: (tab = "pet") => ipcRenderer.send("qa:open-console", tab),
  onConsoleNavigation: (callback) => {
    const listener = (_event, tab) => callback(tab);
    ipcRenderer.on("qa:navigate-console", listener);
    return () => ipcRenderer.removeListener("qa:navigate-console", listener);
  },
  quit: () => ipcRenderer.send("qa:quit"),
  togglePopover: () => ipcRenderer.send("qa:toggle-popover"),
  dispatchPetAction: (action) => ipcRenderer.invoke("qa:dispatch-action", action),
  getQuickPlaySession: () => ipcRenderer.invoke("qa:get-quick-play-session"),
  onQuickPlaySessionChanged: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on("qa:quick-play-session-changed", listener);
    return () => ipcRenderer.removeListener("qa:quick-play-session-changed", listener);
  },
  onPetDirectorEvent: (callback) => {
    const listener = (_event, directorEvent) => callback(directorEvent);
    ipcRenderer.on("qa:director-event", listener);
    return () => ipcRenderer.removeListener("qa:director-event", listener);
  },
  summonPet: () => ipcRenderer.invoke("qa:summon"),
  capturePetMoment: () => ipcRenderer.invoke("qa:capture-moment"),
  onCursorPosition: (callback) => {
    const listener = (_event, position) => callback(position);
    ipcRenderer.on("qa:cursor-position", listener);
    return () => ipcRenderer.removeListener("qa:cursor-position", listener);
  },
  startDrag: () => ipcRenderer.invoke("qa:start-drag"),
  endDrag: () => ipcRenderer.invoke("qa:end-drag"),
  closePopover: () => ipcRenderer.send("qa:close-popover"),
  close: () => ipcRenderer.send("qa:close-pet"),
  getScreenshotQaState: () => ipcRenderer.invoke("qa:get-state"),
  setScreenshotQuickPlaySession: (session) => ipcRenderer.invoke("qa:set-quick-play-session", session),
  setScreenshotQuickPlayDirectorSuppressed: (suppressed) => ipcRenderer.invoke("qa:set-quick-play-director-suppressed", suppressed),
});
