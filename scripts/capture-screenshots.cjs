const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { settings: initialSettings, snapshot } = require("./pet-story-screenshot-fixture.cjs");

// Transparent offscreen BrowserWindows can retain stale GPU tiles between state
// captures. Software compositing makes the visual baselines deterministic.
app.disableHardwareAcceleration();

const root = join(__dirname, "..");
const rendererFile = join(root, "dist-renderer/index.html");
const outputDir = join(root, "docs", "screenshots", "pet-story");
const windows = [];
const settings = structuredClone(initialSettings);
const report = {
  generatedAt: new Date().toISOString(),
  fixture: "synthetic local demo data; no private user data",
  checks: [],
  screenshots: [],
  failure: null,
};
const qaState = {
  actions: [],
  captures: 0,
  summons: 0,
  openConsoleCalls: [],
  togglePopoverCalls: 0,
  closePopoverCalls: 0,
  closePetCalls: 0,
  setSettingCalls: [],
  dragStarts: 0,
  dragEnds: 0,
};
let expectedReduceMotion = initialSettings.petStory.reduceMotion;
let expectedActionSnackSize = 100;

const quickPlayIds = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "dance",
  "capture_moment",
];
const emptyQuickPlaySession = {
  activeAction: null,
  startedAt: null,
  phase: "idle",
  phaseStartedAt: null,
  startBounds: null,
  startDirectorState: null,
  targetPoint: null,
  pointerMode: "none",
  resting: false,
  restingUntil: null,
  failure: null,
};
let quickPlaySession = clone(emptyQuickPlaySession);
let suppressQuickPlayDirector = false;
const quickPlayPositionActions = new Set(["walk_round_trip", "token_snack", "drag_dangle", "toss_yarn"]);
const consolePetActionIds = new Set(["click_purr", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "summon_to_screen", "capture_moment"]);

const coreActorStateIds = [
  "idle_breathe",
  "blink",
  "sleep_loop",
  "focus_loop",
  "hot_loop",
  "overdrive_loop",
  "click_purr",
  "drag_dangle",
  "drop_bounce",
  "token_snack",
  "play_cursor",
  "milestone_celebrate",
];
const goldenActorManifest = require(join(root, "apps", "desktop", "public", "pet-actors", "golden-british", "actor.json"));
const coreActorFramePaths = Object.fromEntries(coreActorStateIds.map((actionId) => [
  actionId,
  goldenActorManifest.animations[`action.${actionId}`].frames.map((frame) => frame.src),
]));

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app.on("window-all-closed", () => {
  // The QA runner owns app shutdown after every assertion and capture completes.
});

function clone(value) {
  return structuredClone(value);
}

function record(name, detail) {
  report.checks.push({ name, detail });
}

function verify(name, condition, detail) {
  assert.ok(condition, `${name}: ${detail}`);
  record(name, detail);
}

function rendererUrl(view, params = {}) {
  const url = new URL(pathToFileURL(rendererFile));
  url.searchParams.set("view", view);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.href;
}

function broadcast(channel, value) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, clone(value));
  }
}

function resetFixtureSettings() {
  for (const key of Object.keys(settings)) delete settings[key];
  Object.assign(settings, clone(initialSettings));
  expectedReduceMotion = settings.petStory.reduceMotion;
  quickPlaySession = clone(emptyQuickPlaySession);
  broadcast("qa:settings-updated", settings);
  broadcast("qa:quick-play-session-changed", quickPlaySession);
}

function registerFixtureBridge() {
  ipcMain.handle("qa:get-usage", () => clone(snapshot));
  ipcMain.handle("qa:refresh-usage", () => clone(snapshot));
  ipcMain.handle("qa:get-settings", () => clone(settings));
  ipcMain.handle("qa:set-setting", (_event, key, value) => {
    settings[key] = clone(value);
    qaState.setSettingCalls.push({ key, value: clone(value) });
    broadcast("qa:settings-updated", settings);
    return clone(settings);
  });
  ipcMain.handle("qa:get-state", () => ({ qaState: clone(qaState), settings: clone(settings) }));
  ipcMain.handle("qa:get-quick-play-session", () => clone(quickPlaySession));
  ipcMain.handle("qa:set-quick-play-session", (_event, session) => {
    quickPlaySession = clone({ ...emptyQuickPlaySession, ...session });
    broadcast("qa:quick-play-session-changed", quickPlaySession);
    return clone(quickPlaySession);
  });
  ipcMain.handle("qa:set-quick-play-director-suppressed", (_event, suppressed) => {
    suppressQuickPlayDirector = Boolean(suppressed);
    return suppressQuickPlayDirector;
  });
  ipcMain.handle("qa:dispatch-action", (event, action) => {
    const fromQuickPlay = new URL(event.sender.getURL()).searchParams.get("view") === "popover";
    if (!fromQuickPlay && consolePetActionIds.has(action)) {
      qaState.actions.push(action);
      broadcast("qa:director-event", { type: "actor.actionRequested", action });
      return { accepted: true };
    }
    if (!quickPlayIds.includes(action)) {
      if (!consolePetActionIds.has(action)) return { accepted: false };
      qaState.actions.push(action);
      broadcast("qa:director-event", { type: "actor.actionRequested", action });
      return { accepted: true };
    }
    if (action !== "capture_moment" && quickPlaySession.activeAction) return { accepted: false, reason: "active" };
    if (settings.petStory.lockPosition && quickPlayPositionActions.has(action)) return { accepted: false, reason: "locked" };
    qaState.actions.push(action);
    if (action === "capture_moment") qaState.captures += 1;
    if (action !== "capture_moment") {
      quickPlaySession = {
        ...emptyQuickPlaySession,
        activeAction: action,
        startedAt: Date.now(),
        pointerMode: action === "token_snack" ? "snack" : action === "drag_dangle" ? "dangle" : action === "toss_yarn" ? "yarn" : "none",
      };
      broadcast("qa:quick-play-session-changed", quickPlaySession);
      if (!suppressQuickPlayDirector) broadcast("qa:director-event", { type: "quickPlay.action", action });
    }
    return { accepted: true };
  });
  ipcMain.handle("qa:summon", () => {
    qaState.summons += 1;
    return { moved: true };
  });
  ipcMain.handle("qa:capture-moment", () => {
    qaState.captures += 1;
    return { saved: true, filePath: "synthetic-pet-moment.png" };
  });
  ipcMain.handle("qa:start-drag", () => {
    qaState.dragStarts += 1;
    return { started: !settings.petStory?.lockPosition };
  });
  ipcMain.handle("qa:end-drag", () => {
    qaState.dragEnds += 1;
    return { moved: true };
  });
  ipcMain.on("qa:open-console", (_event, tab) => qaState.openConsoleCalls.push(tab));
  ipcMain.on("qa:toggle-popover", () => {
    qaState.togglePopoverCalls += 1;
  });
  ipcMain.on("qa:close-popover", () => {
    qaState.closePopoverCalls += 1;
  });
  ipcMain.on("qa:close-pet", () => {
    qaState.closePetCalls += 1;
  });
  ipcMain.on("qa:quit", () => undefined);
}

function createWindow({ width, height, transparent = false }) {
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent,
    backgroundColor: transparent ? "#00000000" : "#f5f7fa",
    webPreferences: {
      preload: join(__dirname, "screenshot-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windows.push(window);
  return window;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function evaluate(window, callback, ...args) {
  const source = `(${callback.toString()})(...${JSON.stringify(args)})`;
  return window.webContents.executeJavaScript(source, true);
}

async function waitFor(window, callback, args, label, timeoutMs = 12_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(window, callback, ...(args ?? []))) return;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForSelector(window, selector, timeoutMs) {
  await waitFor(window, (value) => Boolean(document.querySelector(value)), [selector], selector, timeoutMs);
}

async function waitForActor(window) {
  await waitForSelector(window, ".pet-generated-actor-canvas-root.is-ready", 20_000);
  await waitFor(
    window,
    () => {
      const canvas = document.querySelector(".pet-generated-actor-canvas");
      if (!canvas) return false;
      const context = canvas.getContext("2d");
      if (!context) return false;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 3; index < data.length; index += 2048) {
        if (data[index] > 0) return true;
      }
      return false;
    },
    [],
    "non-empty generated actor pixels",
    20_000,
  );
}

async function classifyDesktopActorFrame(window) {
  return evaluate(window, async (actionFrames) => {
    const canvas = document.querySelector(".pet-stage .pet-generated-actor-canvas");
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return null;

    window.__tokenpetQaActorFrames ??= new Map();
    const frameCache = window.__tokenpetQaActorFrames;
    const loadFrame = async (framePath) => {
      if (!frameCache.has(framePath)) {
        frameCache.set(framePath, new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            const reference = document.createElement("canvas");
            reference.width = canvas.width;
            reference.height = canvas.height;
            const referenceContext = reference.getContext("2d", { willReadFrequently: true });
            referenceContext.drawImage(image, 0, 0, reference.width, reference.height);
            resolve(referenceContext.getImageData(0, 0, reference.width, reference.height).data);
          };
          image.onerror = reject;
          image.src = new URL(`pet-actors/golden-british/${framePath}`, window.location.href).href;
        }));
      }
      return frameCache.get(framePath);
    };

    const current = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const scores = [];
    for (const [actionId, framePaths] of Object.entries(actionFrames)) {
      let actionScore = Number.POSITIVE_INFINITY;
      for (const framePath of framePaths) {
        const expected = await loadFrame(framePath);
        let difference = 0;
        let compared = 0;
        for (let y = 176; y < 930; y += 8) {
          for (let x = 48; x < 976; x += 8) {
            if (x >= 320 && x <= 704 && y >= 680 && y <= 830) continue;
            const offset = (y * canvas.width + x) * 4;
            const occupied = current[offset + 3] > 12 || expected[offset + 3] > 12;
            if (!occupied) continue;
            difference += Math.abs(current[offset] - expected[offset]);
            difference += Math.abs(current[offset + 1] - expected[offset + 1]);
            difference += Math.abs(current[offset + 2] - expected[offset + 2]);
            difference += Math.abs(current[offset + 3] - expected[offset + 3]) * 1.5;
            compared += 4.5;
          }
        }
        actionScore = Math.min(actionScore, compared ? difference / compared : Number.POSITIVE_INFINITY);
      }
      scores.push({ actionId, score: actionScore });
    }
    scores.sort((left, right) => left.score - right.score);
    return { best: scores[0], runnerUp: scores[1] };
  }, coreActorFramePaths);
}

async function waitForDesktopActorState(window, actionId) {
  let latest = null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 3_000) {
    latest = await classifyDesktopActorFrame(window);
    if (latest?.best?.actionId === actionId) return latest;
    await delay(50);
  }
  throw new Error(`Timed out waiting for desktop actor frame ${actionId}; latest classification ${JSON.stringify(latest)}`);
}

async function load(window, view, params = {}) {
  await window.loadURL(rendererUrl(view, params));
  await waitForSelector(window, "#root > *");
  await evaluate(window, async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    })));
  });
  await delay(160);
}

async function click(window, selector, label = selector) {
  const clicked = await evaluate(window, (value) => {
    const element = document.querySelector(value);
    if (!element || element.disabled) return false;
    element.click();
    return true;
  }, selector);
  verify(`click ${label}`, clicked, "control exists, is enabled, and accepted a click");
}

async function clickButtonWithText(window, text, scope = "document") {
  const clicked = await evaluate(window, (label, selector) => {
    const root = selector === "document" ? document : document.querySelector(selector);
    const button = [...root.querySelectorAll("button")].find((candidate) => candidate.textContent.replace(/\s+/gu, " ").trim().includes(label));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, text, scope);
  verify(`click ${text}`, clicked, "matching button exists, is enabled, and accepted a click");
}

async function capture(window, fileName, surface) {
  const forceTransparentRepaint = surface.startsWith("Quick Play");
  if (forceTransparentRepaint) {
    window.showInactive();
    window.webContents.invalidate();
  }
  await delay(forceTransparentRepaint ? 240 : 180);
  const image = await window.webContents.capturePage();
  if (forceTransparentRepaint) window.hide();
  const filePath = join(outputDir, fileName);
  writeFileSync(filePath, image.toPNG());
  const dimensions = image.getSize();
  verify(`screenshot ${surface}`, dimensions.width > 0 && dimensions.height > 0, `${fileName} captured at ${dimensions.width}×${dimensions.height}`);
  report.screenshots.push({ surface, file: `docs/screenshots/pet-story/${fileName}`, ...dimensions });
}

async function qaStateFor(window) {
  return evaluate(window, () => window.tokenpet.getScreenshotQaState());
}

async function setFixturePetSize(window, size) {
  await evaluate(window, async (nextSize) => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petAppearance", {
      ...(current.petAppearance ?? {}),
      size: nextSize,
    });
  }, size);
  await waitFor(
    window,
    (nextSize) => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance?.size === nextSize),
    [size],
    `pet appearance size ${size}`,
  );
  await delay(240);
}

async function actorCssGeometry(window, scope) {
  return evaluate(window, (selector) => {
    const shell = document.querySelector(`${selector} .pet-generated-actor-shell`);
    const actor = document.querySelector(`${selector} .pet-generated-actor-canvas-root`);
    const container = document.querySelector(selector);
    if (!shell || !actor || !container) return null;
    const actorRect = actor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      scale: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--pet-visual-scale")),
      configuredSize: Number(shell.dataset.petSize),
      actor: {
        left: actorRect.left,
        top: actorRect.top,
        width: actorRect.width,
        height: actorRect.height,
      },
      container: {
        left: containerRect.left,
        top: containerRect.top,
        width: containerRect.width,
        height: containerRect.height,
      },
    };
  }, scope);
}

