import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, screen, Tray } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent, Rectangle } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, PetActionId, PetDirectorEvent, QuickPlayActionId, QuickPlayActorDirection, QuickPlayPhase, QuickPlaySession } from "./types.js";
import { defaultPetAppearance, normalizePetAppearance, syncLegacyAppearanceFields } from "./appearance.js";
import { moodSignalFromUsage } from "./mood.js";
import { defaultPetStory, normalizePetStory, reconcilePetStory } from "./story.js";
import { loadUsageSnapshot } from "./usage.js";
import {
  alphaBoundsForBitmap,
  clampBoundsToWorkArea,
  clampValue,
  createPetTraversalPlan,
  hasPngSignature,
  petTraversalBoundsAtProgress,
  petVisibleBoundsForPopover,
  popoverPositionForBounds,
  summonBoundsForCursor,
} from "./window-behavior.js";
import {
  accumulateDangleMovement,
  boundsAtPointToPointTime,
  createDistanceLockedWalkPlan,
  createCursorTrackingState,
  createDangleMovementState,
  dangleActorDirection,
  createQuickPlayActionTimeline,
  createPointToPointPath,
  createYarnRollPlan,
  DANGLE_PURSUIT_ROOT_MOTION,
  DANGLE_RETURN_ROOT_MOTION,
  DEFAULT_WALK_ROOT_MOTION,
  FEED_SNACK_RETURN_ROOT_MOTION,
  FEED_SNACK_WALK_ROOT_MOTION,
  TOSS_YARN_CARRY_ROOT_MOTION,
  TOSS_YARN_CHASE_ROOT_MOTION,
  interpolateQuickPlayBounds,
  normalizeQuickPlayActionConfig,
  sampleSafeRandomTarget,
  scaleDistanceLockedWalkPlan,
  distanceLockedWalkProgressAtTime,
  feedSnackTargetBounds,
  feedSnackReturnPacePercent,
  updateCursorTracking,
} from "./quick-play-choreography.js";
import type { CursorTrackingState, DistanceLockedWalkPlan, DangleMovementState, WalkRootMotionProfile } from "./quick-play-choreography.js";
import {
  executeDance,
  executeDangleToy,
  executeFeedSnack,
  executeNapHere,
  executePet,
  executePlayCursor,
  NAP_HERE_DURATION_MS,
  PLAY_CURSOR_DURATION_MS,
  executeTossYarn,
  executeWakeUp,
} from "./quick-play/executors/index.js";
import type { FeedSnackLocomotionId as FeedSnackSemanticLocomotionId, FeedSnackPropStage } from "./quick-play/executors/feed-snack.js";
import type { DancePhase } from "./quick-play/executors/dance.js";

app.enableSandbox();

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = process.env.TOKENPET_DEV_SERVER_URL !== undefined;
const devServerUrl = process.env.TOKENPET_DEV_SERVER_URL;
const isMainProcessQa = process.env.TOKENPET_MAIN_PROCESS_QA === "1";

// Dance starts in the persistent pet renderer after a click in the separate
// Quick Play window. Chromium does not transfer user activation between those
// renderers, so permit the explicitly user-requested local reference track.
// Product mute/quiet/focus policy is still enforced by soundCueEngine.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let petWindow: BrowserWindow | null = null;
let popoverWindow: BrowserWindow | null = null;
let menuBarWindow: BrowserWindow | null = null;
let consoleWindow: BrowserWindow | null = null;
let quickPlayOverlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayHealthTimer: NodeJS.Timeout | null = null;
let trayTokenTitle = "";
let isQuitting = false;
let cursorTrackingTimer: NodeJS.Timeout | null = null;
let lastStoryReconcileAt = 0;
const pendingDirectorEvents: PetDirectorEvent[] = [];
const rendererGoneWindows = new WeakSet<BrowserWindow>();
let mainProcessQaCursor: { x: number; y: number } | null = null;
let workspaceRehomeCount = 0;
let quickPlaySession: QuickPlaySession = {
  activeAction: null,
  startedAt: null,
  phase: "idle",
  phaseStartedAt: null,
  startBounds: null,
  startDirectorState: null,
  targetPoint: null,
  walkMotion: null,
  actorDirection: null,
  actorVariant: null,
  pointerMode: "none",
  resting: false,
  restingUntil: null,
  failure: null,
};
let quickPlaySessionTimer: NodeJS.Timeout | null = null;
let reportedPetDirectorState: { action: PetActionId; resting: boolean } = { action: "idle_breathe", resting: false };
let timedNapTimer: NodeJS.Timeout | null = null;
let timedNapState: { restoreAction: PetActionId; startedAt: number; expiresAt: number; durationMs: number } | null = null;
type QuickPlayRuntime = {
  id: number;
  action: Exclude<QuickPlayActionId, "capture_moment">;
  startBounds: Rectangle;
  targetBounds: Rectangle | null;
  timers: Set<NodeJS.Timeout>;
  cancelers: Set<() => void>;
  overlayTimer: NodeJS.Timeout | null;
  resolveOverlay: ((point: { x: number; y: number; velocityX: number; velocityY: number } | null) => void) | null;
  dangleState: DangleMovementState;
  dangleTargetPoint: { x: number; y: number } | null;
  dangleSequenceStarted: boolean;
  dangleReleased: boolean;
  dangleMotionPromise: Promise<void> | null;
  dangleLastPublishAt: number;
  overlayClosing: boolean;
  failing: boolean;
};
let quickPlayRuntime: QuickPlayRuntime | null = null;
let nextQuickPlayRuntimeId = 1;
let quickPlayTimeScale = 1;
let quickPlayCursorTrackingState: CursorTrackingState = createCursorTrackingState();
const quickPlayTrace: Array<{ at: number; action: QuickPlayActionId | null; phase: QuickPlayPhase; bounds: Rectangle | null; targetPoint: { x: number; y: number } | null; actorDirection: QuickPlayActorDirection | null }> = [];
let petVisibleCaptureBounds: Rectangle | null = null;
type DangleLocomotionId =
  | "dangle_pursuit_run" | "dangle_pursuit_run_front" | "dangle_pursuit_run_back"
  | "dangle_pursuit_run_front_left" | "dangle_pursuit_run_front_right" | "dangle_pursuit_run_back_left" | "dangle_pursuit_run_back_right"
  | "dangle_return_walk" | "dangle_return_walk_front" | "dangle_return_walk_back"
  | "dangle_return_walk_front_left" | "dangle_return_walk_front_right" | "dangle_return_walk_back_left" | "dangle_return_walk_back_right";
type TossYarnDirectionId = "right" | "left" | "front" | "back" | "front_right" | "front_left" | "back_right" | "back_left";
type TossYarnLocomotionId = `toss_yarn_chase_${TossYarnDirectionId}` | `toss_yarn_carry_${TossYarnDirectionId}`;
type FeedSnackDirectionId = TossYarnDirectionId;
type FeedSnackDirectionalLocomotionId = `feed_snack_walk_slow_${FeedSnackDirectionId}` | `feed_snack_return_run_${FeedSnackDirectionId}`;
type PetWalkDirectionalLocomotionId = `walk_round_trip_walk_${TossYarnDirectionId}`;
type GoldenLocomotionActionId = "walk_round_trip" | PetWalkDirectionalLocomotionId | FeedSnackSemanticLocomotionId | FeedSnackDirectionalLocomotionId | DangleLocomotionId | TossYarnLocomotionId;
const cachedLocomotionRootMotion = new Map<GoldenLocomotionActionId, WalkRootMotionProfile>();

function fallbackLocomotionProfile(actionId: GoldenLocomotionActionId) {
  if (actionId.startsWith("feed_snack_walk_slow")) return FEED_SNACK_WALK_ROOT_MOTION;
  if (actionId.startsWith("feed_snack_return_run")) return FEED_SNACK_RETURN_ROOT_MOTION;
  if (actionId.startsWith("dangle_pursuit_run")) return DANGLE_PURSUIT_ROOT_MOTION;
  if (actionId.startsWith("dangle_return_walk")) return DANGLE_RETURN_ROOT_MOTION;
  if (actionId.startsWith("toss_yarn_chase_")) return TOSS_YARN_CHASE_ROOT_MOTION;
  if (actionId.startsWith("toss_yarn_carry_")) return TOSS_YARN_CARRY_ROOT_MOTION;
  return DEFAULT_WALK_ROOT_MOTION;
}

function loadGoldenLocomotionRootMotion(actionId: GoldenLocomotionActionId): WalkRootMotionProfile {
  const cached = cachedLocomotionRootMotion.get(actionId);
  if (cached) return cached;
  const candidates = [
    join(__dirname, "../dist-renderer/pet-actors/golden-british/actor.json"),
    join(app.getAppPath(), "apps/desktop/public/pet-actors/golden-british/actor.json"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as {
        animations?: Record<string, { locomotion?: WalkRootMotionProfile }>;
      };
      const profile = manifest.animations?.[`action.${actionId}`]?.locomotion;
      if (
        profile
        && profile.footfallsPerCycle > 0
        && profile.nominalStepDistancePx > 0
        && profile.rootStepKeyframes.length >= 2
        && profile.rootStepKeyframes[0] === 0
        && profile.rootStepKeyframes.at(-1) === profile.footfallsPerCycle
      ) {
        const resolved = {
          nominalStepDistancePx: profile.nominalStepDistancePx,
          footfallsPerCycle: profile.footfallsPerCycle,
          rootStepKeyframes: [...profile.rootStepKeyframes],
        };
        cachedLocomotionRootMotion.set(actionId, resolved);
        return resolved;
      }
    } catch (error) {
      console.warn(`[tokenpet] unable to load authored ${actionId} root motion from ${path}`, error);
    }
  }
  const fallback = fallbackLocomotionProfile(actionId);
  const resolved = {
    ...fallback,
    rootStepKeyframes: [...fallback.rootStepKeyframes],
  };
  cachedLocomotionRootMotion.set(actionId, resolved);
  return resolved;
}
let captureQueue: Promise<unknown> = Promise.resolve();
let mainProcessQaCaptureCount = 0;
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
  petOpacity: 1,
  petAppearance: defaultPetAppearance,
  petStory: defaultPetStory,
};

