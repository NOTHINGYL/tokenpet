import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.QUOTAPET_DEV_SERVER_URL !== undefined;
const devServerUrl = process.env.QUOTAPET_DEV_SERVER_URL;

let petWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let dragState:
  | {
      timer: NodeJS.Timeout;
      pointerX: number;
      pointerY: number;
      windowX: number;
      windowY: number;
      moved: boolean;
    }
  | null = null;

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

function verifyBridge(window: BrowserWindow, label: string) {
  window.webContents.once("did-finish-load", () => {
    window.webContents
      .executeJavaScript("Boolean(window.quotapet)")
      .then((ready) => {
        console.log(`[quotapet] ${label} preload bridge: ${ready ? "ready" : "missing"}`);
      })
      .catch((error: unknown) => {
        console.warn(`[quotapet] ${label} preload bridge check failed`, error);
      });
  });
}

function quitQuotaPet() {
  popoverWindow?.close();
  petWindow?.close();
  app.quit();
}

function positionAccessoryWindows() {
  if (!petWindow) return;

  const petBounds = petWindow.getBounds();

  if (popoverWindow) {
    popoverWindow.setPosition(petBounds.x - 90, petBounds.y + petBounds.height - 12, false);
  }
}

function showPetContextMenu() {
  Menu.buildFromTemplate([
    {
      label: "Open Summary",
      click: () => togglePopover(),
    },
    {
      type: "separator",
    },
    {
      label: "Quit QuotaPet",
      click: () => quitQuotaPet(),
    },
  ]).popup({ window: petWindow ?? undefined });
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
    acceptFirstMouse: true,
    focusable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.webContents.on("context-menu", () => {
    showPetContextMenu();
  });
  verifyBridge(petWindow, "pet");
  void loadWindow(petWindow, "pet");

  petWindow.on("move", () => {
    positionAccessoryWindows();
  });

  petWindow.on("blur", () => {
    stopDrag();
  });

  petWindow.on("closed", () => {
    petWindow = null;
    popoverWindow?.close();
    stopDrag();
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
    acceptFirstMouse: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  popoverWindow.setAlwaysOnTop(true, "floating");
  verifyBridge(popoverWindow, "popover");
  void loadWindow(popoverWindow, "popover");

  popoverWindow.on("blur", () => {
    popoverWindow?.close();
  });

  popoverWindow.on("closed", () => {
    popoverWindow = null;
  });

  positionAccessoryWindows();
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

ipcMain.on("pet:close", () => {
  quitQuotaPet();
});

function stopDrag() {
  if (!dragState) return;

  clearInterval(dragState.timer);
  dragState = null;
}

ipcMain.handle("pet:start-drag", () => {
  if (!petWindow) return { started: false };

  stopDrag();

  const pointer = screen.getCursorScreenPoint();
  const bounds = petWindow.getBounds();

  dragState = {
    pointerX: pointer.x,
    pointerY: pointer.y,
    windowX: bounds.x,
    windowY: bounds.y,
    moved: false,
    timer: setInterval(() => {
      if (!petWindow || !dragState) return;

      const nextPointer = screen.getCursorScreenPoint();
      const deltaX = nextPointer.x - dragState.pointerX;
      const deltaY = nextPointer.y - dragState.pointerY;

      if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
        dragState.moved = true;
      }

      petWindow.setPosition(Math.round(dragState.windowX + deltaX), Math.round(dragState.windowY + deltaY), false);
      positionAccessoryWindows();
    }, 16),
  };

  return { started: true };
});

ipcMain.handle("pet:end-drag", () => {
  const moved = dragState?.moved ?? false;
  stopDrag();
  return { moved };
});