async function canvasAlphaGeometry(window, scope, containerScope = scope, alphaThreshold = 16) {
  return evaluate(window, (actorSelector, containerSelector, threshold) => {
    const canvas = document.querySelector(`${actorSelector} canvas.pet-actor-canvas`);
    const container = document.querySelector(containerSelector);
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !container || !context) return null;

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    let opaquePixels = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const alpha = pixels[(y * canvas.width + x) * 4 + 3];
        if (alpha < threshold) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        opaquePixels += 1;
      }
    }
    if (maxX < minX || maxY < minY) return null;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const actorRoot = canvas.closest(".pet-visual-cat-wrap");
    if (!actorRoot) return null;
    const actorMatrix = new DOMMatrix(getComputedStyle(actorRoot).transform);
    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;
    const visibleRect = {
      left: canvasRect.left + minX * scaleX,
      top: canvasRect.top + minY * scaleY,
      right: canvasRect.left + (maxX + 1) * scaleX,
      bottom: canvasRect.top + (maxY + 1) * scaleY,
      width: (maxX - minX + 1) * scaleX,
      height: (maxY - minY + 1) * scaleY,
    };
    const clippingRect = {
      left: containerRect.left,
      top: containerRect.top,
      right: containerRect.right,
      bottom: containerRect.bottom,
      width: containerRect.width,
      height: containerRect.height,
    };
    return {
      alphaThreshold: threshold,
      opaquePixels,
      pixelBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
      visibleRect,
      containerRect: clippingRect,
      overflow: {
        left: Math.max(0, clippingRect.left - visibleRect.left),
        top: Math.max(0, clippingRect.top - visibleRect.top),
        right: Math.max(0, visibleRect.right - clippingRect.right),
        bottom: Math.max(0, visibleRect.bottom - clippingRect.bottom),
      },
      shellClass: canvas.closest(".pet-appearance-visual")?.className ?? "",
      transformScale: {
        x: Math.hypot(actorMatrix.a, actorMatrix.b),
        y: Math.hypot(actorMatrix.c, actorMatrix.d),
      },
      containerOverflow: getComputedStyle(container).overflow,
    };
  }, scope, containerScope, alphaThreshold);
}

function rectContained(inner, outer, tolerance = 1) {
  return inner
    && outer
    && inner.left >= outer.left - tolerance
    && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance
    && inner.bottom <= outer.bottom + tolerance;
}

function sameRect(left, right, tolerance = 0.5) {
  return left && right
    && ["left", "top", "width", "height"].every((key) => Math.abs(left[key] - right[key]) <= tolerance);
}

async function verifyConsoleSidebarPetSize(consoleWindow, desktopPet) {
  await waitForSelector(consoleWindow, ".sidebar-pet-actor .pet-generated-actor-canvas-root.is-ready");
  const originalState = await qaStateFor(consoleWindow);
  const originalSize = originalState.settings.petAppearance?.size ?? originalState.settings.petScale ?? 1;

  await setFixturePetSize(consoleWindow, 0.75);
  await waitFor(desktopPet, () => Number(document.querySelector(".pet-generated-actor-shell")?.dataset.petSize) === 0.75, [], "desktop pet size 0.75");
  await delay(220);
  const sidebarSmall = await actorCssGeometry(consoleWindow, ".sidebar-pet-actor");
  const desktopSmall = await actorCssGeometry(desktopPet, ".pet-stage");
  await capture(desktopPet, "desktop-pet-size-75.png", "Desktop pet / Size 75%");
  await setFixturePetSize(consoleWindow, 1.25);
  await waitFor(desktopPet, () => Number(document.querySelector(".pet-generated-actor-shell")?.dataset.petSize) === 1.25, [], "desktop pet size 1.25");
  await delay(220);
  const sidebarLarge = await actorCssGeometry(consoleWindow, ".sidebar-pet-actor");
  const desktopLarge = await actorCssGeometry(desktopPet, ".pet-stage");
  await capture(desktopPet, "desktop-pet-size-125.png", "Desktop pet / Size 125%");
  report.sidebarSizeContract = {
    testedDesktopSizes: [0.75, 1.25],
    sidebarSmall,
    sidebarLarge,
    desktopControl: { small: desktopSmall, large: desktopLarge },
  };

  verify(
    "Console sidebar pet has a fixed preview size",
    sidebarSmall
      && sidebarLarge
      && sidebarSmall.scale === 1
      && sidebarLarge.scale === 1
      && sameRect(sidebarSmall.actor, sidebarLarge.actor)
      && sameRect(sidebarSmall.container, sidebarLarge.container)
      && desktopSmall
      && desktopLarge
      && desktopSmall.configuredSize === 0.75
      && desktopLarge.configuredSize === 1.25
      && desktopSmall.scale === 0.75
      && desktopLarge.scale === 1.25,
    `sidebar small/large ${JSON.stringify({ sidebarSmall, sidebarLarge })}; desktop control widths ${desktopSmall?.actor.width}/${desktopLarge?.actor.width}`,
  );

  const sidebarAlpha = await canvasAlphaGeometry(consoleWindow, ".sidebar-pet-actor", ".sidebar-pet-actor");
  report.sidebarSizeContract.visibleAlpha = sidebarAlpha;
  verify(
    "Console sidebar Golden alpha bounds are fully visible",
    sidebarAlpha
      && sidebarAlpha.opaquePixels > 0
      && rectContained(sidebarAlpha.visibleRect, sidebarAlpha.containerRect),
    `mapped visible alpha ${JSON.stringify(sidebarAlpha?.visibleRect)} inside sidebar ${JSON.stringify(sidebarAlpha?.containerRect)}; overflow ${JSON.stringify(sidebarAlpha?.overflow)}`,
  );

  await setFixturePetSize(consoleWindow, originalSize);
}

async function setFixturePetAppearance(window, patch) {
  await evaluate(window, async (nextPatch) => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petAppearance", {
      ...(current.petAppearance ?? {}),
      ...nextPatch,
      ...(nextPatch.moodBadge ? {
        moodBadge: { ...(current.petAppearance?.moodBadge ?? {}), ...nextPatch.moodBadge },
      } : {}),
    });
  }, patch);
  await waitFor(
    window,
    (expected) => window.tokenpet.getScreenshotQaState().then((state) => Object.entries(expected).every(([key, value]) => {
      if (key === "moodBadge") return Object.entries(value).every(([badgeKey, badgeValue]) => state.settings.petAppearance?.moodBadge?.[badgeKey] === badgeValue);
      return state.settings.petAppearance?.[key] === value;
    })),
    [patch],
    `pet appearance patch ${JSON.stringify(patch)}`,
  );
  await delay(280);
}

async function verifyDesktopCatVisualNormalization(desktopPet) {
  const originalState = await qaStateFor(desktopPet);
  const originalAppearance = originalState.settings.petAppearance ?? {};
  const originalSize = originalAppearance.size ?? originalState.settings.petScale ?? 1;
  const originalMoodBadge = originalAppearance.moodBadge ?? { showMood: true };

  await setFixturePetAppearance(desktopPet, {
    catTypeId: "golden-british",
    size: 1,
    moodBadge: { showMood: false },
  });
  await waitFor(desktopPet, () => Boolean(document.querySelector(".pet-stage .pet-generated-actor-canvas-root.is-ready")), [], "Golden desktop normalization actor");
  await waitFor(desktopPet, () => {
    const frame = document.querySelector(".pet-stage .pet-generated-actor-canvas")?.dataset.actorFrame;
    return typeof frame === "string" && frame.endsWith("-1");
  }, [], "Golden desktop normalization first authored frame");
  const golden = await canvasAlphaGeometry(desktopPet, ".pet-stage", ".pet-stage");

  await setFixturePetAppearance(desktopPet, {
    catTypeId: "ragdoll",
    size: 1,
    moodBadge: { showMood: false },
  });
  await waitFor(desktopPet, () => Boolean(document.querySelector(".pet-stage .pet-actor-canvas-shell.pet-cat-ragdoll .pet-actor-canvas-root.is-ready")), [], "Ragdoll desktop normalization actor");
  const ragdoll = await canvasAlphaGeometry(desktopPet, ".pet-stage", ".pet-stage");

  const widthDelta = golden && ragdoll ? Math.abs(golden.visibleRect.width - ragdoll.visibleRect.width) / Math.max(golden.visibleRect.width, ragdoll.visibleRect.width) : Number.POSITIVE_INFINITY;
  const heightDelta = golden && ragdoll ? Math.abs(golden.visibleRect.height - ragdoll.visibleRect.height) / Math.max(golden.visibleRect.height, ragdoll.visibleRect.height) : Number.POSITIVE_INFINITY;
  const goldenArea = golden ? golden.visibleRect.width * golden.visibleRect.height : 0;
  const ragdollArea = ragdoll ? ragdoll.visibleRect.width * ragdoll.visibleRect.height : 0;
  const goldenToRagdollAreaRatio = ragdollArea > 0 ? goldenArea / ragdollArea : 0;
  report.desktopCatNormalization = { configuredSize: 1, moodBadgeExcluded: true, golden, ragdoll, widthDelta, heightDelta, goldenToRagdollAreaRatio };
  verify(
    "Desktop Golden keeps native proportions and is not smaller than Ragdoll",
    golden
      && ragdoll
      && golden.opaquePixels > 0
      && ragdoll.opaquePixels > 0
      && Math.abs(golden.transformScale.x - golden.transformScale.y) <= 0.001
      && Math.abs(ragdoll.transformScale.x - ragdoll.transformScale.y) <= 0.001
      // Golden's authored Hot frame is wider/shorter than the static Ragdoll
      // silhouette. Preserve native aspect ratios and compare area; a 15%
      // height envelope avoids treating that intentional pose as resize drift.
      && heightDelta <= 0.15
      && goldenToRagdollAreaRatio >= 0.9
      && goldenToRagdollAreaRatio <= 1.2,
    `size=1 mapped alpha Golden ${JSON.stringify(golden?.visibleRect)} vs Ragdoll ${JSON.stringify(ragdoll?.visibleRect)}; height delta ${(heightDelta * 100).toFixed(1)}%, area ratio ${goldenToRagdollAreaRatio.toFixed(3)}, transforms ${JSON.stringify({ golden: golden?.transformScale, ragdoll: ragdoll?.transformScale })}`,
  );

  await setFixturePetAppearance(desktopPet, {
    ...originalAppearance,
    catTypeId: originalAppearance.catTypeId ?? "golden-british",
    size: originalSize,
    moodBadge: originalMoodBadge,
  });
  await waitFor(desktopPet, () => Boolean(document.querySelector(".pet-stage .pet-generated-actor-canvas-root.is-ready")), [], "Golden desktop actor restore");
}

function sharedStoryState(state) {
  return {
    moodThresholds: clone(state.settings.petStory.moodThresholds),
    journeyStage: state.settings.petStory.journey?.stage ?? null,
    memories: clone(state.settings.petStory.journey?.memories ?? []),
    milestoneIds: clone(state.settings.petStory.journey?.milestoneIds ?? []),
  };
}

async function verifyNoHorizontalOverflow(window, pageLabel) {
  const fit = await evaluate(window, () => {
    const shell = document.querySelector(".console-shell, .quick-play, .pet-stage");
    const page = document.querySelector("[data-pet-page]");
    const shellRect = shell?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      shellRight: shellRect?.right ?? 0,
      pageClientWidth: page?.clientWidth ?? 0,
      pageScrollWidth: page?.scrollWidth ?? 0,
    };
  });
  const noViewportOverflow = fit.documentWidth <= fit.innerWidth + 1 && fit.bodyWidth <= fit.innerWidth + 1 && fit.shellRight <= fit.innerWidth + 1;
  const noPageOverflow = fit.pageClientWidth === 0 || fit.pageScrollWidth <= fit.pageClientWidth + 1;
  verify(`${pageLabel} horizontal fit`, noViewportOverflow && noPageOverflow, `viewport ${fit.innerWidth}px; document ${fit.documentWidth}px; page ${fit.pageScrollWidth}/${fit.pageClientWidth}px`);
}