let settings: AppSettings = { ...DEFAULT_SETTINGS };

const POPOVER_SIZE = {
  width: 280,
  height: 480,
};

const POPOVER_MARGIN = 12;
const POPOVER_GAP = 6;

const MENUBAR_SIZE = {
  width: 500,
  height: 360,
};

const TRAY_HEALTH_INTERVAL_MS = 30_000;

const PET_WINDOW_SIZE = {
  width: 260,
  height: 260,
};

type ConsoleTab = "overview" | "breakdown" | "cost" | "pet" | "settings";
type RendererView = "pet" | "popover" | "menubar" | "console" | "quick-play-overlay";

const rendererViews = new Set<RendererView>(["pet", "popover", "menubar", "console", "quick-play-overlay"]);

function trustedRendererViewForUrl(value: string): RendererView | null {
  try {
    const url = new URL(value);
    const view = url.searchParams.get("view") as RendererView | null;
    if (!view || !rendererViews.has(view)) return null;

    if (isDev && devServerUrl) {
      return url.origin === new URL(devServerUrl).origin ? view : null;
    }

    if (url.protocol !== "file:") return null;
    const expectedPath = join(__dirname, "../dist-renderer/index.html");
    return fileURLToPath(url) === expectedPath ? view : null;
  } catch {
    return null;
  }
}

function isTrustedRendererUrl(value: string) {
  return trustedRendererViewForUrl(value) !== null;
}

type IpcSenderEvent = IpcMainEvent | IpcMainInvokeEvent;

function ipcSenderView(event: IpcSenderEvent) {
  return trustedRendererViewForUrl(event.senderFrame?.url ?? event.sender.getURL());
}

function isTrustedIpcSender(event: IpcSenderEvent, ...allowedViews: RendererView[]) {
  const view = ipcSenderView(event);
  return view !== null && (allowedViews.length === 0 || allowedViews.includes(view));
}

function assertTrustedIpcSender(event: IpcSenderEvent, ...allowedViews: RendererView[]) {
  const view = ipcSenderView(event);
  if (view === null || (allowedViews.length > 0 && !allowedViews.includes(view))) {
    throw new Error("Blocked IPC request from an untrusted TokenPet renderer");
  }
  return view;
}

function isUsableWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed() && !rendererGoneWindows.has(window) && !window.webContents.isCrashed());
}

function trackWindowHealth(window: BrowserWindow) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
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

function rendererUrl(view: RendererView, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ view, ...params }).toString();
  if (isDev && devServerUrl) {
    return `${devServerUrl}/?${query}`;
  }

  return `file://${join(__dirname, "../dist-renderer/index.html")}?${query}`;
}

