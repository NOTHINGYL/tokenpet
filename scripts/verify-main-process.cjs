const { app, BrowserWindow, nativeImage, screen } = require("electron");
const assert = require("node:assert/strict");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = join(__dirname, "..");
const reportPath = join(root, "docs", "screenshots", "pet-story", "main-process-qa.json");
const temporaryRoot = mkdtempSync(join(tmpdir(), "tokenpet-main-process-qa-"));
const userDataPath = join(temporaryRoot, "user-data");
const picturesPath = join(temporaryRoot, "pictures");
const capturePath = join(picturesPath, "TokenPet-main-process-qa.png");
const goldenActorRoot = join(root, "apps", "desktop", "public", "pet-actors", "golden-british");
const goldenActorManifest = JSON.parse(readFileSync(join(goldenActorRoot, "actor.json"), "utf8"));

mkdirSync(userDataPath, { recursive: true });
mkdirSync(picturesPath, { recursive: true });
writeFileSync(join(userDataPath, "settings.json"), `${JSON.stringify({ petVisible: false }, null, 2)}\n`);
process.env.TOKENPET_MAIN_PROCESS_QA = "1";
process.env.TOKENPET_MAIN_PROCESS_QA_CAPTURE_PATH = capturePath;
process.env.HOME = temporaryRoot;
process.env.XDG_CONFIG_HOME = join(temporaryRoot, "config");
app.setPath("userData", userDataPath);
app.setPath("pictures", picturesPath);
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

const report = {
  generatedAt: new Date().toISOString(),
  environment: "isolated temporary userData seeded with petVisible=false to verify launch migration; local usage loading disabled",
  checks: [],
  failure: null,
};

function record(name, detail) {
  report.checks.push({ name, detail });
  console.log(`[main-qa ${report.checks.length}] ${name}`);
}