async function verifyDesktopPet() {
  // Keep the baseline focused screenshot deterministic even when QA runs
  // during the fixture's configured overnight quiet hours. Sleep is exercised
  // explicitly below with its own persistent token/name bubble assertions.
  settings.petStory.safety.quietHoursEnabled = false;
  const window = createWindow({ width: 260, height: 260, transparent: true });
  await load(window, "pet");
  await waitForActor(window);

  const actor = await evaluate(window, () => ({
    generatedCanvases: document.querySelectorAll(".pet-generated-actor-canvas").length,
    embedded: Boolean(document.querySelector(".pet-token-embedded")),
    fallbackCanvas: Boolean(document.querySelector(".pet-actor-canvas-shell:not(.pet-generated-actor-shell)")),
    moodBadge: Boolean(document.querySelector(".pet-generated-actor-canvas")),
  }));
  verify("desktop generated actor", actor.generatedCanvases === 1 && !actor.fallbackCanvas, "desktop surface has exactly one generated actor canvas and no separate fallback renderer");
  verify("desktop embedded token frame", actor.embedded, "Golden British uses the embedded token-frame render mode");
  await verifyNoHorizontalOverflow(window, "desktop pet");
  await capture(window, "desktop-pet.png", "Desktop pet");

  const closeBeforeHover = await evaluate(window, () => {
    const style = getComputedStyle(document.querySelector(".pet-close"));
    return { opacity: style.opacity, pointerEvents: style.pointerEvents };
  });
  verify("Desktop close is hidden at rest", closeBeforeHover.opacity === "0" && closeBeforeHover.pointerEvents === "none", `the close control is visually and interactively absent before hover: ${JSON.stringify(closeBeforeHover)}`);
  const hiddenBeforeHover = await evaluate(window, () => document.querySelector("[data-pet-name-bubble]")?.getAttribute("aria-hidden"));
  verify("Desktop name bubble is hover-only", hiddenBeforeHover === "true", "the desktop name does not permanently occupy screen space");
  await evaluate(window, () => document.querySelector(".pet-stage")?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await waitFor(window, () => document.querySelector("[data-pet-name-bubble]")?.classList.contains("is-visible"), [], "desktop name hover bubble");
  await waitFor(window, () => getComputedStyle(document.querySelector(".pet-close")).opacity === "1", [], "desktop hover close");
  await delay(380);
  const hoverBubble = await evaluate(window, () => {
    const bubble = document.querySelector(".pet-name-thought-circle")?.getBoundingClientRect();
    const closeStyle = getComputedStyle(document.querySelector(".pet-close"));
    return {
      name: document.querySelector(".pet-name-thought-circle strong")?.textContent,
      dots: document.querySelectorAll(".pet-name-thought-dot").length,
      width: bubble?.width ?? 0,
      height: bubble?.height ?? 0,
      opacity: getComputedStyle(document.querySelector(".pet-name-thought-circle")).opacity,
      closeOpacity: closeStyle.opacity,
      closePointerEvents: closeStyle.pointerEvents,
    };
  });
  verify("Desktop adaptive thought bubble", hoverBubble.name === "Mochi" && hoverBubble.dots === 2 && Math.abs(hoverBubble.width - hoverBubble.height) < 1 && Number(hoverBubble.opacity) > .99, `hover renders the persisted name in one circular cream bubble with exactly two staged dots: ${JSON.stringify(hoverBubble)}`);
  verify("Desktop close appears on hover", hoverBubble.closeOpacity === "1" && hoverBubble.closePointerEvents === "auto", `hover reveals the close control and makes it clickable: ${JSON.stringify(hoverBubble)}`);
  await capture(window, "desktop-pet-name-hover.png", "Desktop pet / Name hover");
  await evaluate(window, () => document.querySelector(".pet-stage")?.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
  await waitFor(window, () => getComputedStyle(document.querySelector(".pet-close")).opacity === "0", [], "desktop close hidden after hover");

  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({
    activeAction: "nap_here",
    startedAt: Date.now(),
    phase: "stand",
    phaseStartedAt: Date.now(),
    pointerMode: "none",
  }));
  await waitForSelector(window, '[data-actor-animation="action.sleep_loop"]');
  await waitFor(window, () => document.querySelector('[data-pet-name-bubble][data-bubble-content-mode="token"]')?.getAttribute("aria-hidden") === "false", [], "sleep token bubble");
  const sleepPresentation = await evaluate(window, () => ({
    animation: document.querySelector("[data-actor-animation]")?.dataset.actorAnimation,
    tokenFrameHidden: document.querySelector("[data-sleep-token-frame-hidden]")?.dataset.sleepTokenFrameHidden,
    tokenHotspots: document.querySelectorAll(".pet-actor-token-hotspot").length,
    bubbleMode: document.querySelector("[data-pet-name-bubble]")?.dataset.bubbleContentMode,
    bubbleContent: document.querySelector("[data-pet-name-bubble] strong")?.textContent,
    bubbleVisible: document.querySelector("[data-pet-name-bubble]")?.getAttribute("aria-hidden"),
    head: document.querySelector("[data-accessory-head]")?.dataset.accessoryHead,
    ground: document.querySelector("[data-accessory-ground]")?.dataset.accessoryGround,
    effect: document.querySelector("[data-accessory-effect]")?.dataset.accessoryEffect,
  }));
  verify(
    "Sleepy frame-free token bubble",
    sleepPresentation.animation === "action.sleep_loop"
      && sleepPresentation.tokenFrameHidden === "true"
      && sleepPresentation.tokenHotspots === 0
      && sleepPresentation.bubbleMode === "token"
      && /\d/u.test(sleepPresentation.bubbleContent ?? "")
      && sleepPresentation.bubbleVisible === "false"
      && sleepPresentation.head === "none"
      && sleepPresentation.ground === "none"
      && sleepPresentation.effect === "none",
    `sleeping cat is ground-only while its persistent thought bubble owns the token value: ${JSON.stringify(sleepPresentation)}`,
  );
  await capture(window, "desktop-pet-sleep-bubble.png", "Desktop pet / Sleep token bubble");
  await evaluate(window, () => document.querySelector(".pet-stage")?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })));
  await waitFor(window, () => document.querySelector('[data-pet-name-bubble][data-bubble-content-mode="name"] strong')?.textContent === "Mochi", [], "sleep hover name swap");
  record("Sleepy hover name swap", "the persistent token bubble changes to Mochi on hover when Show name on hover is enabled");
  await evaluate(window, () => document.querySelector(".pet-stage")?.dispatchEvent(new PointerEvent("pointerout", { bubbles: true })));
  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({}));

  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({
    activeAction: "dance",
    startedAt: Date.now() - 1_800,
    phase: "dance_reference_clip",
    phaseStartedAt: Date.now() - 1_800,
    pointerMode: "none",
  }));
  await waitFor(window, () => {
    const video = document.querySelector("[data-dance-video-layer] video");
    return Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime > 1.5);
  }, [], "desktop transparent Dance video ready");
  const desktopDance = await evaluate(window, () => {
    const stageRect = document.querySelector(".pet-drag-region")?.getBoundingClientRect();
    const video = document.querySelector("[data-dance-video-layer] video");
    const videoRect = video?.getBoundingClientRect();
    return {
      source: document.querySelector("[data-dance-video-layer]")?.dataset.danceVideoSource,
      readyState: video?.readyState,
      duration: video?.duration,
      currentTime: video?.currentTime,
      muted: video?.muted,
      fallbackHidden: !document.querySelector(".pet-appearance-visual-desktop"),
      contained: Boolean(stageRect && videoRect
        && videoRect.left >= stageRect.left - 1
        && videoRect.right <= stageRect.right + 1
        && videoRect.top >= stageRect.top - 1
        && videoRect.bottom <= stageRect.bottom + 1),
    };
  });
  verify(
    "desktop Dance uses the transparent fixed-anchor loop layer",
    desktopDance.source === "pet-video/dance-golden-style.webm"
      && desktopDance.readyState >= 2
      && desktopDance.duration >= 10.12
      && desktopDance.currentTime > 1.5
      && desktopDance.muted
      && desktopDance.fallbackHidden
      && desktopDance.contained,
    `desktop video decoded on the source clock with no duplicate raster actor: ${JSON.stringify(desktopDance)}`,
  );
  await capture(window, "quick-play-dance-video.png", "Desktop / Quick Play / loop-detected fixed-anchor Dance");
  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({}));
  await waitForSelector(window, ".pet-appearance-visual-desktop");

  await evaluate(window, () => document.querySelector(".pet-stage").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.qaState.togglePopoverCalls > 0), [], "desktop double-click bridge");
  record("desktop double-click", "double-clicking the pet invokes the Quick Play bridge");
  return window;
}

async function verifyQuickPlay() {
  resetFixtureSettings();
  const window = createWindow({ width: 280, height: 480, transparent: true, hasShadow: false });
  await load(window, "popover");
  await waitForSelector(window, "[data-testid=quick-play-panel]");
  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlayDirectorSuppressed(true));

  const structure = await evaluate(window, () => {
    const panel = document.querySelector("[data-testid=quick-play-panel]");
    const actionButtons = [...document.querySelectorAll("[data-action-id]")];
    const bodyText = document.body.innerText;
    const actionRects = actionButtons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const controls = [...document.querySelectorAll(".quick-control-copy strong")].map((node) => node.textContent);
    const orderedAnchors = [".quick-play-header", ".quick-action-grid", ".quick-controls-card", ".quick-footer"].map((selector) => document.querySelector(selector).getBoundingClientRect().top);
    return {
      ids: actionButtons.map((button) => button.dataset.actionId),
      disabled: actionButtons.filter((button) => button.disabled).map((button) => button.dataset.actionId),
      controls,
      actionRects,
      orderedAnchors,
      title: document.querySelector("h1")?.textContent,
      subtitle: document.querySelector(".quick-play-heading p")?.textContent,
      helper: document.querySelector("[data-action-id=play_cursor] small")?.textContent,
      napHelper: document.querySelector("[data-action-id=nap_here] small")?.textContent,
      icons: document.querySelectorAll("[data-action-icon]").length,
      iconStates: actionButtons.map((button) => {
        const iconStyle = getComputedStyle(button.querySelector("[data-action-icon]"));
        return { id: button.dataset.actionId, disabled: button.disabled, filter: iconStyle.filter, opacity: iconStyle.opacity };
      }),
      closeSize: document.querySelector(".quick-play-close").getBoundingClientRect().width,
      footerWidth: document.querySelector(".open-console").getBoundingClientRect().width,
      panelWidth: panel.getBoundingClientRect().width,
      panelHeight: panel.getBoundingClientRect().height,
      panelLeft: panel.getBoundingClientRect().left,
      panelTop: panel.getBoundingClientRect().top,
      panelBeforeContent: getComputedStyle(panel, "::before").content,
      panelShadow: getComputedStyle(panel).boxShadow,
      repeatedPreview: Boolean(document.querySelector(".pet-appearance-visual, .pet-generated-actor-canvas, .cat-image")),
      forbiddenContent: ["TokenPet", "All good", "Mood", "Loop", "Play Mode", "Mini Toys", "Last interaction", "Follow cursor", "Reduce motion", "Quiet mode", "Today", "7-day", "All-time tokens", "Source status", "Codex", "Claude Code"].filter((label) => bodyText.includes(label)),
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      documentHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      smallestActionLabel: Math.min(...actionButtons.map((button) => Number.parseFloat(getComputedStyle(button.querySelector(".quick-action-label")).fontSize))),
    };
  });
  verify("Quick Play v20 identity", structure.title === "Quick Play" && structure.subtitle === "Play, rest, or dance with your companion.", "the compact controller has the normative Dance-era title and subtitle");
  verify("Quick Play 3×3 action order", structure.ids.join(",") === quickPlayIds.join(","), `nine stable ids follow the v18 order: ${structure.ids.join(", ")}`);
  verify("Quick Play cursor helper", structure.helper === "10 sec", "Play cursor matches the concise v18 helper copy");
  verify("Quick Play Nap helper", structure.napHelper === "5 min", "Nap here advertises its five-minute timed sleep beside the action label");
  verify("Quick Play exactly three controls", structure.controls.join(",") === "Always on top,Lock position,Mute pet sounds", `controls are ${structure.controls.join(", ")}`);
  verify("Quick Play unlocked actions", structure.disabled.length === 0, "all nine Golden British actions are available before dynamic gates");
  verify("Quick Play no repeated preview", !structure.repeatedPreview, "panel contains no duplicate cat preview");
  verify("Quick Play no forbidden modules", structure.forbiddenContent.length === 0, `removed v14/dashboard content: ${structure.forbiddenContent.join(", ") || "none present"}`);
  verify("Quick Play fixed hierarchy", structure.orderedAnchors.every((value, index) => index === 0 || value > structure.orderedAnchors[index - 1]), `header/grid/controls/footer anchors: ${structure.orderedAnchors.join(", ")}`);
  verify("Quick Play true 3×3 geometry", new Set(structure.actionRects.map((rect) => rect.x)).size === 3 && new Set(structure.actionRects.map((rect) => rect.y)).size === 3, "action cards form three exact columns and rows");
  verify("Quick Play consistent cards", Math.max(...structure.actionRects.map((rect) => rect.width)) - Math.min(...structure.actionRects.map((rect) => rect.width)) <= 1 && Math.max(...structure.actionRects.map((rect) => rect.height)) - Math.min(...structure.actionRects.map((rect) => rect.height)) <= 1, "all nine action cards share dimensions within 1px");
  verify("Quick Play stable icon system", structure.icons === 9, "all actions use local deterministic raster icons rather than platform emoji");
  verify("Quick Play unlocked icons use normal color", structure.iconStates.every((icon) => !icon.disabled && !icon.filter.includes("grayscale") && Number(icon.opacity) >= .99), `all nine unlocked actions use the v20 color treatment: ${JSON.stringify(structure.iconStates)}`);
  verify("Quick Play close target", structure.closeSize >= 24, `scaled close target is ${structure.closeSize}px`);
  verify("Quick Play footer shelf", structure.footerWidth / structure.panelWidth >= .72 && structure.footerWidth / structure.panelWidth <= .9, `footer is ${Math.round(structure.footerWidth / structure.panelWidth * 100)}% of panel width`);
  verify("Quick Play clean single frame", structure.panelLeft === 0 && structure.panelTop === 0 && structure.panelBeforeContent === "none" && structure.panelShadow.endsWith("inset") && !structure.panelShadow.includes("48px"), `panel fills the window at ${structure.panelLeft},${structure.panelTop}; pseudo-frame ${structure.panelBeforeContent}; shadow ${structure.panelShadow}`);
  verify("Quick Play vertical fit", structure.panelHeight <= structure.innerHeight && structure.documentHeight <= structure.innerHeight + 1, `visible panel ${structure.panelHeight}px inside ${structure.innerHeight}px window; document ${structure.documentHeight}px`);
  verify("Quick Play readable labels", structure.smallestActionLabel >= 9, `smallest rendered action label is ${structure.smallestActionLabel}px CSS`);
  await verifyNoHorizontalOverflow(window, "Quick Play");

  await evaluate(window, async () => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petStory", { ...current.petStory, lockPosition: true });
  });
  await waitFor(window, () => document.querySelectorAll("[data-lock-mark]").length === 4, [], "Lock position gate");
  const lockedState = await evaluate(window, () => ({
    disabled: [...document.querySelectorAll("[data-action-id]:disabled")].map((button) => button.dataset.actionId),
    enabled: [...document.querySelectorAll("[data-action-id]:not(:disabled)")].map((button) => button.dataset.actionId),
    icons: [...document.querySelectorAll("[data-action-id]")].map((button) => {
      const style = getComputedStyle(button.querySelector("[data-action-icon]"));
      return { id: button.dataset.actionId, disabled: button.disabled, filter: style.filter, opacity: style.opacity };
    }),
    detail: document.body.innerText.includes("Movement actions are locked"),
  }));
  verify("Quick Play lock position matrix", lockedState.disabled.join(",") === "walk_round_trip,token_snack,drag_dangle,toss_yarn" && lockedState.enabled.join(",") === "play_cursor,nap_here,wake_up,dance,capture_moment", `disabled ${lockedState.disabled.join(", ")}; enabled ${lockedState.enabled.join(", ")}`);
  verify("Quick Play lock-only gray treatment", lockedState.icons.every((icon) => icon.disabled ? icon.filter.includes("grayscale(1)") && Number(icon.opacity) < .7 : !icon.filter.includes("grayscale") && Number(icon.opacity) >= .99), `only the four Lock position actions are visually gray: ${JSON.stringify(lockedState.icons)}`);
  verify("Quick Play lock position copy", lockedState.detail, "the controls card explains that movement actions are locked");
  await capture(window, "quick-play.png", "Quick Play v18 locked reference state");

  await evaluate(window, async () => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petStory", { ...current.petStory, lockPosition: false });
  });
  await waitFor(window, () => document.querySelectorAll("[data-action-id]:disabled").length === 0, [], "unlocked Quick Play state");
  await capture(window, "quick-play-unlocked.png", "Quick Play unlocked");

  await evaluate(window, async () => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petStory", { ...current.petStory, lockPosition: false });
    await window.tokenpet.setScreenshotQuickPlaySession({ activeAction: "token_snack", startedAt: Date.now(), pointerMode: "snack" });
  });
  await waitFor(window, () => document.querySelectorAll("[data-action-id]:disabled").length === 8, [], "active action mutex UI");
  const activeState = await evaluate(window, async () => ({
    disabled: [...document.querySelectorAll("[data-action-id]:disabled")].map((button) => button.dataset.actionId),
    enabled: [...document.querySelectorAll("[data-action-id]:not(:disabled)")].map((button) => button.dataset.actionId),
    session: await window.tokenpet.getQuickPlaySession(),
  }));
  verify("Quick Play exclusive action matrix", activeState.disabled.length === 8 && activeState.enabled.join(",") === "capture_moment", "only Capture stays enabled during token_snack");
  await capture(window, "quick-play-active-action.png", "Quick Play active action");
  await click(window, "[data-action-id=capture_moment]", "Capture during action");
  await click(window, "[data-action-id=capture_moment]", "Repeat Capture during action");
  const afterCaptures = await evaluate(window, async () => window.tokenpet.getQuickPlaySession());
  verify("Quick Play Capture concurrency", afterCaptures.activeAction === activeState.session.activeAction && afterCaptures.startedAt === activeState.session.startedAt, "repeated Capture leaves the exclusive session unchanged");

  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({}));
  await waitFor(window, () => document.querySelectorAll("[data-action-id]:disabled").length === 0, [], "clear active action fixture");
  const closeActions = new Set(["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "dance"]);
  for (const actionId of quickPlayIds) {
    await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({}));
    await waitFor(window, () => document.querySelectorAll("[data-action-id]:disabled").length === 0, [], `reset before ${actionId}`);
    const before = (await qaStateFor(window)).qaState.closePopoverCalls;
    await click(window, `[data-action-id="${actionId}"]`, `Quick Play ${actionId}`);
    await waitFor(window, (minimum) => window.tokenpet.getScreenshotQaState().then((state) => state.qaState.actions.length >= minimum), [(await qaStateFor(window)).qaState.actions.length], `${actionId} dispatch`);
    const after = (await qaStateFor(window)).qaState.closePopoverCalls;
    verify(`Quick Play ${actionId} panel rule`, after - before === (closeActions.has(actionId) ? 1 : 0), closeActions.has(actionId) ? "accepted action closes immediately" : "action keeps the panel open");
  }
  const actionState = await qaStateFor(window);
  verify("Quick Play action dispatch", quickPlayIds.every((id) => actionState.qaState.actions.includes(id)), "every friendly action dispatched its stable id");

  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlaySession({}));
  const controlBefore = await evaluate(window, () => [...document.querySelectorAll(".quick-controls input")].map((input) => input.checked));
  for (let index = 0; index < controlBefore.length; index += 1) await click(window, `.quick-controls label:nth-child(${index + 1})`, `Quick Play control ${index + 1}`);
  const controlAfter = await evaluate(window, () => [...document.querySelectorAll(".quick-controls input")].map((input) => input.checked));
  const toggledControls = { before: controlBefore, after: controlAfter, count: controlAfter.length };
  verify("Quick Play controls", toggledControls.count === 3 && toggledControls.before.every((value, index) => toggledControls.after[index] !== value), "exactly three v18 controls change state");

  await click(window, ".open-console", "Open Console");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.qaState.openConsoleCalls.includes("pet")), [], "Open Console bridge");
  record("Quick Play Open Console", "Open Console requests the Pet console section");

  await window.reload();
  await waitForSelector(window, "[data-testid=quick-play-panel]");
  await waitFor(window, (expectedControls) => {
    const controls = [...document.querySelectorAll(".quick-controls input")].map((input) => input.checked);
    return controls.join(",") === expectedControls.join(",");
  }, [toggledControls.after], "Quick Play persisted settings hydration");
  const persisted = await evaluate(window, () => ({
    controls: [...document.querySelectorAll(".quick-controls input")].map((input) => input.checked),
  }));
  verify("Quick Play reload persistence", persisted.controls.join(",") === toggledControls.after.join(","), "all three controls survive a renderer reload through the settings bridge");
  await evaluate(window, () => window.tokenpet.setScreenshotQuickPlayDirectorSuppressed(false));
  resetFixtureSettings();
  await waitFor(window, () => document.querySelectorAll("[data-action-id]:disabled").length === 0, [], "final unlocked Quick Play state");
  return window;
}