async function loadWindow(
  window: BrowserWindow,
  view: RendererView,
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
  isQuitting = true;
  stopTrayHealthMonitoring();
  clearTimedNapTimer();
  timedNapState = null;
  cancelPetTraversal();
  finishQuickPlaySession(undefined, true);
  if (cursorTrackingTimer) {
    clearInterval(cursorTrackingTimer);
    cursorTrackingTimer = null;
  }
  closeUsableWindow(menuBarWindow);
  closeUsableWindow(consoleWindow);
  closeUsableWindow(popoverWindow);
  closeUsableWindow(petWindow);
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
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
    // Closing the pet is session-scoped. Every new app launch starts with the
    // companion visible, even if the previous session ended while it was hidden.
    petVisible: true,
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
      const menuBarImage = image.resize({ height: process.platform === "darwin" ? 18 : 22, quality: "best" });
      // Keep the authored Golden British colors. A macOS template image would
      // intentionally flatten this artwork to a black/white silhouette.
      menuBarImage.setTemplateImage(false);
      return menuBarImage;
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

function applyTrayPresentation(target: Tray) {
  target.setImage(createTrayIcon());
  target.setToolTip("TokenPet");
  if (process.platform === "darwin") {
    target.setTitle(trayTokenTitle);
  }
}

function ensureTray(options: { recreate?: boolean } = {}) {
  if (isMainProcessQa || isQuitting || !app.isReady()) return;
  const usableTray = tray && !tray.isDestroyed() ? tray : null;
  if (!usableTray || options.recreate) {
    try {
      createTray();
    } catch (error) {
      tray = null;
      console.warn("[tokenpet] failed to restore menu bar pet", error);
    }
    return;
  }
  applyTrayPresentation(usableTray);
}

function recoverTrayAfterSystemChange() {
  ensureTray({ recreate: true });
}

function startTrayHealthMonitoring() {
  if (isMainProcessQa || trayHealthTimer) return;
  powerMonitor.on("resume", recoverTrayAfterSystemChange);
  screen.on("display-added", recoverTrayAfterSystemChange);
  screen.on("display-removed", recoverTrayAfterSystemChange);
  screen.on("display-metrics-changed", recoverTrayAfterSystemChange);
  trayHealthTimer = setInterval(() => ensureTray(), TRAY_HEALTH_INTERVAL_MS);
  trayHealthTimer.unref();
}

function stopTrayHealthMonitoring() {
  if (trayHealthTimer) {
    clearInterval(trayHealthTimer);
    trayHealthTimer = null;
  }
  powerMonitor.removeListener("resume", recoverTrayAfterSystemChange);
  screen.removeListener("display-added", recoverTrayAfterSystemChange);
  screen.removeListener("display-removed", recoverTrayAfterSystemChange);
  screen.removeListener("display-metrics-changed", recoverTrayAfterSystemChange);
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
  trayTokenTitle = compactNumber(moodSignalFromUsage(snapshot, settings.petStory.moodSignalWindow));
  ensureTray();
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
  if (tray && !tray.isDestroyed()) tray.destroy();
  const nextTray = new Tray(createTrayIcon());
  tray = nextTray;
  applyTrayPresentation(nextTray);

  nextTray.on("click", () => {
    toggleMenuBarWindow();
  });

  nextTray.on("right-click", () => {
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
    const { x, y } = menuBarPosition();
    menuBarWindow.setPosition(x, y, false);
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
    show: false,
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
  let canAutoDismiss = false;
  void loadWindow(createdWindow, "menubar").then(() => {
    if (!isUsableWindow(createdWindow) || menuBarWindow !== createdWindow) return;
    const position = menuBarPosition();
    createdWindow.setPosition(position.x, position.y, false);
    createdWindow.show();
    createdWindow.focus();
    // macOS may briefly transfer focus through the status item while the panel
    // is being presented. Ignore only that initial synthetic blur.
    setTimeout(() => {
      if (isUsableWindow(createdWindow) && menuBarWindow === createdWindow) canAutoDismiss = true;
    }, 180);
  });

  createdWindow.on("blur", () => {
    if (canAutoDismiss) closeUsableWindow(createdWindow);
  });

  createdWindow.on("closed", () => {
    if (menuBarWindow === createdWindow) menuBarWindow = null;
  });
}

function toggleMenuBarWindow() {
  if (isUsableWindow(menuBarWindow)) {
    if (menuBarWindow.isVisible()) menuBarWindow.close();
    else createMenuBarWindow();
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

function currentPetVisibleBounds(petBounds: Rectangle) {
  if (petVisibleCaptureBounds) {
    return {
      x: petBounds.x + petVisibleCaptureBounds.x,
      y: petBounds.y + petVisibleCaptureBounds.y,
      width: petVisibleCaptureBounds.width,
      height: petVisibleCaptureBounds.height,
    };
  }
  return petVisibleBoundsForPopover(petBounds, settings.petAppearance.size);
}

async function capturePetVisibleBounds(targetWindow: BrowserWindow) {
  if (!isUsableWindow(targetWindow)) return null;
  try {
    const image = await targetWindow.capturePage();
    const bitmap = image.toBitmap();
    const logicalSize = image.getSize();
    const expectedBytes = logicalSize.width * logicalSize.height * 4;
    const representationScale = expectedBytes > 0 ? Math.sqrt(bitmap.length / expectedBytes) : 1;
    const pixelWidth = Math.max(1, Math.round(logicalSize.width * representationScale));
    const pixelHeight = Math.max(1, Math.round(logicalSize.height * representationScale));
    const relativeBounds = alphaBoundsForBitmap(
      bitmap,
      pixelWidth,
      pixelHeight,
      targetWindow.getBounds().width,
      targetWindow.getBounds().height,
    );
    if (relativeBounds && petWindow === targetWindow) petVisibleCaptureBounds = relativeBounds;
    return relativeBounds;
  } catch (error) {
    console.warn("[tokenpet] unable to capture visible pet bounds", error);
    return null;
  }
}

function popoverPositionForPet(petBounds: Rectangle, popoverBounds = POPOVER_SIZE, visiblePetBounds = currentPetVisibleBounds(petBounds)) {
  const display = screen.getDisplayMatching(petBounds);
  return popoverPositionForBounds(visiblePetBounds, popoverBounds, display.workArea, POPOVER_MARGIN, POPOVER_GAP);
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

function showPetOnCurrentWorkspace(targetWindow: BrowserWindow) {
  if (!isUsableWindow(targetWindow)) return;

  if (process.platform === "darwin") {
    const workspaceOptions = { visibleOnFullScreen: true, skipTransformProcessType: true };
    // Temporarily join the active Space, show there, then immediately return to
    // single-Space mode. This re-homes a previously hidden pet to the Space the
    // user is viewing instead of switching back to the pet's old Space.
    targetWindow.setVisibleOnAllWorkspaces(true, workspaceOptions);
    targetWindow.showInactive();
    targetWindow.setVisibleOnAllWorkspaces(false, workspaceOptions);
  } else {
    targetWindow.showInactive();
  }

  targetWindow.moveTop();
  workspaceRehomeCount += 1;
}

function revealPetForLaunch() {
  settings.petVisible = true;
  if (!isUsableWindow(petWindow)) {
    disposeStaleWindow(petWindow);
    petWindow = null;
    createPetWindow();
  } else {
    showPetOnCurrentWorkspace(petWindow);
  }
  writeStoredSettings();
  publishSettings(currentSettings());
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
      showPetOnCurrentWorkspace(petWindow);
    }
    return;
  }

  cancelPetTraversal();
  finishQuickPlaySession(undefined, true);
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

const quickPlayPositionActions = new Set<QuickPlayActionId>([
  "walk_round_trip",
  "token_snack",
  "drag_dangle",
  "toss_yarn",
]);

function currentQuickPlaySession(): QuickPlaySession {
  return {
    ...quickPlaySession,
    startBounds: quickPlaySession.startBounds ? { ...quickPlaySession.startBounds } : null,
    currentBounds: isUsableWindow(petWindow) ? petWindow.getBounds() : null,
    walkMotion: quickPlaySession.walkMotion ? { ...quickPlaySession.walkMotion } : null,
  };
}

function publishQuickPlaySession() {
  const session = currentQuickPlaySession();
  BrowserWindow.getAllWindows().forEach((window) => {
    if (isUsableWindow(window)) window.webContents.send("quick-play:session-changed", session);
  });
}

function emptyQuickPlaySession(): QuickPlaySession {
  return {
    activeAction: null,
    startedAt: null,
    phase: "idle",
    phaseStartedAt: null,
    startBounds: null,
    startDirectorState: timedNapState?.restoreAction ?? reportedPetDirectorState.action,
    targetPoint: null,
    walkMotion: null,
    actorDirection: null,
    actorVariant: null,
    pointerMode: "none",
    resting: reportedPetDirectorState.resting,
    restingUntil: timedNapState?.expiresAt ?? null,
    failure: null,
  };
}

function clearTimedNapTimer() {
  if (timedNapTimer) {
    clearTimeout(timedNapTimer);
    timedNapTimer = null;
  }
}

function restoreTimedNap(options: { publish?: boolean } = {}) {
  const timedNap = timedNapState;
  if (!timedNap) return false;
  clearTimedNapTimer();
  timedNapState = null;
  reportedPetDirectorState = { action: timedNap.restoreAction, resting: false };
  quickPlaySession = {
    ...quickPlaySession,
    resting: false,
    restingUntil: null,
    startDirectorState: timedNap.restoreAction,
  };
  if (options.publish !== false) publishQuickPlaySession();
  return true;
}

function beginTimedNap(restoreAction: PetActionId, durationMs = NAP_HERE_DURATION_MS) {
  clearTimedNapTimer();
  const startedAt = Date.now();
  const wallDurationMs = Math.max(1, durationMs / quickPlayTimeScale);
  timedNapState = {
    restoreAction,
    startedAt,
    expiresAt: startedAt + wallDurationMs,
    durationMs,
  };
  reportedPetDirectorState = { action: "sleep_loop", resting: true };
  quickPlaySession = {
    ...quickPlaySession,
    resting: true,
    restingUntil: timedNapState.expiresAt,
    startDirectorState: restoreAction,
  };
  publishQuickPlaySession();
  timedNapTimer = setTimeout(() => {
    timedNapTimer = null;
    restoreTimedNap();
  }, wallDurationMs);
  timedNapTimer.unref();
}

function interruptRestForQuickPlayAction() {
  if (restoreTimedNap({ publish: false })) return true;
  if (!reportedPetDirectorState.resting) return false;
  const restoreAction = reportedPetDirectorState.action === "sleep_loop"
    ? "idle_breathe"
    : reportedPetDirectorState.action;
  reportedPetDirectorState = { action: restoreAction, resting: false };
  quickPlaySession = {
    ...quickPlaySession,
    resting: false,
    restingUntil: null,
    startDirectorState: restoreAction,
  };
  return true;
}

function updateQuickPlayPhase(phase: QuickPlayPhase, targetPoint = quickPlaySession.targetPoint) {
  const keepsWalkMotion = phase === "outbound" || phase === "pursuit" || phase === "return" || phase === "carry";
  quickPlaySession = { ...quickPlaySession, phase, phaseStartedAt: Date.now(), targetPoint, walkMotion: keepsWalkMotion ? quickPlaySession.walkMotion : null };
  quickPlayTrace.push({ at: Date.now(), action: quickPlaySession.activeAction, phase, bounds: isUsableWindow(petWindow) ? petWindow.getBounds() : null, targetPoint, actorDirection: quickPlaySession.actorDirection });
  publishQuickPlaySession();
}

function beginAuthoredWalkPhase(
  phase: "outbound" | "pursuit" | "return" | "carry",
  from: Rectangle,
  to: Rectangle,
  pacePercent: number,
  targetPoint = quickPlaySession.targetPoint,
  locomotionActionId: GoldenLocomotionActionId = "walk_round_trip",
) {
  const rootMotion = loadGoldenLocomotionRootMotion(locomotionActionId);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const authoredPlan = createDistanceLockedWalkPlan(distance, pacePercent, settings.petAppearance.size, rootMotion);
  const wallClockPlan = scaleDistanceLockedWalkPlan(authoredPlan, quickPlayTimeScale);
  const leadInMs = 90 / quickPlayTimeScale;
  const startedAt = Date.now() + leadInMs;
  quickPlaySession = {
    ...quickPlaySession,
    walkMotion: {
      startedAt,
      durationMs: wallClockPlan.durationMs,
      stepDurationMs: wallClockPlan.stepDurationMs,
      cycleDurationMs: wallClockPlan.cycleDurationMs,
      stepCount: wallClockPlan.stepCount,
      stepDistancePx: wallClockPlan.stepDistancePx,
      footfallsPerCycle: wallClockPlan.rootMotion.footfallsPerCycle,
      rootStepKeyframes: [...wallClockPlan.rootMotion.rootStepKeyframes],
    },
  };
  updateQuickPlayPhase(phase, targetPoint);
  return { authoredPlan, wallClockPlan, leadInMs, startedAt };
}

async function runAuthoredLocomotionLeg(
  runtime: QuickPlayRuntime,
  phase: "outbound" | "return" | "carry",
  from: Rectangle,
  to: Rectangle,
  pacePercent: number,
  locomotionActionId: GoldenLocomotionActionId,
  interruptionMessage: string,
  targetPoint = quickPlaySession.targetPoint,
) {
  const authored = beginAuthoredWalkPhase(phase, from, to, pacePercent, targetPoint, locomotionActionId);
  if (!await quickPlayDelay(runtime, 90)) return false;
  const moved = await animateQuickPlayBounds(runtime, to, authored.authoredPlan.durationMs, false, "straight", "walk", authored.wallClockPlan, authored.startedAt);
  if (!moved) throw new Error(interruptionMessage);
  return true;
}

function clearQuickPlayRuntimeTimers(runtime: QuickPlayRuntime | null) {
  if (!runtime) return;
  [...runtime.cancelers].forEach((cancel) => cancel());
  runtime.cancelers.clear();
  runtime.timers.forEach((timer) => clearTimeout(timer));
  runtime.timers.clear();
  if (runtime.overlayTimer) clearInterval(runtime.overlayTimer);
  runtime.overlayTimer = null;
}

function closeQuickPlayOverlay() {
  if (quickPlayRuntime) quickPlayRuntime.overlayClosing = true;
  closeUsableWindow(quickPlayOverlayWindow);
  quickPlayOverlayWindow = null;
}

function publishQuickPlayOverlayState(state: { phase?: "placing" | "playing" | "rolling" | "finishing"; enabled?: boolean; hint?: string; targetScreenX?: number; targetScreenY?: number; pointerScreenX?: number; pointerScreenY?: number; durationMs?: number; snackStage?: FeedSnackPropStage }) {
  if (isUsableWindow(quickPlayOverlayWindow)) quickPlayOverlayWindow.webContents.send("quick-play:overlay-state", state);
}

function releasePlacementPointer(runtime: QuickPlayRuntime, point: { x: number; y: number }) {
  if (!["token_snack", "toss_yarn"].includes(runtime.action) || !isUsableWindow(quickPlayOverlayWindow)) return;
  // Keep the placed prop visible through Feed eating or Toss rolling, while
  // returning pointer ownership and click handling to the desktop immediately.
  publishQuickPlayOverlayState({ enabled: false, targetScreenX: point.x, targetScreenY: point.y });
  quickPlayOverlayWindow.setIgnoreMouseEvents(true);
  // Once released, the prop's throw/place origin must no longer follow the
  // live system pointer. The overlay remains visible only as scenery.
  if (runtime.overlayTimer) clearInterval(runtime.overlayTimer);
  runtime.overlayTimer = null;
}

function finishQuickPlaySession(action?: Exclude<QuickPlayActionId, "capture_moment">, restoreStart = false) {
  if (action && quickPlaySession.activeAction !== action) return;
  if (quickPlaySessionTimer) clearTimeout(quickPlaySessionTimer);
  quickPlaySessionTimer = null;
  const runtime = quickPlayRuntime;
  if (restoreStart && runtime && isUsableWindow(petWindow)) {
    petWindow.setBounds(runtime.startBounds, false);
    positionAccessoryWindows();
  }
  runtime?.resolveOverlay?.(null);
  clearQuickPlayRuntimeTimers(runtime);
  quickPlayRuntime = null;
  quickPlayCursorTrackingState = createCursorTrackingState();
  closeQuickPlayOverlay();
  quickPlaySession = emptyQuickPlaySession();
  publishQuickPlaySession();
}

function quickPlayDelay(runtime: QuickPlayRuntime, durationMs: number) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      runtime.cancelers.delete(cancel);
      resolve(value);
    };
    const cancel = () => {
      clearTimeout(timer);
      runtime.timers.delete(timer);
      finish(false);
    };
    const timer = setTimeout(() => {
      runtime.timers.delete(timer);
      finish(quickPlayRuntime === runtime);
    }, Math.max(0, durationMs / quickPlayTimeScale));
    timer.unref();
    runtime.timers.add(timer);
    runtime.cancelers.add(cancel);
  });
}

function animateQuickPlayBounds(runtime: QuickPlayRuntime, target: Rectangle, durationMs: number, persist = false, routeCurve: "straight" | "gentle" | "curved" = "straight", motionProfile: "smooth" | "walk" = "smooth", walkPlan: DistanceLockedWalkPlan | null = null, motionStartedAtMs: number | null = null, abortWhen: (() => boolean) | null = null) {
  if (!isUsableWindow(petWindow) || quickPlayRuntime !== runtime) return Promise.resolve(false);
  const actorWindow = petWindow;
  const start = actorWindow.getBounds();
  // Walking sprites and native-window root motion must sample one epoch. Timer
  // wake-up jitter otherwise lets the legs get several milliseconds ahead of
  // the desktop displacement on every outbound/return phase.
  const startedAt = motionStartedAtMs ?? Date.now();
  const wallDurationMs = walkPlan?.durationMs ?? Math.max(1, durationMs / quickPlayTimeScale);
  const startDisplay = screen.getDisplayMatching(start);
  const targetDisplay = screen.getDisplayMatching(target);
  const curvedPlan = startDisplay.id === targetDisplay.id && routeCurve !== "straight"
    ? createPointToPointPath(start, target, startDisplay.workArea, { durationMs: wallDurationMs, routeCurve })
    : null;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      runtime.cancelers.delete(cancel);
      resolve(value);
    };
    const cancel = () => {
      clearInterval(timer);
      runtime.timers.delete(timer);
      finish(false);
    };
    const step = () => {
      if (quickPlayRuntime !== runtime || !isUsableWindow(actorWindow) || petWindow !== actorWindow || !settings.petVisible || dragState || abortWhen?.()) {
        clearInterval(timer);
        runtime.timers.delete(timer);
        finish(false);
        return;
      }
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const progress = Math.min(1, elapsedMs / wallDurationMs);
      const eased = motionProfile === "walk" && walkPlan
        ? distanceLockedWalkProgressAtTime(walkPlan, elapsedMs)
        : motionProfile === "walk"
          ? progress
          : progress < .5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
      const next = curvedPlan
        ? boundsAtPointToPointTime(curvedPlan, Date.now() - startedAt).bounds
        : interpolateQuickPlayBounds(start, target, eased);
      actorWindow.setBounds(next, false);
      if (isMainProcessQa) {
        const previousTraceBounds = quickPlayTrace.at(-1)?.bounds;
        if (!previousTraceBounds || previousTraceBounds.x !== next.x || previousTraceBounds.y !== next.y) {
          quickPlayTrace.push({ at: Date.now(), action: runtime.action, phase: quickPlaySession.phase, bounds: { ...next }, targetPoint: quickPlaySession.targetPoint, actorDirection: quickPlaySession.actorDirection });
        }
      }
      positionAccessoryWindows();
      if (progress < 1) return;
      clearInterval(timer);
      runtime.timers.delete(timer);
      actorWindow.setBounds(target, false);
      if (persist) writeStoredPetPosition(target);
      positionAccessoryWindows();
      finish(true);
    };
    const timer = setInterval(step, 16);
    timer.unref();
    runtime.timers.add(timer);
    runtime.cancelers.add(cancel);
    step();
  });
}

