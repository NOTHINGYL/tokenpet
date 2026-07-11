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

const quickPlayIds = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_pointer",
  "capture_moment",
];
const emptyQuickPlaySession = {
  activeAction: null,
  startedAt: null,
  startBounds: null,
  startDirectorState: null,
  pointerMode: "none",
};
let quickPlaySession = clone(emptyQuickPlaySession);
let suppressQuickPlayDirector = false;
const quickPlayPositionActions = new Set(["walk_round_trip", "token_snack", "drag_dangle", "toss_yarn", "summon_to_pointer"]);
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
  await delay(180);
  const image = await window.webContents.capturePage();
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
      && heightDelta <= 0.1
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

  await evaluate(window, () => document.querySelector(".pet-stage").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.qaState.togglePopoverCalls > 0), [], "desktop double-click bridge");
  record("desktop double-click", "double-clicking the pet invokes the Quick Play bridge");
  return window;
}

async function verifyQuickPlay() {
  resetFixtureSettings();
  const window = createWindow({ width: 405, height: 697, transparent: true });
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
      icons: document.querySelectorAll("[data-action-icon]").length,
      closeSize: document.querySelector(".quick-play-close").getBoundingClientRect().width,
      footerWidth: document.querySelector(".open-console").getBoundingClientRect().width,
      panelWidth: panel.getBoundingClientRect().width,
      repeatedPreview: Boolean(document.querySelector(".pet-appearance-visual, .pet-generated-actor-canvas, .cat-image")),
      forbiddenContent: ["TokenPet", "All good", "Mood", "Loop", "Play Mode", "Mini Toys", "Last interaction", "Follow cursor", "Reduce motion", "Quiet mode", "Today", "7-day", "All-time tokens", "Source status", "Codex", "Claude Code"].filter((label) => bodyText.includes(label)),
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      documentHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      smallestActionLabel: Math.min(...actionButtons.map((button) => Number.parseFloat(getComputedStyle(button.querySelector(".quick-action-label")).fontSize))),
    };
  });
  verify("Quick Play v18 identity", structure.title === "Quick Play" && structure.subtitle === "Play, rest, or move your companion.", "the compact controller has the normative title and subtitle");
  verify("Quick Play 3×3 action order", structure.ids.join(",") === quickPlayIds.join(","), `nine stable ids follow the v18 order: ${structure.ids.join(", ")}`);
  verify("Quick Play cursor helper", structure.helper === "Tracks your cursor for 30 seconds.", "Play cursor includes the exact required helper copy");
  verify("Quick Play exactly three controls", structure.controls.join(",") === "Always on top,Lock position,Mute pet sounds", `controls are ${structure.controls.join(", ")}`);
  verify("Quick Play unlocked actions", structure.disabled.length === 0, "all nine Golden British actions are available before dynamic gates");
  verify("Quick Play no repeated preview", !structure.repeatedPreview, "panel contains no duplicate cat preview");
  verify("Quick Play no forbidden modules", structure.forbiddenContent.length === 0, `removed v14/dashboard content: ${structure.forbiddenContent.join(", ") || "none present"}`);
  verify("Quick Play fixed hierarchy", structure.orderedAnchors.every((value, index) => index === 0 || value > structure.orderedAnchors[index - 1]), `header/grid/controls/footer anchors: ${structure.orderedAnchors.join(", ")}`);
  verify("Quick Play true 3×3 geometry", new Set(structure.actionRects.map((rect) => rect.x)).size === 3 && new Set(structure.actionRects.map((rect) => rect.y)).size === 3, "action cards form three exact columns and rows");
  verify("Quick Play consistent cards", Math.max(...structure.actionRects.map((rect) => rect.width)) - Math.min(...structure.actionRects.map((rect) => rect.width)) <= 1 && Math.max(...structure.actionRects.map((rect) => rect.height)) - Math.min(...structure.actionRects.map((rect) => rect.height)) <= 1, "all nine action cards share dimensions within 1px");
  verify("Quick Play stable icon system", structure.icons === 9, "all actions use local deterministic SVG icons rather than platform emoji");
  verify("Quick Play close target", structure.closeSize >= 36, `close target is ${structure.closeSize}px`);
  verify("Quick Play footer shelf", structure.footerWidth / structure.panelWidth >= .72 && structure.footerWidth / structure.panelWidth <= .9, `footer is ${Math.round(structure.footerWidth / structure.panelWidth * 100)}% of panel width`);
  verify("Quick Play vertical fit", structure.scrollHeight <= structure.clientHeight + 1 && structure.documentHeight <= structure.innerHeight + 1, `panel ${structure.scrollHeight}/${structure.clientHeight}px; document ${structure.documentHeight}/${structure.innerHeight}px`);
  verify("Quick Play readable labels", structure.smallestActionLabel >= 13, `smallest action label is ${structure.smallestActionLabel}px CSS`);
  await verifyNoHorizontalOverflow(window, "Quick Play");

  await evaluate(window, async () => {
    const current = await window.tokenpet.getAppSettings();
    await window.tokenpet.setAppSetting("petStory", { ...current.petStory, lockPosition: true });
  });
  await waitFor(window, () => document.querySelectorAll("[data-lock-mark]").length === 5, [], "Lock position gate");
  const lockedState = await evaluate(window, () => ({
    disabled: [...document.querySelectorAll("[data-action-id]:disabled")].map((button) => button.dataset.actionId),
    enabled: [...document.querySelectorAll("[data-action-id]:not(:disabled)")].map((button) => button.dataset.actionId),
    detail: document.body.innerText.includes("Movement actions are locked"),
  }));
  verify("Quick Play lock position matrix", lockedState.disabled.join(",") === "walk_round_trip,token_snack,drag_dangle,toss_yarn,summon_to_pointer" && lockedState.enabled.join(",") === "play_cursor,nap_here,wake_up,capture_moment", `disabled ${lockedState.disabled.join(", ")}; enabled ${lockedState.enabled.join(", ")}`);
  verify("Quick Play lock position copy", lockedState.detail, "the controls card explains that movement actions are locked");
  await capture(window, "quick-play.png", "Quick Play v18 locked reference state");

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
  const closeActions = new Set(["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "summon_to_pointer"]);
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
  await capture(window, "quick-play-unlocked.png", "Quick Play unlocked");
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
  verify("MenuBar tiny companion enabled", visible.tiny === 1 && visible.generated === 1 && visible.fallback === 0, "keepTinyMenuForm=true renders one real generated actor in the menu bar");
  verify("MenuBar explicit quit", visible.quit, "a settings-adjacent Quit TokenPet X is visible while the desktop pet X remains a hide control");
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
  await waitFor(window, () => !document.querySelector("[data-testid=menubar-tiny-pet]"), [], "MenuBar tiny companion to hide");
  record("MenuBar tiny companion toggle", "keepTinyMenuForm=false removes the tiny actor immediately");

  await window.reload();
  await waitForSelector(window, ".menubar-panel");
  await delay(180);
  const hiddenAfterReload = await evaluate(window, () => !document.querySelector("[data-testid=menubar-tiny-pet]"));
  verify("MenuBar tiny companion persistence", hiddenAfterReload, "the hidden state survives a renderer reload through persisted settings");
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
    enabledExternalFrames: [...document.querySelectorAll(".token-bubble-card [data-token-frame-id]")]
      .filter((button) => ["pillow", "compact", "cost", "floating"].includes(button.dataset.tokenFrameId) && !button.disabled)
      .map((button) => button.dataset.tokenFrameId),
    enabledSkinButtons: document.querySelectorAll(".skin-card button:not(:disabled)").length,
    enabledAccessoryCards: document.querySelectorAll(".accessories-card [data-accessory-id]:not(:disabled)").length,
  }));
  verify("Appearance shared actor", preview.generatedCanvases === 1 && !preview.fallbackCanvas, "Appearance preview uses exactly one generated actor renderer");
  verify("Appearance embedded token frame", preview.embedded, "Appearance preview uses the manifest embedded token mode without a second runtime frame");
  verify("Appearance capability honesty", preview.enabledExternalFrames.length === 0 && preview.enabledSkinButtons === 0 && preview.enabledAccessoryCards === 0, "baked actor colors/accessories and unsupported external frames are not presented as usable");
  await verifyNoHorizontalOverflow(window, "Appearance");
  await capture(window, "console-appearance.png", "Console / Appearance");

  const hiddenCopy = await evaluate(window, () => {
    const button = document.querySelector(".token-bubble-card [data-token-frame-id=hidden]");
    return button?.textContent.replace(/\s+/gu, " ").trim() ?? "";
  });
  verify("Golden Hidden copy is honest", /hide value/iu.test(hiddenCopy) && /baked frame remains/iu.test(hiddenCopy), `Hidden option says what changes and what remains: ${hiddenCopy}`);
  await click(window, ".token-bubble-card [data-token-frame-id=hidden]", "Golden Hide value");
  await waitFor(window, () => Boolean(document.querySelector(".pet-preview-card .pet-generated-actor-shell.pet-token-hidden")), [], "Golden hidden token mode");
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.tokenBubbleId === "hidden"), [], "Golden hidden token setting persistence");
  const hiddenMode = await evaluate(window, async () => {
    const canvas = document.querySelector(".pet-preview-card .pet-generated-actor-canvas");
    const context = canvas?.getContext("2d");
    const manifestUrl = new URL("./pet-actors/golden-british/actor.json", location.href);
    const manifest = await fetch(manifestUrl).then((response) => response.json());
    const slot = manifest.tokenSlot ?? manifest.dynamicSlots.tokenText;
    const pixels = context?.getImageData(slot.x, slot.y, slot.width, slot.height).data ?? [];
    let opaquePixels = 0;
    let creamPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 180) opaquePixels += 1;
      if (pixels[index] > 180 && pixels[index + 1] > 160 && pixels[index + 2] > 110 && pixels[index + 3] > 180) creamPixels += 1;
    }
    return {
      generatedCanvases: document.querySelectorAll(".pet-preview-card .pet-generated-actor-canvas").length,
      fallbackCanvases: document.querySelectorAll(".pet-preview-card .pet-actor-canvas-shell:not(.pet-generated-actor-shell)").length,
      tokenHotspots: document.querySelectorAll(".pet-preview-card .pet-actor-token-hotspot").length,
      opaquePixels,
      creamPixels,
    };
  });
  verify("Golden Hidden runtime semantics", hiddenMode.generatedCanvases === 1 && hiddenMode.fallbackCanvases === 0 && hiddenMode.tokenHotspots === 0, "Hidden removes the dynamic token value/hotspot without adding a second or fallback frame");
  verify("Golden baked frame remains", hiddenMode.opaquePixels > 1_000 && hiddenMode.creamPixels > 1_000, `the manifest token slot still contains approved baked cream-frame pixels (${hiddenMode.creamPixels} cream / ${hiddenMode.opaquePixels} opaque)`);
  await capture(window, "console-appearance-hidden-value.png", "Console / Appearance / Hide value");
  await click(window, ".token-bubble-card [data-token-frame-id=embedded]", "restore Golden embedded frame");
  await waitFor(window, () => Boolean(document.querySelector(".pet-preview-card .pet-generated-actor-shell.pet-token-embedded .pet-actor-token-hotspot")), [], "Golden embedded token mode restore");
  record("Golden frame restore", "restoring Embedded returns exactly one dynamic token hotspot on the same generated actor");

  const subpages = [
    { trigger: "[data-testid=open-cat-type]", page: "cat-type", file: "console-cat-type.png", name: "Cat Type" },
    { trigger: "[data-testid=open-mood-looks]", page: "mood-looks", file: "console-mood-looks.png", name: "Mood Looks" },
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
      await capture(window, "console-cat-type-ragdoll-fallback.png", "Console / Cat Type / Ragdoll fallback");

      await click(window, "[data-cat-id=golden-british]", "restore Golden British actor");
      await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petAppearance.catTypeId === "golden-british"), [], "Golden British appearance restore");
      await waitFor(window, () => Boolean(document.querySelector(".cat-type-page-preview-stage .pet-generated-actor-canvas-root.is-ready")), [], "Golden British generated actor restore");
      verify("Golden restore preserves shared story state", JSON.stringify(sharedStoryState(await qaStateFor(window))) === JSON.stringify(beforeCatChange), "journey stage, memories, mood thresholds, and milestone ids remain unchanged after switching back to Golden");
    }
    if (subpage.page === "mood-looks") {
      const moodLooks = await evaluate(window, () => ({
        bakedControls: [...document.querySelectorAll(".mood-editor-card select:disabled, .mood-effects-card button:disabled")].length,
        bakedLabels: [...document.querySelectorAll(".mood-editor-card strong, .mood-effects-card button, .mood-quick-actions button")].filter((label) => label.textContent.toLowerCase().includes("baked")).length,
        previewOnlyLabels: [...document.querySelectorAll(".mood-editor-card strong")].filter((label) => label.textContent.includes("preview only")).length,
      }));
      verify("Mood Looks honest controls", moodLooks.bakedControls >= 7 && moodLooks.bakedLabels >= 7 && moodLooks.previewOnlyLabels === 1, "baked actor-owned controls/effects are disabled and the sole ephemeral Background wash control is explicitly preview-only");
    }
    if (subpage.page === "accessories") {
      const accessories = await evaluate(window, () => ({
        enabledExternalFrames: [...document.querySelectorAll(".token-frame-section [data-token-frame-id]")]
          .filter((button) => ["pillow", "compact", "cost", "floating"].includes(button.dataset.tokenFrameId) && !button.disabled)
          .map((button) => button.dataset.tokenFrameId),
        enabledUnsupported: [...document.querySelectorAll("[data-accessory-choice-id]:not(:disabled)")]
          .map((button) => button.dataset.accessoryChoiceId)
          .filter((id) => !["none", "collar"].includes(id)),
        capabilityLabels: document.querySelectorAll(".accessory-capability-label").length,
      }));
      verify("Accessories capability gate", accessories.enabledExternalFrames.length === 0 && accessories.enabledUnsupported.length === 0 && accessories.capabilityLabels > 0, "unsupported frames/wearables are disabled and capability-labelled");
    }
    await verifyNoHorizontalOverflow(window, subpage.name);
    await capture(window, subpage.file, `Console / ${subpage.name}`);
    await click(window, ".cat-type-back", `back from ${subpage.name}`);
    await waitForSelector(window, "[data-pet-page=appearance]");
  }
}