async function verifyMenuBarTinyPet() {
  const window = createWindow({ width: 500, height: 360 });
  await load(window, "menubar");
  await waitForActor(window);

  const visible = await evaluate(window, () => ({
    tiny: document.querySelectorAll("[data-testid=menubar-tiny-pet]").length,
    generated: document.querySelectorAll("[data-testid=menubar-tiny-pet] .pet-generated-actor-canvas").length,
    fallback: document.querySelectorAll("[data-testid=menubar-tiny-pet] .pet-actor-canvas-shell:not(.pet-generated-actor-shell)").length,
    quit: Boolean(document.querySelector("button[aria-label='Quit TokenPet']")),
  }));
  verify("MenuBar tiny companion enabled", visible.tiny === 1 && visible.generated === 1 && visible.fallback === 0, "the top bar always renders one real generated actor");
  verify("MenuBar explicit quit", visible.quit, "a settings-adjacent Quit TokenPet X is visible while the desktop pet X remains a hide control");
  const consoleCallsBefore = (await qaStateFor(window)).qaState.openConsoleCalls.length;
  await click(window, "button[aria-label='Open settings']", "Menu Bar settings opens Overview");
  await click(window, ".menubar-footer button", "Menu Bar Open Console opens Overview");
  await waitFor(window, (minimum) => window.tokenpet.getScreenshotQaState().then((state) => state.qaState.openConsoleCalls.length >= minimum), [consoleCallsBefore + 2], "Menu Bar Overview routes");
  const menuBarConsoleCalls = (await qaStateFor(window)).qaState.openConsoleCalls.slice(consoleCallsBefore);
  verify("MenuBar Console entries route to Overview", menuBarConsoleCalls.length === 2 && menuBarConsoleCalls.every((tab) => tab === "overview"), `settings and footer targets: ${JSON.stringify(menuBarConsoleCalls)}`);
  await capture(window, "menu-bar.png", "Menu Bar");

  await evaluate(window, async () => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petStory", {
      ...current.petStory,
      companionSettings: {
        ...current.petStory.companionSettings,
        keepTinyMenuForm: false,
      },
    });
  });
  await delay(180);
  const visibleAfterLegacyFalse = await evaluate(window, () => Boolean(document.querySelector("[data-testid=menubar-tiny-pet]")));
  verify("MenuBar legacy hidden setting migration", visibleAfterLegacyFalse, "a legacy keepTinyMenuForm=false value cannot hide the permanent top-bar companion");

  await window.reload();
  await waitForSelector(window, ".menubar-panel");
  await delay(180);
  const visibleAfterReload = await evaluate(window, () => Boolean(document.querySelector("[data-testid=menubar-tiny-pet]")));
  verify("MenuBar tiny companion persistence", visibleAfterReload, "the top-bar companion stays visible after a renderer reload");
}

async function openPetConsole(window) {
  await click(window, "[data-console-tab=pet]", "Console Pet tab");
  await waitForSelector(window, "[data-pet-page=appearance]");
  const state = await evaluate(window, () => ({
    petActive: document.querySelector("[data-console-tab=pet]")?.classList.contains("active"),
    header: document.querySelector(".console-header strong")?.textContent,
    rangeVisible: Boolean(document.querySelector(".console-header-actions")),
  }));
  verify("Console Pet tab opens", state.petActive && state.header === "Pet", "clicking Pet activates the Pet console and renders Appearance");
  verify("Pet unified header", !state.rangeVisible, "legacy range/refresh controls are absent from Pet surfaces");
}

async function selectPetSection(window, section) {
  await click(window, `[data-pet-section="${section}"]`, `Pet section ${section}`);
  await waitForSelector(window, `[data-pet-page="${section}"]`);
  const active = await evaluate(window, (id) => document.querySelector(`[data-pet-section="${id}"]`)?.getAttribute("aria-current") === "page", section);
  verify(`Pet section ${section} active`, active, `${section} is selected in the unified Pet rail`);
}