function dangleTargetBounds(runtime: QuickPlayRuntime, point: { x: number; y: number }) {
  const workArea = screen.getDisplayNearestPoint(point).workArea;
  return clampBoundsToWorkArea({
    ...runtime.startBounds,
    x: Math.round(point.x - runtime.startBounds.width / 2),
    y: Math.round(point.y + 26 - runtime.startBounds.height * .56),
  }, workArea);
}

function setDangleActorDirection(from: Rectangle, to: Rectangle) {
  const actorDirection = dangleActorDirection(from, to);
  quickPlaySession = { ...quickPlaySession, actorDirection };
  return actorDirection;
}

function danglePursuitAction(direction: QuickPlayActorDirection): DangleLocomotionId {
  if (direction === "front") return "dangle_pursuit_run_front";
  if (direction === "back") return "dangle_pursuit_run_back";
  if (direction === "front-left") return "dangle_pursuit_run_front_left";
  if (direction === "front-right") return "dangle_pursuit_run_front_right";
  if (direction === "back-left") return "dangle_pursuit_run_back_left";
  if (direction === "back-right") return "dangle_pursuit_run_back_right";
  return "dangle_pursuit_run";
}

function dangleReturnAction(direction: QuickPlayActorDirection): DangleLocomotionId {
  if (direction === "front") return "dangle_return_walk_front";
  if (direction === "back") return "dangle_return_walk_back";
  if (direction === "front-left") return "dangle_return_walk_front_left";
  if (direction === "front-right") return "dangle_return_walk_front_right";
  if (direction === "back-left") return "dangle_return_walk_back_left";
  if (direction === "back-right") return "dangle_return_walk_back_right";
  return "dangle_return_walk";
}

function tossYarnDirectionId(direction: QuickPlayActorDirection): TossYarnDirectionId {
  return direction.replaceAll("-", "_") as TossYarnDirectionId;
}

function setTossYarnActorDirection(from: Rectangle, to: Rectangle) {
  const actorDirection = dangleActorDirection(from, to);
  quickPlaySession = { ...quickPlaySession, actorDirection };
  return actorDirection;
}

function tossYarnChaseAction(direction: QuickPlayActorDirection): TossYarnLocomotionId {
  return `toss_yarn_chase_${tossYarnDirectionId(direction)}`;
}

function tossYarnCarryAction(direction: QuickPlayActorDirection): TossYarnLocomotionId {
  return `toss_yarn_carry_${tossYarnDirectionId(direction)}`;
}

function setFeedSnackActorDirection(from: Rectangle, to: Rectangle) {
  const actorDirection = dangleActorDirection(from, to);
  quickPlaySession = { ...quickPlaySession, actorDirection };
  return actorDirection;
}

function setPetActorDirection(from: Rectangle, to: Rectangle) {
  const actorDirection = dangleActorDirection(from, to);
  quickPlaySession = { ...quickPlaySession, actorDirection };
  return actorDirection;
}

function petWalkLocomotionAction(direction: QuickPlayActorDirection): PetWalkDirectionalLocomotionId {
  return `walk_round_trip_walk_${tossYarnDirectionId(direction)}`;
}

function feedSnackLocomotionAction(
  phase: "outbound" | "return",
  direction: QuickPlayActorDirection,
): FeedSnackDirectionalLocomotionId {
  const directionId = tossYarnDirectionId(direction) as FeedSnackDirectionId;
  return phase === "outbound"
    ? `feed_snack_walk_slow_${directionId}`
    : `feed_snack_return_run_${directionId}`;
}

function dangleTargetCrossedTravelDirection(runtime: QuickPlayRuntime, plannedTarget: Rectangle) {
  if (!runtime.dangleTargetPoint || !isUsableWindow(petWindow)) return false;
  const current = petWindow.getBounds();
  const liveTarget = dangleTargetBounds(runtime, runtime.dangleTargetPoint);
  const plannedVector = { x: plannedTarget.x - current.x, y: plannedTarget.y - current.y };
  const liveVector = { x: liveTarget.x - current.x, y: liveTarget.y - current.y };
  const plannedDistance = Math.hypot(plannedVector.x, plannedVector.y);
  const liveDistance = Math.hypot(liveVector.x, liveVector.y);
  if (plannedDistance < 8 || liveDistance < 48) return false;
  return plannedVector.x * liveVector.x + plannedVector.y * liveVector.y <= 0
    || dangleActorDirection(current, plannedTarget) !== dangleActorDirection(current, liveTarget);
}

