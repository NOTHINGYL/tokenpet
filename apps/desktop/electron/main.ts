import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import type { Rectangle } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, UsageSnapshot } from "./types.js";
import { loadUsageSnapshot } from "./usage.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.QUOTAPET_DEV_SERVER_URL !== undefined;
const devServerUrl = process.env.QUOTAPET_DEV_SERVER_URL;

let petWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let menuBarWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
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

const DEFAULT_SETTINGS: AppSettings = {
  launchAtLogin: false,
  petVisible: true,
  alwaysOnTop: true,
  petTheme: "gold",
};

let settings: AppSettings = { ...DEFAULT_SETTINGS };

const POPOVER_SIZE = {
  width: 390,
  height: 360,
};

const POPOVER_MARGIN = 12;
const POPOVER_GAP = 8;

const MENUBAR_SIZE = {
  width: 500,
  height: 360,
};

function rendererUrl(view: "pet" | "popover" | "menubar" | "console") {
  if (isDev && devServerUrl) {
    return `${devServerUrl}/?view=${view}`;
  }

  return `file://${join(__dirname, "../dist-renderer/index.html")}?view=${view}`;
}

async function loadWindow(window: BrowserWindow, view: "pet" | "popover" | "menubar" | "console") {
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
  menuBarWindow?.close();
  consoleWindow?.close();
  popoverWindow?.close();
  petWindow?.close();
  app.quit();
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function settingsPath() {
  return join(app.getPath("userData"), "settings.json");
}

function readStoredSettings() {
  const path = settingsPath();
  if (!existsSync(path)) return {};

  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<AppSettings>;
  } catch (error) {
    console.warn("[quotapet] failed to read settings", error);
    return {};
  }
}

function writeStoredSettings() {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
  } catch (error) {
    console.warn("[quotapet] failed to write settings", error);
  }
}

function hydrateSettings() {
  settings = {
    ...DEFAULT_SETTINGS,
    ...readStoredSettings(),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
  };
}