async function verifyAppearanceAndSubpages(window) {
  await waitForActor(window);
  const preview = await evaluate(window, () => ({
    generatedCanvases: document.querySelectorAll(".pet-preview-card .pet-generated-actor-canvas").length,
    fallbackCanvas: Boolean(document.querySelector(".pet-preview-card .pet-actor-canvas-shell:not(.pet-generated-actor-shell)")),
    embedded: Boolean(document.querySelector(".pet-preview-card .pet-token-embedded")),
    catChoices: document.querySelectorAll("[data-appearance-cat-type] [data-cat-id]").length,
    captureCommands: document.querySelectorAll("[data-appearance-preview] [data-testid=capture-appearance-preview]").length,
    previewResetOrUndo: [...document.querySelectorAll("[data-appearance-preview] button")]
      .filter((button) => /reset|undo|save/iu.test(button.textContent ?? "")).length,
    identityCards: document.querySelectorAll("[data-appearance-identity]").length,
    identityInput: document.querySelector("[data-testid=pet-identity-name]")?.value,
    identityToggle: document.querySelector("[data-testid=show-name-on-hover]")?.getAttribute("aria-pressed"),
    identityMiniPreviews: document.querySelectorAll("[data-appearance-identity] [data-pet-name-bubble]").length,
    previewNameBubbles: document.querySelectorAll("[data-appearance-preview] [data-pet-name-bubble].is-visible").length,
    previewThoughtDots: document.querySelectorAll("[data-appearance-preview] .pet-name-thought-dot").length,
    previewMoodBadge: document.querySelector("[data-appearance-preview-mood]")?.textContent?.trim(),
    previewEffect: document.querySelector("[data-appearance-preview] .pet-accessory-compositor")?.getAttribute("data-accessory-effect"),
    previewEffectOverlays: document.querySelectorAll("[data-appearance-preview] .pet-accessory-overlay-effect").length,
    legacySkinCards: document.querySelectorAll("[data-appearance-skin], .skin-card").length,
    displayRanges: [...document.querySelectorAll("[data-appearance-display] input[type=range]")].map((input) => ({
      id: input.dataset.rangeId,
      value: input.value,
      disabled: input.disabled,
      cursor: getComputedStyle(input).cursor,
    })),
    accessoryCategories: [...document.querySelectorAll("[data-appearance-accessories] [data-accessory-category]")]
      .map((group) => ({ id: group.dataset.accessoryCategory, choices: group.querySelectorAll("[data-summary-choice]").length })),
    moodControls: document.querySelectorAll(".appearance-v22 .mood-badge-card, .appearance-v22 .mood-looks-card, [data-testid=open-mood-looks]").length,
    standaloneTokenFrame: document.querySelectorAll(".appearance-v22 .token-bubble-card").length,
    summaryTokenFrame: document.querySelectorAll("[data-appearance-accessories] [data-accessory-category=tokenFrame]").length,
    resetOwners: [...document.querySelectorAll(".appearance-v22 button")].filter((button) => /reset appearance/iu.test(button.textContent ?? "")).length,
    workbench: (() => {
      const root = document.querySelector(".appearance-v22");
      const previewCard = document.querySelector("[data-appearance-preview]")?.getBoundingClientRect();
      const display = document.querySelector("[data-appearance-display]")?.getBoundingClientRect();
      const identity = document.querySelector("[data-appearance-identity]")?.getBoundingClientRect();
      const accessories = document.querySelector("[data-appearance-accessories]")?.getBoundingClientRect();
      const footer = document.querySelector("[data-appearance-footer]")?.getBoundingClientRect();
      return root && previewCard && display && identity && accessories && footer ? {
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        previewWidth: previewCard.width,
        previewHeight: previewCard.height,
        sideWidth: display.width,
        stacked: identity.top >= display.bottom,
        accessoriesBelow: accessories.top >= previewCard.bottom,
        footerBelow: footer.top >= accessories.bottom,
      } : null;
    })(),
  }));
  verify("Appearance shared actor", preview.generatedCanvases === 1 && !preview.fallbackCanvas, "Appearance preview uses exactly one generated actor renderer");
  verify("Appearance embedded token frame", preview.embedded, "Appearance preview uses the manifest embedded token mode without a second runtime frame");
  verify("Appearance v22 Cat Type strip", preview.catChoices === 5, "the shallow selector exposes exactly the five reference cat choices plus View all");
  verify("Appearance v22 preview command ownership", preview.captureCommands === 1 && preview.previewResetOrUndo === 0, "Pet Preview owns Capture preview only, with no duplicate Reset, Undo, or Save");
  verify("Appearance v26 Pet Identity", preview.identityCards === 1 && preview.identityInput === "Mochi" && preview.identityToggle === "true" && preview.identityMiniPreviews === 0 && preview.legacySkinCards === 0, "the right stack contains the single live Pet Identity editor, defaults to Mochi/on, and has no redundant mini preview or retired Skin card");
  verify("Appearance v26 held-hover preview", preview.previewNameBubbles === 1 && preview.previewThoughtDots === 2 && preview.previewMoodBadge === "focused", "the large Pet Preview holds hover state and renders the fixed current mood plus exactly one circular name bubble with two thought dots");
  verify("Appearance default None effect", preview.previewEffect === "none" && preview.previewEffectOverlays === 0, "the selected None effect renders no automatic mood override in Pet Preview");
  verify("Appearance Display range affordance", preview.displayRanges.length === 4 && preview.displayRanges.every((range) => !range.disabled && range.cursor === "pointer"), `all four enabled Display sliders use the hand cursor: ${JSON.stringify(preview.displayRanges)}`);
  verify("Appearance default opacity", preview.displayRanges.find((range) => range.id === "opacity")?.value === "100", "a fresh or reset appearance starts at 100% opacity");
  verify("Appearance v30 accessory summary", preview.accessoryCategories.length === 4 && preview.accessoryCategories.map((group) => group.id).join(",") === "neck,head,base,effects" && preview.accessoryCategories.every((group) => group.choices === 2), `Neck, Head, Ground, and Effects each expose exactly current/default + None: ${JSON.stringify(preview.accessoryCategories)}`);
  verify("Appearance scope boundaries", preview.moodControls === 0 && preview.standaloneTokenFrame === 0 && preview.summaryTokenFrame === 0, "Mood controls and Token Frame are absent from the v30 Appearance workbench");
  verify("Appearance reset ownership", preview.resetOwners === 1, "the footer is the page's sole Reset appearance owner");
  verify("Appearance v26 geometry", Boolean(preview.workbench && preview.workbench.scrollHeight <= preview.workbench.clientHeight + 1 && preview.workbench.previewWidth > preview.workbench.sideWidth && preview.workbench.previewHeight > 280 && preview.workbench.stacked && preview.workbench.accessoriesBelow && preview.workbench.footerBelow), `full compact workbench fits without page scrolling: ${JSON.stringify(preview.workbench)}`);
  await verifyNoHorizontalOverflow(window, "Appearance");
  await capture(window, "console-appearance.png", "Console / Appearance");

  const setIdentityName = async (value) => {
    await evaluate(window, (nextValue) => {
      const input = document.querySelector("[data-testid=pet-identity-name]");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, nextValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  await setIdentityName("TokenPet猫猫");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.identity?.name === "TokenPet猫猫"), [], "10-grapheme Pet Identity persistence");
  const longBubbleSize = await evaluate(window, () => document.querySelector("[data-appearance-preview] .pet-name-thought-circle")?.getBoundingClientRect().width ?? 0);
  await setIdentityName("TokenPet猫猫呀");
  await waitFor(window, () => document.querySelector("[data-testid=pet-identity-name]")?.getAttribute("aria-invalid") === "true", [], "Pet Identity over-limit validation");
  await waitFor(window, () => {
    const color = getComputedStyle(document.querySelector(".pet-identity-name-field")).borderTopColor;
    const rgb = color.match(/[\d.]+/gu)?.slice(0, 3).map(Number) ?? [];
    return rgb.length === 3 && rgb[0] >= 190 && rgb[0] > rgb[1] * 2.5 && rgb[0] > rgb[2] * 2.5;
  }, [], "Pet Identity invalid red border paint");
  const invalidIdentity = await evaluate(window, async () => ({
    inputValue: document.querySelector("[data-testid=pet-identity-name]")?.value,
    error: document.querySelector("#pet-identity-name-error")?.textContent,
    redBorder: getComputedStyle(document.querySelector(".pet-identity-name-field")).borderTopColor,
    persistedName: (await window.tokenpet.getScreenshotQaState()).settings.petAppearance.identity?.name,
  }));
  const invalidBorderRgb = invalidIdentity.redBorder.match(/[\d.]+/gu)?.slice(0, 3).map(Number) ?? [];
  const invalidBorderIsRed = invalidBorderRgb.length === 3
    && invalidBorderRgb[0] >= 190
    && invalidBorderRgb[0] > invalidBorderRgb[1] * 2.5
    && invalidBorderRgb[0] > invalidBorderRgb[2] * 2.5;
  verify("Pet Identity 10-grapheme validation", invalidIdentity.inputValue === "TokenPet猫猫呀" && invalidIdentity.error === "最多10个字符" && invalidBorderIsRed && invalidIdentity.persistedName === "TokenPet猫猫", `the 11th grapheme remains visible only as a red invalid draft while the last valid name stays persisted: ${JSON.stringify(invalidIdentity)}`);
  await capture(window, "console-appearance-name-invalid.png", "Console / Appearance / Pet name validation");

  await setIdentityName("M");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.identity?.name === "M"), [], "short Pet Identity persistence");
  const shortBubbleSize = await evaluate(window, () => document.querySelector("[data-appearance-preview] .pet-name-thought-circle")?.getBoundingClientRect().width ?? 0);
  verify("Pet Identity adaptive thought bubble", longBubbleSize > shortBubbleSize + 10, `the circular bubble grows with valid name length (${shortBubbleSize}px short / ${longBubbleSize}px long)`);
  await click(window, "[data-testid=show-name-on-hover]", "disable name on hover");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.identity?.showNameOnHover === false), [], "hide-name setting persistence");
  const hiddenNamePreview = await evaluate(window, () => document.querySelector("[data-appearance-preview] [data-pet-name-bubble]")?.getAttribute("aria-hidden"));
  verify("Pet Identity hover visibility toggle", hiddenNamePreview === "true", "turning Show name on hover off hides the held-hover result in the large preview and persists immediately");
  await click(window, "[data-testid=show-name-on-hover]", "restore name on hover");
  await setIdentityName("Mochi");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.identity?.name === "Mochi" && state.settings.petAppearance.identity?.showNameOnHover === true), [], "Pet Identity default restore");

  const setDisplayRange = async (rangeId, value) => {
    await evaluate(window, ({ id, nextValue }) => {
      const input = document.querySelector(`[data-range-id="${id}"]`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, String(nextValue));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, { id: rangeId, nextValue: value });
  };
  await setDisplayRange("shadow", 0);
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.shadow === 0), [], "Shadow 0% persistence");
  await delay(240);
  const shadowOffFilter = await evaluate(window, () => getComputedStyle(document.querySelector("[data-appearance-preview] .pet-generated-actor-canvas")).filter);
  await capture(window, "console-appearance-shadow-0.png", "Console / Appearance / Shadow 0%");
  await setDisplayRange("shadow", 100);
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.shadow === 1), [], "Shadow 100% persistence");
  await delay(240);
  const shadowOnFilter = await evaluate(window, () => getComputedStyle(document.querySelector("[data-appearance-preview] .pet-generated-actor-canvas")).filter);
  verify("Appearance live Shadow control", shadowOffFilter !== shadowOnFilter && shadowOnFilter.includes("drop-shadow"), `the generated actor consumes the persisted slider value instead of reporting Baked (${shadowOffFilter} → ${shadowOnFilter})`);
  await capture(window, "console-appearance-shadow-100.png", "Console / Appearance / Shadow 100%");
  await setDisplayRange("shadow", 60);
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.shadow === .6), [], "Shadow reference restore");

  const originalPreviewSize = Number(preview.displayRanges.find((range) => range.id === "size")?.value ?? 100);
  await setDisplayRange("size", 125);
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.size === 1.25), [], "Appearance maximum Size persistence");
  await delay(240);
  const maximumSizePreviewFit = await evaluate(window, () => {
    const stage = document.querySelector("[data-appearance-preview] .pet-preview-stage")?.getBoundingClientRect();
    const canvas = document.querySelector("[data-appearance-preview] .pet-generated-actor-canvas");
    const canvasRect = canvas?.getBoundingClientRect();
    const context = canvas?.getContext("2d");
    if (!stage || !canvas || !canvasRect || !context) return null;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width;
    let top = canvas.height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(y * canvas.width + x) * 4 + 3] <= 12) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < left || bottom < top) return null;
    const visible = {
      left: canvasRect.left + left / canvas.width * canvasRect.width,
      top: canvasRect.top + top / canvas.height * canvasRect.height,
      right: canvasRect.left + (right + 1) / canvas.width * canvasRect.width,
      bottom: canvasRect.top + (bottom + 1) / canvas.height * canvasRect.height,
    };
    return {
      configuredSize: Number(document.querySelector("[data-appearance-preview] .pet-generated-actor-shell")?.dataset.petSize),
      stage: { left: stage.left, top: stage.top, right: stage.right, bottom: stage.bottom },
      visible,
      contained: visible.left >= stage.left - 1 && visible.top >= stage.top - 1 && visible.right <= stage.right + 1 && visible.bottom <= stage.bottom + 1,
    };
  });
  verify("Appearance maximum Size preview containment", maximumSizePreviewFit?.configuredSize === .92 && maximumSizePreviewFit.contained === true, `the preview caps only its portrait scale and keeps the complete actor visible at desktop Size 125%: ${JSON.stringify(maximumSizePreviewFit)}`);
  await capture(window, "console-appearance-size-125.png", "Console / Appearance / Size 125% fitted preview");
  await setDisplayRange("size", originalPreviewSize);
  await waitFor(window, (expectedSize) => window.tokenpet.getScreenshotQaState().then((state) => Math.round((state.settings.petAppearance.size ?? 1) * 100) === expectedSize), [originalPreviewSize], "Appearance Size restore");

  const subpages = [
    { trigger: "[data-testid=open-cat-type]", page: "cat-type", file: "console-cat-type.png", name: "Cat Type" },
    { trigger: "[data-testid=open-accessories]", page: "accessories", file: "console-accessories.png", name: "Accessories" },
  ];
  for (const subpage of subpages) {
    await click(window, subpage.trigger, `open ${subpage.name}`);
    await waitForSelector(window, `[data-pet-page="${subpage.page}"]`);
    await waitForActor(window);
    if (subpage.page === "cat-type") {
      const details = await evaluate(window, () => ({
        enabledRanges: document.querySelectorAll(".cat-breed-details-card input:not(:disabled)").length,
        enabledEyes: document.querySelectorAll(".cat-eye-color-options button:not(:disabled)").length,
        note: document.querySelector(".cat-details-locked-note")?.textContent ?? "",
      }));
      verify("Cat Type baked-detail gate", details.enabledRanges === 0 && details.enabledEyes === 0 && details.note.includes("baked"), "Golden fur, eye, and pattern controls are disabled and explained as baked actor art");

      const beforeCatChange = sharedStoryState(await qaStateFor(window));
      const identityBeforeCatChange = (await qaStateFor(window)).settings.petAppearance.identity;
      await click(window, "[data-cat-id=ragdoll]", "select Ragdoll fallback");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.catTypeId === "ragdoll"), [], "Ragdoll appearance persistence");
      await waitFor(window, () => Boolean(document.querySelector(".cat-type-page-preview-stage .pet-actor-canvas-root.is-ready")), [], "Ragdoll fallback renderer");
      await waitFor(window, () => {
        const canvas = document.querySelector(".cat-type-page-preview-stage .pet-actor-canvas");
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return false;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let index = 3; index < pixels.length; index += 2048) if (pixels[index] > 0) return true;
        return false;
      }, [], "Ragdoll approved fallback pixels");
      const fallback = await evaluate(window, () => {
        const canvas = document.querySelector(".cat-type-page-preview-stage .pet-actor-canvas");
        const context = canvas?.getContext("2d");
        const pixels = context?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
        let opaqueSamples = 0;
        for (let index = 3; index < pixels.length; index += 2048) if (pixels[index] > 0) opaqueSamples += 1;
        return {
          fallbackCanvases: document.querySelectorAll(".cat-type-page-preview-stage .pet-actor-canvas-shell.pet-cat-ragdoll:not(.pet-generated-actor-shell)").length,
          generatedCanvases: document.querySelectorAll(".cat-type-page-preview-stage .pet-generated-actor-canvas").length,
          hiddenTokenMode: document.querySelectorAll(".cat-type-page-preview-stage .pet-actor-canvas-shell.pet-cat-ragdoll.pet-token-hidden").length,
          tokenHotspots: document.querySelectorAll(".cat-type-page-preview-stage .pet-actor-token-hotspot").length,
          width: canvas?.width ?? 0,
          height: canvas?.height ?? 0,
          opaqueSamples,
        };
      });
      verify("Ragdoll approved static fallback", fallback.fallbackCanvases === 1 && fallback.generatedCanvases === 0 && fallback.hiddenTokenMode === 1 && fallback.tokenHotspots === 0 && fallback.opaqueSamples > 0, `Ragdoll uses only the approved non-empty ${fallback.width}×${fallback.height} fallbackStaticImage, with runtime token UI forced hidden: ${JSON.stringify(fallback)}`);
      verify("Ragdoll fallback does not crash", !window.webContents.isCrashed(), "switching from actor-ready Golden to Ragdoll keeps the renderer alive");
      verify("Cat type preserves shared story state", JSON.stringify(sharedStoryState(await qaStateFor(window))) === JSON.stringify(beforeCatChange), "journey stage, memories, mood thresholds, and milestone ids are unchanged after selecting Ragdoll");
      verify("Cat type preserves Pet Identity", JSON.stringify((await qaStateFor(window)).settings.petAppearance.identity) === JSON.stringify(identityBeforeCatChange), "changing the cat image keeps the local name and Show name on hover preference");
      await capture(window, "console-cat-type-ragdoll-fallback.png", "Console / Cat Type / Ragdoll fallback");

      await click(window, "[data-cat-id=golden-british]", "restore Golden British actor");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.catTypeId === "golden-british"), [], "Golden British appearance restore");
      await waitFor(window, () => Boolean(document.querySelector(".cat-type-page-preview-stage .pet-generated-actor-canvas-root.is-ready")), [], "Golden British generated actor restore");
      verify("Golden restore preserves shared story state", JSON.stringify(sharedStoryState(await qaStateFor(window))) === JSON.stringify(beforeCatChange), "journey stage, memories, mood thresholds, and milestone ids remain unchanged after switching back to Golden");
    }
    if (subpage.page === "accessories") {
      const accessories = await evaluate(window, () => ({
        categoryIds: [...document.querySelectorAll(".accessories-library-column [data-accessory-category]")].map((section) => section.dataset.accessoryCategory),
        choiceCounts: [...document.querySelectorAll(".accessories-library-column [data-accessory-category]")].map((section) => section.querySelectorAll("[data-accessory-choice-id]").length),
        planned: [...document.querySelectorAll("[data-accessory-choice-id]:disabled")].map((button) => button.dataset.accessoryChoiceId),
        tokenFrames: document.querySelectorAll(".token-frame-section, [data-token-frame-id]").length,
        detailCards: document.querySelectorAll(".accessory-details-card").length,
        capabilityLabels: document.querySelectorAll(".accessory-capability-label").length,
        geometry: (() => {
          const root = document.querySelector(".accessories-v28");
          const preview = document.querySelector(".accessories-live-preview-card")?.getBoundingClientRect();
          const library = document.querySelector(".accessories-library-column")?.getBoundingClientRect();
          return root && preview && library ? {
            scrollHeight: root.scrollHeight,
            clientHeight: root.clientHeight,
            previewWidth: preview.width,
            libraryWidth: library.width,
          } : null;
        })(),
      }));
      verify("Accessories v28 catalog structure", accessories.categoryIds.join(",") === "neck,head,base,effects" && accessories.choiceCounts.every((count) => count === 4) && accessories.tokenFrames === 0 && accessories.detailCards === 0, `only Neck, Head, Ground, and Effects remain, each with None plus three choices: ${JSON.stringify(accessories)}`);
      verify("Accessories v28 capability gate", accessories.planned.sort().join(",") === ["bandana", "bow-tie", "study-glasses"].sort().join(",") && accessories.capabilityLabels >= 9, `only the three explicitly planned wearables are disabled: ${JSON.stringify(accessories.planned)}`);
      verify("Accessories v28 geometry", Boolean(accessories.geometry && accessories.geometry.scrollHeight <= accessories.geometry.clientHeight + 1 && accessories.geometry.libraryWidth > accessories.geometry.previewWidth), `the four catalog rows fit without page scrolling beside a narrower live preview: ${JSON.stringify(accessories.geometry)}`);

      await click(window, "[data-accessory-category=base] [data-accessory-choice-id=round-rug]", "select Round rug");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.accessorySettings.baseId === "round-rug"), [], "Round rug persistence");
      await waitFor(window, () => document.querySelector(".accessories-live-preview-stage [data-accessory-ground=round-rug]"), [], "Round rug live rendering");
      await click(window, "[data-accessory-category=effects] [data-accessory-choice-id=leaf-drift]", "select Leaf drift");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.accessorySettings.effectId === "leaf-drift"), [], "Leaf drift persistence");
      await waitFor(window, () => document.querySelector(".accessories-live-preview-stage [data-accessory-effect=leaf-drift]"), [], "Leaf drift live rendering");
      await click(window, "[data-accessory-category=head] [data-accessory-choice-id=halo]", "select Halo");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.accessorySettings.headId === "halo"), [], "Halo persistence");
      await waitFor(window, () => document.querySelector(".accessories-live-preview-stage [data-accessory-head=halo]"), [], "Halo live rendering");
      record("Accessories runtime selections", "Round rug, Leaf drift, and Halo persist and render through the shared actor compositor");
      await click(window, "[data-testid=reset-accessories]", "restore minimal accessory defaults");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.accessorySettings.neckId === "collar" && state.settings.petAppearance.accessorySettings.headId === "none" && state.settings.petAppearance.accessorySettings.baseId === "none" && state.settings.petAppearance.accessorySettings.effectId === "none"), [], "minimal accessory default restore");
    }
    await verifyNoHorizontalOverflow(window, subpage.name);
    await capture(window, subpage.file, `Console / ${subpage.name}`);
    await click(window, ".cat-type-back", `back from ${subpage.name}`);
    await waitForSelector(window, "[data-pet-page=appearance]");
  }
}