async function runDanglePounceAndPursuit(runtime: QuickPlayRuntime) {
  const firstPoint = runtime.dangleTargetPoint;
  if (!firstPoint || runtime.dangleReleased || quickPlayRuntime !== runtime || !isUsableWindow(petWindow)) return;
  const firstTarget = dangleTargetBounds(runtime, firstPoint);
  runtime.targetBounds = firstTarget;
  setDangleActorDirection(petWindow.getBounds(), firstTarget);
  updateQuickPlayPhase("pounce", firstPoint);
  publishQuickPlayOverlayState({ hint: "Pounce! Keep moving the fish, or click to release." });
  let pounceRetargeted = false;
  const pounced = await animateQuickPlayBounds(
    runtime,
    firstTarget,
    620,
    false,
    "curved",
    "smooth",
    null,
    null,
    () => {
      if (runtime.dangleReleased) return true;
      pounceRetargeted = dangleTargetCrossedTravelDirection(runtime, firstTarget);
      return pounceRetargeted;
    },
  );
  if ((!pounced && !pounceRetargeted) || runtime.dangleReleased || quickPlayRuntime !== runtime) return;

  updateQuickPlayPhase("play", runtime.dangleTargetPoint ?? firstPoint);
  publishQuickPlayOverlayState({ hint: "Caught! Move the fish elsewhere to make your cat chase." });
  while (!runtime.dangleReleased && quickPlayRuntime === runtime && isUsableWindow(petWindow)) {
    const point = runtime.dangleTargetPoint;
    if (!point) {
      if (!await quickPlayDelay(runtime, 90)) return;
      continue;
    }
    const current = petWindow.getBounds();
    const target = dangleTargetBounds(runtime, point);
    const distance = Math.hypot(target.x - current.x, target.y - current.y);
    if (distance <= 72) {
      if (quickPlaySession.phase !== "play") updateQuickPlayPhase("play", point);
      if (!await quickPlayDelay(runtime, 110)) return;
      continue;
    }

    runtime.targetBounds = target;
    const config = actionConfig("drag_dangle");
    const direction = setDangleActorDirection(current, target);
    const authored = beginAuthoredWalkPhase("pursuit", current, target, config.pursuitPace, point, danglePursuitAction(direction));
    publishQuickPlayOverlayState({ hint: "Chasing the fish… click at any time to release." });
    if (!await quickPlayDelay(runtime, 90) || runtime.dangleReleased) return;
    let pursuitRetargeted = false;
    const moved = await animateQuickPlayBounds(
      runtime,
      target,
      authored.authoredPlan.durationMs,
      false,
      "straight",
      "walk",
      authored.wallClockPlan,
      authored.startedAt,
      () => {
        if (runtime.dangleReleased) return true;
        pursuitRetargeted = dangleTargetCrossedTravelDirection(runtime, target);
        return pursuitRetargeted;
      },
    );
    if (runtime.dangleReleased) return;
    if (!moved && pursuitRetargeted) continue;
    if (!moved) return;
    updateQuickPlayPhase("play", point);
  }
}

function startDanglePounceAndPursuit(runtime: QuickPlayRuntime) {
  if (runtime.dangleSequenceStarted || runtime.dangleReleased || quickPlayRuntime !== runtime) return;
  runtime.dangleSequenceStarted = true;
  const promise = runDanglePounceAndPursuit(runtime)
    .catch((error) => {
      if (!runtime.dangleReleased && quickPlayRuntime === runtime) void failQuickPlayRuntime(runtime, error);
    })
    .finally(() => {
      if (runtime.dangleMotionPromise === promise) runtime.dangleMotionPromise = null;
    });
  runtime.dangleMotionPromise = promise;
}

