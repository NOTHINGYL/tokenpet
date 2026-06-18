import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import type { Rectangle } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

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

type ProviderId = "codex" | "claude" | "cursor" | "ccusage";
type CcusageProviderId = "codex" | "claude";
type ProviderStatus = "connected" | "idle" | "error";

type ProviderSnapshot = {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  detail: string;
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
};

type UsageSnapshot = {
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
  todayCost: number;
  sevenDayCost: number;
  topModel: string;
  topTool: string;
  burnRate: string;
  status: string;
  generatedAt: string;
  providers: ProviderSnapshot[];
};

type AppSettings = {
  launchAtLogin: boolean;
  petVisible: boolean;
  alwaysOnTop: boolean;
};

type CcusageDailyRow = {
  date?: string;
  period?: string;
  totalTokens?: number;
  totalCost?: number;
  costUSD?: number;
  models?: Record<string, { totalTokens?: number }>;
  modelBreakdowns?: Array<{ modelName?: string; totalTokens?: number; inputTokens?: number; outputTokens?: number }>;
};

type CcusageDailyReport = {
  daily?: CcusageDailyRow[];
  totals?: {
    totalTokens?: number;
    totalCost?: number;
    costUSD?: number;
  };
};

type ProviderReport = ProviderSnapshot & {
  rows: CcusageDailyRow[];
  topModels: Map<string, number>;
  allTimeCost: number;
  sevenDayCost: number;
  todayCost: number;
};

let usageCache: { expiresAt: number; snapshot: UsageSnapshot } | null = null;

let settings: AppSettings = {
  launchAtLogin: false,
  petVisible: true,
  alwaysOnTop: true,
};

const POPOVER_SIZE = {
  width: 390,
  height: 360,
};

const POPOVER_MARGIN = 12;
const POPOVER_GAP = 8;

const MENUBAR_SIZE = {
  width: 430,
  height: 620,
};

function rendererUrl(view: "pet" | "popover" | "menubar" | "console") {
  if (isDev && devServerUrl) {
    return `${devServerUrl}/?view=${view}`;
  }

  return `file://${join(__dirname, "../dist-renderer/index.html")}?view=${view}`;
}

