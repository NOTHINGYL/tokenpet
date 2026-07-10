import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import type { Rectangle } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, PetDirectorEvent, QuickPlayActionId, UsageSnapshot } from "./types.js";
import { defaultPetAppearance, normalizePetAppearance, syncLegacyAppearanceFields } from "./appearance.js";
import { defaultPetStory, normalizePetStory, reconcilePetStory } from "./story.js";
import { loadUsageSnapshot } from "./usage.js";
import {
  clampBoundsToWorkArea,
  clampValue,
  createPetTraversalPlan,
  hasPngSignature,
  petTraversalBoundsAtProgress,
  popoverPositionForBounds,
  summonBoundsForCursor,
} from "./window-behavior.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.TOKENPET_DEV_SERVER_URL !== undefined;
const devServerUrl = process.env.TOKENPET_DEV_SERVER_URL;
const isMainProcessQa = process.env.TOKENPET_MAIN_PROCESS_QA === "1";

let petWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let menuBarWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let cursorTrackingTimer: NodeJS.Timeout | null = null;
let lastStoryReconcileAt = 0;
const pendingDirectorEvents: PetDirectorEvent[] = [];
const rendererGoneWindows = new WeakSet<BrowserWindow>();
let mainProcessQaCursor: { x: number; y: number } | null = null;
type PetTraversalResult = { moved: boolean; canceled?: boolean };
type PetTraversalState = {
  window: BrowserWindow;
  plan: ReturnType<typeof createPetTraversalPlan>;
  startedAt: number;
  timer: NodeJS.Timeout | null;
  moved: boolean;
  resolve: (result: PetTraversalResult) => void;
};
let traversalState: PetTraversalState | null = null;
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
  petScale: 1,
  petOpacity: 0.92,
  petAppearance: defaultPetAppearance,
  petStory: defaultPetStory,
};

let settings: AppSettings = { ...DEFAULT_SETTINGS };

const POPOVER_SIZE = {
  width: 405,
  height: 480,
};

const POPOVER_MARGIN = 12;
const POPOVER_GAP = 8;

const MENUBAR_SIZE = {
  width: 500,
  height: 360,
};

const PET_WINDOW_SIZE = {
  width: 260,
  height: 260,
};

type ConsoleTab = "overview" | "breakdown" | "cost" | "pet" | "settings";

function isUsableWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed() && !rendererGoneWindows.has(window) && !window.webContents.isCrashed());
}

function trackWindowHealth(window: BrowserWindow) {
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") {
      rendererGoneWindows.add(window);
      if (window === petWindow) cancelPetTraversal();
    }
  });
}

function disposeStaleWindow(window: BrowserWindow | null) {
  if (window && !window.isDestroyed()) window.destroy();
}

function closeUsableWindow(window: BrowserWindow | null) {
  if (isUsableWindow(window)) window.close();
  else disposeStaleWindow(window);
}

function currentCursorScreenPoint() {
  return isMainProcessQa && mainProcessQaCursor ? mainProcessQaCursor : screen.getCursorScreenPoint();
}

function rendererUrl(view: "pet" | "popover" | "menubar" | "console", params: Record<string, string> = {}) {
  const query = new URLSearchParams({ view, ...params }).toString();
  if (isDev && devServerUrl) {
    return `${devServerUrl}/?${query}`;
  }

  return `file://${join(__dirname, "../dist-renderer/index.html")}?${query}`;
}

async function loadWindow(
  window: BrowserWindow,
  view: "pet" | "popover" | "menubar" | "console",
  params?: Record<string, string>,
) {
  await window.loadURL(rendererUrl(view, params));
}

function verifyBridge(window: BrowserWindow, label: string) {
  window.webContents.once("did-finish-load", () => {
    window.webContents
      .executeJavaScript("Boolean(window.tokenpet)")
      .then((ready) => {
        console.log(`[tokenpet] ${label} preload bridge: ${ready ? "ready" : "missing"}`);
      })
      .catch((error: unknown) => {
        console.warn(`[tokenpet] ${label} preload bridge check failed`, error);
      });
  });
}