function createQuickPlayOverlay(runtime: QuickPlayRuntime, mode: Exclude<QuickPlaySession["pointerMode"], "none">) {
  closeQuickPlayOverlay();
  const point = currentCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(point).workArea;
  const createdWindow = new BrowserWindow({
    ...workArea,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  quickPlayOverlayWindow = createdWindow;
  trackWindowHealth(createdWindow);
  createdWindow.setAlwaysOnTop(true, "screen-saver");
  const params: Record<string, string> = { mode };
  if (mode === "snack") {
    const config = actionConfig("token_snack");
    params.snackStyle = config.snackStyle;
    params.snackSize = String(config.snackSize);
  } else if (mode === "dangle") {
    const config = actionConfig("drag_dangle");
    params.fishToyStyle = config.fishToyStyle;
    params.swingResponse = String(config.swingResponse);
    params.toyTrailEffect = String(config.toyTrailEffect);
  } else {
    params.yarnColor = actionConfig("toss_yarn").yarnColor;
  }
  void loadWindow(createdWindow, "quick-play-overlay", params).then(() => {
    if (quickPlayOverlayWindow === createdWindow && isUsableWindow(createdWindow)) {
      createdWindow.show();
      createdWindow.focus();
    }
  });
  createdWindow.on("closed", () => {
    if (quickPlayOverlayWindow === createdWindow) quickPlayOverlayWindow = null;
    if (quickPlayRuntime === runtime && !runtime.overlayClosing && !runtime.failing) {
      void failQuickPlayRuntime(runtime, new Error("Quick Play overlay closed unexpectedly"));
    }
  });
  createdWindow.webContents.on("render-process-gone", () => {
    if (quickPlayRuntime === runtime && !runtime.overlayClosing && !runtime.failing) {
      void failQuickPlayRuntime(runtime, new Error("Quick Play overlay renderer stopped"));
    }
  });

  runtime.overlayTimer = setInterval(() => {
    if (quickPlayRuntime !== runtime || !isUsableWindow(createdWindow)) return;
    const cursor = currentCursorScreenPoint();
    const cursorDisplay = screen.getDisplayNearestPoint(cursor);
    if (JSON.stringify(createdWindow.getBounds()) !== JSON.stringify(cursorDisplay.workArea)) {
      createdWindow.setBounds(cursorDisplay.workArea, false);
    }
    publishQuickPlayOverlayState({ pointerScreenX: cursor.x, pointerScreenY: cursor.y });
    if (mode !== "dangle") return;
  }, 32);
  runtime.overlayTimer.unref();
}

function waitForQuickPlayOverlay(runtime: QuickPlayRuntime) {
  return new Promise<{ x: number; y: number; velocityX: number; velocityY: number } | null>((resolve) => {
    runtime.resolveOverlay = resolve;
  });
}

async function completeQuickPlayRuntime(runtime: QuickPlayRuntime) {
  if (quickPlayRuntime !== runtime) return;
  updateQuickPlayPhase("complete");
  await quickPlayDelay(runtime, 120);
  finishQuickPlaySession(runtime.action);
}

async function failQuickPlayRuntime(runtime: QuickPlayRuntime, reason: unknown) {
  if (quickPlayRuntime !== runtime || runtime.failing) return;
  runtime.failing = true;
  quickPlaySession = { ...quickPlaySession, phase: "failed", phaseStartedAt: Date.now(), failure: reason instanceof Error ? reason.message : String(reason) };
  quickPlayTrace.push({ at: Date.now(), action: runtime.action, phase: "failed", bounds: isUsableWindow(petWindow) ? petWindow.getBounds() : null, targetPoint: quickPlaySession.targetPoint, actorDirection: quickPlaySession.actorDirection });
  publishQuickPlaySession();
  if (isUsableWindow(petWindow)) {
    petWindow.setBounds(runtime.startBounds, false);
    positionAccessoryWindows();
  }
  await quickPlayDelay(runtime, 180);
  finishQuickPlaySession(runtime.action);
}

function actionConfig<A extends Exclude<QuickPlayActionId, "capture_moment">>(action: A) {
  return normalizeQuickPlayActionConfig(action, settings.petStory.actionSettings.byAction[action]);
}

async function runQuickPlayRuntime(runtime: QuickPlayRuntime) {
  const action = runtime.action;
  if (!isUsableWindow(petWindow)) throw new Error("Pet window is unavailable");

  if (action === "walk_round_trip") {
    const config = actionConfig(action);
    const workArea = screen.getDisplayMatching(runtime.startBounds).workArea;
    const target = sampleSafeRandomTarget(runtime.startBounds, workArea, {
      roamDistance: config.roamDistance,
      minimumVerticalDistance: config.roamDistance === "near" ? 72 : config.roamDistance === "far" ? 180 : 120,
    });
    runtime.targetBounds = target;
    quickPlaySession = { ...quickPlaySession, targetPoint: { x: target.x + target.width / 2, y: target.y + target.height / 2 } };
    setPetActorDirection(runtime.startBounds, target);
    await executePet({
      phase: updateQuickPlayPhase,
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      locomote: (phase) => {
        const from = phase === "outbound" ? runtime.startBounds : target;
        const to = phase === "outbound" ? target : runtime.startBounds;
        const direction = setPetActorDirection(from, to);
        return runAuthoredLocomotionLeg(
          runtime,
          phase,
          from,
          to,
          config.walkPace,
          petWalkLocomotionAction(direction),
          phase === "outbound" ? "Pet walk was interrupted" : "Pet return was interrupted",
        );
      },
      complete: () => completeQuickPlayRuntime(runtime),
    }, config.destinationPause);
    return;
  }

  if (action === "token_snack") {
    createQuickPlayOverlay(runtime, "snack");
    updateQuickPlayPhase("awaiting-placement");
    const point = await waitForQuickPlayOverlay(runtime);
    runtime.resolveOverlay = null;
    if (!point) throw new Error("snack placement canceled");
    const workArea = screen.getDisplayNearestPoint(point).workArea;
    const interactionPoint = { x: point.x, y: point.y };
    publishQuickPlayOverlayState({
      enabled: false,
      phase: "finishing",
      hint: "Snack placed — here comes your cat…",
      targetScreenX: interactionPoint.x,
      targetScreenY: interactionPoint.y,
      snackStage: "ground",
    });
    const target = feedSnackTargetBounds(runtime.startBounds, interactionPoint, workArea).bounds;
    runtime.targetBounds = target;
    quickPlaySession = { ...quickPlaySession, targetPoint: interactionPoint };
    const outboundDirection = setFeedSnackActorDirection(runtime.startBounds, target);
    const feedConfig = actionConfig("token_snack");
    await executeFeedSnack({
      phase: (phase) => updateQuickPlayPhase(phase, interactionPoint),
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      locomote: (phase, _locomotionId, pacePercent) => {
        const from = phase === "outbound"
          ? runtime.startBounds
          : isUsableWindow(petWindow) ? petWindow.getBounds() : target;
        const to = phase === "outbound" ? target : runtime.startBounds;
        const direction = phase === "outbound" ? outboundDirection : setFeedSnackActorDirection(from, to);
        return runAuthoredLocomotionLeg(
          runtime,
          phase,
          from,
          to,
          pacePercent,
          feedSnackLocomotionAction(phase, direction),
          phase === "outbound" ? "Snack approach was interrupted" : "Snack return was interrupted",
          interactionPoint,
        );
      },
      setPropStage: (snackStage, durationMs) => publishQuickPlayOverlayState({
        snackStage,
        durationMs: durationMs / quickPlayTimeScale,
        hint: snackStage === "bite"
          ? "One lick — got it!"
          : snackStage === "chew"
            ? "Chewing…"
            : snackStage === "swallow"
              ? "Gulp!"
              : "All gone!",
      }),
      closePropOverlay: closeQuickPlayOverlay,
      complete: () => completeQuickPlayRuntime(runtime),
    }, {
      walkPace: feedConfig.walkPace,
      returnPacePercent: feedSnackReturnPacePercent(feedConfig.returnPace),
    });
    return;
  }

  if (action === "toss_yarn") {
    createQuickPlayOverlay(runtime, "yarn");
    updateQuickPlayPhase("awaiting-placement");
    const point = await waitForQuickPlayOverlay(runtime);
    runtime.resolveOverlay = null;
    if (!point) throw new Error("yarn placement canceled");
    const workArea = screen.getDisplayNearestPoint(point).workArea;
    const yarnConfig = actionConfig("toss_yarn");
    quickPlaySession = { ...quickPlaySession, actorVariant: yarnConfig.yarnColor };
    publishQuickPlaySession();
    const roll = createYarnRollPlan(point, { x: point.velocityX, y: point.velocityY }, workArea, yarnConfig);
    const interactionPoint = roll.target;
    updateQuickPlayPhase("rolling", interactionPoint);
    publishQuickPlayOverlayState({
      enabled: false,
      phase: "rolling",
      hint: "The yarn is rolling…",
      targetScreenX: roll.target.x,
      targetScreenY: roll.target.y,
      durationMs: roll.durationMs / quickPlayTimeScale,
    });
    if (!await quickPlayDelay(runtime, roll.durationMs)) return;
    publishQuickPlayOverlayState({ enabled: false, phase: "finishing", hint: "Your cat is retrieving the yarn…" });
    const target = clampBoundsToWorkArea({ ...runtime.startBounds, x: Math.round(interactionPoint.x - runtime.startBounds.width / 2), y: Math.round(interactionPoint.y - runtime.startBounds.height * .68) }, workArea);
    runtime.targetBounds = target;
    quickPlaySession = { ...quickPlaySession, targetPoint: interactionPoint };
    const chaseDirection = setTossYarnActorDirection(runtime.startBounds, target);
    const carryPace = yarnConfig.returnPace === "run" ? 140 : 118;
    await executeTossYarn({
      phase: (phase) => updateQuickPlayPhase(phase, interactionPoint),
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      approach: () => runAuthoredLocomotionLeg(
        runtime,
        "outbound",
        runtime.startBounds,
        target,
        132,
        tossYarnChaseAction(chaseDirection),
        "Toss Yarn chase was interrupted",
        interactionPoint,
      ),
      carryHome: () => {
        const current = isUsableWindow(petWindow) ? petWindow.getBounds() : target;
        const carryDirection = setTossYarnActorDirection(current, runtime.startBounds);
        return runAuthoredLocomotionLeg(
          runtime,
          "carry",
          current,
          runtime.startBounds,
          carryPace,
          tossYarnCarryAction(carryDirection),
          "Toss Yarn mouth-carry return was interrupted",
          interactionPoint,
        );
      },
      closePropOverlay: closeQuickPlayOverlay,
      complete: () => completeQuickPlayRuntime(runtime),
    });
    return;
  }

  if (action === "drag_dangle") {
    createQuickPlayOverlay(runtime, "dangle");
    await executeDangleToy({
      phase: updateQuickPlayPhase,
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      waitForRelease: async () => {
        const point = await waitForQuickPlayOverlay(runtime);
        runtime.resolveOverlay = null;
        return point;
      },
      closePropOverlay: closeQuickPlayOverlay,
      stopPursuit: async () => {
        runtime.dangleReleased = true;
        await runtime.dangleMotionPromise;
      },
      returnHome: async () => {
        if (!isUsableWindow(petWindow)) return false;
        const current = petWindow.getBounds();
        if (JSON.stringify(current) !== JSON.stringify(runtime.startBounds)) {
          const direction = setDangleActorDirection(current, runtime.startBounds);
          const moved = await runAuthoredLocomotionLeg(
            runtime,
            "return",
            current,
            runtime.startBounds,
            100,
            dangleReturnAction(direction),
            "Dangle return was interrupted",
            runtime.dangleTargetPoint,
          );
          if (!moved) return false;
        }
        petWindow.setBounds(runtime.startBounds, false);
        positionAccessoryWindows();
        return true;
      },
      complete: () => completeQuickPlayRuntime(runtime),
    });
    return;
  }

  if (action === "play_cursor") {
    const acceptedAt = quickPlaySession.startedAt ?? Date.now();
    const remainingMs = Math.max(0, PLAY_CURSOR_DURATION_MS - (Date.now() - acceptedAt));
    await executePlayCursor({
      phase: (phase) => updateQuickPlayPhase(phase, phase === "tracking" ? currentCursorScreenPoint() : undefined),
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      // Cursor restore is already the final 350ms of its strict ten-second
      // deadline, so do not append the generic 120ms completion tail.
      complete: async () => finishQuickPlaySession(runtime.action),
    }, remainingMs);
    return;
  }

  if (action === "nap_here") {
    const config = actionConfig("nap_here");
    const timeline = createQuickPlayActionTimeline("nap_here", config);
    await executeNapHere({
      phase: updateQuickPlayPhase,
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      markResting: (durationMs) => beginTimedNap(
        quickPlaySession.startDirectorState ?? reportedPetDirectorState.action,
        durationMs,
      ),
      complete: () => completeQuickPlayRuntime(runtime),
    }, timeline.durationMs);
    return;
  }

  if (action === "wake_up") {
    const config = actionConfig("wake_up");
    const timeline = createQuickPlayActionTimeline("wake_up", config);
    const [blink, roll, stretch, gather] = timeline.phases;
    await executeWakeUp({
      phase: updateQuickPlayPhase,
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      markAwake: () => { reportedPetDirectorState = { ...reportedPetDirectorState, resting: false }; },
      complete: () => completeQuickPlayRuntime(runtime),
    }, {
      blinkMs: blink.durationMs,
      rollMs: roll.durationMs,
      stretchMs: stretch.durationMs,
      gatherMs: gather.durationMs,
    });
    return;
  }

  if (action === "dance") {
    const config = actionConfig("dance");
    const timeline = createQuickPlayActionTimeline("dance", config);
    await executeDance({
      phase: updateQuickPlayPhase,
      delay: (durationMs) => quickPlayDelay(runtime, durationMs),
      assertFixedBounds: () => {
        if (!isUsableWindow(petWindow)) throw new Error("Dance pet window is unavailable");
        if (JSON.stringify(petWindow.getBounds()) !== JSON.stringify(runtime.startBounds)) {
          throw new Error("Dance must preserve byte-exact pet-window bounds");
        }
      },
      // The renderer owns the optional preloaded cue so it can obey the same
      // Mute pet sounds and sound-safety rules as every other actor action.
      sound: () => undefined,
      complete: async () => {
        if (!isUsableWindow(petWindow)) throw new Error("Dance pet window is unavailable at restore");
        petWindow.setBounds(runtime.startBounds, false);
        positionAccessoryWindows();
        await completeQuickPlayRuntime(runtime);
      },
    }, timeline.phases.map((phase) => ({ id: phase.id as DancePhase, durationMs: phase.durationMs })), config.danceSound);
    return;
  }
}

function beginQuickPlaySession(action: Exclude<QuickPlayActionId, "capture_moment">) {
  const pointerMode: QuickPlaySession["pointerMode"] = action === "token_snack"
    ? "snack"
    : action === "drag_dangle"
      ? "dangle"
      : action === "toss_yarn"
        ? "yarn"
        : "none";
  const startBounds = isUsableWindow(petWindow) ? petWindow.getBounds() : { x: 0, y: 0, ...PET_WINDOW_SIZE };
  const runtime: QuickPlayRuntime = {
    id: nextQuickPlayRuntimeId++, action, startBounds: { ...startBounds }, targetBounds: null,
    timers: new Set(), cancelers: new Set(), overlayTimer: null, resolveOverlay: null,
    dangleState: createDangleMovementState(), dangleTargetPoint: null, dangleSequenceStarted: false,
    dangleReleased: false, dangleMotionPromise: null, dangleLastPublishAt: 0,
    overlayClosing: false, failing: false,
  };
  quickPlayRuntime = runtime;
  if (action === "play_cursor") quickPlayCursorTrackingState = createCursorTrackingState();
  const targetPoint = null;
  quickPlaySession = {
    activeAction: action,
    startedAt: Date.now(),
    phase: pointerMode === "none" ? "stand" : "awaiting-placement",
    phaseStartedAt: Date.now(),
    startBounds: runtime.startBounds,
    startDirectorState: reportedPetDirectorState.action,
    targetPoint,
    walkMotion: null,
    actorDirection: null,
    actorVariant: action === "toss_yarn" ? actionConfig("toss_yarn").yarnColor : null,
    pointerMode,
    resting: reportedPetDirectorState.resting,
    restingUntil: timedNapState?.expiresAt ?? null,
    failure: null,
  };
  publishQuickPlaySession();
  quickPlayTrace.push({ at: Date.now(), action, phase: quickPlaySession.phase, bounds: runtime.startBounds, targetPoint, actorDirection: quickPlaySession.actorDirection });
  // QA may accelerate authored animation time, but must never compress the
  // human placement window so far that the overlay expires before it loads.
  const watchdogMs = Math.max(15_000, (action === "play_cursor" ? 13_000 : 65_000) / quickPlayTimeScale);
  quickPlaySessionTimer = setTimeout(() => void failQuickPlayRuntime(runtime, new Error("Quick Play watchdog timed out")), watchdogMs);
  quickPlaySessionTimer.unref();
  void runQuickPlayRuntime(runtime).catch((error) => void failQuickPlayRuntime(runtime, error));
}

function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const previousMoodSignalWindow = settings.petStory.moodSignalWindow;
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
  if (key === "petStory" && settings.petStory.moodSignalWindow !== previousMoodSignalWindow) {
    void loadAndPublishUsage();
  }
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
    showPetOnCurrentWorkspace(petWindow);
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
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow = createdWindow;
  trackWindowHealth(createdWindow);

  applyAlwaysOnTop();
  createdWindow.webContents.on("context-menu", () => {
    showPetContextMenu();
  });
  verifyBridge(createdWindow, "pet");
  createdWindow.webContents.on("did-finish-load", () => {
    flushPendingDirectorEvents();
    if (petWindow === createdWindow && settings.petVisible) {
      showPetOnCurrentWorkspace(createdWindow);
      void capturePetVisibleBounds(createdWindow);
    }
  });
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
      finishQuickPlaySession(undefined, false);
      petWindow = null;
      petVisibleCaptureBounds = null;
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
    hasShadow: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    focusable: true,
    skipTaskbar: true,
    show: false,
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
  void loadWindow(createdWindow, "popover").then(async () => {
    const targetPet = petWindow;
    if (isUsableWindow(targetPet)) {
      const relativeBounds = await capturePetVisibleBounds(targetPet);
      if (isUsableWindow(createdWindow) && popoverWindow === createdWindow) {
        const petBounds = targetPet.getBounds();
        const visiblePetBounds = relativeBounds
          ? { ...relativeBounds, x: petBounds.x + relativeBounds.x, y: petBounds.y + relativeBounds.y }
          : currentPetVisibleBounds(petBounds);
        const position = popoverPositionForPet(petBounds, createdWindow.getBounds(), visiblePetBounds);
        createdWindow.setPosition(position.x, position.y, false);
      }
    }
    if (isUsableWindow(createdWindow) && popoverWindow === createdWindow) {
      createdWindow.show();
      createdWindow.focus();
    }
  });

  createdWindow.on("blur", () => {
    if (popoverWindow === createdWindow) closeUsableWindow(createdWindow);
  });

  createdWindow.on("closed", () => {
    if (popoverWindow === createdWindow) popoverWindow = null;
  });

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
  showPetOnCurrentWorkspace(petWindow);
  writeStoredPetPosition(nextBounds);
  positionAccessoryWindows();
  return { moved: true };
}

async function capturePetMomentNow() {
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
  if (isMainProcessQa) mainProcessQaCaptureCount += 1;
  return { saved: true, filePath: result.filePath };
}

function capturePetMoment() {
  const task = captureQueue.then(() => capturePetMomentNow(), () => capturePetMomentNow());
  captureQueue = task.then(() => undefined, () => undefined);
  return task;
}

function startCursorTracking() {
  if (cursorTrackingTimer) return;
  cursorTrackingTimer = setInterval(() => {
    const quickPlayCursor = quickPlaySession.activeAction === "play_cursor" && quickPlaySession.phase === "tracking";
    if (!isUsableWindow(petWindow) || (!settings.petStory.followCursor && !quickPlayCursor) || dragState) return;
    const cursor = currentCursorScreenPoint();
    const bounds = petWindow.getBounds();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    if (quickPlayCursor) {
      const config = actionConfig("play_cursor");
      const tracking = updateCursorTracking(
        quickPlayCursorTrackingState,
        cursor,
        { x: centerX, y: centerY },
        Date.now(),
        config,
      );
      quickPlayCursorTrackingState = tracking;
      petWindow.webContents.send("pet:cursor-position", {
        x: tracking.headOffset.x,
        y: tracking.headOffset.y,
        quickPlay: true,
        tracking: {
          eyeOffset: tracking.eyeOffset,
          headOffset: tracking.headOffset,
          earOffset: tracking.earOffset,
          headAngleDegrees: tracking.headAngleDegrees,
          withinAttention: tracking.withinAttention,
          earFollow: config.earFollow,
        },
      });
      return;
    }
    petWindow.webContents.send("pet:cursor-position", {
      x: clampValue((cursor.x - centerX) / Math.max(bounds.width * 1.5, 1), -1, 1),
      y: clampValue((cursor.y - centerY) / Math.max(bounds.height * 1.5, 1), -1, 1),
      quickPlay: quickPlayCursor,
    });
  }, 120);
  cursorTrackingTimer.unref();
}

const launchReplacementRequested = process.argv.includes("--tokenpet-replace-running");
const hasSingleInstanceLock = isMainProcessQa || app.requestSingleInstanceLock({
  replaceForLaunch: launchReplacementRequested,
});
if (!hasSingleInstanceLock) {
  if (launchReplacementRequested) app.exit(75);
  else app.quit();
} else if (!isMainProcessQa) {
  app.on("second-instance", (_event, _argv, _workingDirectory, additionalData) => {
    if ((additionalData as { replaceForLaunch?: boolean })?.replaceForLaunch === true) {
      quitTokenPet();
      return;
    }
    if (app.isReady()) {
      ensureTray();
      revealPetForLaunch();
    }
  });
}

export const tokenPetReady = hasSingleInstanceLock ? app.whenReady().then(() => {
  hydrateSettings();
  writeStoredSettings();
  if (process.platform === "darwin") {
    app.dock?.hide();
  }

  if (!isMainProcessQa) {
    createTray();
    startTrayHealthMonitoring();
  }
  startCursorTracking();
  if (settings.petVisible) {
    createPetWindow();
  }
  if (!isMainProcessQa) void loadAndPublishUsage({ force: true });

  app.on("activate", () => {
    ensureTray();
    if (!settings.petVisible) return;
    if (!isUsableWindow(petWindow)) createPetWindow();
    else showPetOnCurrentWorkspace(petWindow);
  });
}) : Promise.resolve();

export const mainProcessQa = {
  enabled: isMainProcessQa,
  getWindow(kind: "pet" | "popover" | "menubar" | "console" | "quickplayOverlay") {
    return { pet: petWindow, popover: popoverWindow, menubar: menuBarWindow, console: consoleWindow, quickplayOverlay: quickPlayOverlayWindow }[kind];
  },
  getSettings() {
    return currentSettings();
  },
  getWorkspaceRehomeCount() {
    return workspaceRehomeCount;
  },
  getTrayIconInfo() {
    const image = createTrayIcon();
    return {
      empty: image.isEmpty(),
      size: image.getSize(),
      template: image.isTemplateImage(),
      titleMode: "dynamic-token-count",
      healthIntervalMs: TRAY_HEALTH_INTERVAL_MS,
      recoversAfterSystemChange: true,
    };
  },
  getQuickPlaySession() {
    return currentQuickPlaySession();
  },
  getTimedNapInfo() {
    return timedNapState
      ? {
          active: true,
          restoreAction: timedNapState.restoreAction,
          durationMs: timedNapState.durationMs,
          expiresAt: timedNapState.expiresAt,
          remainingMs: Math.max(0, timedNapState.expiresAt - Date.now()),
        }
      : { active: false, restoreAction: null, durationMs: NAP_HERE_DURATION_MS, expiresAt: null, remainingMs: 0 };
  },
  getReportedPetDirectorState() {
    return { ...reportedPetDirectorState };
  },
  getCaptureCount() {
    return mainProcessQaCaptureCount;
  },
  setQuickPlayTimeScale(scale: number) {
    if (!isMainProcessQa) throw new Error("Quick Play time scaling is unavailable outside main-process QA");
    quickPlayTimeScale = clampValue(Number(scale), 1, 100);
  },
  resetQuickPlayTrace() {
    if (!isMainProcessQa) throw new Error("Quick Play trace reset is unavailable outside main-process QA");
    quickPlayTrace.length = 0;
  },
  getQuickPlayTrace() {
    return quickPlayTrace.map((entry) => ({
      ...entry,
      bounds: entry.bounds ? { ...entry.bounds } : null,
      targetPoint: entry.targetPoint ? { ...entry.targetPoint } : null,
    }));
  },
  submitQuickPlayOverlayInput(point: { x: number; y: number } | null) {
    if (!isMainProcessQa) throw new Error("Quick Play overlay injection is unavailable outside main-process QA");
    const runtime = quickPlayRuntime;
    const resolver = runtime?.resolveOverlay;
    if (!runtime || !resolver) return false;
    runtime.resolveOverlay = null;
    if (runtime.action === "drag_dangle") {
      runtime.dangleReleased = true;
      closeQuickPlayOverlay();
    }
    if (point) releasePlacementPointer(runtime, point);
    resolver(point ? { ...point, velocityX: 0, velocityY: 0 } : null);
    return true;
  },
  getPetPopoverAnchorBounds() {
    if (!isUsableWindow(petWindow)) return null;
    return currentPetVisibleBounds(petWindow.getBounds());
  },
  finishQuickPlaySession() {
    finishQuickPlaySession();
  },
  simulateSecondInstanceLaunch() {
    revealPetForLaunch();
  },
  isWindowUsable: isUsableWindow,
  setCursorPoint(point: { x: number; y: number } | null) {
    if (!isMainProcessQa) throw new Error("QA cursor override is unavailable outside main-process QA");
    mainProcessQaCursor = point;
  },
  openConsole(tab: ConsoleTab = "overview") {
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

ipcMain.handle("usage:get-snapshot", (event) => {
  assertTrustedIpcSender(event);
  return loadAndPublishUsage();
});

ipcMain.handle("usage:refresh-snapshot", (event) => {
  assertTrustedIpcSender(event);
  return loadAndPublishUsage({ force: true });
});

ipcMain.handle("app:get-settings", (event) => {
  assertTrustedIpcSender(event);
  return currentSettings();
});

ipcMain.handle("app:set-setting", (event, key: keyof AppSettings, value: AppSettings[keyof AppSettings]) => {
  assertTrustedIpcSender(event);
  return setSetting(key, value);
});

ipcMain.on("pet:toggle-popover", (event) => {
  if (!isTrustedIpcSender(event, "pet")) return;
  togglePopover();
});

ipcMain.on("pet:close", (event) => {
  if (!isTrustedIpcSender(event, "pet")) return;
  setSetting("petVisible", false);
});

ipcMain.on("popover:close", (event) => {
  if (!isTrustedIpcSender(event, "popover")) return;
  closeUsableWindow(popoverWindow);
});

ipcMain.on("app:open-console", (event, requestedTab: ConsoleTab = "overview") => {
  if (!isTrustedIpcSender(event, "menubar", "popover")) return;
  const tab: ConsoleTab = ["overview", "breakdown", "cost", "pet", "settings"].includes(requestedTab) ? requestedTab : "overview";
  openConsoleWindow(tab);
});

ipcMain.on("app:quit", (event) => {
  if (!isTrustedIpcSender(event, "menubar")) return;
  quitTokenPet();
});

const quickPlayActionIds = new Set<QuickPlayActionId>([
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "dance",
  "capture_moment",
]);
const consolePetActionIds = new Set<PetActionId>([
  "click_purr", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "dance", "summon_to_screen", "capture_moment",
]);

ipcMain.handle("quick-play:get-session", (event) => {
  assertTrustedIpcSender(event, "pet", "popover");
  return currentQuickPlaySession();
});

ipcMain.on("pet:director-state", (event, state: { action?: PetActionId; resting?: boolean }) => {
  if (!isTrustedIpcSender(event, "pet")) return;
  if (state && typeof state.action === "string" && typeof state.resting === "boolean") {
    // Automatic renderer events cannot shorten an explicit five-minute Nap.
    // The timer expiry or an accepted Quick Play action clears timedNapState
    // before reporting the awake state.
    if (timedNapState && state.resting === false) return;
    reportedPetDirectorState = { action: state.action, resting: state.resting };
    if (quickPlaySession.activeAction === null) {
      quickPlaySession = {
        ...quickPlaySession,
        resting: state.resting,
        restingUntil: timedNapState?.expiresAt ?? null,
        startDirectorState: timedNapState?.restoreAction ?? state.action,
      };
      publishQuickPlaySession();
    }
  }
});

ipcMain.on("quick-play:overlay-input", (event, input: { type?: string; screenX?: number; screenY?: number; velocityX?: number; velocityY?: number }) => {
  const runtime = quickPlayRuntime;
  if (!runtime || !isUsableWindow(quickPlayOverlayWindow) || event.sender !== quickPlayOverlayWindow.webContents) return;
  if (input.type === "reopen") {
    togglePopover();
    return;
  }
  if (input.type === "move" && runtime.action === "drag_dangle" && Number.isFinite(input.screenX) && Number.isFinite(input.screenY)) {
    const now = Date.now();
    const point = { x: Number(input.screenX), y: Number(input.screenY) };
    runtime.dangleTargetPoint = point;
    runtime.dangleState = accumulateDangleMovement(runtime.dangleState, point, now);
    if (now - runtime.dangleLastPublishAt >= 80) {
      runtime.dangleLastPublishAt = now;
      quickPlaySession = { ...quickPlaySession, targetPoint: { ...point } };
      publishQuickPlaySession();
    }
    if (runtime.dangleState.armed) startDanglePounceAndPursuit(runtime);
    return;
  }
  if (!runtime.resolveOverlay) return;
  if (input.type === "cancel") {
    const resolve = runtime.resolveOverlay;
    runtime.resolveOverlay = null;
    if (runtime.action === "drag_dangle") runtime.dangleReleased = true;
    closeQuickPlayOverlay();
    resolve(null);
    return;
  }
  if (input.type !== "click" || !Number.isFinite(input.screenX) || !Number.isFinite(input.screenY)) return;
  const resolve = runtime.resolveOverlay;
  runtime.resolveOverlay = null;
  const point = { x: Number(input.screenX), y: Number(input.screenY) };
  if (runtime.action === "drag_dangle") {
    runtime.dangleReleased = true;
    closeQuickPlayOverlay();
  }
  releasePlacementPointer(runtime, point);
  resolve({
    ...point,
    velocityX: Number.isFinite(input.velocityX) ? Number(input.velocityX) : 0,
    velocityY: Number.isFinite(input.velocityY) ? Number(input.velocityY) : 0,
  });
});

ipcMain.handle("pet:dispatch-action", (event, action: QuickPlayActionId | PetActionId) => {
  const senderView = assertTrustedIpcSender(event, "popover", "console");
  const fromQuickPlay = senderView === "popover";
  if (!fromQuickPlay && consolePetActionIds.has(action as PetActionId)) {
    emitPetDirectorEvent({ type: "actor.actionRequested", action: action as PetActionId });
    return { accepted: true };
  }
  if (!quickPlayActionIds.has(action as QuickPlayActionId)) {
    if (!consolePetActionIds.has(action as PetActionId)) return { accepted: false, reason: "invalid" as const };
    emitPetDirectorEvent({ type: "actor.actionRequested", action: action as PetActionId });
    return { accepted: true };
  }
  const quickAction = action as QuickPlayActionId;
  if (quickAction === "capture_moment") {
    if (interruptRestForQuickPlayAction()) publishQuickPlaySession();
    void capturePetMoment();
    return { accepted: true };
  }
  if (quickPlaySession.activeAction) return { accepted: false, reason: "active" as const };
  if (settings.petStory.lockPosition && quickPlayPositionActions.has(quickAction)) return { accepted: false, reason: "locked" as const };
  if (quickAction === "nap_here" && reportedPetDirectorState.resting) return { accepted: true, reason: "already-resting" as const };
  if (quickAction !== "nap_here") interruptRestForQuickPlayAction();
  beginQuickPlaySession(quickAction as Exclude<QuickPlayActionId, "capture_moment">);
  return { accepted: true };
});

ipcMain.handle("pet:summon", (event) => {
  assertTrustedIpcSender(event, "pet");
  return summonPetToCurrentScreen();
});

ipcMain.handle("pet:traverse", (event) => {
  assertTrustedIpcSender(event, "pet");
  return traversePetAcrossWorkArea();
});

ipcMain.handle("pet:capture-moment", (event) => {
  assertTrustedIpcSender(event, "pet");
  return capturePetMoment();
});

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

ipcMain.handle("pet:start-drag", (event) => {
  assertTrustedIpcSender(event, "pet");
  cancelPetTraversal();
  if (!isUsableWindow(petWindow) || settings.petStory.lockPosition || quickPlaySession.activeAction !== null) return { started: false };

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

ipcMain.handle("pet:end-drag", (event) => {
  assertTrustedIpcSender(event, "pet");
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
