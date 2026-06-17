import { app, BrowserWindow, ipcMain, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.QUOTAPET_DEV_SERVER_URL !== undefined;
const devServerUrl = process.env.QUOTAPET_DEV_SERVER_URL;

let petWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let dragStart: { pointerX: number; pointerY: number; windowX: number; windowY: number } | null = null;

const mockUsage = {
  todayTokens: 128420,
  sevenDayTokens: 8920000,
  allTimeTokens: 925000000,
  todayCost: 8.34,
  sevenDayCost: 716.7,
  topModel: "gpt-5.5",
  topTool: "Codex",
  burnRate: "steady",
  status: "mock data",
};

function rendererUrl(view: "pet" | "popover") {
  if (isDev && devServerUrl) {
    return `${devServerUrl}/?view=${view}`;
  }

  return `file://${join(__dirname, "../dist-renderer/index.html")}?view=${view}`;
}

async function loadWindow(window: BrowserWindow, view: "pet" | "popover") {
  await window.loadURL(rendererUrl(view));
}

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width } = primaryDisplay.workAreaSize;

  petWindow = new BrowserWindow({
    width: 190,
    height: 190,
    x: Math.max(24, width - 240),
    y: 120,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setAlwaysOnTop(true, "floating");
  void loadWindow(petWindow, "pet");

  petWindow.on("closed", () => {
    petWindow = null;
    popoverWindow?.close();
  });
}

function createPopoverWindow() {
  if (!petWindow) return;

  const petBounds = petWindow.getBounds();

  popoverWindow = new BrowserWindow({
    width: 360,
    height: 286,
    x: petBounds.x - 90,
    y: petBounds.y + petBounds.height - 12,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popoverWindow.setAlwaysOnTop(true, "floating");
  void loadWindow(popoverWindow, "popover");

  popoverWindow.on("blur", () => {
    popoverWindow?.close();
  });

  popoverWindow.on("closed", () => {
    popoverWindow = null;
  });
}

function togglePopover() {
  if (popoverWindow) {
    popoverWindow.close();
    return;
  }

  createPopoverWindow();
}

app.whenReady().then(() => {
  createPetWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("usage:get-snapshot", () => mockUsage);

ipcMain.on("pet:toggle-popover", () => {
  togglePopover();
});

ipcMain.on("pet:drag-start", (_event, pointer: { x: number; y: number }) => {
  if (!petWindow) return;
  const bounds = petWindow.getBounds();
  dragStart = {
    pointerX: pointer.x,
    pointerY: pointer.y,
    windowX: bounds.x,
    windowY: bounds.y,
  };
});

ipcMain.on("pet:drag-move", (_event, pointer: { x: number; y: number }) => {
  if (!petWindow || !dragStart) return;

  const nextX = Math.round(dragStart.windowX + pointer.x - dragStart.pointerX);
  const nextY = Math.round(dragStart.windowY + pointer.y - dragStart.pointerY);
  petWindow.setPosition(nextX, nextY, false);

  if (popoverWindow) {
    const petBounds = petWindow.getBounds();
    popoverWindow.setPosition(petBounds.x - 90, petBounds.y + petBounds.height - 12, false);
  }
});

ipcMain.on("pet:drag-end", () => {
  dragStart = null;
});