function quitTokenPet() {
  cancelPetTraversal();
  if (cursorTrackingTimer) {
    clearInterval(cursorTrackingTimer);
    cursorTrackingTimer = null;
  }
  closeUsableWindow(menuBarWindow);
  closeUsableWindow(consoleWindow);
  closeUsableWindow(popoverWindow);
  closeUsableWindow(petWindow);
  app.quit();
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function settingsPath() {
  return join(app.getPath("userData"), "settings.json");
}

type StoredPetPosition = { x: number; y: number; width: number; height: number };

function petPositionPath() {
  return join(app.getPath("userData"), "pet-position.json");
}

function readStoredPetPosition(): StoredPetPosition | null {
  const path = petPositionPath();
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<StoredPetPosition>;
    if (![value.x, value.y, value.width, value.height].every((entry) => Number.isFinite(entry))) return null;
    return value as StoredPetPosition;
  } catch {
    return null;
  }
}

function writeStoredPetPosition(bounds: Rectangle) {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(petPositionPath(), JSON.stringify(bounds, null, 2));
  } catch (error) {
    console.warn("[tokenpet] failed to write pet position", error);
  }
}

function traversalMovedFromStart(state: PetTraversalState, bounds: Rectangle) {
  return state.moved || bounds.x !== state.plan.start.x || bounds.y !== state.plan.start.y;
}

function cancelPetTraversal(): PetTraversalResult {
  const state = traversalState;
  if (!state) return { moved: false, canceled: true };
  traversalState = null;
  if (state.timer) clearInterval(state.timer);

  let moved = state.moved;
  if (isUsableWindow(state.window)) {
    const bounds = clampBoundsToWorkArea(state.window.getBounds(), state.plan.workArea);
    moved = traversalMovedFromStart(state, bounds);
    state.window.setBounds(bounds, false);
    if (moved) writeStoredPetPosition(bounds);
    if (petWindow === state.window) positionAccessoryWindows();
  }
  const result = { moved, canceled: true };
  state.resolve(result);
  return result;
}

function finishPetTraversal(state: PetTraversalState) {
  if (traversalState !== state) return;
  traversalState = null;
  if (state.timer) clearInterval(state.timer);
  if (!isUsableWindow(state.window)) {
    state.resolve({ moved: state.moved, canceled: true });
    return;
  }

  state.window.setBounds(state.plan.target, false);
  const moved = traversalMovedFromStart(state, state.plan.target);
  if (moved) writeStoredPetPosition(state.plan.target);
  if (petWindow === state.window) positionAccessoryWindows();
  state.resolve({ moved, canceled: false });
}

function traversePetAcrossWorkArea(): Promise<PetTraversalResult> {
  cancelPetTraversal();
  if (!settings.petVisible || !isUsableWindow(petWindow) || settings.petStory.lockPosition || dragState) {
    return Promise.resolve({ moved: false, canceled: true });
  }

  const traversalWindow = petWindow;
  const workArea = screen.getDisplayMatching(traversalWindow.getBounds()).workArea;
  const plan = createPetTraversalPlan(traversalWindow.getBounds(), workArea, settings.petStory.reduceMotion);
  if (traversalWindow.getBounds().x !== plan.start.x || traversalWindow.getBounds().y !== plan.start.y) {
    traversalWindow.setBounds(plan.start, false);
    positionAccessoryWindows();
  }
  if (plan.start.x === plan.target.x && plan.start.y === plan.target.y) {
    return Promise.resolve({ moved: false, canceled: false });
  }

  return new Promise((resolve) => {
    const state: PetTraversalState = {
      window: traversalWindow,
      plan,
      startedAt: Date.now(),
      timer: null,
      moved: false,
      resolve,
    };
    traversalState = state;

    const step = () => {
      if (traversalState !== state) return;
      if (
        petWindow !== state.window
        || !isUsableWindow(state.window)
        || !settings.petVisible
        || settings.petStory.lockPosition
        || dragState
      ) {
        cancelPetTraversal();
        return;
      }

      const progress = Math.min((Date.now() - state.startedAt) / state.plan.durationMs, 1);
      if (progress >= 1) {
        finishPetTraversal(state);
        return;
      }
      const nextBounds = petTraversalBoundsAtProgress(state.plan, progress);
      state.moved = traversalMovedFromStart(state, nextBounds);
      state.window.setPosition(nextBounds.x, nextBounds.y, false);
      positionAccessoryWindows();
    };

    state.timer = setInterval(step, 16);
    state.timer.unref();
    step();
  });
}

