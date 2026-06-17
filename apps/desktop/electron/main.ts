import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

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

type ProviderId = "codex" | "claude";
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

function rendererUrl(view: "pet" | "popover") {
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

async function runCcusageDaily(provider: ProviderId): Promise<CcusageDailyReport> {
  const { stdout } = await execFileAsync(ccusageBinPath(), [provider, "daily", "--json", "--offline"], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as CcusageDailyReport;
}

function providerLabel(provider: ProviderId) {
  return provider === "codex" ? "Codex" : "Claude Code";
}

async function loadProvider(provider: ProviderId): Promise<ProviderReport> {
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

async function loadUsageSnapshot(): Promise<UsageSnapshot> {
  const now = Date.now();
  if (usageCache && usageCache.expiresAt > now) {
    return usageCache.snapshot;
  }

  const providerReports = await Promise.all([loadProvider("codex"), loadProvider("claude")]);
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
    providers: providerReports.map(({ rows: _rows, topModels: _topModels, ...provider }) => provider),
  };

  usageCache = {
    expiresAt: now + 15_000,
    snapshot,
  };

  return snapshot;
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
    width: 390,
    height: 360,
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

ipcMain.handle("usage:get-snapshot", () => loadUsageSnapshot());

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