function createTrayIcon() {
  const assetCandidates = [
    join(__dirname, "../dist-renderer/assets/pets/cat-menubar.png"),
    join(app.getAppPath(), "apps/desktop/public/assets/pets/cat-menubar.png"),
  ];

  for (const assetPath of assetCandidates) {
    const image = nativeImage.createFromPath(assetPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 18, height: 14, quality: "best" });
    }
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path fill="black" d="M9 1.6c1.7 0 3.1.8 4 2.1l1.3-.9c.4-.3.9.1.8.6l-.5 2.1A5.8 5.8 0 0 1 15 8.1c0 3.3-2.7 5.9-6 5.9s-6-2.6-6-5.9c0-.9.2-1.8.6-2.6L3.1 3.4c-.1-.5.4-.9.8-.6l1.3.9A4.7 4.7 0 0 1 9 1.6Zm-2.2 6c-.5 0-.9.5-.9 1.1s.4 1.1.9 1.1.9-.5.9-1.1-.4-1.1-.9-1.1Zm4.4 0c-.5 0-.9.5-.9 1.1s.4 1.1.9 1.1.9-.5.9-1.1-.4-1.1-.9-1.1ZM7.3 11c.4.5 1 .8 1.7.8s1.3-.3 1.7-.8H7.3Z"/>
    </svg>
  `;
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  image.setTemplateImage(true);
  return image;
}

function updateTray(snapshot?: UsageSnapshot) {
  if (!tray) return;

  tray.setToolTip("QuotaPet");
  if (process.platform === "darwin") {
    tray.setTitle(snapshot ? compactNumber(snapshot.todayTokens) : "");
  }
}

async function loadAndPublishUsage(options: { force?: boolean } = {}) {
  const snapshot = await loadUsageSnapshot(options);
  updateTray(snapshot);
  return snapshot;
}

function createTray() {
  tray = new Tray(createTrayIcon());
  updateTray();

  tray.on("click", () => {
    toggleMenuBarWindow();
  });

  tray.on("right-click", () => {
    Menu.buildFromTemplate([
      {
        label: "Open Summary",
        click: () => toggleMenuBarWindow(),
      },
      {
        label: "Open Console",
        click: () => openConsoleWindow(),
      },
      {
        type: "separator",
      },
      {
        label: "Quit QuotaPet",
        click: () => quitQuotaPet(),
      },
    ]).popup();
  });
}

function menuBarPosition() {
  const trayBounds = tray?.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const display = trayBounds ? screen.getDisplayMatching(trayBounds) : screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  const anchorX = trayBounds ? trayBounds.x + trayBounds.width / 2 : cursor.x;
  const anchorY = trayBounds ? trayBounds.y + trayBounds.height : workArea.y;
  const x = clamp(
    Math.round(anchorX - MENUBAR_SIZE.width / 2),
    workArea.x + POPOVER_MARGIN,
    workArea.x + workArea.width - MENUBAR_SIZE.width - POPOVER_MARGIN,
  );
  const y = clamp(
    Math.round(anchorY + POPOVER_GAP),
    workArea.y + POPOVER_MARGIN,
    workArea.y + workArea.height - MENUBAR_SIZE.height - POPOVER_MARGIN,
  );

  return { x, y };
}

function createMenuBarWindow() {
  const { x, y } = menuBarPosition();

  menuBarWindow = new BrowserWindow({
    width: MENUBAR_SIZE.width,
    height: MENUBAR_SIZE.height,
    x,
    y,
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

  menuBarWindow.setAlwaysOnTop(true, "floating");
  verifyBridge(menuBarWindow, "menubar");
  void loadWindow(menuBarWindow, "menubar");

  menuBarWindow.on("blur", () => {
    menuBarWindow?.close();
  });

  menuBarWindow.on("closed", () => {
    menuBarWindow = null;
  });
}

function toggleMenuBarWindow() {
  if (menuBarWindow) {
    menuBarWindow.close();
    return;
  }

  createMenuBarWindow();
}

function openConsoleWindow() {
  if (consoleWindow) {
    consoleWindow.show();
    consoleWindow.focus();
    return;
  }

  consoleWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 900,
    minHeight: 560,
    title: "QuotaPet Console",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  verifyBridge(consoleWindow, "console");
  void loadWindow(consoleWindow, "console");

  consoleWindow.on("closed", () => {
    consoleWindow = null;
  });
}

function popoverPositionForPet(petBounds: Rectangle, popoverBounds = POPOVER_SIZE) {
  const display = screen.getDisplayMatching(petBounds);
  const workArea = display.workArea;
  const centeredX = petBounds.x + petBounds.width / 2 - popoverBounds.width / 2;
  const x = clamp(
    Math.round(centeredX),
    workArea.x + POPOVER_MARGIN,
    workArea.x + workArea.width - popoverBounds.width - POPOVER_MARGIN,
  );

  const belowY = petBounds.y + petBounds.height + POPOVER_GAP;
  const aboveY = petBounds.y - popoverBounds.height - POPOVER_GAP;
  const maxY = workArea.y + workArea.height - popoverBounds.height - POPOVER_MARGIN;
  const minY = workArea.y + POPOVER_MARGIN;
  const preferredY = belowY <= maxY ? belowY : aboveY;
  const y = clamp(Math.round(preferredY), minY, maxY);

  return { x, y };
}

function positionAccessoryWindows() {
  if (!petWindow) return;

  const petBounds = petWindow.getBounds();

  if (popoverWindow) {
    const popoverBounds = popoverWindow.getBounds();
    const { x, y } = popoverPositionForPet(petBounds, popoverBounds);
    popoverWindow.setPosition(x, y, false);
  }
}

function currentSettings() {
  settings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
  return settings;
}

function applyAlwaysOnTop() {
  if (!petWindow) return;

  if (settings.alwaysOnTop) {
    petWindow.setAlwaysOnTop(true, "floating");
    return;
  }

  petWindow.setAlwaysOnTop(false);
}

function setLaunchAtLogin(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled });
  settings.launchAtLogin = app.getLoginItemSettings().openAtLogin;
}

function setPetVisible(enabled: boolean) {
  settings.petVisible = enabled;

  if (enabled) {
    if (!petWindow) {
      createPetWindow();
    } else {
      petWindow.show();
    }
    return;
  }

  popoverWindow?.close();
  petWindow?.hide();
}

function setAlwaysOnTop(enabled: boolean) {
  settings.alwaysOnTop = enabled;
  applyAlwaysOnTop();
}

function setPetTheme(theme: AppSettings["petTheme"]) {
  settings.petTheme = theme;
  petWindow?.webContents.reload();
}

function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  if (key === "launchAtLogin") {
    setLaunchAtLogin(Boolean(value));
  }

  if (key === "petVisible") {
    setPetVisible(Boolean(value));
  }

  if (key === "alwaysOnTop") {
    setAlwaysOnTop(Boolean(value));
  }

  if (key === "petTheme") {
    setPetTheme(value as AppSettings["petTheme"]);
  }

  const nextSettings = currentSettings();
  writeStoredSettings();
  return nextSettings;
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
  if (petWindow) {
    petWindow.show();
    return;
  }

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
    alwaysOnTop: settings.alwaysOnTop,
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
  applyAlwaysOnTop();
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
  const popoverPosition = popoverPositionForPet(petBounds);

  popoverWindow = new BrowserWindow({
    width: POPOVER_SIZE.width,
    height: POPOVER_SIZE.height,
    x: popoverPosition.x,
    y: popoverPosition.y,
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
  hydrateSettings();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  createTray();
  if (settings.petVisible) {
    createPetWindow();
  }
  void loadAndPublishUsage({ force: true });

  app.on("activate", () => {
    if (settings.petVisible && BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("usage:get-snapshot", () => loadAndPublishUsage());

ipcMain.handle("usage:refresh-snapshot", () => loadAndPublishUsage({ force: true }));

ipcMain.handle("app:get-settings", () => currentSettings());

ipcMain.handle("app:set-setting", (_event, key: keyof AppSettings, value: AppSettings[keyof AppSettings]) =>
  setSetting(key, value),
);

ipcMain.on("pet:toggle-popover", () => {
  togglePopover();
});

ipcMain.on("pet:close", () => {
  quitQuotaPet();
});

ipcMain.on("app:open-console", () => {
  openConsoleWindow();
});

ipcMain.on("app:quit", () => {
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