function readStoredSettings() {
  const path = settingsPath();
  if (!existsSync(path)) return {};

  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<AppSettings>;
  } catch (error) {
    console.warn("[tokenpet] failed to read settings", error);
    return {};
  }
}

function writeStoredSettings() {
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    const persistedSettings = {
      ...settings,
      petStory: { ...settings.petStory, lastAction: null },
    };
    writeFileSync(settingsPath(), JSON.stringify(persistedSettings, null, 2));
  } catch (error) {
    console.warn("[tokenpet] failed to write settings", error);
  }
}

function hydrateSettings() {
  const storedSettings = readStoredSettings();
  const appearance = normalizePetAppearance(storedSettings);
  settings = syncLegacyAppearanceFields({
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    petStory: normalizePetStory(storedSettings.petStory),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
  }, appearance) as AppSettings;
}

function createTrayIcon() {
  const assetCandidates = [
    join(__dirname, "../dist-renderer/assets/pets/cat-menubar.png"),
    join(app.getAppPath(), "apps/desktop/public/assets/pets/cat-menubar.png"),
  ];

  for (const assetPath of assetCandidates) {
    const image = nativeImage.createFromPath(assetPath);
    if (!image.isEmpty()) {
      return image.resize({ width: 22, quality: "best" });
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

  tray.setToolTip("TokenPet");
  if (process.platform === "darwin") {
    tray.setTitle(snapshot ? compactNumber(snapshot.todayTokens) : "");
  }
}

function emitPetDirectorEvent(event: PetDirectorEvent) {
  if (!isUsableWindow(petWindow) || petWindow.webContents.isLoading()) {
    pendingDirectorEvents.push(event);
    if (settings.petVisible && app.isReady() && !isUsableWindow(petWindow)) createPetWindow();
    return;
  }
  petWindow.webContents.send("pet:director-event", event);
}

function flushPendingDirectorEvents() {
  if (!isUsableWindow(petWindow) || petWindow.webContents.isLoading()) return;
  while (pendingDirectorEvents.length) {
    const event = pendingDirectorEvents.shift();
    if (event) petWindow.webContents.send("pet:director-event", event);
  }
}

async function loadAndPublishUsage(options: { force?: boolean } = {}) {
  const snapshot = await loadUsageSnapshot(options);
  updateTray(snapshot);
  const now = Date.now();
  if (options.force || lastStoryReconcileAt === 0 || now - lastStoryReconcileAt >= 60_000) {
    lastStoryReconcileAt = now;
    const reconciliation = reconcilePetStory(settings.petStory, snapshot);
    if (reconciliation.changed) {
      settings = { ...settings, petStory: reconciliation.story };
      writeStoredSettings();
      publishSettings(currentSettings());
    }
    reconciliation.events.forEach(emitPetDirectorEvent);
  }
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
        label: "Quit TokenPet",
        click: () => quitTokenPet(),
      },
    ]).popup();
  });
}

function menuBarPosition() {
  const trayBounds = tray?.getBounds();
  const cursor = currentCursorScreenPoint();
  const display = trayBounds ? screen.getDisplayMatching(trayBounds) : screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  const anchorX = trayBounds ? trayBounds.x + trayBounds.width / 2 : cursor.x;
  const anchorY = trayBounds ? trayBounds.y + trayBounds.height : workArea.y;
  const x = clampValue(
    Math.round(anchorX - MENUBAR_SIZE.width / 2),
    workArea.x + POPOVER_MARGIN,
    workArea.x + workArea.width - MENUBAR_SIZE.width - POPOVER_MARGIN,
  );
  const y = clampValue(
    Math.round(anchorY + POPOVER_GAP),
    workArea.y + POPOVER_MARGIN,
    workArea.y + workArea.height - MENUBAR_SIZE.height - POPOVER_MARGIN,
  );

  return { x, y };
}