async function verifyActions(window, desktopPet) {
  await selectPetSection(window, "actions");
  await waitForSelector(window, "[data-action-preview] .pet-generated-actor-canvas-root.is-ready");
  const expectedActions = ["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "dance"];
  const expectedSettings = {
    walk_round_trip: ["walkPace", "roamDistance", "destinationPause", "lookAroundEffect"],
    token_snack: ["snackStyle", "walkPace", "snackSize", "startMeow", "returnPace"],
    play_cursor: ["followSmoothing", "maxHeadTurnAngle", "earFollow"],
    drag_dangle: ["fishToyStyle", "swingResponse", "pursuitPace", "toyTrailEffect"],
    toss_yarn: ["yarnColor", "rollDistance", "rollSpeed", "returnPace"],
    nap_here: ["settlePace", "sleepShadow"],
    wake_up: ["meowVoice", "meowCue", "stretchHold", "wakeSparkle"],
    dance: ["danceSound"],
  };
  const state = await evaluate(window, () => ({
    ids: [...document.querySelectorAll("[data-action-selector] [data-action-id]")].map((button) => button.dataset.actionId),
    labels: [...document.querySelectorAll("[data-action-selector] [data-action-id] strong")].map((label) => label.textContent.trim()),
    disabled: [...document.querySelectorAll("[data-action-selector] [data-action-id]")].filter((button) => button.disabled).map((button) => button.dataset.actionId),
    brokenImages: [...document.querySelectorAll("[data-action-selector] img, [data-action-filmstrip] img")].filter((image) => !image.complete || image.naturalWidth === 0).length,
    selected: document.querySelector(".actions-workbench-page")?.dataset.selectedAction,
    captureCount: document.querySelectorAll("[data-action-id=capture_moment]").length,
    previewOnly: document.querySelector("[data-preview-only]")?.textContent.trim(),
    footer: document.querySelector("[data-actions-footer]")?.textContent.trim(),
    sharedActorId: document.querySelector("[data-action-preview] [data-actor-id]")?.dataset.actorId,
    generatedActors: document.querySelectorAll("[data-action-preview] .pet-generated-actor-canvas-root.is-ready").length,
    filmstripFrames: document.querySelectorAll("[data-action-filmstrip] [data-action-keyframe]").length,
    settingsFor: document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor,
    accessories: (() => {
      const compositor = document.querySelector("[data-action-preview] .pet-accessory-compositor");
      return compositor ? {
        visible: compositor.dataset.accessoriesVisible,
        head: compositor.dataset.accessoryHead,
        ground: compositor.dataset.accessoryGround,
        effect: compositor.dataset.accessoryEffect,
      } : null;
    })(),
    layout: (() => {
      const preview = document.querySelector("[data-action-preview]")?.getBoundingClientRect();
      const settings = document.querySelector("[data-action-settings]")?.getBoundingClientRect();
      const stage = document.querySelector("[data-action-preview-stage]")?.getBoundingClientRect();
      const page = document.querySelector(".actions-workbench-page")?.getBoundingClientRect();
      const footer = document.querySelector("[data-actions-footer]")?.getBoundingClientRect();
      const content = document.querySelector(".console-content");
      const contentRect = content?.getBoundingClientRect();
      return preview && settings && stage && page && footer && content && contentRect ? {
        previewWidth: preview.width,
        settingsWidth: settings.width,
        stageHeight: stage.height,
        pageHeight: page.height,
        contentClientHeight: content.clientHeight,
        contentScrollHeight: content.scrollHeight,
        footerBottom: footer.bottom,
        contentBottom: contentRect.bottom,
      } : null;
    })(),
    retiredModules: [...document.querySelectorAll("[data-pet-page=actions] h2, [data-pet-page=actions] h3")].map((heading) => heading.textContent.trim()).filter((text) => ["Behavior Mode", "Actor States", "Interaction Rules", "Director Priority", "Safety", "Live Actor Preview"].includes(text)),
  }));
  verify("Actions v19 selector", JSON.stringify(state.ids) === JSON.stringify(expectedActions) && state.captureCount === 0, `exact ordered eight-action selector, Capture excluded: ${JSON.stringify(state.ids)}`);
  verify("Actions v20 selector labels", JSON.stringify(state.labels) === JSON.stringify(["Pet", "Feed snack", "Play cursor", "Dangle toy", "Toss yarn", "Nap here", "Wake up", "Dance"]), `friendly labels: ${JSON.stringify(state.labels)}`);
  verify("Actions ready assets", state.disabled.length === 0 && state.brokenImages === 0, "all Golden British action previews are enabled and all selector/filmstrip art loaded");
  verify("Actions default selection", state.selected === "walk_round_trip" && state.settingsFor === "walk_round_trip", "Pet is selected and its dedicated settings are visible whenever Actions opens");
  verify("Actions isolated preview renderer", state.previewOnly === "Preview only" && state.sharedActorId === "golden-british" && state.generatedActors === 1 && state.filmstripFrames >= 3, `preview uses the shared generated Golden actor and complete semantic filmstrip: ${JSON.stringify(state)}`);
  verify("Actions preview suppresses Appearance accessories", state.accessories?.visible === "false" && state.accessories.head === "none" && state.accessories.ground === "none" && state.accessories.effect === "none", `the action-only actor ignores selected Head, Ground, and Effects: ${JSON.stringify(state.accessories)}`);
  verify("Actions v19 composition", state.layout && state.layout.previewWidth / state.layout.settingsWidth >= 1.55 && state.layout.stageHeight >= 285, `dominant preview / secondary settings composition: ${JSON.stringify(state.layout)}`);
  verify("Actions fits 1280×900 without vertical scrolling", state.layout && state.layout.contentScrollHeight <= state.layout.contentClientHeight + 1 && state.layout.footerBottom <= state.layout.contentBottom + 1, `entire selector, workbench, and footer fit the production Console viewport: ${JSON.stringify(state.layout)}`);
  verify("Actions retired modules removed", state.retiredModules.length === 0, `old director modules absent: ${JSON.stringify(state.retiredModules)}`);
  verify("Actions isolation copy", state.footer === "Preview changes apply instantly. Your desktop pet stays still.", `exact footer copy: ${state.footer}`);

  await click(window, "[data-action-id=dance]", "select Dance preview");
  await waitFor(window, () => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === "dance", [], "Dance settings");
  await waitFor(window, () => document.querySelector("[data-action-preview-stage]")?.dataset.previewDancePhase === "dance_reference_clip", [], "Dance reference phase");

  // The production Dance preview starts its own reference track when selected.
  // Stop that single intended stream before opening the isolated playback
  // probe; two simultaneous elements for the same AAC can leave the second
  // one waiting on the cold macOS audio device even though play() resolved.
  const dancePreviewPlaying = await evaluate(window, () => document.querySelector("[data-action-play]")?.getAttribute("aria-label") === "Pause preview");
  if (dancePreviewPlaying) await click(window, "[data-action-play]", "pause Dance preview before isolated audio verification");
  await delay(120);

  const danceAudioProbe = await evaluate(window, () => new Promise((resolve) => {
    const audio = new Audio("./pet-audio/dance-video-reference.m4a");
    const startedAt = performance.now();
    let settled = false;
    let progressTimer = 0;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      window.clearInterval(progressTimer);
      audio.pause();
      resolve(value);
    };
    audio.volume = .01;
    audio.addEventListener("loadedmetadata", async () => {
      try {
        await audio.play();
        // A cold macOS audio device can take longer than one animation frame to
        // expose its first advancing timestamp even after play() resolves. Poll
        // for real progress instead of accepting a resolved promise as proof.
        progressTimer = window.setInterval(() => {
          if (!audio.paused && audio.currentTime > 0) {
            finish({ loaded: true, played: true, duration: audio.duration, currentTime: audio.currentTime, startupMs: Math.round(performance.now() - startedAt) });
          }
        }, 40);
        window.setTimeout(() => finish({ loaded: true, played: false, duration: audio.duration, currentTime: audio.currentTime, startupMs: Math.round(performance.now() - startedAt) }), 1_500);
      } catch (error) {
        finish({ loaded: true, played: false, duration: audio.duration, error: String(error) });
      }
    }, { once: true });
    audio.addEventListener("error", () => finish({ loaded: false, played: false, duration: 0 }), { once: true });
    audio.load();
    window.setTimeout(() => finish({ loaded: false, played: false, duration: 0 }), 5_000);
  }));
  verify(
    "Dance reference audio decodes and actually plays for the detected source loop",
    danceAudioProbe.loaded && danceAudioProbe.played && danceAudioProbe.duration >= 10.10 && danceAudioProbe.duration <= 10.20,
    `the trimmed 10.133-second AAC loop starts in the production renderer (Chromium reports AAC priming/padding in the container duration): ${JSON.stringify(danceAudioProbe)}`,
  );

  await evaluate(window, () => {
    const scrubber = document.querySelector("[data-action-scrubber]");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(scrubber, "2030");
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
    scrubber.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(window, () => {
    const video = document.querySelector("[data-dance-video-layer] video");
    return Boolean(video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.duration >= 10.12);
  }, [], "transparent Dance video ready");
  const dancePreview = await evaluate(window, () => {
    const stage = document.querySelector("[data-action-preview-stage]");
    const actor = stage?.querySelector(".action-preview-actor");
    const route = stage?.querySelector(".action-preview-route");
    const home = stage?.querySelector(".action-preview-home");
    const destination = stage?.querySelector(".action-preview-destination");
    const video = stage?.querySelector("[data-dance-video-layer] video");
    const videoLayer = stage?.querySelector("[data-dance-video-layer]");
    const stageRect = stage?.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect();
    const videoFitsStage = Boolean(stageRect && videoRect
      && videoRect.left >= stageRect.left - 2
      && videoRect.right <= stageRect.right + 2
      && videoRect.top >= stageRect.top - 2
      && videoRect.bottom <= stageRect.bottom + 2);
    return {
      contract: stage?.dataset.previewDanceContract,
      phase: stage?.dataset.previewDancePhase,
      videoSource: videoLayer?.dataset.danceVideoSource,
      audioContract: videoLayer?.dataset.danceVideoAudio,
      videoReadyState: video?.readyState,
      videoDuration: video?.duration,
      videoMuted: video?.muted,
      actorX: actor?.style.getPropertyValue("--actor-preview-x"),
      actorY: actor?.style.getPropertyValue("--actor-preview-y"),
      keyframes: document.querySelectorAll("[data-action-filmstrip] [data-action-keyframe]").length,
      settings: [...document.querySelectorAll("[data-action-settings] [data-action-setting]")].map((field) => field.dataset.actionSetting),
      routeHidden: !route || getComputedStyle(route).display === "none",
      homeHidden: !home || getComputedStyle(home).display === "none",
      destinationHidden: !destination || getComputedStyle(destination).display === "none",
      videoFitsStage,
      fallbackHidden: !stage?.querySelector(".pet-appearance-visual-preview"),
      videoBounds: videoRect ? { left: videoRect.left, right: videoRect.right, top: videoRect.top, bottom: videoRect.bottom } : null,
      stageBounds: stageRect ? { left: stageRect.left, right: stageRect.right, top: stageRect.top, bottom: stageRect.bottom } : null,
    };
  });
  verify(
    "Actions Dance preview uses the loop-detected fixed-anchor Golden British video contract",
    dancePreview.contract === "loop-detected-registered-golden-british-vp9-alpha-trimmed-audio-fixed-anchor-fallback"
      && dancePreview.phase === "dance_reference_clip"
      && dancePreview.videoSource === "pet-video/dance-golden-style.webm"
      && dancePreview.audioContract === "separate-detected-loop-reference"
      && dancePreview.videoReadyState >= 2
      && dancePreview.videoDuration >= 10.12
      && dancePreview.videoMuted
      && dancePreview.actorX === "0%"
      && dancePreview.actorY === "0%"
      && dancePreview.keyframes === 3
      && JSON.stringify(dancePreview.settings) === JSON.stringify(["danceSound"])
      && dancePreview.routeHidden
      && dancePreview.homeHidden
      && dancePreview.destinationHidden
      && dancePreview.videoFitsStage
      && dancePreview.fallbackHidden,
    `the fixed-anchor VP9 layer uses the detected loop timeline, synchronized trimmed audio, clean stage bounds, and no duplicate fallback actor: ${JSON.stringify(dancePreview)}`,
  );
  await capture(window, "console-actions-dance.png", "Console / Actions / Dance preview");

  const settingsMatrix = {};
  for (const actionId of expectedActions) {
    await click(window, `[data-action-id=${actionId}]`, `select ${actionId} preview`);
    await waitFor(window, (id) => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === id, [actionId], `${actionId} settings`);
    settingsMatrix[actionId] = await evaluate(window, () => [...document.querySelectorAll("[data-action-settings] [data-action-setting]")].map((field) => field.dataset.actionSetting));
  }
  verify("Actions dedicated settings matrix", Object.entries(expectedSettings).every(([id, keys]) => JSON.stringify(settingsMatrix[id]) === JSON.stringify(keys)), `every action exposes only its specified controls: ${JSON.stringify(settingsMatrix)}`);

  await click(window, "[data-action-id=play_cursor]", "select Play cursor preview");
  await waitFor(window, () => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === "play_cursor", [], "Play cursor settings");
  // The previous settings-matrix selection is Dance. Let the declared 80ms
  // stage transition finish before measuring the registered Cursor bounds.
  await delay(240);
  const sampleCursorPreviewAt = async (timeMs) => {
    await evaluate(window, (nextTimeMs) => {
      const scrubber = document.querySelector("[data-action-scrubber]");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(scrubber, String(nextTimeMs));
      scrubber.dispatchEvent(new Event("input", { bubbles: true }));
      scrubber.dispatchEvent(new Event("change", { bubbles: true }));
    }, timeMs);
    await delay(160);
    return evaluate(window, () => {
      const stage = document.querySelector("[data-action-preview-stage]");
      const actor = stage?.querySelector(".action-preview-actor");
      const canvas = stage?.querySelector(".pet-generated-actor-canvas");
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      const stageRect = stage?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      let alphaBounds = null;
      if (canvas && context && stageRect && canvasRect) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        if (maxX >= minX && maxY >= minY) {
          alphaBounds = {
            left: canvasRect.left + minX / canvas.width * canvasRect.width,
            top: canvasRect.top + minY / canvas.height * canvasRect.height,
            right: canvasRect.left + (maxX + 2) / canvas.width * canvasRect.width,
            bottom: canvasRect.top + (maxY + 2) / canvas.height * canvasRect.height,
          };
        }
      }
      return {
        frame: stage?.querySelector(".pet-generated-actor-canvas")?.dataset.actorFrame,
        animation: stage?.querySelector("[data-actor-animation]")?.dataset.actorAnimation,
        contract: stage?.dataset.previewCursorContract,
        actorX: actor?.style.getPropertyValue("--actor-preview-x"),
        actorY: actor?.style.getPropertyValue("--actor-preview-y"),
        stageBounds: stageRect ? { left: stageRect.left, top: stageRect.top, right: stageRect.right, bottom: stageRect.bottom } : null,
        alphaBounds,
        fitsStage: Boolean(alphaBounds && stageRect
          && alphaBounds.left >= stageRect.left - 1
          && alphaBounds.top >= stageRect.top - 1
          && alphaBounds.right <= stageRect.right + 1
          && alphaBounds.bottom <= stageRect.bottom + 1),
      };
    });
  };
  const cursorEyes = await sampleCursorPreviewAt(200);
  const cursorHead = await sampleCursorPreviewAt(900);
  const cursorEars = await sampleCursorPreviewAt(1_500);
  verify(
    "Actions Play Cursor preview shares the registered directional cascade",
    cursorEyes.animation === "action.play_cursor"
      && cursorEyes.contract === "offline-eyes-head-ears"
      && /^play_cursor-[3-6]$/.test(cursorEyes.frame ?? "")
      && /^play_cursor-(?:[7-9]|10)$/.test(cursorHead.frame ?? "")
      && /^play_cursor-(?:1[1-4])$/.test(cursorEars.frame ?? "")
      && [cursorEyes, cursorHead, cursorEars].every((sample) => sample.actorX === "0%" && sample.actorY === "0%" && sample.fitsStage),
    `eyes, head and ears use production frames while the body anchor remains fixed and fully visible: ${JSON.stringify({ cursorEyes, cursorHead, cursorEars })}`,
  );
  await capture(window, "console-actions-play-cursor.png", "Console / Actions / Play Cursor preview");

  await click(window, "[data-action-id=drag_dangle]", "select Dangle toy preview");
  await waitFor(window, () => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === "drag_dangle", [], "Dangle toy settings");
  await click(window, "[data-action-filmstrip] [data-action-keyframe]:nth-child(6)", "show Dangle pursuit frame");
  await waitFor(window, () => document.querySelector("[data-action-preview] [data-actor-animation]")?.dataset.actorAnimation === "action.dangle_pursuit_run", [], "Dangle pursuit actor");
  await delay(160);
  const danglePreview = await evaluate(window, () => {
    const stage = document.querySelector("[data-action-preview-stage]");
    const shell = stage?.querySelector(".pet-generated-actor-shell");
    const images = [...(stage?.querySelectorAll(".action-preview-dangle-wand img, .action-preview-prop-drag_dangle img") ?? [])];
    const filmstrip = document.querySelector("[data-action-filmstrip]");
    const keyframes = [...(filmstrip?.querySelectorAll("[data-action-keyframe]") ?? [])];
    return {
      contract: stage?.dataset.previewDangleContract,
      phase: stage?.dataset.previewDanglePhase,
      animation: stage?.querySelector("[data-actor-animation]")?.dataset.actorAnimation,
      keyframes: keyframes.length,
      filmstripRows: new Set(keyframes.map((frame) => Math.round(frame.getBoundingClientRect().top))).size,
      filmstripFits: Boolean(filmstrip && filmstrip.scrollHeight <= filmstrip.clientHeight + 1),
      propImages: images.length,
      propsReady: images.every((image) => image.complete && image.naturalWidth > 0),
      cord: stage?.querySelector(".action-preview-dangle-cord path")?.getAttribute("d"),
      tokenHidden: shell?.classList.contains("pet-token-hidden") ?? false,
    };
  });
  verify(
    "Actions Dangle preview shares the complete offline pursuit rig",
    danglePreview.contract === "offline-phases-distance-locked"
      && danglePreview.phase === "dangle_pursuit_run"
      && danglePreview.animation === "action.dangle_pursuit_run"
      && danglePreview.keyframes === 8
      && danglePreview.filmstripRows === 1
      && danglePreview.filmstripFits
      && danglePreview.propImages === 2
      && danglePreview.propsReady
      && danglePreview.cord?.startsWith("M ")
      && danglePreview.tokenHidden,
    `eight Dangle phases, dedicated pursuit actor, clean wand/fish assets, connected cord, and chrome-free preview: ${JSON.stringify(danglePreview)}`,
  );
  await capture(window, "console-actions-dangle.png", "Console / Actions / Dangle Toy preview");

  await click(window, "[data-action-id=nap_here]", "select Nap Here preview");
  await waitFor(window, () => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === "nap_here", [], "Nap Here settings");
  const napPreviewPlaying = await evaluate(window, () => document.querySelector("[data-action-play]")?.getAttribute("aria-label") === "Pause preview");
  if (napPreviewPlaying) await click(window, "[data-action-play]", "pause Nap Here preview for grounded-state review");
  await evaluate(window, () => {
    const scrubber = document.querySelector("[data-action-scrubber]");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(scrubber, "700");
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
    scrubber.dispatchEvent(new Event("change", { bubbles: true }));
  });
  // The actor artboard scale/offset transition is 180ms. Let the production
  // transform settle before measuring the embedded token frame; sampling the
  // interpolated transform made this check timing-dependent after a full QA run.
  await delay(260);
  const napPreview = await evaluate(window, () => {
    const stage = document.querySelector("[data-action-preview-stage]");
    const actor = stage?.querySelector(".action-preview-actor");
    const shell = stage?.querySelector(".pet-generated-actor-shell");
    const root = stage?.querySelector(".pet-generated-actor-canvas-root");
    const stageRect = stage?.getBoundingClientRect();
    const tokenRect = stage?.querySelector(".pet-name-thought-token .pet-name-thought-circle")?.getBoundingClientRect();
    return {
      contract: stage?.dataset.previewNapContract,
      phase: stage?.dataset.previewNapPhase,
      animation: stage?.querySelector("[data-actor-animation]")?.dataset.actorAnimation,
      frame: stage?.querySelector(".pet-generated-actor-canvas")?.dataset.actorFrame,
      keyframes: document.querySelectorAll("[data-action-filmstrip] [data-action-keyframe]").length,
      actorX: actor?.style.getPropertyValue("--actor-preview-x"),
      actorY: actor?.style.getPropertyValue("--actor-preview-y"),
      embeddedTokenHidden: Boolean(shell?.classList.contains("pet-token-hidden") && !shell.querySelector(".pet-actor-token-hotspot")),
      tokenVisible: Boolean(stage?.querySelector('[data-pet-name-bubble][data-bubble-content-mode="token"][aria-hidden="false"]')),
      tokenFitsStage: Boolean(stageRect && tokenRect
        && tokenRect.left >= stageRect.left - 1
        && tokenRect.right <= stageRect.right + 1
        && tokenRect.top >= stageRect.top - 1
        && tokenRect.bottom <= stageRect.bottom - 6),
      stageBounds: stageRect ? { left: stageRect.left, top: stageRect.top, right: stageRect.right, bottom: stageRect.bottom } : null,
      tokenBounds: tokenRect ? { left: tokenRect.left, top: tokenRect.top, right: tokenRect.right, bottom: tokenRect.bottom } : null,
      routeHidden: getComputedStyle(stage.querySelector(".action-preview-route")).display === "none",
      homeHidden: getComputedStyle(stage.querySelector(".action-preview-home")).display === "none",
      destinationHidden: getComputedStyle(stage.querySelector(".action-preview-destination")).display === "none",
      shadow: root ? getComputedStyle(root).filter : "none",
    };
  });
  verify(
    "Actions Nap Here preview shares the grounded fixed-token transition",
    napPreview.contract === "grounded-direct-settle-sleep-bubble"
      && napPreview.phase === "sleep_loop"
      && napPreview.animation === "action.sleep_loop"
      && /^sleep_loop-\d+$/.test(napPreview.frame ?? "")
      && napPreview.keyframes === 2
      && napPreview.actorX === "0%"
      && napPreview.actorY === "0%"
      && napPreview.embeddedTokenHidden
      && napPreview.tokenVisible
      && napPreview.tokenFitsStage
      && napPreview.routeHidden
      && napPreview.homeHidden
      && napPreview.destinationHidden
      && napPreview.shadow !== "none",
    `Ready and Asleep use registered poses without route chrome; the embedded frame stays hidden while the persistent token bubble remains in-stage: ${JSON.stringify(napPreview)}`,
  );
  await capture(window, "console-actions-nap-here.png", "Console / Actions / Nap Here grounded settle");

  await click(window, "[data-action-id=wake_up]", "select Wake Up preview");
  await waitFor(window, () => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === "wake_up", [], "Wake Up settings");
  const wakePhaseAnimations = [];
  for (let index = 1; index <= 4; index += 1) {
    await click(window, `[data-action-filmstrip] [data-action-keyframe]:nth-child(${index})`, `show Wake Up phase ${index}`);
    await delay(120);
    wakePhaseAnimations.push(await evaluate(window, () => document.querySelector("[data-action-preview] [data-actor-animation]")?.dataset.actorAnimation));
  }
  const wakePreviewPlaying = await evaluate(window, () => document.querySelector("[data-action-play]")?.getAttribute("aria-label") === "Pause preview");
  if (wakePreviewPlaying) await click(window, "[data-action-play]", "pause Wake Up preview for key-pose review");
  await evaluate(window, () => {
    const scrubber = document.querySelector("[data-action-scrubber]");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(scrubber, "2700");
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
    scrubber.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await delay(160);
  const wakePreview = await evaluate(window, () => {
    const stage = document.querySelector("[data-action-preview-stage]");
    const shell = stage?.querySelector(".pet-generated-actor-shell");
    const actor = stage?.querySelector(".action-preview-actor");
    const canvas = stage?.querySelector(".pet-generated-actor-canvas");
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    const stageRect = stage?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const keyframes = [...document.querySelectorAll("[data-action-filmstrip] [data-action-keyframe]")];
    let alphaBounds = null;
    if (canvas && context && stageRect && canvasRect) {
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x += 2) {
          if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX >= minX && maxY >= minY) {
        alphaBounds = {
          left: canvasRect.left + minX / canvas.width * canvasRect.width,
          top: canvasRect.top + minY / canvas.height * canvasRect.height,
          right: canvasRect.left + (maxX + 2) / canvas.width * canvasRect.width,
          bottom: canvasRect.top + (maxY + 2) / canvas.height * canvasRect.height,
        };
      }
    }
    return {
      contract: stage?.dataset.previewWakeUpContract,
      phase: stage?.dataset.previewWakeUpPhase,
      animation: stage?.querySelector("[data-actor-animation]")?.dataset.actorAnimation,
      frame: canvas?.dataset.actorFrame,
      keyframes: keyframes.length,
      filmstripRows: new Set(keyframes.map((frame) => Math.round(frame.getBoundingClientRect().top))).size,
      actorX: actor?.style.getPropertyValue("--actor-preview-x"),
      actorY: actor?.style.getPropertyValue("--actor-preview-y"),
      tokenHidden: shell?.classList.contains("pet-token-hidden") ?? false,
      alphaFitsStage: Boolean(stageRect && alphaBounds
        && alphaBounds.left >= stageRect.left - 1
        && alphaBounds.top >= stageRect.top - 1
        && alphaBounds.right <= stageRect.right + 1
        && alphaBounds.bottom <= stageRect.bottom + 1),
    };
  });
  verify(
    "Actions Wake Up preview shares the dedicated five-second offline sequence",
    JSON.stringify(wakePhaseAnimations) === JSON.stringify(["action.wake_up_blink", "action.wake_up_roll", "action.wake_up_stretch", "action.wake_up_gather"])
      && wakePreview.contract === "offline-five-second-whole-frame-stretch"
      && wakePreview.phase === "wake_up_stretch"
      && wakePreview.animation === "action.wake_up_stretch"
      && /^wake_up_stretch-[4-5]$/.test(wakePreview.frame ?? "")
      && wakePreview.keyframes === 4
      && wakePreview.filmstripRows === 1
      && wakePreview.actorX === "0%"
      && wakePreview.actorY === "0%"
      && wakePreview.tokenHidden
      && wakePreview.alphaFitsStage,
    `blink/roll/stretch/gather use the same registered chrome-free whole-cat manifests and remain contained: ${JSON.stringify({ wakePhaseAnimations, wakePreview })}`,
  );
  await capture(window, "console-actions-wake-up.png", "Console / Actions / Wake Up maximum stretch");

  await click(window, "[data-action-id=walk_round_trip]", "select Pet locomotion preview");
  await waitFor(window, () => document.querySelector("[data-action-preview] [data-actor-animation]")?.dataset.actorAnimation === "action.walk_round_trip_walk_front_right", [], "Pet preview directional walk actor");
  const samplePetPreviewAt = async (ratio) => {
    await evaluate(window, (nextRatio) => {
      const scrubber = document.querySelector("[data-action-scrubber]");
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(scrubber, String(Number(scrubber.max) * nextRatio));
      scrubber.dispatchEvent(new Event("input", { bubbles: true }));
      scrubber.dispatchEvent(new Event("change", { bubbles: true }));
    }, ratio);
    await delay(100);
    return evaluate(window, () => {
      const stage = document.querySelector("[data-action-preview-stage]");
      const canvas = stage?.querySelector(".pet-generated-actor-canvas");
      const context = canvas?.getContext("2d", { willReadFrequently: true });
      const stageRect = stage?.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      let alphaBounds = null;
      if (canvas && context && stageRect && canvasRect) {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < canvas.height; y += 2) {
          for (let x = 0; x < canvas.width; x += 2) {
            if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        if (maxX >= minX && maxY >= minY) {
          alphaBounds = {
            left: canvasRect.left + minX / canvas.width * canvasRect.width,
            top: canvasRect.top + minY / canvas.height * canvasRect.height,
            right: canvasRect.left + (maxX + 2) / canvas.width * canvasRect.width,
            bottom: canvasRect.top + (maxY + 2) / canvas.height * canvasRect.height,
          };
        }
      }
      const settingsControls = [...document.querySelectorAll("[data-action-settings] button, [data-action-settings] input[type=range]")];
      return {
        rootProgress: Number(stage?.dataset.previewWalkRootProgress),
        cycleMs: Number(stage?.dataset.previewWalkCycleMs),
        distancePx: Number(stage?.dataset.previewWalkDistancePx),
        animation: stage?.querySelector("[data-actor-animation]")?.dataset.actorAnimation,
        frame: stage?.querySelector(".pet-generated-actor-canvas")?.dataset.actorFrame,
        petSize: Number(stage?.querySelector("[data-pet-size]")?.dataset.petSize),
        stageBounds: stageRect ? { left: stageRect.left, top: stageRect.top, right: stageRect.right, bottom: stageRect.bottom } : null,
        alphaBounds,
        settingsControlCount: settingsControls.length,
        pointerControlCount: settingsControls.filter((control) => getComputedStyle(control).cursor === "pointer").length,
      };
    });
  };
  const petPreviewLeft = await samplePetPreviewAt(0);
  const petPreviewRight = await samplePetPreviewAt(1);
  const fitsStage = (sample) => sample.alphaBounds && sample.stageBounds
    && sample.alphaBounds.left >= sample.stageBounds.left - 1
    && sample.alphaBounds.top >= sample.stageBounds.top - 1
    && sample.alphaBounds.right <= sample.stageBounds.right + 1
    && sample.alphaBounds.bottom <= sample.stageBounds.bottom + 1;
  verify(
    "Actions Pet preview shares Quick Play gait",
    petPreviewLeft.animation === "action.walk_round_trip_walk_front_right"
      && petPreviewLeft.rootProgress <= .02
      && petPreviewRight.rootProgress >= .98
      && petPreviewLeft.distancePx === 288
      && petPreviewLeft.cycleMs > 0
      && /^walk_round_trip_walk_front_right-[1-8]$/.test(petPreviewRight.frame ?? ""),
    `left/right root samples use the production actor and root plan: ${JSON.stringify({ petPreviewLeft, petPreviewRight })}`,
  );
  verify("Actions Pet preview keeps the whole cat visible", fitsStage(petPreviewLeft) && fitsStage(petPreviewRight) && petPreviewLeft.petSize === .78, `non-transparent cat bounds fit both stage endpoints: ${JSON.stringify({ left: petPreviewLeft, right: petPreviewRight })}`);
  verify("Actions Pet Settings use pointer cursors", petPreviewLeft.settingsControlCount >= 6 && petPreviewLeft.pointerControlCount === petPreviewLeft.settingsControlCount, `all ${petPreviewLeft.settingsControlCount} interactive Pet Settings controls use the hand cursor`);
  await evaluate(window, () => {
    const scrubber = document.querySelector("[data-action-scrubber]");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(scrubber, "0");
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
    scrubber.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await click(window, "[data-action-restart]", "restart Pet root-motion preview");
  const liveRootStart = await evaluate(window, () => Number(document.querySelector("[data-action-preview-stage]")?.dataset.previewWalkRootProgress));
  await delay(420);
  const liveRootEnd = await evaluate(window, () => Number(document.querySelector("[data-action-preview-stage]")?.dataset.previewWalkRootProgress));
  verify("Actions Pet preview traverses the sandbox", liveRootEnd > liveRootStart, `shared root progress advances from ${liveRootStart} to ${liveRootEnd}`);
  await capture(window, "console-actions-pet.png", "Console / Actions / Pet preview");

  await click(window, "[data-action-id=token_snack]", "restore Feed snack preview");
  await waitFor(window, () => document.querySelector(".actions-workbench-page")?.dataset.selectedAction === "token_snack", [], "Feed snack restore");
  const beforeQa = await qaStateFor(window);
  const beforeDesktopBounds = desktopPet.getBounds();
  const beforeIsolation = {
    actions: beforeQa.qaState.actions,
    lastAction: beforeQa.settings.petStory.lastAction,
    desktopBounds: beforeDesktopBounds,
  };
  await click(window, "[data-action-play]", "pause isolated preview");
  await click(window, "[data-action-restart]", "restart isolated preview");
  await evaluate(window, () => {
    const scrubber = document.querySelector("[data-action-scrubber]");
    scrubber.value = String(Number(scrubber.max) * .72);
    scrubber.dispatchEvent(new Event("input", { bubbles: true }));
    scrubber.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await click(window, "[data-action-loop]", "toggle isolated preview loop");
  await delay(180);
  const afterQa = await qaStateFor(window);
  const afterIsolation = {
    actions: afterQa.qaState.actions,
    lastAction: afterQa.settings.petStory.lastAction,
    desktopBounds: desktopPet.getBounds(),
  };
  verify("Actions preview never dispatches desktop actions", JSON.stringify(afterIsolation) === JSON.stringify(beforeIsolation), `selectors and transport leave QA actions, PetDirector request, and BrowserWindow bounds unchanged: ${JSON.stringify(afterIsolation)}`);

  const loopEnabled = await evaluate(window, () => document.querySelector("[data-action-loop]")?.getAttribute("aria-checked") === "true");
  if (!loopEnabled) await click(window, "[data-action-loop]", "restore preview loop for v19 baseline");
  await click(window, "[data-action-filmstrip] [data-action-keyframe]:nth-child(2)", "show Feed snack action frame");
  await click(window, "[data-action-play]", "play Feed snack v19 baseline");
  await delay(120);
  report.actionsViewportContract = { selector: state.ids, layout: state.layout, settingsMatrix, isolation: afterIsolation };
  await verifyNoHorizontalOverflow(window, "Actions");
  await capture(window, "console-actions.png", "Console / Actions");

  expectedActionSnackSize = 115;
  await evaluate(window, (value) => {
    const input = document.querySelector('[data-action-setting="snackSize"] input[type=range]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, expectedActionSnackSize);
  await waitFor(window, (value) => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.actionSettings.byAction.token_snack?.snackSize === value), [expectedActionSnackSize], "Feed snack setting persistence");
  record("Actions instant local settings", "Feed snack size applies instantly to the isolated preview and persists without a Save action");
}

async function verifyMood(window) {
  await selectPetSection(window, "mood");
  await waitForActor(window);
  const inputs = await evaluate(window, () => [...document.querySelectorAll(".threshold-list input[type=number]")].map((input) => Number(input.value)));
  verify("Mood thresholds", inputs.length === 3 && inputs[0] < inputs[1] && inputs[1] < inputs[2], `three ordered thresholds are editable: ${inputs.join(" < ")}`);
  await verifyNoHorizontalOverflow(window, "Mood & Reactions");
  await capture(window, "console-mood-reactions.png", "Console / Mood & Reactions");

  await evaluate(window, () => {
    const input = document.querySelector(".threshold-list input[type=number]");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "75000");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.moodThresholds.focused === 75000), [], "Mood threshold persistence");
  record("Mood threshold persistence", "edited focused threshold reaches persisted story settings");
  await click(window, "[data-preview-mood=hot]", "Mood hot preview");
}

async function verifySound(window) {
  await selectPetSection(window, "sound");
  await waitForActor(window);
  await verifyNoHorizontalOverflow(window, "Sound Cues");
  await capture(window, "console-sound-cues.png", "Console / Sound Cues");
  await clickButtonWithText(window, "Tiny bell", ".sound-style-card");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.soundStyle === "cozy" && state.settings.petStory.soundEnabled), [], "Sound Style persistence");
  await click(window, "button[aria-label^='Disable Wake']", "disable Wake cue");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => !state.settings.petStory.cueIds.includes("wake")), [], "Sound cue persistence");
  record("Sound controls persistence", "sound style and cue toggle reach persisted story settings");
}

async function verifyJourney(window) {
  await selectPetSection(window, "journey");
  await waitForActor(window);
  const state = await evaluate(window, () => ({
    cards: [...document.querySelectorAll(".local-memories-card article")].map((card) => card.textContent.replace(/\s+/gu, " ").trim()),
    externalLinks: document.querySelectorAll(".journey-page a[href]").length,
    stage: document.querySelector(".journey-stage-badge")?.textContent,
  }));
  verify("Journey real local memories", state.cards.length === 3 && state.cards.some((card) => card.includes("A cozy week")), "Journey renders persisted fixture memories rather than static placeholder copy");
  verify("Journey no external learn-more", state.externalLinks === 0, "Journey has no external learn-more row");
  verify("Journey shared stage", state.stage === "Flow Companion", "lifecycle stage is derived from shared local usage");
  await verifyNoHorizontalOverflow(window, "Journey");
  await capture(window, "console-journey.png", "Console / Journey");

  await clickButtonWithText(window, "Show memory cards", ".companion-settings-card");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.companionSettings.showMemoryCards === false), [], "Journey memory-card setting persistence");
  await waitFor(window, () => {
    const container = document.querySelector("[data-memory-cards=hidden]");
    return Boolean(container) && ![...container.querySelectorAll("article")].some((card) => card.textContent.includes("A cozy week"));
  }, [], "Journey memory cards to hide");
  record("Journey memory cards toggle", "showMemoryCards=false hides persisted memory cards immediately while retaining an honest local-data placeholder");

  await window.reload();
  await waitForSelector(window, "[data-console-tab=overview].active");
  await openPetConsole(window);
  await selectPetSection(window, "journey");
  await waitForActor(window);
  const memoriesHiddenAfterReload = await evaluate(window, () => {
    const container = document.querySelector("[data-memory-cards=hidden]");
    return Boolean(container) && ![...container.querySelectorAll("article")].some((card) => card.textContent.includes("A cozy week"));
  });
  verify("Journey memory cards persistence", memoriesHiddenAfterReload, "persisted memory cards remain hidden after a renderer reload");
  await clickButtonWithText(window, "Pin journey stage", ".companion-settings-card");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.pinnedStage === "flowCompanion"), [], "Journey pin persistence");
  await click(window, ".journey-celebrate-button", "Journey milestone preview");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.lastAction?.id === "milestone_celebrate"), [], "Journey milestone action");
  record("Journey controls persistence", "stage pin and milestone preview reach persisted story state");
}