async function verifyActions(window, desktopPet) {
  await selectPetSection(window, "actions");
  await waitForActor(window);
  const state = await evaluate(window, () => ({
    ids: [...document.querySelectorAll("[data-actor-state]")].map((button) => button.dataset.actorState),
    disabled: [...document.querySelectorAll("[data-actor-state]")].filter((button) => button.disabled).map((button) => button.dataset.actorState),
    brokenImages: [...document.querySelectorAll(".actor-state-grid img")].filter((image) => !image.complete || image.naturalWidth === 0).length,
    runAcrossControls: [...document.querySelectorAll("[data-desktop-action=run_across], [data-desktop-choreography=run_across]")].map((button) => ({
      disabled: button.disabled,
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })),
    safety: (() => {
      const card = document.querySelector(".actions-safety-card");
      const content = document.querySelector(".console-content");
      if (!card || !content) return null;
      const rect = card.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      return {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        viewport: {
          left: Math.max(0, contentRect.left),
          top: Math.max(0, contentRect.top),
          right: Math.min(window.innerWidth, contentRect.right),
          bottom: Math.min(window.innerHeight, contentRect.bottom),
        },
        switches: card.querySelectorAll("[role=switch]").length,
        visible: getComputedStyle(card).display !== "none" && getComputedStyle(card).visibility !== "hidden",
      };
    })(),
  }));
  verify("Actions implementation ids", state.ids.length === 12 && state.ids.includes("click_purr") && state.ids.includes("milestone_celebrate"), `Actions exposes 12 stable actor-state ids`);
  verify("Actions ready assets", state.disabled.length === 0 && state.brokenImages === 0, "all displayed Golden British actor states are enabled and have loaded thumbnails");
  verify(
    "Actions run_across controls are ready",
    state.runAcrossControls.length >= 2
      && state.runAcrossControls.every((control) => !control.disabled && control.width > 0 && control.height > 0),
    `found ${state.runAcrossControls.length} enabled visible run_across controls: ${JSON.stringify(state.runAcrossControls)}`,
  );
  verify(
    "Actions Safety is visible at 1280×900",
    state.safety
      && state.safety.visible
      && state.safety.switches >= 4
      && rectContained(state.safety.rect, state.safety.viewport),
    `Safety ${JSON.stringify(state.safety)}`,
  );
  report.actionsViewportContract = { runAcrossControls: state.runAcrossControls, safety: state.safety };
  await verifyNoHorizontalOverflow(window, "Actions");
  await capture(window, "console-actions.png", "Console / Actions");
  const desktopStates = [];
  for (const actionId of coreActorStateIds) {
    await click(window, `[data-actor-state=${actionId}]`, `Actions ${actionId}`);
    const classification = await waitForDesktopActorState(desktopPet, actionId);
    desktopStates.push({ actionId, classification });
  }
  report.actionDesktopMatrix = desktopStates;
  verify(
    "Actions drive the desktop actor",
    desktopStates.length === coreActorStateIds.length
      && desktopStates.every(({ actionId, classification }) => classification?.best?.actionId === actionId),
    "all 12 Console actor-state controls render their matching approved frame in the separate desktop PetApp window",
  );
  await waitFor(window, () => window.tokenpet.getScreenshotQaState().then((state) => ["click_purr", "drag_dangle", "token_snack", "play_cursor"].every((id) => state.qaState.actions.includes(id))), [], "Actions shared Quick Play dispatches");

  await delay(1_800);
  await click(window, "[data-actor-state=focus_loop]", "Actions focus_loop return baseline");
  await waitForDesktopActorState(desktopPet, "focus_loop");
  await click(window, "[data-actor-state=click_purr]", "Actions click_purr one-shot lifecycle");
  await waitForDesktopActorState(desktopPet, "click_purr");
  await delay(1_300);
  const clickReturn = await waitForDesktopActorState(desktopPet, "sleep_loop");
  verify("Actions one-shot returns on desktop", clickReturn?.best?.actionId === "sleep_loop", "click_purr visibly plays in the desktop PetApp and then returns to the director-selected nighttime loop");

  await click(window, "[data-actor-state=overdrive_loop]", "Actions overdrive bounded lifecycle");
  await waitForDesktopActorState(desktopPet, "overdrive_loop");
  await delay(3_000);
  const overdriveReturn = await waitForDesktopActorState(desktopPet, "sleep_loop");
  verify("Actions overdrive is time-bounded on desktop", overdriveReturn?.best?.actionId === "sleep_loop", "the intense overdrive state exits back to the director-selected nighttime loop instead of becoming permanent");

  const beforeToggle = await qaStateFor(window);
  expectedReduceMotion = !beforeToggle.settings.petStory.reduceMotion;
  await clickButtonWithText(window, "Reduce motion", ".actions-safety-card");
  await waitFor(window, (expected) => window.tokenpet.getScreenshotQaState().then((state) => state.settings.petStory.reduceMotion === expected), [expectedReduceMotion], "Reduce motion persistence");
  record("Actions reduce motion", "Reduce motion changes persisted story settings");
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

  window.webContents.send("qa:navigate-console", "overview");
  await waitForSelector(window, "[data-console-tab=overview].active");
  window.webContents.send("qa:navigate-console", "pet");
  await waitForSelector(window, "[data-console-tab=pet].active");
  await waitForSelector(window, "[data-pet-page=appearance]");
  record("Console IPC navigation", "an existing Console window accepts navigation back to the Pet section");

  await selectPetSection(window, "actions");
  const persisted = await evaluate(window, () => ({
    reduceMotion: [...document.querySelectorAll(".actions-safety-card [role=switch]")].find((button) => button.textContent.includes("Reduce motion"))?.getAttribute("aria-checked"),
  }));
  verify("Console settings survive section remount", persisted.reduceMotion === String(expectedReduceMotion), "Reduce motion remains selected after navigating away and back");
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
  verify("Quick Play summon command", finalState.actions.includes("summon_to_pointer"), "Summon dispatched the v18 stable pointer-target action id");
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