function createMenuBarWindow() {
  if (isUsableWindow(menuBarWindow)) {
    menuBarWindow.show();
    menuBarWindow.focus();
    return;
  }
  disposeStaleWindow(menuBarWindow);
  menuBarWindow = null;

  const { x, y } = menuBarPosition();

  const createdWindow = new BrowserWindow({
    width: MENUBAR_SIZE.width,
    height: MENUBAR_SIZE.height,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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
  menuBarWindow = createdWindow;
  trackWindowHealth(createdWindow);

  createdWindow.setAlwaysOnTop(true, "floating");
  verifyBridge(createdWindow, "menubar");
  void loadWindow(createdWindow, "menubar");

  createdWindow.on("blur", () => {
    closeUsableWindow(createdWindow);
  });

  createdWindow.on("closed", () => {
    if (menuBarWindow === createdWindow) menuBarWindow = null;
  });
}

function toggleMenuBarWindow() {
  if (isUsableWindow(menuBarWindow)) {
    menuBarWindow.close();
    return;
  }

  disposeStaleWindow(menuBarWindow);
  menuBarWindow = null;
  createMenuBarWindow();
}

function openConsoleWindow(initialTab: ConsoleTab = "overview") {
  if (!isUsableWindow(consoleWindow)) {
    disposeStaleWindow(consoleWindow);
    consoleWindow = null;
  }

  if (consoleWindow) {
    const existingWindow = consoleWindow;
    if (existingWindow.isMinimized()) existingWindow.restore();
    existingWindow.show();
    existingWindow.focus();
    if (existingWindow.webContents.isLoading()) {
      existingWindow.webContents.once("did-finish-load", () => {
        if (isUsableWindow(existingWindow)) existingWindow.webContents.send("app:navigate-console", initialTab);
      });
    } else {
      existingWindow.webContents.send("app:navigate-console", initialTab);
    }
    return;
  }

  const display = screen.getDisplayNearestPoint(currentCursorScreenPoint());
  const workArea = display.workArea;
  const availableWidth = Math.max(640, workArea.width - 48);
  const availableHeight = Math.max(560, workArea.height - 48);
  const consoleWidth = Math.min(1280, availableWidth);
  const consoleHeight = Math.min(900, availableHeight);
  const x = workArea.x + Math.round((workArea.width - consoleWidth) / 2);
  const y = workArea.y + Math.round((workArea.height - consoleHeight) / 2);

  const createdWindow = new BrowserWindow({
    width: consoleWidth,
    height: consoleHeight,
    x,
    y,
    minWidth: Math.min(900, consoleWidth),
    minHeight: Math.min(640, consoleHeight),
    title: "TokenPet Console",
    ...(process.platform === "darwin"
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  consoleWindow = createdWindow;
  trackWindowHealth(createdWindow);

  verifyBridge(createdWindow, "console");
  createdWindow.webContents.once("did-finish-load", () => {
    if (isUsableWindow(createdWindow)) createdWindow.webContents.send("app:navigate-console", initialTab);
  });
  void loadWindow(createdWindow, "console", { section: initialTab });

  createdWindow.on("closed", () => {
    if (consoleWindow === createdWindow) consoleWindow = null;
  });
}

function popoverPositionForPet(petBounds: Rectangle, popoverBounds = POPOVER_SIZE) {
  const display = screen.getDisplayMatching(petBounds);
  return popoverPositionForBounds(petBounds, popoverBounds, display.workArea, POPOVER_MARGIN, POPOVER_GAP);
}

function positionAccessoryWindows() {
  if (!isUsableWindow(petWindow)) return;

  const petBounds = petWindow.getBounds();

  if (isUsableWindow(popoverWindow)) {
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
  if (!isUsableWindow(petWindow)) return;

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
    if (!isUsableWindow(petWindow)) {
      disposeStaleWindow(petWindow);
      petWindow = null;
      createPetWindow();
    } else {
      petWindow.show();
    }
    return;
  }

  cancelPetTraversal();
  closeUsableWindow(popoverWindow);
  if (isUsableWindow(petWindow)) petWindow.hide();
  else {
    disposeStaleWindow(petWindow);
    petWindow = null;
  }
}

function setAlwaysOnTop(enabled: boolean) {
  settings.alwaysOnTop = enabled;
  applyAlwaysOnTop();
}

function setPetTheme(theme: AppSettings["petTheme"]) {
  settings.petTheme = theme;
  settings.petAppearance = normalizePetAppearance({
    ...settings,
    petAppearance: {
      ...settings.petAppearance,
      themeId: theme,
    },
  });
}

function publishSettings(nextSettings: AppSettings) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (isUsableWindow(window)) window.webContents.send("app:settings-updated", nextSettings);
  });
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

  if (key === "petScale") {
    settings.petScale = clampValue(Number(value), 0.75, 1.25);
    settings.petAppearance = normalizePetAppearance({
      ...settings,
      petAppearance: {
        ...settings.petAppearance,
        size: settings.petScale,
      },
    });
  }

  if (key === "petOpacity") {
    settings.petOpacity = clampValue(Number(value), 0.45, 1);
    settings.petAppearance = normalizePetAppearance({
      ...settings,
      petAppearance: {
        ...settings.petAppearance,
        opacity: settings.petOpacity,
      },
    });
  }

  if (key === "petAppearance") {
    settings.petAppearance = normalizePetAppearance({
      ...settings,
      petAppearance: value as AppSettings["petAppearance"],
    });
  }

  if (key === "petStory") {
    settings.petStory = normalizePetStory(value);
    if (settings.petStory.lockPosition) cancelPetTraversal();
  }

  settings = syncLegacyAppearanceFields(settings, settings.petAppearance) as AppSettings;

  const nextSettings = currentSettings();
  writeStoredSettings();
  publishSettings(nextSettings);
  return nextSettings;
}

function showPetContextMenu() {
  Menu.buildFromTemplate([
    {
      label: "Open Quick Play",
      click: () => togglePopover(),
    },
    {
      label: "Hide Pet",
      click: () => setSetting("petVisible", false),
    },
    {
      type: "separator",
    },
    {
      label: "Quit TokenPet",
      click: () => quitTokenPet(),
    },
  ]).popup({ window: isUsableWindow(petWindow) ? petWindow : undefined });
}

function clampPetBoundsToDisplay(bounds: Rectangle) {
  const display = screen.getDisplayMatching(bounds);
  return clampBoundsToWorkArea(bounds, display.workArea);
}

function initialPetBounds(): Rectangle {
  const stored = readStoredPetPosition();
  if (stored) {
    return clampPetBoundsToDisplay({ ...stored, width: PET_WINDOW_SIZE.width, height: PET_WINDOW_SIZE.height });
  }

  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  return {
    width: PET_WINDOW_SIZE.width,
    height: PET_WINDOW_SIZE.height,
    x: workArea.x + workArea.width - PET_WINDOW_SIZE.width - 50,
    y: clampValue(workArea.y + 120, workArea.y, workArea.y + workArea.height - PET_WINDOW_SIZE.height),
  };
}

function createPetWindow() {
  if (isUsableWindow(petWindow)) {
    petWindow.show();
    return;
  }
  disposeStaleWindow(petWindow);
  petWindow = null;

  const initialBounds = initialPetBounds();

  const createdWindow = new BrowserWindow({
    ...initialBounds,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
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
  petWindow = createdWindow;
  trackWindowHealth(createdWindow);

  createdWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applyAlwaysOnTop();
  createdWindow.webContents.on("context-menu", () => {
    showPetContextMenu();
  });
  verifyBridge(createdWindow, "pet");
  createdWindow.webContents.on("did-finish-load", flushPendingDirectorEvents);
  void loadWindow(createdWindow, "pet");

  createdWindow.on("move", () => {
    if (petWindow === createdWindow) positionAccessoryWindows();
  });

  createdWindow.on("blur", () => {
    stopDrag();
  });

  createdWindow.on("closed", () => {
    if (traversalState?.window === createdWindow) cancelPetTraversal();
    if (petWindow === createdWindow) {
      petWindow = null;
      closeUsableWindow(popoverWindow);
      stopDrag();
    }
  });
}

function createPopoverWindow() {
  if (!isUsableWindow(petWindow)) {
    disposeStaleWindow(petWindow);
    petWindow = null;
    if (settings.petVisible) createPetWindow();
  }
  if (!isUsableWindow(petWindow)) return;

  const petBounds = petWindow.getBounds();
  const popoverPosition = popoverPositionForPet(petBounds);

  const createdWindow = new BrowserWindow({
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
  popoverWindow = createdWindow;
  trackWindowHealth(createdWindow);

  createdWindow.setAlwaysOnTop(true, "floating");
  verifyBridge(createdWindow, "popover");
  void loadWindow(createdWindow, "popover");

  createdWindow.on("blur", () => {
    closeUsableWindow(createdWindow);
  });

  createdWindow.on("closed", () => {
    if (popoverWindow === createdWindow) popoverWindow = null;
  });

  positionAccessoryWindows();
}

function togglePopover() {
  if (isUsableWindow(popoverWindow)) {
    popoverWindow.close();
    return;
  }

  disposeStaleWindow(popoverWindow);
  popoverWindow = null;
  createPopoverWindow();
}

function summonPetToCurrentScreen() {
  cancelPetTraversal();
  if (!settings.petVisible) {
    settings.petVisible = true;
    createPetWindow();
    writeStoredSettings();
    publishSettings(currentSettings());
  } else if (!isUsableWindow(petWindow)) {
    disposeStaleWindow(petWindow);
    petWindow = null;
    createPetWindow();
  }
  if (!isUsableWindow(petWindow)) return { moved: false };

  const cursor = currentCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(cursor).workArea;
  const bounds = petWindow.getBounds();
  const nextBounds = summonBoundsForCursor(bounds, cursor, workArea);
  petWindow.setBounds(nextBounds, true);
  petWindow.showInactive();
  writeStoredPetPosition(nextBounds);
  positionAccessoryWindows();
  return { moved: true };
}

async function capturePetMoment() {
  if (!isUsableWindow(petWindow) || petWindow.webContents.isLoading()) return { saved: false };
  const targetWindow = petWindow;

  const image = await (async () => {
    await targetWindow.webContents.executeJavaScript(`document.querySelector('.pet-close')?.setAttribute('data-capture-hidden', document.querySelector('.pet-close')?.style.visibility || ''); if (document.querySelector('.pet-close')) document.querySelector('.pet-close').style.visibility = 'hidden';`);
    try {
      await new Promise((resolve) => setTimeout(resolve, 34));
      return await targetWindow.webContents.capturePage();
    } finally {
      if (isUsableWindow(targetWindow)) {
        await targetWindow.webContents.executeJavaScript(`if (document.querySelector('.pet-close')) { document.querySelector('.pet-close').style.visibility = document.querySelector('.pet-close').getAttribute('data-capture-hidden') || ''; document.querySelector('.pet-close').removeAttribute('data-capture-hidden'); }`);
      }
    }
  })();
  if (image.isEmpty()) return { saved: false };
  const png = image.toPNG();
  if (!hasPngSignature(png)) return { saved: false };
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dialogParent = [popoverWindow, consoleWindow, targetWindow].find(isUsableWindow);
  const qaCapturePath = isMainProcessQa ? process.env.TOKENPET_MAIN_PROCESS_QA_CAPTURE_PATH : undefined;
  const saveDialogOptions = {
    title: "Save TokenPet moment",
    defaultPath: join(app.getPath("pictures"), `TokenPet-${timestamp}.png`),
    filters: [{ name: "PNG image", extensions: ["png"] }],
  };
  const result = qaCapturePath
    ? { canceled: false, filePath: qaCapturePath }
    : dialogParent
      ? await dialog.showSaveDialog(dialogParent, saveDialogOptions)
      : await dialog.showSaveDialog(saveDialogOptions);
  if (result.canceled || !result.filePath) return { saved: false };

  writeFileSync(result.filePath, png);
  return { saved: true, filePath: result.filePath };
}

function startCursorTracking() {
  if (cursorTrackingTimer) return;
  cursorTrackingTimer = setInterval(() => {
    if (!isUsableWindow(petWindow) || !settings.petStory.followCursor || dragState) return;
    const cursor = currentCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    petWindow.webContents.send("pet:cursor-position", {
      x: clampValue((cursor.x - centerX) / Math.max(bounds.width * 1.5, 1), -1, 1),
      y: clampValue((cursor.y - centerY) / Math.max(bounds.height * 1.5, 1), -1, 1),
    });
  }, 120);
  cursorTrackingTimer.unref();
}

export const tokenPetReady = app.whenReady().then(() => {
  hydrateSettings();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  if (!isMainProcessQa) createTray();
  startCursorTracking();
  if (settings.petVisible) {
    createPetWindow();
  }
  if (!isMainProcessQa) void loadAndPublishUsage({ force: true });

  app.on("activate", () => {
    if (settings.petVisible && !isUsableWindow(petWindow)) createPetWindow();
  });
});

export const mainProcessQa = {
  enabled: isMainProcessQa,
  getWindow(kind: "pet" | "popover" | "menubar" | "console") {
    return { pet: petWindow, popover: popoverWindow, menubar: menuBarWindow, console: consoleWindow }[kind];
  },
  getSettings() {
    return currentSettings();
  },
  isWindowUsable: isUsableWindow,
  setCursorPoint(point: { x: number; y: number } | null) {
    if (!isMainProcessQa) throw new Error("QA cursor override is unavailable outside main-process QA");
    mainProcessQaCursor = point;
  },
  openConsole(tab: ConsoleTab = "pet") {
    openConsoleWindow(tab);
  },
  toggleMenuBar: toggleMenuBarWindow,
  togglePopover,
  setSetting,
  summonPetToCurrentScreen,
  traversePetAcrossWorkArea,
  capturePetMoment,
};

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
  setSetting("petVisible", false);
});

ipcMain.on("popover:close", () => {
  closeUsableWindow(popoverWindow);
});

ipcMain.on("app:open-console", (_event, requestedTab: ConsoleTab = "pet") => {
  const tab: ConsoleTab = ["overview", "breakdown", "cost", "pet", "settings"].includes(requestedTab) ? requestedTab : "pet";
  openConsoleWindow(tab);
});

ipcMain.on("app:quit", () => {
  quitTokenPet();
});

const quickPlayActionIds = new Set<QuickPlayActionId>([
  "click_purr",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_screen",
  "capture_moment",
]);

ipcMain.handle("pet:dispatch-action", (_event, action: QuickPlayActionId) => {
  if (!quickPlayActionIds.has(action)) return { accepted: false };
  emitPetDirectorEvent({ type: "quickPlay.action", action });
  return { accepted: true };
});

ipcMain.handle("pet:summon", () => summonPetToCurrentScreen());

ipcMain.handle("pet:traverse", () => traversePetAcrossWorkArea());

ipcMain.handle("pet:capture-moment", () => capturePetMoment());

function stopDrag() {
  if (!dragState) return;

  const moved = dragState.moved;
  clearInterval(dragState.timer);
  dragState = null;
  if (moved && isUsableWindow(petWindow)) {
    const bounds = clampPetBoundsToDisplay(petWindow.getBounds());
    petWindow.setBounds(bounds, false);
    writeStoredPetPosition(bounds);
    positionAccessoryWindows();
  }
}

ipcMain.handle("pet:start-drag", () => {
  cancelPetTraversal();
  if (!isUsableWindow(petWindow) || settings.petStory.lockPosition) return { started: false };

  stopDrag();

  const pointer = currentCursorScreenPoint();
  const bounds = petWindow.getBounds();

  dragState = {
    pointerX: pointer.x,
    pointerY: pointer.y,
    windowX: bounds.x,
    windowY: bounds.y,
    moved: false,
    timer: setInterval(() => {
      if (!isUsableWindow(petWindow) || !dragState) return;

      const nextPointer = currentCursorScreenPoint();
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
  if (moved && isUsableWindow(petWindow)) {
    const bounds = clampPetBoundsToDisplay(petWindow.getBounds());
    petWindow.setBounds(bounds, false);
    writeStoredPetPosition(bounds);
    positionAccessoryWindows();
  }
  return { moved };
});