function verify(name, condition, detail) {
  assert.ok(condition, `${name}: ${detail}`);
  record(name, detail);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(callback, label, timeoutMs = 15_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await callback();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

function isUsable(window) {
  return Boolean(window && !window.isDestroyed() && !window.webContents.isCrashed());
}

async function execute(window, source) {
  assert.ok(isUsable(window), "cannot execute against a missing, destroyed, or crashed BrowserWindow");
  return window.webContents.executeJavaScript(source, true);
}

async function waitForDom(window, selector, timeoutMs = 20_000) {
  return waitFor(
    async () => isUsable(window) && await execute(window, `Boolean(document.querySelector(${JSON.stringify(selector)}))`),
    selector,
    timeoutMs,
  );
}

async function waitForActor(window) {
  await waitForDom(window, ".pet-generated-actor-canvas-root.is-ready", 25_000);
  await waitFor(
    () => execute(window, `(() => {
      const canvas = document.querySelector('.pet-generated-actor-canvas');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return false;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 3; index < pixels.length; index += 2048) if (pixels[index] > 0) return true;
      return false;
    })()`),
    "non-empty actor pixels",
    25_000,
  );
}

async function click(window, selector) {
  const clicked = await execute(window, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert.equal(clicked, true, `click target is unavailable: ${selector}`);
}

async function doubleClickPet(petWindow) {
  const dispatched = await execute(petWindow, `(() => {
    const stage = document.querySelector('.pet-stage');
    if (!stage) return false;
    stage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    return true;
  })()`);
  assert.equal(dispatched, true, "desktop pet did not accept a double-click");
}

function safeWindow(qa, kind) {
  const window = qa.getWindow(kind);
  return qa.isWindowUsable(window) ? window : null;
}

async function forceRendererCrash(window, label) {
  const rendererGone = new Promise((resolve) => {
    window.webContents.once("render-process-gone", (_event, details) => resolve(details));
  });
  window.webContents.forcefullyCrashRenderer();
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out waiting for ${label} render-process-gone`)), 15_000));
  return Promise.race([rendererGone, timeout]);
}

async function waitForWindow(qa, kind, previousId = null) {
  return waitFor(() => {
    const window = safeWindow(qa, kind);
    return window && window.id !== previousId ? window : null;
  }, `${kind} BrowserWindow`);
}

async function waitForClosed(qa, kind) {
  await waitFor(() => {
    const window = qa.getWindow(kind);
    return !window || window.isDestroyed();
  }, `${kind} BrowserWindow to close`);
}

function boundsFitWorkArea(bounds, workArea) {
  return bounds.x >= workArea.x
    && bounds.y >= workArea.y
    && bounds.x + bounds.width <= workArea.x + workArea.width
    && bounds.y + bounds.height <= workArea.y + workArea.height;
}

function rectanglesOverlap(left, right) {
  return Math.min(left.x + left.width, right.x + right.width) > Math.max(left.x, right.x)
    && Math.min(left.y + left.height, right.y + right.height) > Math.max(left.y, right.y);
}

function rectangleClearance(left, right) {
  const horizontal = Math.max(left.x - (right.x + right.width), right.x - (left.x + left.width), 0);
  const vertical = Math.max(left.y - (right.y + right.height), right.y - (left.y + left.height), 0);
  return Math.hypot(horizontal, vertical);
}

function pointDistanceFromRect(x, y, rect, scale = { x: 1, y: 1 }) {
  const dx = x < rect.x ? rect.x - x : x > rect.x + rect.width ? x - rect.x - rect.width : 0;
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.height ? y - rect.y - rect.height : 0;
  return Math.hypot(dx * scale.x, dy * scale.y);
}

function readFrameAlphaGeometry(frame, badgeRect, closeRect, artboardToDomScale) {
  const image = nativeImage.createFromPath(join(goldenActorRoot, frame.src));
  assert.equal(image.isEmpty(), false, `actor frame is missing or invalid: ${frame.src}`);
  const { width, height } = image.getSize();
  const bitmap = image.toBitmap({ scaleFactor: 1 });
  assert.equal(bitmap.length, width * height * 4, `unexpected bitmap stride for ${frame.src}`);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixels = 0;
  let badgeOverlapPixels = 0;
  let closeOverlapPixels = 0;
  let badgeDistance = Number.POSITIVE_INFINITY;
  let closeDistance = Number.POSITIVE_INFINITY;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = bitmap[(y * width + x) * 4 + 3];
      if (alpha < 12) continue;
      opaquePixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const badgePixelDistance = pointDistanceFromRect(x + 0.5, y + 0.5, badgeRect, artboardToDomScale);
      const closePixelDistance = pointDistanceFromRect(x + 0.5, y + 0.5, closeRect, artboardToDomScale);
      if (badgePixelDistance === 0) badgeOverlapPixels += 1;
      if (closePixelDistance === 0) closeOverlapPixels += 1;
      badgeDistance = Math.min(badgeDistance, badgePixelDistance);
      closeDistance = Math.min(closeDistance, closePixelDistance);
    }
  }
  assert.ok(opaquePixels > 0, `actor frame has no visible pixels: ${frame.src}`);
  return {
    id: frame.id,
    src: frame.src,
    alphaBounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    opaquePixels,
    badgeOverlapPixels,
    closeOverlapPixels,
    badgeDistance,
    closeDistance,
  };
}

async function setPetSize(petWindow, size) {
  await execute(petWindow, `window.tokenpet.getAppSettings().then((settings) => window.tokenpet.setAppSetting('petAppearance', {
    ...settings.petAppearance,
    size: ${JSON.stringify(size)},
  }))`);
  await waitFor(
    () => execute(petWindow, `Number(document.querySelector('.pet-generated-actor-shell')?.dataset.petSize) === ${JSON.stringify(size)}`),
    `pet size ${size}`,
  );
  await delay(260);
}

async function readPetChromeLayout(petWindow, actionId) {
  const dom = await execute(petWindow, `(() => {
    const shell = document.querySelector('.pet-generated-actor-shell');
    const actor = document.querySelector('.pet-generated-actor-canvas-root');
    const close = document.querySelector('.pet-close');
    if (!shell || !actor || !close) return null;
    const actorRect = actor.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    return {
      size: Number(shell.dataset.petSize),
      actor: { left: actorRect.left, top: actorRect.top, width: actorRect.width, height: actorRect.height },
      close: { left: closeRect.left, top: closeRect.top, width: closeRect.width, height: closeRect.height },
      moodY: Number(shell.dataset.moodBadgeY),
      moodHeight: Number(shell.dataset.moodBadgeHeight),
    };
  })()`);
  if (!dom) return null;

  const animation = goldenActorManifest.animations[`action.${actionId}`];
  assert.ok(animation?.frames?.length, `missing Golden British action animation: ${actionId}`);
  const uniqueFrames = Array.from(new Map(animation.frames.map((frame) => [frame.src, frame])).values());
  const artboard = goldenActorManifest.artboard;
  const moodSlot = goldenActorManifest.moodBadgeSlot ?? goldenActorManifest.dynamicSlots.moodBadge;
  const badgeRect = {
    x: moodSlot.x,
    y: dom.moodY,
    width: moodSlot.width,
    height: dom.moodHeight,
  };
  const domToArtboardScale = {
    x: artboard.width / dom.actor.width,
    y: artboard.height / dom.actor.height,
  };
  const closeRect = {
    x: (dom.close.left - dom.actor.left) * domToArtboardScale.x,
    y: (dom.close.top - dom.actor.top) * domToArtboardScale.y,
    width: dom.close.width * domToArtboardScale.x,
    height: dom.close.height * domToArtboardScale.y,
  };
  const artboardToDomScale = {
    x: dom.actor.width / artboard.width,
    y: dom.actor.height / artboard.height,
  };
  const frames = uniqueFrames.map((frame) => {
    const geometry = readFrameAlphaGeometry(frame, badgeRect, closeRect, artboardToDomScale);
    return {
      id: geometry.id,
      src: geometry.src,
      alphaBounds: geometry.alphaBounds,
      opaquePixels: geometry.opaquePixels,
      badgeOverlapPixels: geometry.badgeOverlapPixels,
      closeOverlapPixels: geometry.closeOverlapPixels,
      badgeDistancePx: Math.round(geometry.badgeDistance * 100) / 100,
      closeDistancePx: Math.round(geometry.closeDistance * 100) / 100,
    };
  });
  return {
    actionId,
    size: dom.size,
    actor: dom.actor,
    close: dom.close,
    moodY: dom.moodY,
    moodHeight: dom.moodHeight,
    frames,
    maxBadgeDistancePx: Math.max(...frames.map((frame) => frame.badgeDistancePx)),
    maxCloseDistancePx: Math.max(...frames.map((frame) => frame.closeDistancePx)),
  };
}

async function run() {
  const moduleUrl = `${pathToFileURL(join(root, "dist-electron", "main.js")).href}?qa=${Date.now()}`;
  const main = await import(moduleUrl);
  await main.tokenPetReady;
  const qa = main.mainProcessQa;
  verify("main-process QA guard", qa.enabled === true, "production main is running through the explicit QA environment guard");
  const trayIcon = qa.getTrayIconInfo();
  verify(
    "Menu bar pet icon is launch-ready",
    !trayIcon.empty && trayIcon.size.width > 0 && trayIcon.size.height > 0 && !trayIcon.template,
    `icon ${trayIcon.size.width}×${trayIcon.size.height}; template=${trayIcon.template}`,
  );

  let pet = await waitForWindow(qa, "pet");
  await waitForDom(pet, ".pet-stage");
  await waitForActor(pet);
  await waitFor(() => pet.isVisible(), "default pet visibility");
  const launchSettingsOnDisk = JSON.parse(readFileSync(join(userDataPath, "settings.json"), "utf8"));
  verify(
    "Launch always reveals the pet",
    qa.getSettings().petVisible === true && launchSettingsOnDisk.petVisible === true && pet.isVisible(),
    "a stored petVisible=false is reset to visible for every new app launch",
  );
  verify(
    "Pet is attached only to the current workspace",
    process.platform !== "darwin" || (!pet.isVisibleOnAllWorkspaces() && qa.getWorkspaceRehomeCount() >= 1),
    `visibleOnAllWorkspaces=${pet.isVisibleOnAllWorkspaces()}; workspace rehomes=${qa.getWorkspaceRehomeCount()}`,
  );
  const launchPetId = pet.id;
  const launchRehomesBeforeSecondInstance = qa.getWorkspaceRehomeCount();
  qa.simulateSecondInstanceLaunch();
  verify(
    "Second launch reuses the current-space pet",
    safeWindow(qa, "pet")?.id === launchPetId
      && qa.getSettings().petVisible
      && qa.getWorkspaceRehomeCount() > launchRehomesBeforeSecondInstance
      && (process.platform !== "darwin" || !pet.isVisibleOnAllWorkspaces()),
    "a second launch reveals and re-homes the existing BrowserWindow instead of creating another pet instance",
  );
  const bridgeReady = await execute(pet, "Boolean(window.tokenpet?.togglePopover && window.tokenpet?.close)");
  verify("actual pet preload bridge", bridgeReady, "the real preload exposes pet window controls");

  await doubleClickPet(pet);
  let popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "[data-testid=quick-play-panel]");
  await waitFor(() => popover.isVisible(), "captured-pixel-positioned Quick Play visibility");
  verify("double-click opens independent clean Quick Play", popover.getParentWindow() === null && popover.hasShadow() === false, `created independent shadowless BrowserWindow ${popover.id}`);
  let visiblePetBounds = qa.getPetPopoverAnchorBounds();
  verify(
    "Quick Play initially avoids pet",
    visiblePetBounds
      && !rectanglesOverlap(visiblePetBounds, popover.getBounds())
      && rectangleClearance(visiblePetBounds, popover.getBounds()) >= 6,
    `independent panel opens with ${rectangleClearance(visiblePetBounds, popover.getBounds())}px clearance from visible pet bounds`,
  );
  const initialPopoverBounds = popover.getBounds();

  const petDisplayWorkArea = screen.getDisplayMatching(pet.getBounds()).workArea;
  const centeredPetBounds = {
    ...pet.getBounds(),
    x: petDisplayWorkArea.x + Math.round((petDisplayWorkArea.width - pet.getBounds().width) / 2),
    y: petDisplayWorkArea.y + Math.round((petDisplayWorkArea.height - pet.getBounds().height) / 2),
  };
  pet.setBounds(centeredPetBounds, false);
  await waitFor(() => {
    visiblePetBounds = qa.getPetPopoverAnchorBounds();
    return visiblePetBounds
      && JSON.stringify(popover.getBounds()) !== JSON.stringify(initialPopoverBounds)
      && !rectanglesOverlap(visiblePetBounds, popover.getBounds());
  }, "Quick Play dynamic pet avoidance");
  verify(
    "Quick Play dynamically avoids centered pet",
    boundsFitWorkArea(popover.getBounds(), petDisplayWorkArea)
      && !rectanglesOverlap(visiblePetBounds, popover.getBounds())
      && rectangleClearance(visiblePetBounds, popover.getBounds()) >= 6,
    `pet window ${JSON.stringify(pet.getBounds())}; visible pet ${JSON.stringify(visiblePetBounds)}; panel ${JSON.stringify(popover.getBounds())}`,
  );

  const unlockedStory = qa.getSettings().petStory;
  qa.setSetting("petStory", { ...unlockedStory, lockPosition: true });
  const lockedDispatch = await execute(popover, "window.tokenpet.dispatchPetAction('walk_round_trip')");
  verify("Quick Play native lock gate", lockedDispatch.accepted === false && lockedDispatch.reason === "locked" && qa.getQuickPlaySession().activeAction === null, "main process rejects movement actions while Lock position is enabled");
  qa.setSetting("petStory", { ...qa.getSettings().petStory, lockPosition: false });

  const acceptedCursor = await execute(popover, "window.tokenpet.dispatchPetAction('play_cursor')");
  const rejectedWake = await execute(popover, "window.tokenpet.dispatchPetAction('wake_up')");
  verify("Quick Play native action mutex", acceptedCursor.accepted && rejectedWake.accepted === false && rejectedWake.reason === "active" && qa.getQuickPlaySession().activeAction === "play_cursor", "main process atomically accepts one exclusive action and rejects queued actions");
  await doubleClickPet(pet);
  await waitForClosed(qa, "popover");
  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "[data-testid=quick-play-panel]");
  const reopenedSession = await execute(popover, "window.tokenpet.getQuickPlaySession()");
  verify("Quick Play reopening preserves action", reopenedSession.activeAction === "play_cursor", "closing and reopening the panel does not cancel the active action");
  qa.finishQuickPlaySession();

  await doubleClickPet(pet);
  await waitForClosed(qa, "popover");
  verify("double-click closes Quick Play", pet.isVisible(), "second double-click closes only the independent panel");

  const settingsBeforeClose = JSON.stringify(qa.getSettings());
  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "button[aria-label='Close Quick Play']");
  await click(popover, "button[aria-label='Close Quick Play']");
  await waitForClosed(qa, "popover");
  verify(
    "Quick Play X closes only panel",
    pet.isVisible() && qa.getSettings().petVisible && JSON.stringify(qa.getSettings()) === settingsBeforeClose,
    "pet stays visible and settings are unchanged",
  );

  const petStoryBeforeConsole = JSON.stringify(qa.getSettings().petStory);
  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, ".open-console");
  await click(popover, ".open-console");
  let consoleWindow = await waitForWindow(qa, "console");
  await waitForDom(consoleWindow, "[data-console-tab=pet].active");
  await waitForDom(consoleWindow, "[data-pet-page=appearance]");
  verify("Open Console routes to Pet", !consoleWindow.webContents.isCrashed(), "real Console renderer opened Pet without crashing");
  verify("Open Console preserves pet state", JSON.stringify(qa.getSettings().petStory) === petStoryBeforeConsole, "opening Console did not dispatch or persist a pet action");
  await waitFor(() => consoleWindow.isVisible() && !consoleWindow.isMinimized(), "Console visible state", 5_000);
  verify("Open Console shows window", consoleWindow.isVisible() && !consoleWindow.isMinimized(), "new Console is visible and available without relying on macOS foreground focus arbitration");

  consoleWindow.minimize();
  await waitFor(() => consoleWindow.isMinimized(), "Console minimize");
  qa.openConsole("pet");
  await waitFor(() => !consoleWindow.isMinimized() && consoleWindow.isVisible(), "Console restore/show", 5_000);
  verify("Open Console restores existing window", safeWindow(qa, "console")?.id === consoleWindow.id, "existing Console was restored and shown instead of duplicated");

  const crashedConsoleId = consoleWindow.id;
  await forceRendererCrash(consoleWindow, "Console");
  qa.openConsole("pet");
  consoleWindow = await waitForWindow(qa, "console", crashedConsoleId);
  await waitForDom(consoleWindow, "[data-console-tab=pet].active");
  await waitForDom(consoleWindow, "[data-pet-page=appearance]");
  verify("Console crash self-heals", !consoleWindow.webContents.isCrashed(), `crashed window ${crashedConsoleId} was replaced by ${consoleWindow.id}`);

  await click(consoleWindow, "[data-pet-section=actions]");
  await waitForDom(consoleWindow, "[data-pet-page=actions]");
  await waitForDom(consoleWindow, "[data-action-preview] .pet-generated-actor-canvas-root.is-ready");
  const actionWorkbench = await execute(consoleWindow, `(() => ({
    ids: [...document.querySelectorAll('[data-action-selector] [data-action-id]')].map((button) => button.dataset.actionId),
    selected: document.querySelector('.actions-workbench-page')?.dataset.selectedAction,
    previewOnly: document.querySelector('[data-preview-only]')?.textContent?.trim(),
    footer: document.querySelector('[data-actions-footer]')?.textContent?.trim(),
    actorId: document.querySelector('[data-action-preview] [data-actor-id]')?.dataset.actorId,
    captureCount: document.querySelectorAll('[data-action-id=capture_moment]').length,
  }))()`);
  verify(
    "Console Actions v19 workbench is interactive",
    JSON.stringify(actionWorkbench.ids) === JSON.stringify(["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "summon_to_pointer"])
      && actionWorkbench.selected === "token_snack"
      && actionWorkbench.previewOnly === "Preview only"
      && actionWorkbench.footer === "Preview changes apply instantly. Your desktop pet stays still."
      && actionWorkbench.actorId === "golden-british"
      && actionWorkbench.captureCount === 0,
    `the exact eight-action isolated workbench uses the shared generated actor: ${JSON.stringify(actionWorkbench)}`,
  );

  qa.setSetting("petVisible", true);
  pet = await waitForWindow(qa, "pet");
  await waitForDom(pet, ".pet-stage");
  await execute(pet, "window.tokenpet.setAppSetting('alwaysOnTop', false)");
  await waitFor(() => !qa.getSettings().alwaysOnTop && !pet.isAlwaysOnTop(), "Always on top off");
  await execute(pet, "window.tokenpet.setAppSetting('alwaysOnTop', true)");
  await waitFor(() => qa.getSettings().alwaysOnTop && pet.isAlwaysOnTop(), "Always on top on");
  verify("Always on top control", pet.isAlwaysOnTop(), "real setting updates the desktop BrowserWindow level");

  const actionIsolationBefore = {
    bounds: pet.getBounds(),
    lastAction: qa.getSettings().petStory.lastAction,
    settingsFile: readFileSync(join(userDataPath, "settings.json"), "utf8"),
  };
  await click(consoleWindow, "[data-action-id=walk_round_trip]");
  await click(consoleWindow, "[data-action-play]");
  await click(consoleWindow, "[data-action-restart]");
  await execute(consoleWindow, `(() => {
    const scrubber = document.querySelector('[data-action-scrubber]');
    scrubber.value = String(Number(scrubber.max) * .64);
    scrubber.dispatchEvent(new Event('input', { bubbles: true }));
    scrubber.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await click(consoleWindow, "[data-action-loop]");
  await delay(220);
  const actionIsolationAfter = {
    bounds: pet.getBounds(),
    lastAction: qa.getSettings().petStory.lastAction,
    settingsFile: readFileSync(join(userDataPath, "settings.json"), "utf8"),
  };
  verify(
    "Console Actions preview is isolated from desktop Pet",
    JSON.stringify(actionIsolationAfter) === JSON.stringify(actionIsolationBefore),
    `select, pause, restart, scrub, and loop leave BrowserWindow bounds and persisted PetDirector state untouched: ${JSON.stringify(actionIsolationAfter)}`,
  );

  await setPetSize(pet, 0.75);
  const hotActionRequest = { id: "hot_loop", nonce: Date.now() };
  qa.setSetting("petStory", { ...qa.getSettings().petStory, lastAction: hotActionRequest });
  await waitFor(() => qa.getSettings().petStory.lastAction?.nonce === hotActionRequest.nonce, "hot_loop action request");
  await delay(180);
  const smallHotChrome = await readPetChromeLayout(pet, "hot_loop");

  await setPetSize(pet, 1.25);
  const idleActionRequest = { id: "idle_breathe", nonce: Date.now() + 1 };
  qa.setSetting("petStory", { ...qa.getSettings().petStory, lastAction: idleActionRequest });
  await waitFor(() => qa.getSettings().petStory.lastAction?.nonce === idleActionRequest.nonce, "idle_breathe action request");
  await delay(180);
  const largeIdleChrome = await readPetChromeLayout(pet, "idle_breathe");
  verify(
    "Desktop mood badge and close follow real action alpha",
    hotActionRequest.id === "hot_loop"
      && idleActionRequest.id === "idle_breathe"
      && smallHotChrome
      && largeIdleChrome
      && smallHotChrome.frames.every((frame) => frame.badgeOverlapPixels === 0 && frame.closeOverlapPixels === 0)
      && largeIdleChrome.frames.every((frame) => frame.badgeOverlapPixels === 0 && frame.closeOverlapPixels === 0)
      && smallHotChrome.maxBadgeDistancePx <= 18
      && largeIdleChrome.maxBadgeDistancePx <= 18
      && smallHotChrome.maxCloseDistancePx <= 36
      && largeIdleChrome.maxCloseDistancePx <= 36
      && largeIdleChrome.actor.width > smallHotChrome.actor.width
      && largeIdleChrome.close.left > smallHotChrome.close.left
      && largeIdleChrome.close.top < smallHotChrome.close.top
      && largeIdleChrome.close.width > smallHotChrome.close.width,
    `small hot ${JSON.stringify(smallHotChrome)}; large idle ${JSON.stringify(largeIdleChrome)}`,
  );
  await setPetSize(pet, 1);

  await execute(pet, `window.tokenpet.getAppSettings().then((settings) => window.tokenpet.setAppSetting('petStory', {
    ...settings.petStory,
    followCursor: true,
    lockPosition: true,
  }))`);
  await waitFor(() => qa.getSettings().petStory.followCursor && qa.getSettings().petStory.lockPosition, "Follow/Lock settings");
  const lockedDrag = await execute(pet, "window.tokenpet.startDrag()");
  verify("Lock position blocks main-process drag", lockedDrag.started === false, "main IPC rejects drag even if renderer code is bypassed");
  const lockedTraversalBounds = pet.getBounds();
  const lockedTraversal = await execute(pet, "window.tokenpet.traversePet()");
  verify(
    "Lock position blocks native traversal",
    lockedTraversal.moved === false && lockedTraversal.canceled === true && JSON.stringify(pet.getBounds()) === JSON.stringify(lockedTraversalBounds),
    "run_across cannot move the BrowserWindow while Lock position is enabled",
  );

  const cursorEvent = await execute(pet, `new Promise((resolve) => {
    let unsubscribe = () => undefined;
    const timeout = setTimeout(() => { unsubscribe(); resolve(null); }, 1500);
    unsubscribe = window.tokenpet.onCursorPosition((position) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(position);
    });
  })`);
  verify("Follow cursor main-to-renderer IPC", Number.isFinite(cursorEvent?.x) && Number.isFinite(cursorEvent?.y), "enabled follow mode receives normalized cursor coordinates");

  await execute(pet, `window.tokenpet.getAppSettings().then((settings) => window.tokenpet.setAppSetting('petStory', {
    ...settings.petStory,
    lockPosition: false,
  }))`);
  const dragOrigin = pet.getBounds();
  const qaPointer = { x: dragOrigin.x + 80, y: dragOrigin.y + 80 };
  qa.setCursorPoint(qaPointer);
  const unlockedDrag = await execute(pet, "window.tokenpet.startDrag()");
  qa.setCursorPoint({ x: qaPointer.x + 37, y: qaPointer.y + 29 });
  await waitFor(() => {
    const bounds = pet.getBounds();
    return bounds.x === dragOrigin.x + 37 && bounds.y === dragOrigin.y + 29;
  }, "main-process drag movement");
  const endedDrag = await execute(pet, "window.tokenpet.endDrag()");
  qa.setCursorPoint(null);
  verify("Unlock position enables main-process drag", unlockedDrag.started === true && endedDrag.moved === true, "actual drag IPC moves and ends after the lock is disabled");
  const draggedBounds = pet.getBounds();
  const draggedPositionOnDisk = JSON.parse(readFileSync(join(userDataPath, "pet-position.json"), "utf8"));
  verify("Dragged position persists", JSON.stringify(draggedPositionOnDisk) === JSON.stringify(draggedBounds), "the real drag end writes clamped desktop bounds to isolated userData");

  const traversalWorkArea = screen.getDisplayMatching(pet.getBounds()).workArea;
  const leftTraversalBounds = {
    ...pet.getBounds(),
    x: traversalWorkArea.x + 24,
    y: traversalWorkArea.y + Math.round((traversalWorkArea.height - pet.getBounds().height) / 2),
  };

  pet.setBounds(leftTraversalBounds, false);
  const normalTraversalStartedAt = Date.now();
  const normalTraversalPromise = qa.traversePetAcrossWorkArea();
  await waitFor(() => pet.getBounds().x > leftTraversalBounds.x + 30, "native traversal intermediate movement");
  const traversalMidpoint = pet.getBounds();
  verify(
    "Console traversal moves real intermediate bounds",
    traversalMidpoint.x > leftTraversalBounds.x && boundsFitWorkArea(traversalMidpoint, traversalWorkArea),
    `pet moved from ${JSON.stringify(leftTraversalBounds)} to intermediate ${JSON.stringify(traversalMidpoint)}`,
  );
  const expectedTraversalTargetX = traversalWorkArea.x + traversalWorkArea.width - leftTraversalBounds.width - 24;
  await waitFor(() => {
    const bounds = pet.getBounds();
    return bounds.x === expectedTraversalTargetX && bounds.y === leftTraversalBounds.y;
  }, "Console-triggered native traversal completion", 5_000);
  const normalTraversalResult = await normalTraversalPromise;
  const normalTraversalElapsed = Date.now() - normalTraversalStartedAt;
  const normalTraversalFinal = pet.getBounds();
  verify(
    "Native traversal remains available outside Actions preview",
    normalTraversalResult.moved === true
      && normalTraversalResult.canceled === false
      && normalTraversalElapsed >= 2_200
      && normalTraversalElapsed < 3_500
      && normalTraversalFinal.x > traversalMidpoint.x
      && normalTraversalFinal.x === expectedTraversalTargetX
      && boundsFitWorkArea(normalTraversalFinal, traversalWorkArea),
    `direct main-process traversal completed in ${normalTraversalElapsed}ms at ${JSON.stringify(normalTraversalFinal)} without coupling it to Console Actions`,
  );
  const traversalPositionPath = join(userDataPath, "pet-position.json");
  await waitFor(() => {
    if (!existsSync(traversalPositionPath)) return false;
    return JSON.stringify(JSON.parse(readFileSync(traversalPositionPath, "utf8"))) === JSON.stringify(normalTraversalFinal);
  }, "native traversal persistence flush");
  const traversalPositionOnDisk = JSON.parse(readFileSync(traversalPositionPath, "utf8"));
  verify("Native traversal persists final bounds", JSON.stringify(traversalPositionOnDisk) === JSON.stringify(normalTraversalFinal), "completed run_across writes the safe opposite-side position");
  qa.setSetting("petStory", { ...qa.getSettings().petStory, lastAction: null });

  qa.setSetting("petStory", { ...qa.getSettings().petStory, reduceMotion: true });
  pet.setBounds(leftTraversalBounds, false);
  const reducedTraversalStartedAt = Date.now();
  const reducedTraversal = await execute(pet, "window.tokenpet.traversePet()");
  const reducedTraversalElapsed = Date.now() - reducedTraversalStartedAt;
  const reducedTraversalFinal = pet.getBounds();
  verify(
    "Reduced Motion shortens native traversal",
    reducedTraversal.moved === true
      && reducedTraversal.canceled === false
      && reducedTraversalElapsed < 1_500
      && reducedTraversalFinal.x > leftTraversalBounds.x
      && reducedTraversalFinal.x < normalTraversalFinal.x
      && boundsFitWorkArea(reducedTraversalFinal, traversalWorkArea),
    `reduced traversal completed in ${reducedTraversalElapsed}ms at ${JSON.stringify(reducedTraversalFinal)}`,
  );

  qa.setSetting("petStory", { ...qa.getSettings().petStory, reduceMotion: false });
  pet.setBounds(leftTraversalBounds, false);
  const firstTraversal = qa.traversePetAcrossWorkArea();
  await waitFor(() => pet.getBounds().x > leftTraversalBounds.x + 10, "first traversal before replacement");
  qa.setSetting("petStory", { ...qa.getSettings().petStory, reduceMotion: true });
  const replacementTraversal = qa.traversePetAcrossWorkArea();
  const firstTraversalResult = await firstTraversal;
  const replacementTraversalResult = await replacementTraversal;
  verify(
    "New traversal cancels previous traversal",
    firstTraversalResult.canceled === true && replacementTraversalResult.moved === true && replacementTraversalResult.canceled === false,
    "the first promise resolves canceled before the replacement Reduced Motion traversal completes",
  );

  qa.setSetting("petStory", { ...qa.getSettings().petStory, reduceMotion: false });
  pet.setBounds(leftTraversalBounds, false);
  const dragCanceledTraversal = qa.traversePetAcrossWorkArea();
  await waitFor(() => pet.getBounds().x > leftTraversalBounds.x + 10, "traversal before drag cancellation");
  const traversalCancelingDrag = await execute(pet, "window.tokenpet.startDrag()");
  const dragCanceledTraversalResult = await dragCanceledTraversal;
  await execute(pet, "window.tokenpet.endDrag()");
  verify(
    "Drag cancels native traversal",
    traversalCancelingDrag.started === true && dragCanceledTraversalResult.canceled === true,
    "direct manipulation takes ownership from run_across",
  );

  const settingsOnDisk = JSON.parse(readFileSync(join(userDataPath, "settings.json"), "utf8"));
  verify(
    "Pet controls persist locally",
    settingsOnDisk.alwaysOnTop === true && settingsOnDisk.petStory.followCursor === true && settingsOnDisk.petStory.lockPosition === false,
    "Always on top, Follow cursor, and Lock position survive the settings write boundary",
  );

  const cursor = screen.getCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(cursor).workArea;
  pet.setBounds({ ...pet.getBounds(), x: workArea.x + workArea.width + 900, y: workArea.y + workArea.height + 900 }, false);
  const summonResult = await execute(pet, "window.tokenpet.summonPet()");
  const summonedBounds = pet.getBounds();
  const storedPosition = JSON.parse(readFileSync(join(userDataPath, "pet-position.json"), "utf8"));
  verify(
    "Summon uses visible safe bounds",
    summonResult.moved === true && boundsFitWorkArea(summonedBounds, workArea),
    `summoned to ${JSON.stringify(summonedBounds)} within ${JSON.stringify(workArea)}`,
  );
  verify("Summon persists position", JSON.stringify(storedPosition) === JSON.stringify(summonedBounds), "safe summoned bounds were written to isolated userData");

  await waitForActor(pet);
  const captureResult = await execute(pet, "window.tokenpet.capturePetMoment()");
  const png = existsSync(capturePath) ? readFileSync(capturePath) : Buffer.alloc(0);
  const capturedImage = nativeImage.createFromBuffer(png);
  verify(
    "Capture exports a real PNG",
    captureResult.saved === true
      && captureResult.filePath === capturePath
      && png.length > 8
      && png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      && !capturedImage.isEmpty(),
    `capturePage produced a valid ${capturedImage.getSize().width}×${capturedImage.getSize().height} PNG`,
  );
  const closeVisibility = await execute(pet, "document.querySelector('.pet-close')?.style.visibility ?? null");
  verify("Capture restores pet chrome", closeVisibility === "", "the hidden close control is restored after capture");

  const petIdBeforeHide = pet.id;
  const workspaceRehomesBeforeRestore = qa.getWorkspaceRehomeCount();
  const hideTraversalStartX = pet.getBounds().x;
  const hideCanceledTraversal = qa.traversePetAcrossWorkArea();
  await waitFor(() => pet.getBounds().x !== hideTraversalStartX, "traversal before hide cancellation");
  await click(pet, ".pet-close");
  const hideCanceledTraversalResult = await hideCanceledTraversal;
  await waitFor(() => !qa.getSettings().petVisible && !pet.isVisible(), "pet hide");
  verify(
    "Pet X hides without quitting and cancels traversal",
    hideCanceledTraversalResult.canceled === true && !pet.isDestroyed() && safeWindow(qa, "console") !== null,
    "hide stops run_across, keeps the pet BrowserWindow alive, and leaves Console running",
  );
  await execute(consoleWindow, "window.tokenpet.setAppSetting('petVisible', true)");
  await waitFor(() => qa.getSettings().petVisible && pet.isVisible(), "pet restore");
  verify(
    "Hidden pet restores on the current workspace",
    pet.id === petIdBeforeHide
      && pet.isVisible()
      && qa.getWorkspaceRehomeCount() > workspaceRehomesBeforeRestore
      && (process.platform !== "darwin" || !pet.isVisibleOnAllWorkspaces()),
    "Show pet reuses the hidden window, re-homes it to the active Space, and leaves all-Spaces mode disabled",
  );

  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "[data-testid=quick-play-panel]");
  const crashedPopoverId = popover.id;
  await forceRendererCrash(popover, "Quick Play");
  qa.togglePopover();
  popover = await waitForWindow(qa, "popover", crashedPopoverId);
  await waitForDom(popover, "[data-testid=quick-play-panel]");
  verify("Quick Play crash self-heals", popover.id !== crashedPopoverId, `crashed window ${crashedPopoverId} was replaced by ${popover.id}`);
  await click(popover, "button[aria-label='Close Quick Play']");
  await waitForClosed(qa, "popover");

  qa.toggleMenuBar();
  let menuBar = await waitForWindow(qa, "menubar");
  await waitForDom(menuBar, ".menubar-panel");
  const crashedMenuId = menuBar.id;
  await forceRendererCrash(menuBar, "Menu Bar");
  qa.toggleMenuBar();
  menuBar = await waitForWindow(qa, "menubar", crashedMenuId);
  await waitForDom(menuBar, ".menubar-panel");
  verify("Menu Bar crash self-heals", menuBar.id !== crashedMenuId, `crashed window ${crashedMenuId} was replaced by ${menuBar.id}`);
  qa.toggleMenuBar();
  await waitForClosed(qa, "menubar");

  const destroyedPetId = pet.id;
  const destroyTraversalStartX = pet.getBounds().x;
  const destroyCanceledTraversal = qa.traversePetAcrossWorkArea();
  await waitFor(() => pet.getBounds().x !== destroyTraversalStartX, "traversal before destroy cancellation");
  pet.destroy();
  const destroyCanceledTraversalResult = await destroyCanceledTraversal;
  qa.setSetting("petVisible", true);
  pet = await waitForWindow(qa, "pet", destroyedPetId);
  await waitForDom(pet, ".pet-stage");
  verify(
    "Pet destroy cancels traversal and recreates",
    destroyCanceledTraversalResult.canceled === true && pet.id !== destroyedPetId,
    `run_across stopped and destroyed window ${destroyedPetId} was replaced by ${pet.id}`,
  );

  const crashedPetId = pet.id;
  await forceRendererCrash(pet, "Pet");
  qa.setSetting("petVisible", true);
  pet = await waitForWindow(qa, "pet", crashedPetId);
  await waitForDom(pet, ".pet-stage");
  verify("Pet crash self-heals", pet.id !== crashedPetId, `crashed window ${crashedPetId} was replaced by ${pet.id}`);

  const quitTraversalStartX = pet.getBounds().x;
  const quitCanceledTraversal = qa.traversePetAcrossWorkArea();
  await waitFor(() => pet.getBounds().x !== quitTraversalStartX, "traversal before quit cancellation");
  qa.toggleMenuBar();
  menuBar = await waitForWindow(qa, "menubar");
  await waitForDom(menuBar, "button[aria-label='Quit TokenPet']");
  let quitRequests = 0;
  const preventQaQuit = (event) => {
    event.preventDefault();
    quitRequests += 1;
  };
  app.on("before-quit", preventQaQuit);
  await click(menuBar, "button[aria-label='Quit TokenPet']");
  const quitCanceledTraversalResult = await quitCanceledTraversal;
  await waitFor(() => quitRequests > 0, "Menu Bar quit request");
  await delay(100);
  app.removeListener("before-quit", preventQaQuit);
  verify(
    "Menu Bar X requests real app quit and cancels traversal",
    quitCanceledTraversalResult.canceled === true && quitRequests > 0,
    "the settings-adjacent X stopped run_across and reached app.quit; QA prevented final process exit only after observing before-quit",
  );

  mkdirSync(join(root, "docs", "screenshots", "pet-story"), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`TokenPet main-process QA: ${report.checks.length} checks passed.`);
}

function finish(exitCode) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  try {
    rmSync(temporaryRoot, { recursive: true, force: true });
  } catch {
    // The OS can clean an isolated QA directory if a renderer still releases a handle.
  }
  if (exitCode === 0) app.quit();
  else app.exit(exitCode);
}

run()
  .then(() => finish(0))
  .catch((error) => {
    report.failure = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
    mkdirSync(join(root, "docs", "screenshots", "pet-story"), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(error);
    finish(1);
  });