async function verifyConsole(desktopPet) {
  const window = createWindow({ width: 1280, height: 900 });
  await load(window, "console");
  await waitForSelector(window, "[data-console-tab=overview].active");
  await verifyConsoleSidebarPetSize(window, desktopPet);
  await openPetConsole(window);
  await verifyAppearanceAndSubpages(window);
  await verifyActions(window, desktopPet);
  await verifyMood(window);
  await verifySound(window);
  await verifyJourney(window);

  window.webContents.send("qa:navigate-console", "pet");
  await waitForSelector(window, "[data-console-tab=pet].active");
  await waitForSelector(window, "[data-pet-page=appearance]");
  record("Console IPC navigation", "an existing Console already on a Pet subpage resets to Pet Appearance when Quick Play requests Pet");

  await selectPetSection(window, "actions");
  await click(window, "[data-action-id=token_snack]", "reselect Feed snack after Actions remount");
  await waitFor(window, () => document.querySelector("[data-action-settings]")?.dataset.actionSettingsFor === "token_snack", [], "Feed snack settings after Actions remount");
  const persisted = await evaluate(window, () => ({
    snackSize: Number(document.querySelector('[data-action-setting="snackSize"] input[type=range]')?.value),
  }));
  verify("Console action settings survive section remount", persisted.snackSize === expectedActionSnackSize, "the v19 Feed snack setting remains selected after navigating away and back");
  return window;
}

