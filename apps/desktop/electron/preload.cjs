const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tokenpet", {
  getUsageSnapshot: () => ipcRenderer.invoke("usage:get-snapshot"),
  refreshUsageSnapshot: () => ipcRenderer.invoke("usage:refresh-snapshot"),
  getAppSettings: () => ipcRenderer.invoke("app:get-settings"),
  setAppSetting: (key, value) => ipcRenderer.invoke("app:set-setting", key, value),
  onAppSettingsChanged: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("app:settings-updated", listener);
    return () => ipcRenderer.removeListener("app:settings-updated", listener);
  },
  openConsole: (tab = "pet") => ipcRenderer.send("app:open-console", tab),
  onConsoleNavigation: (callback) => {
    const listener = (_event, tab) => callback(tab);
    ipcRenderer.on("app:navigate-console", listener);
    return () => ipcRenderer.removeListener("app:navigate-console", listener);
  },
  quit: () => ipcRenderer.send("app:quit"),
  togglePopover: () => ipcRenderer.send("pet:toggle-popover"),
  dispatchPetAction: (action) => ipcRenderer.invoke("pet:dispatch-action", action),
  getQuickPlaySession: () => ipcRenderer.invoke("quick-play:get-session"),
  onQuickPlaySessionChanged: (callback) => {
    const listener = (_event, session) => callback(session);
    ipcRenderer.on("quick-play:session-changed", listener);
    return () => ipcRenderer.removeListener("quick-play:session-changed", listener);
  },
  reportPetDirectorState: (state) => ipcRenderer.send("pet:director-state", state),
  quickPlayOverlayInput: (input) => ipcRenderer.send("quick-play:overlay-input", input),
  onQuickPlayOverlayState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("quick-play:overlay-state", listener);
    return () => ipcRenderer.removeListener("quick-play:overlay-state", listener);
  },
  onPetDirectorEvent: (callback) => {
    const listener = (_event, directorEvent) => callback(directorEvent);
    ipcRenderer.on("pet:director-event", listener);
    return () => ipcRenderer.removeListener("pet:director-event", listener);
  },
  summonPet: () => ipcRenderer.invoke("pet:summon"),
  traversePet: () => ipcRenderer.invoke("pet:traverse"),
  capturePetMoment: () => ipcRenderer.invoke("pet:capture-moment"),
  onCursorPosition: (callback) => {
    const listener = (_event, position) => callback(position);
    ipcRenderer.on("pet:cursor-position", listener);
    return () => ipcRenderer.removeListener("pet:cursor-position", listener);
  },
  startDrag: () => ipcRenderer.invoke("pet:start-drag"),
  endDrag: () => ipcRenderer.invoke("pet:end-drag"),
  closePopover: () => ipcRenderer.send("popover:close"),
  close: () => ipcRenderer.send("pet:close"),
});