function ccusageBinPath() {
  const binName = process.platform === "win32" ? "ccusage.cmd" : "ccusage";
  return join(app.getAppPath(), "node_modules", ".bin", binName);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentDateKeys(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return new Set(
    Array.from({ length: days }, (_value, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      return dateKey(date);
    }),
  );
}

function rowDate(row: CcusageDailyRow) {
  return row.date ?? row.period ?? "";
}

function rowTokens(row: CcusageDailyRow) {
  return Number(row.totalTokens ?? 0);
}

function rowCost(row: CcusageDailyRow) {
  return Number(row.costUSD ?? row.totalCost ?? 0);
}

function rowModelTokens(row: CcusageDailyRow) {
  const models = new Map<string, number>();

  for (const [model, usage] of Object.entries(row.models ?? {})) {
    models.set(model, (models.get(model) ?? 0) + Number(usage.totalTokens ?? 0));
  }

  for (const breakdown of row.modelBreakdowns ?? []) {
    const model = breakdown.modelName;
    if (!model) continue;

    const tokens = Number(
      breakdown.totalTokens ?? Number(breakdown.inputTokens ?? 0) + Number(breakdown.outputTokens ?? 0),
    );
    models.set(model, (models.get(model) ?? 0) + tokens);
  }

  return models;
}

async function runCcusageDaily(provider: CcusageProviderId): Promise<CcusageDailyReport> {
  const { stdout } = await execFileAsync(ccusageBinPath(), [provider, "daily", "--json", "--offline"], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as CcusageDailyReport;
}

function providerLabel(provider: CcusageProviderId) {
  return provider === "codex" ? "Codex" : "Claude Code";
}

async function loadProvider(provider: CcusageProviderId): Promise<ProviderReport> {
  const label = providerLabel(provider);

  try {
    const report = await runCcusageDaily(provider);
    const rows = report.daily ?? [];
    const today = dateKey(new Date());
    const sevenDays = recentDateKeys(7);

    let todayTokens = 0;
    let sevenDayTokens = 0;
    let allTimeTokens = Number(report.totals?.totalTokens ?? 0);
    let todayCost = 0;
    let sevenDayCost = 0;
    let allTimeCost = Number(report.totals?.costUSD ?? report.totals?.totalCost ?? 0);
    const topModels = new Map<string, number>();

    for (const row of rows) {
      const tokens = rowTokens(row);
      const cost = rowCost(row);
      const date = rowDate(row);

      if (date === today) {
        todayTokens += tokens;
        todayCost += cost;
      }

      if (sevenDays.has(date)) {
        sevenDayTokens += tokens;
        sevenDayCost += cost;
      }

      for (const [model, modelTokens] of rowModelTokens(row)) {
        topModels.set(model, (topModels.get(model) ?? 0) + modelTokens);
      }
    }

    if (allTimeTokens === 0) {
      allTimeTokens = rows.reduce((total, row) => total + rowTokens(row), 0);
    }
    if (allTimeCost === 0) {
      allTimeCost = rows.reduce((total, row) => total + rowCost(row), 0);
    }

    return {
      id: provider,
      label,
      status: allTimeTokens > 0 ? "connected" : "idle",
      detail: allTimeTokens > 0 ? `${allTimeTokens.toLocaleString()} local all time` : "no local usage found",
      todayTokens,
      sevenDayTokens,
      allTimeTokens,
      rows,
      topModels,
      todayCost,
      sevenDayCost,
      allTimeCost,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "ccusage failed";

    return {
      id: provider,
      label,
      status: "error",
      detail,
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
      rows: [],
      topModels: new Map(),
      todayCost: 0,
      sevenDayCost: 0,
      allTimeCost: 0,
    };
  }
}

function emptyProvider(provider: ProviderId, label: string, status: ProviderStatus, detail: string): ProviderReport {
  return {
    id: provider,
    label,
    status,
    detail,
    todayTokens: 0,
    sevenDayTokens: 0,
    allTimeTokens: 0,
    rows: [],
    topModels: new Map(),
    todayCost: 0,
    sevenDayCost: 0,
    allTimeCost: 0,
  };
}

function loadCursorProvider(): ProviderReport {
  return emptyProvider("cursor", "Cursor", "idle", "local adapter planned");
}

function loadCcusageProvider(): ProviderReport {
  if (!existsSync(ccusageBinPath())) {
    return emptyProvider("ccusage", "ccusage", "error", "bundled binary missing");
  }

  return emptyProvider("ccusage", "ccusage", "connected", "bundled npm dependency");
}

function topModelFromProviders(providers: ProviderReport[]) {
  const totals = new Map<string, number>();

  for (const provider of providers) {
    for (const [model, tokens] of provider.topModels) {
      totals.set(model, (totals.get(model) ?? 0) + tokens);
    }
  }

  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
}

function burnRate(todayTokens: number) {
  if (todayTokens === 0) return "quiet";
  if (todayTokens >= 5_000_000) return "hot";
  if (todayTokens >= 500_000) return "steady";
  return "light";
}

async function loadUsageSnapshot(options: { force?: boolean } = {}): Promise<UsageSnapshot> {
  const now = Date.now();
  if (!options.force && usageCache && usageCache.expiresAt > now) {
    return usageCache.snapshot;
  }

  const providerReports = await Promise.all([loadProvider("codex"), loadProvider("claude")]);
  const sourceReports = [...providerReports, loadCursorProvider(), loadCcusageProvider()];
  const todayTokens = providerReports.reduce((total, provider) => total + provider.todayTokens, 0);
  const sevenDayTokens = providerReports.reduce((total, provider) => total + provider.sevenDayTokens, 0);
  const allTimeTokens = providerReports.reduce((total, provider) => total + provider.allTimeTokens, 0);
  const todayCost = providerReports.reduce((total, provider) => total + provider.todayCost, 0);
  const sevenDayCost = providerReports.reduce((total, provider) => total + provider.sevenDayCost, 0);
  const connected = providerReports.filter((provider) => provider.status === "connected");

  const snapshot: UsageSnapshot = {
    todayTokens,
    sevenDayTokens,
    allTimeTokens,
    todayCost,
    sevenDayCost,
    topModel: topModelFromProviders(providerReports),
    topTool: connected.sort((a, b) => b.sevenDayTokens - a.sevenDayTokens)[0]?.label ?? "none",
    burnRate: burnRate(todayTokens),
    status: connected.length > 0 ? "ccusage live" : "no usage found",
    generatedAt: new Date().toISOString(),
    providers: sourceReports.map(({ rows: _rows, topModels: _topModels, ...provider }) => provider),
  };

  usageCache = {
    expiresAt: now + 15_000,
    snapshot,
  };

  updateTray(snapshot);

  return snapshot;
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

function createTrayIcon() {
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
    width: 760,
    height: 660,
    minWidth: 680,
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

function setSetting(key: keyof AppSettings, enabled: boolean) {
  if (key === "launchAtLogin") {
    setLaunchAtLogin(enabled);
  }

  if (key === "petVisible") {
    setPetVisible(enabled);
  }

  if (key === "alwaysOnTop") {
    setAlwaysOnTop(enabled);
  }

  return currentSettings();
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
  settings = currentSettings();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  createTray();
  if (settings.petVisible) {
    createPetWindow();
  }
  void loadUsageSnapshot({ force: true });

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

ipcMain.handle("usage:get-snapshot", () => loadUsageSnapshot());

ipcMain.handle("usage:refresh-snapshot", () => loadUsageSnapshot({ force: true }));

ipcMain.handle("app:get-settings", () => currentSettings());

ipcMain.handle("app:set-setting", (_event, key: keyof AppSettings, enabled: boolean) => setSetting(key, enabled));

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