async function run() {
  mkdirSync(outputDir, { recursive: true });
  registerFixtureBridge();
  const desktopPet = await verifyDesktopPet();
  await verifyDesktopCatVisualNormalization(desktopPet);
  await verifyQuickPlay();
  resetFixtureSettings();
  await verifyMenuBarTinyPet();
  resetFixtureSettings();
  await verifyConsole(desktopPet);

  const finalState = clone(qaState);
  verify("Quick Play dance command", finalState.actions.includes("dance"), "Dance dispatched the v20 fixed-bounds action id");
  verify("Quick Play capture side effect", finalState.captures >= 2, "repeatable Capture bypassed the exclusive actor action path");
  report.bridgeSummary = {
    ...finalState,
    setSettingCalls: {
      count: finalState.setSettingCalls.length,
      keys: finalState.setSettingCalls.map((call) => call.key),
    },
  };
  writeFileSync(join(outputDir, "qa-results.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Pet Story screenshot QA: ${report.checks.length} checks passed; ${report.screenshots.length} screenshots written.`);
}

function finish(exitCode) {
  for (const window of windows) {
    if (!window.isDestroyed()) window.destroy();
  }
  if (exitCode === 0) app.quit();
  else app.exit(exitCode);
}

app.whenReady().then(async () => {
  try {
    await run();
    finish(0);
  } catch (error) {
    report.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, "qa-results.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.error(error);
    finish(1);
  }
});
