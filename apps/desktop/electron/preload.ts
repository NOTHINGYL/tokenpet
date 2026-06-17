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
  startDrag: (pointer: { x: number; y: number }) => ipcRenderer.send("pet:drag-start", pointer),
  moveDrag: (pointer: { x: number; y: number }) => ipcRenderer.send("pet:drag-move", pointer),
  endDrag: () => ipcRenderer.send("pet:drag-end"),
  close: () => ipcRenderer.send("pet:close"),
});
