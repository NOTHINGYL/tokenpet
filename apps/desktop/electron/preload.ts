import { contextBridge, ipcRenderer } from "electron";

export type UsageSnapshot = {
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
  todayCost: number;
  sevenDayCost: number;
  topModel: string;
  topTool: string;
  burnRate: string;
  status: string;
};

contextBridge.exposeInMainWorld("quotapet", {
  getUsageSnapshot: () => ipcRenderer.invoke("usage:get-snapshot") as Promise<UsageSnapshot>,
  togglePopover: () => ipcRenderer.send("pet:toggle-popover"),
  startDrag: () => ipcRenderer.invoke("pet:start-drag") as Promise<{ started: boolean }>,
  endDrag: () => ipcRenderer.invoke("pet:end-drag") as Promise<{ moved: boolean }>,
  close: () => ipcRenderer.send("pet:close"),
});
