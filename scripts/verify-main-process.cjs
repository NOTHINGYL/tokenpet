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
  quickPlayActions: [],
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
    !trayIcon.empty
      && trayIcon.size.width > 0
      && trayIcon.size.height > 0
      && !trayIcon.template
      && trayIcon.titleMode === "dynamic-token-count"
      && trayIcon.healthIntervalMs === 30_000
      && trayIcon.recoversAfterSystemChange,
    `icon ${trayIcon.size.width}×${trayIcon.size.height}; template=${trayIcon.template}; title=${trayIcon.titleMode}; health=${trayIcon.healthIntervalMs}ms`,
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

  // The headless QA app cannot become the active macOS application, so native
  // focus transfer is intentionally unavailable here. Emit the same
  // BrowserWindow event delivered by an outside click and verify the production
  // blur handler closes only this panel.
  popover.emit("blur");
  await waitForClosed(qa, "popover");
  verify("Quick Play closes on outside focus", pet.isVisible() && qa.getQuickPlaySession().activeAction === null, "losing focus closes only the panel and leaves the desktop pet/session state intact");

  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "[data-testid=quick-play-panel]");
  await doubleClickPet(pet);
  await waitForClosed(qa, "popover");
  verify("double-click closes Quick Play", pet.isVisible(), "second double-click closes only the independent panel");

  qa.setQuickPlayTimeScale(20);
  const quickPlaySummaries = report.quickPlayActions;
  const openQuickPlay = async () => {
    const existing = safeWindow(qa, "popover");
    if (existing) return existing;
    await doubleClickPet(pet);
    const opened = await waitForWindow(qa, "popover");
    await waitForDom(opened, "[data-testid=quick-play-panel]");
    return opened;
  };
  const waitForQuickPlayEnd = (action) => waitFor(
    () => qa.getQuickPlaySession().activeAction === null,
    `${action} Quick Play completion`,
    action === "walk_round_trip" || action === "token_snack" || action === "dance" ? 30_000 : 12_000,
  );
  const runClosedQuickPlayAction = async (action, placement = null) => {
    qa.resetQuickPlayTrace();
    const startBounds = pet.getBounds();
    const startAnimation = await execute(pet, "document.querySelector('[data-actor-animation]')?.dataset.actorAnimation ?? null");
    const panel = await openQuickPlay();
    await click(panel, `[data-action-id=${action}]`);
    await waitForClosed(qa, "popover");
    await waitFor(() => qa.getQuickPlaySession().activeAction === action, `${action} session acceptance`);
    let activeVisual = null;
    let activeVisualScreenshot = null;
    let returnVisual = null;
    let arrivalScreenshot = null;
    let biteScreenshot = null;
    let swallowScreenshot = null;
    let swallowOverlayScreenshot = null;
    let feedInteractionVisuals = [];
    let pickupVisual = null;
    let dropVisual = null;
    let pickupScreenshot = null;
    let dropScreenshot = null;
    const captureAuthoredWalkVisual = async (phase, screenshotName = null) => {
      await waitFor(() => qa.getQuickPlaySession().phase === phase, `${action} authored ${phase} phase`);
      const actorDirectionId = String(qa.getQuickPlaySession().actorDirection ?? "right").replaceAll("-", "_");
      const expectedAnimation = action === "token_snack"
        ? `action.feed_snack_${phase === "outbound" ? "walk_slow" : "return_run"}_${actorDirectionId}`
        : action === "toss_yarn"
          ? `action.toss_yarn_${phase === "outbound" ? "chase" : "carry"}_${String(qa.getQuickPlaySession().actorDirection ?? "right").replaceAll("-", "_")}`
          : `action.walk_round_trip_walk_${actorDirectionId}`;
      const expectedFramePrefix = expectedAnimation.slice("action.".length);
      await waitFor(() => execute(pet, `document.querySelector('[data-actor-animation]')?.dataset.actorAnimation === '${expectedAnimation}'`), `${action} ${phase} actor frames`);
      await waitFor(() => execute(pet, `(() => {
        const canvas = document.querySelector('.pet-generated-actor-canvas');
        return canvas?.dataset.actorFrame?.startsWith('${expectedFramePrefix}-')
          && canvas.dataset.actorFrame !== '${expectedFramePrefix}-1'
          && Number(canvas?.dataset.actorTimelineMs ?? 0) >= 100;
      })()`), `${action} ${phase} non-initial authored walk frame`);
      const visual = await execute(pet, `(() => {
        const actor = document.querySelector('[data-actor-animation]');
        const canvas = document.querySelector('.pet-generated-actor-canvas');
        const shell = document.querySelector('.pet-generated-actor-shell');
        const close = document.querySelector('.pet-close');
        return {
          animation: actor?.dataset.actorAnimation ?? null,
          variant: actor?.dataset.actorVariant ?? null,
          facing: actor?.dataset.actorFacing ?? null,
          mirrored: actor?.dataset.actorMirrored ?? null,
          frame: canvas?.dataset.actorFrame ?? null,
          timelineMs: Number(canvas?.dataset.actorTimelineMs ?? NaN),
          cycleDurationMs: Number(actor?.dataset.actorCycleDurationMs ?? NaN),
          startedAtMs: Number(actor?.dataset.actorStartedAtMs ?? NaN),
          tokenHidden: shell?.classList.contains('pet-token-hidden') ?? false,
          closeOpacity: close ? getComputedStyle(close).opacity : null,
        };
      })()`);
      visual.walkMotion = qa.getQuickPlaySession().walkMotion;
      visual.actorDirection = qa.getQuickPlaySession().actorDirection;
      if (screenshotName) {
        const screenshot = join(root, "docs", "screenshots", "pet-story", screenshotName);
        writeFileSync(screenshot, (await pet.webContents.capturePage()).toPNG());
        return { visual, screenshot };
      }
      return { visual, screenshot: null };
    };
    if (action === "walk_round_trip") {
      const capture = await captureAuthoredWalkVisual("outbound", "quick-play-pet-walk.png");
      activeVisual = capture.visual;
      activeVisualScreenshot = capture.screenshot;
    }
    let overlayBounds = null;
    let overlayScreenshot = null;
    if (placement) {
      const overlay = await waitForWindow(qa, "quickplayOverlay");
      await waitForDom(overlay, `[data-overlay-mode=${placement.mode}]`);
      await waitFor(() => execute(overlay, "[...document.images].every((image) => image.complete && image.naturalWidth > 0)"), `${placement.mode} overlay prop assets`);
      overlayBounds = overlay.getBounds();
      overlayScreenshot = join(root, "docs", "screenshots", "pet-story", `quick-play-${placement.mode}-overlay.png`);
      writeFileSync(overlayScreenshot, (await overlay.webContents.capturePage()).toPNG());
      verify(
        `${action} uses a full-screen pointer overlay`,
        JSON.stringify(overlayBounds) === JSON.stringify(screen.getDisplayNearestPoint(placement.point).workArea),
        `${placement.mode} overlay covers the active display work area ${JSON.stringify(overlayBounds)}`,
      );
      const acceptedOnce = qa.submitQuickPlayOverlayInput(placement.point) === true && qa.submitQuickPlayOverlayInput(placement.point) === false;
      const pointerRestored = !["token_snack", "toss_yarn"].includes(action) || await waitFor(
        () => execute(overlay, "getComputedStyle(document.querySelector('.quick-play-overlay')).cursor === 'default'"),
        `${action} system pointer restoration`,
      );
      verify(`${action} accepts exactly one placement`, acceptedOnce && pointerRestored, "the first placement resolves the native pointer promise, restores the system pointer for Feed/Toss Yarn, and a second placement cannot queue");
      if (action === "token_snack") {
        const capture = await captureAuthoredWalkVisual("outbound", "quick-play-feed-walk.png");
        activeVisual = capture.visual;
        activeVisualScreenshot = capture.screenshot;
        await waitFor(() => qa.getQuickPlaySession().phase === "arrive", "Feed Snack arrival phase");
        arrivalScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-feed-arrive.png");
        writeFileSync(arrivalScreenshot, (await pet.webContents.capturePage()).toPNG());
        const captureFeedInteraction = async (phase, stage, settleMs, screenshotName = null) => {
          await waitFor(() => qa.getQuickPlaySession().phase === phase, `Feed Snack ${phase} phase`);
          const actorDirectionId = String(qa.getQuickPlaySession().actorDirection ?? "right").replaceAll("-", "_");
          const expectedAnimation = `action.feed_snack_${phase}_${actorDirectionId}`;
          await waitFor(() => execute(pet, `document.querySelector('[data-actor-animation]')?.dataset.actorAnimation === '${expectedAnimation}'`), `Feed Snack ${phase} offline actor frames`);
          await delay(settleMs);
          const actor = await execute(pet, `(() => {
            const shell = document.querySelector('[data-actor-animation]');
            const canvas = document.querySelector('.pet-generated-actor-canvas');
            return { animation: shell?.dataset.actorAnimation ?? null, frame: canvas?.dataset.actorFrame ?? null };
          })()`);
          const prop = await execute(overlay, `(() => {
            const root = document.querySelector('.quick-overlay-snack-prop');
            const image = root?.querySelector('img');
            const style = image ? getComputedStyle(image) : null;
            return { stage: root?.dataset.snackStage ?? null, animation: style?.animationName ?? null, opacity: Number(style?.opacity ?? NaN), transform: style?.transform ?? null };
          })()`);
          const screenshot = screenshotName ? join(root, "docs", "screenshots", "pet-story", screenshotName) : null;
          if (screenshot) writeFileSync(screenshot, (await pet.webContents.capturePage()).toPNG());
          const visual = { phase, stage, actor, prop, screenshot };
          feedInteractionVisuals.push(visual);
          return visual;
        };
        await captureFeedInteraction("lick", "ground", 100);
        const biteVisual = await captureFeedInteraction("bite", "bite", 140, "quick-play-feed-bite.png");
        biteScreenshot = biteVisual.screenshot;
        await captureFeedInteraction("chew", "chew", 170);
        const swallowVisual = await captureFeedInteraction("swallow", "swallow", 260, "quick-play-feed-swallow.png");
        swallowScreenshot = swallowVisual.screenshot;
        swallowOverlayScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-feed-swallow-overlay.png");
        writeFileSync(swallowOverlayScreenshot, (await overlay.webContents.capturePage()).toPNG());
        returnVisual = (await captureAuthoredWalkVisual("return")).visual;
      }
      if (action === "toss_yarn") {
        await waitFor(
          () => !["awaiting-placement", "rolling"].includes(qa.getQuickPlaySession().phase),
          "Toss Yarn reaches its pinned roll endpoint",
        );
        const yarnEndpoint = qa.getQuickPlaySession().targetPoint;
        const endpointPinned = yarnEndpoint && await execute(overlay, `(() => {
          const prop = document.querySelector('.quick-overlay-yarn-prop');
          if (!prop?.classList.contains('is-resting')) return false;
          const style = getComputedStyle(prop);
          return Math.abs(parseFloat(style.left) - (${Number(yarnEndpoint?.x ?? 0)} - window.screenX)) < 1
            && Math.abs(parseFloat(style.top) - (${Number(yarnEndpoint?.y ?? 0)} - window.screenY)) < 1
            && style.animationName === 'none';
        })()`);
        verify(
          "Toss yarn remains at the computed straight-roll endpoint",
          endpointPinned === true,
          "the released overlay prop rests at the same X/Y target used by native cat locomotion instead of snapping back to the click origin",
        );
        const capture = await captureAuthoredWalkVisual("outbound", "quick-play-yarn-chase.png");
        activeVisual = capture.visual;
        activeVisualScreenshot = capture.screenshot;
        await waitFor(() => qa.getQuickPlaySession().phase === "pickup", "Toss Yarn pickup phase");
        const pickupOverlayClosed = await waitFor(
          () => safeWindow(qa, "quickplayOverlay") === null,
          "Toss Yarn single-prop pickup handoff",
        );
        verify(
          "Toss yarn hands one ball from overlay to pickup frames",
          pickupOverlayClosed,
          "the loose endpoint prop is removed before the baked pickup yarn becomes visible, preventing a duplicate desktop ball",
        );
        pickupVisual = await execute(pet, `(() => {
          const actor = document.querySelector('[data-actor-animation]');
          const canvas = document.querySelector('.pet-generated-actor-canvas');
          return { animation: actor?.dataset.actorAnimation ?? null, variant: actor?.dataset.actorVariant ?? null, frame: canvas?.dataset.actorFrame ?? null };
        })()`);
        pickupScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-yarn-pickup.png");
        writeFileSync(pickupScreenshot, (await pet.webContents.capturePage()).toPNG());
        returnVisual = (await captureAuthoredWalkVisual("carry", "quick-play-yarn-carry.png")).visual;
        await waitFor(() => qa.getQuickPlaySession().phase === "drop", "Toss Yarn drop phase");
        await waitFor(() => execute(pet, `/^toss_yarn_drop_.+-orange-[5-6]$/.test(document.querySelector('.pet-generated-actor-canvas')?.dataset.actorFrame ?? '')`), "Toss Yarn late drop keyframe");
        dropVisual = await execute(pet, `(() => {
          const actor = document.querySelector('[data-actor-animation]');
          const canvas = document.querySelector('.pet-generated-actor-canvas');
          return { animation: actor?.dataset.actorAnimation ?? null, variant: actor?.dataset.actorVariant ?? null, frame: canvas?.dataset.actorFrame ?? null };
        })()`);
        dropScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-yarn-drop.png");
        writeFileSync(dropScreenshot, (await pet.webContents.capturePage()).toPNG());
      }
    }
    if (action === "walk_round_trip") {
      returnVisual = (await captureAuthoredWalkVisual("return")).visual;
    }
    await waitForQuickPlayEnd(action);
    await delay(120);
    const endBounds = pet.getBounds();
    const endAnimation = await execute(pet, "document.querySelector('[data-actor-animation]')?.dataset.actorAnimation ?? null");
    const trace = qa.getQuickPlayTrace();
    quickPlaySummaries.push({ action, startBounds, endBounds, startAnimation, endAnimation, activeVisual, returnVisual, pickupVisual, dropVisual, activeVisualScreenshot, pickupScreenshot, dropScreenshot, arrivalScreenshot, biteScreenshot, swallowScreenshot, swallowOverlayScreenshot, feedInteractionVisuals, overlayBounds, overlayScreenshot, trace });
    return { startBounds, endBounds, startAnimation, endAnimation, activeVisual, returnVisual, pickupVisual, dropVisual, activeVisualScreenshot, pickupScreenshot, dropScreenshot, arrivalScreenshot, biteScreenshot, swallowScreenshot, swallowOverlayScreenshot, feedInteractionVisuals, trace };
  };

  qa.setQuickPlayTimeScale(1);
  const petRoundTrip = await runClosedQuickPlayAction("walk_round_trip");
  qa.setQuickPlayTimeScale(20);
  const petDestination = petRoundTrip.trace.find((entry) => entry.phase === "pause")?.bounds;
  const outboundPetBounds = petRoundTrip.trace.filter((entry) => entry.phase === "outbound" && entry.bounds).map((entry) => entry.bounds);
  const outboundXDirection = Math.sign((petDestination?.x ?? petRoundTrip.startBounds.x) - petRoundTrip.startBounds.x);
  const outboundYDirection = Math.sign((petDestination?.y ?? petRoundTrip.startBounds.y) - petRoundTrip.startBounds.y);
  const outboundXIsMonotonic = outboundPetBounds.every((bounds, index) => index === 0 || outboundXDirection === 0 || Math.sign(bounds.x - outboundPetBounds[index - 1].x) === outboundXDirection || bounds.x === outboundPetBounds[index - 1].x);
  const outboundYIsMonotonic = outboundPetBounds.every((bounds, index) => index === 0 || outboundYDirection === 0 || Math.sign(bounds.y - outboundPetBounds[index - 1].y) === outboundYDirection || bounds.y === outboundPetBounds[index - 1].y);
  const petDirections = ["right", "left", "front", "back", "front-left", "front-right", "back-left", "back-right"];
  const oppositePetDirection = {
    right: "left", left: "right", front: "back", back: "front",
    "front-left": "back-right", "front-right": "back-left",
    "back-left": "front-right", "back-right": "front-left",
  };
  verify(
    "Pet performs a random safe exact round trip",
    petDestination
      && JSON.stringify(petDestination) !== JSON.stringify(petRoundTrip.startBounds)
      && boundsFitWorkArea(petDestination, screen.getDisplayMatching(petRoundTrip.startBounds).workArea)
      && Math.hypot(petDestination.x - petRoundTrip.startBounds.x, petDestination.y - petRoundTrip.startBounds.y) >= 130
      && Math.abs(petDestination.y - petRoundTrip.startBounds.y) >= 120
      && JSON.stringify(petRoundTrip.endBounds) === JSON.stringify(petRoundTrip.startBounds)
      && new Set(outboundPetBounds.map((entry) => `${entry.x}:${entry.y}`)).size >= 3
      && outboundXIsMonotonic
      && outboundYIsMonotonic
      && petDirections.includes(petRoundTrip.activeVisual?.actorDirection)
      && petRoundTrip.returnVisual?.actorDirection === oppositePetDirection[petRoundTrip.activeVisual?.actorDirection]
      && petRoundTrip.activeVisual?.animation === `action.walk_round_trip_walk_${String(petRoundTrip.activeVisual?.actorDirection).replaceAll("-", "_")}`
      && petRoundTrip.returnVisual?.animation === `action.walk_round_trip_walk_${String(petRoundTrip.returnVisual?.actorDirection).replaceAll("-", "_")}`
      && petRoundTrip.activeVisual?.mirrored === "false"
      && petRoundTrip.returnVisual?.mirrored === "false"
      && /^walk_round_trip_walk_.+-[2-8]$/.test(petRoundTrip.activeVisual?.frame ?? "")
      && petRoundTrip.activeVisual?.timelineMs >= 100
      && petRoundTrip.activeVisual?.walkMotion?.stepDistancePx > 0
      && petRoundTrip.activeVisual?.walkMotion?.stepDistancePx <= 26
      && petRoundTrip.activeVisual?.walkMotion?.stepDurationMs >= 180
      && petRoundTrip.activeVisual?.walkMotion?.cycleDurationMs === petRoundTrip.activeVisual?.walkMotion?.stepDurationMs * 4
      && petRoundTrip.activeVisual?.walkMotion?.footfallsPerCycle === 4
      && JSON.stringify(petRoundTrip.activeVisual?.walkMotion?.rootStepKeyframes) === JSON.stringify([0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4])
      && petRoundTrip.activeVisual?.cycleDurationMs === petRoundTrip.activeVisual?.walkMotion?.cycleDurationMs
      && Math.abs(petRoundTrip.activeVisual?.startedAtMs - petRoundTrip.activeVisual?.walkMotion?.startedAt) < 1
      && petRoundTrip.activeVisual?.tokenHidden === true
      && petRoundTrip.activeVisual?.closeOpacity === "0"
      && existsSync(petRoundTrip.activeVisualScreenshot)
      && petRoundTrip.endAnimation === petRoundTrip.startAnimation,
    `destination ${JSON.stringify(petDestination)}; active visual ${JSON.stringify(petRoundTrip.activeVisual)}; full-display two-dimensional safe path with authored root travel; exact home and actor state ${petRoundTrip.endAnimation}`,
  );

  const placementWorkArea = screen.getDisplayMatching(pet.getBounds()).workArea;
  const snackPoint = { x: placementWorkArea.x + Math.round(placementWorkArea.width * .36), y: placementWorkArea.y + placementWorkArea.height - 48 };
  qa.setQuickPlayTimeScale(1);
  const feed = await runClosedQuickPlayAction("token_snack", { mode: "snack", point: snackPoint });
  qa.setQuickPlayTimeScale(20);
  const feedDirections = ["right", "left", "front", "back", "front-left", "front-right", "back-left", "back-right"];
  const oppositeFeedDirection = {
    right: "left", left: "right", front: "back", back: "front",
    "front-left": "back-right", "front-right": "back-left",
    "back-left": "front-right", "back-right": "front-left",
  };
  verify(
    "Feed snack uses direction-matched distance-locked locomotion assets",
    feedDirections.includes(feed.activeVisual?.actorDirection)
      && feed.returnVisual?.actorDirection === oppositeFeedDirection[feed.activeVisual?.actorDirection]
      && feed.activeVisual?.animation === `action.feed_snack_walk_slow_${String(feed.activeVisual?.actorDirection).replaceAll("-", "_")}`
      && feed.returnVisual?.animation === `action.feed_snack_return_run_${String(feed.returnVisual?.actorDirection).replaceAll("-", "_")}`
      && /^feed_snack_walk_slow_(?:right|left|front|back|front_right|front_left|back_right|back_left)-[2-8]$/.test(feed.activeVisual?.frame ?? "")
      && /^feed_snack_return_run_(?:right|left|front|back|front_right|front_left|back_right|back_left)-[2-8]$/.test(feed.returnVisual?.frame ?? "")
      && feed.activeVisual?.mirrored === "false"
      && feed.returnVisual?.mirrored === "false"
      && feed.activeVisual?.walkMotion?.stepDistancePx > 0
      && feed.activeVisual?.walkMotion?.stepDistancePx <= 26
      && feed.returnVisual?.walkMotion?.stepDistancePx > 0
      && feed.returnVisual?.walkMotion?.stepDistancePx <= 26
      && feed.activeVisual?.walkMotion?.footfallsPerCycle === 4
      && feed.returnVisual?.walkMotion?.footfallsPerCycle === 4
      && JSON.stringify(feed.activeVisual?.walkMotion?.rootStepKeyframes) === JSON.stringify([0, .14, 1, 1.14, 2, 2.14, 3, 3.14, 4])
      && JSON.stringify(feed.returnVisual?.walkMotion?.rootStepKeyframes) === JSON.stringify([0, .32, 1, 1.32, 2, 2.32, 3, 3.32, 4])
      && feed.activeVisual?.cycleDurationMs === feed.activeVisual?.walkMotion?.cycleDurationMs
      && feed.returnVisual?.cycleDurationMs === feed.returnVisual?.walkMotion?.cycleDurationMs
      && Math.abs(feed.activeVisual?.startedAtMs - feed.activeVisual?.walkMotion?.startedAt) < 1
      && Math.abs(feed.returnVisual?.startedAtMs - feed.returnVisual?.walkMotion?.startedAt) < 1
      && feed.activeVisual?.tokenHidden === true
      && feed.returnVisual?.tokenHidden === true
      && feed.activeVisual?.closeOpacity === "0"
      && feed.returnVisual?.closeOpacity === "0"
      && existsSync(feed.activeVisualScreenshot)
      && existsSync(feed.arrivalScreenshot)
      && existsSync(feed.biteScreenshot)
      && existsSync(feed.swallowScreenshot)
      && existsSync(feed.swallowOverlayScreenshot),
    `outbound ${JSON.stringify(feed.activeVisual)}; return ${JSON.stringify(feed.returnVisual)}`,
  );
  verify(
    "Feed snack performs one lick, bites, chews, swallows, and returns exactly",
    feed.trace.filter((entry) => entry.phase === "lick").length === 1
      && feed.trace.filter((entry) => entry.phase === "arrive").length === 1
      && feed.trace.filter((entry) => entry.phase === "bite").length === 1
      && feed.trace.filter((entry) => entry.phase === "chew").length === 1
      && feed.trace.filter((entry) => entry.phase === "swallow").length === 1
      && !feed.trace.some((entry) => entry.phase === "eat")
      && JSON.stringify(feed.feedInteractionVisuals.map((entry) => entry.phase)) === JSON.stringify(["lick", "bite", "chew", "swallow"])
      && JSON.stringify(feed.feedInteractionVisuals.map((entry) => entry.prop.stage)) === JSON.stringify(["ground", "bite", "chew", "swallow"])
      && feed.feedInteractionVisuals.every((entry) => entry.actor.animation === `action.feed_snack_${entry.phase}_${String(feed.activeVisual?.actorDirection).replaceAll("-", "_")}`)
      && feed.feedInteractionVisuals[1].prop.animation === "quick-overlay-snack-bite"
      && feed.feedInteractionVisuals[2].prop.animation === "quick-overlay-snack-chew"
      && feed.feedInteractionVisuals[3].prop.animation === "quick-overlay-snack-swallow"
      && feed.feedInteractionVisuals[3].prop.opacity < feed.feedInteractionVisuals[2].prop.opacity
      && (() => {
        const arriveBounds = feed.trace.find((entry) => entry.phase === "arrive")?.bounds;
        if (!arriveBounds) return false;
        const direction = snackPoint.x >= feed.startBounds.x + feed.startBounds.width / 2 ? 1 : -1;
        const noseX = arriveBounds.x + arriveBounds.width / 2 + arriveBounds.width * .245 * direction;
        return Math.abs(noseX - snackPoint.x) <= 2;
      })()
      && JSON.stringify(feed.endBounds) === JSON.stringify(feed.startBounds)
      && feed.endAnimation === feed.startAnimation,
    `single-prop handoff ${JSON.stringify(feed.feedInteractionVisuals)}; trace ${feed.trace.map((entry) => entry.phase).join(" → ")}`,
  );
  const feedArrivalBounds = feed.trace.find((entry) => entry.phase === "arrive")?.bounds;
  const feedOutboundBounds = feed.trace.filter((entry) => entry.phase === "outbound" && entry.bounds).map((entry) => entry.bounds);
  const feedYDirection = Math.sign((feedArrivalBounds?.y ?? feed.startBounds.y) - feed.startBounds.y);
  verify(
    "Feed snack traverses both desktop axes toward a lower placement",
    feedArrivalBounds
      && Math.abs(feedArrivalBounds.y - feed.startBounds.y) >= 120
      && new Set(feedOutboundBounds.map((entry) => entry.y)).size >= 4
      && feedOutboundBounds.every((bounds, index) => index === 0 || feedYDirection === 0 || Math.sign(bounds.y - feedOutboundBounds[index - 1].y) === feedYDirection || bounds.y === feedOutboundBounds[index - 1].y),
    `lower snack ${JSON.stringify(snackPoint)} moved pet row from y=${feed.startBounds.y} to y=${feedArrivalBounds?.y}; ${new Set(feedOutboundBounds.map((entry) => entry.y)).size} distinct outbound rows`,
  );

  qa.resetQuickPlayTrace();
  const failureStart = pet.getBounds();
  const failureAnimation = await execute(pet, "document.querySelector('[data-actor-animation]')?.dataset.actorAnimation ?? null");
  let panel = await openQuickPlay();
  await click(panel, "[data-action-id=token_snack]");
  await waitForClosed(qa, "popover");
  const failureOverlay = await waitForWindow(qa, "quickplayOverlay");
  await waitForDom(failureOverlay, "[data-overlay-mode=snack]");
  await execute(failureOverlay, `window.tokenpet.quickPlayOverlayInput({ type: 'reopen', screenX: 240, screenY: 240, timestamp: Date.now() })`);
  panel = await waitForWindow(qa, "popover");
  await waitForDom(panel, "[data-testid=quick-play-panel]");
  verify("Pointer mode can reopen Quick Play", qa.getQuickPlaySession().activeAction === "token_snack" && safeWindow(qa, "quickplayOverlay") !== null, "overlay-routed double-click command opens the panel without canceling placement ownership");
  await click(panel, "button[aria-label='Close Quick Play']");
  await waitForClosed(qa, "popover");
  verify("Quick Play cancel injects failure recovery", qa.submitQuickPlayOverlayInput(null) === true, "QA cancels the owned placement promise through its guarded injection hook");
  await waitForQuickPlayEnd("token_snack failure");
  const failureTrace = qa.getQuickPlayTrace();
  await delay(80);
  verify(
    "Quick Play failure restores state and clears overlay/mutex",
    failureTrace.some((entry) => entry.phase === "failed")
      && JSON.stringify(pet.getBounds()) === JSON.stringify(failureStart)
      && await execute(pet, "document.querySelector('[data-actor-animation]')?.dataset.actorAnimation ?? null") === failureAnimation
      && safeWindow(qa, "quickplayOverlay") === null
      && qa.getQuickPlaySession().activeAction === null,
    `failed trace ${failureTrace.map((entry) => entry.phase).join(" → ")} restored ${JSON.stringify(failureStart)} and ${failureAnimation}`,
  );

  qa.resetQuickPlayTrace();
  const cursorStart = pet.getBounds();
  const cursorAnchor = { x: cursorStart.x + cursorStart.width / 2, y: cursorStart.y + cursorStart.height / 2 };
  const cursorTarget = { x: Math.max(12, cursorStart.x - 500), y: Math.max(40, cursorStart.y - 250) };
  const cursorTargetDistance = Math.hypot(cursorTarget.x - cursorAnchor.x, cursorTarget.y - cursorAnchor.y);
  qa.setCursorPoint(cursorTarget);
  qa.setQuickPlayTimeScale(1);
  panel = await openQuickPlay();
  await click(panel, "[data-action-id=play_cursor]");
  await waitForClosed(qa, "popover");
  await waitFor(() => qa.getQuickPlaySession().phase === "tracking", "cursor tracking phase");
  const cursorFrame = () => execute(pet, "document.querySelector('[data-actor-animation=\"action.play_cursor\"] canvas')?.dataset.actorFrame ?? null");
  const cursorVisualDir = join(root, "docs", "screenshots", "pet-story");
  const cursorVisualFrames = [];
  for (const [frameId, filename, role] of [
    ["play_cursor-3", "quick-play-cursor-eyes.png", "eyes"],
    ["play_cursor-7", "quick-play-cursor-head.png", "head"],
    ["play_cursor-11", "quick-play-cursor-ears.png", "ears"],
  ]) {
    await waitFor(async () => await cursorFrame() === frameId, `Play Cursor ${role} offline frame`);
    const screenshot = join(cursorVisualDir, filename);
    writeFileSync(screenshot, (await pet.webContents.capturePage()).toPNG());
    cursorVisualFrames.push({ frameId, role, screenshot });
  }
  const cursorChrome = await execute(pet, `(() => ({
    tokenHidden: !document.querySelector('.pet-actor-token-hotspot'),
    closeOpacity: getComputedStyle(document.querySelector('.pet-close')).opacity,
    animation: document.querySelector('[data-actor-animation]')?.dataset.actorAnimation,
  }))()`);
  verify(
    "Play cursor uses an offline eyes-head-ears cascade",
    cursorVisualFrames.map((entry) => entry.frameId).join(",") === "play_cursor-3,play_cursor-7,play_cursor-11"
      && cursorVisualFrames.every((entry) => existsSync(entry.screenshot))
      && cursorChrome.animation === "action.play_cursor"
      && cursorChrome.tokenHidden === true
      && cursorChrome.closeOpacity === "0",
    `fixed-body left target ${JSON.stringify(cursorTarget)} selected ${cursorVisualFrames.map((entry) => `${entry.role}:${entry.frameId}`).join(" → ")} with chrome ${JSON.stringify(cursorChrome)}`,
  );
  verify(
    "Play cursor tracks the full desktop beyond the legacy local radius",
    cursorTargetDistance > 240 && cursorVisualFrames.length === 3,
    `remote cursor point remained tracked at ${Math.round(cursorTargetDistance)}px from the pet anchor`,
  );
  const quickPlayDragAttempt = await execute(pet, "window.tokenpet.startDrag()");
  verify("Active Quick Play owns pet movement", quickPlayDragAttempt.started === false, "native drag is rejected while Cursor tracking holds the action mutex");
  panel = await openQuickPlay();
  const activeButtons = await waitFor(async () => {
    const state = await execute(panel, `(() => ({
      disabled: [...document.querySelectorAll('[data-action-id]:not([data-action-id=capture_moment])')].every((button) => button.disabled),
      captureEnabled: !document.querySelector('[data-action-id=capture_moment]')?.disabled,
    }))()`);
    return state.disabled && state.captureEnabled ? state : null;
  }, "reopened Quick Play exclusive button state");
  const activeBeforeCapture = qa.getQuickPlaySession();
  const captureCountBefore = qa.getCaptureCount();
  await click(panel, "[data-action-id=capture_moment]");
  await click(panel, "[data-action-id=capture_moment]");
  await waitFor(() => qa.getCaptureCount() === captureCountBefore + 2 && existsSync(capturePath) && readFileSync(capturePath).length > 8, "two serialized concurrent Quick Play captures");
  const activeAfterCapture = qa.getQuickPlaySession();
  verify(
    "Quick Play exclusivity keeps Capture repeatable",
    activeButtons.disabled && activeButtons.captureEnabled
      && activeBeforeCapture.activeAction === "play_cursor"
      && activeAfterCapture.activeAction === "play_cursor"
      && activeAfterCapture.startedAt === activeBeforeCapture.startedAt
      && qa.getCaptureCount() === captureCountBefore + 2,
    `reopened panel state ${JSON.stringify({ activeButtons, activeBeforeCapture, activeAfterCapture, capturesCompleted: qa.getCaptureCount() - captureCountBefore })}`,
  );
  await waitFor(() => qa.getQuickPlaySession().phase === "settle", "Play Cursor settle inside deadline");
  const cursorSettleFrame = await waitFor(async () => await cursorFrame() === "play_cursor-16" ? "play_cursor-16" : null, "Play Cursor authored settle frame");
  await waitForQuickPlayEnd("play_cursor");
  qa.setCursorPoint(null);
  qa.setQuickPlayTimeScale(20);
  const cursorTrace = qa.getQuickPlayTrace();
  const cursorElapsedMs = Date.now() - activeBeforeCapture.startedAt;
  verify(
    "Play cursor stays body-anchored for its 10-second contract",
    cursorTrace.some((entry) => entry.phase === "tracking")
      && cursorTrace.some((entry) => entry.phase === "settle")
      && cursorTrace.every((entry) => !entry.bounds || JSON.stringify(entry.bounds) === JSON.stringify(cursorStart))
      && JSON.stringify(pet.getBounds()) === JSON.stringify(cursorStart)
      && cursorSettleFrame === "play_cursor-16"
      && cursorElapsedMs >= 9_900
      && cursorElapsedMs <= 10_500,
    `the production deadline completed in ${cursorElapsedMs}ms with byte-fixed bounds and authored settle frame ${cursorSettleFrame}`,
  );
  quickPlaySummaries.push({ action: "play_cursor", startBounds: cursorStart, endBounds: pet.getBounds(), trace: cursorTrace, captureConcurrent: true, durationMs: cursorElapsedMs, visualFrames: cursorVisualFrames, settleFrame: cursorSettleFrame });
  const cursorPanel = safeWindow(qa, "popover");
  if (cursorPanel) await click(cursorPanel, "button[aria-label='Close Quick Play']");
  await waitForClosed(qa, "popover");

  qa.resetQuickPlayTrace();
  const currentDangleBounds = pet.getBounds();
  const dangleStart = {
    ...currentDangleBounds,
    x: placementWorkArea.x + Math.round(placementWorkArea.width * .62),
    y: placementWorkArea.y + 96,
  };
  pet.setBounds(dangleStart, false);
  panel = await openQuickPlay();
  await click(panel, "[data-action-id=drag_dangle]");
  await waitForClosed(qa, "popover");
  const earlyDangleOverlay = await waitForWindow(qa, "quickplayOverlay");
  await waitForDom(earlyDangleOverlay, "[data-overlay-mode=dangle]");
  await waitFor(() => execute(earlyDangleOverlay, "[...document.images].every((image) => image.complete && image.naturalWidth > 0)"), "early dangle overlay prop assets");
  const dangleOrigin = {
    x: placementWorkArea.x + 180,
    y: placementWorkArea.y + placementWorkArea.height - 180,
  };
  await execute(earlyDangleOverlay, `window.tokenpet.quickPlayOverlayInput({ type: 'click', screenX: ${dangleOrigin.x}, screenY: ${dangleOrigin.y}, timestamp: Date.now() })`);
  await waitForClosed(qa, "quickplayOverlay");
  await waitForQuickPlayEnd("drag_dangle");
  const earlyDangleTrace = qa.getQuickPlayTrace();
  verify(
    "Dangle click releases at any time",
    JSON.stringify(pet.getBounds()) === JSON.stringify(dangleStart)
      && earlyDangleTrace.some((entry) => entry.phase === "release")
      && earlyDangleTrace.some((entry) => entry.phase === "settle")
      && !earlyDangleTrace.some((entry) => entry.phase === "pounce"),
    `pre-arm click removed the overlay immediately and traced ${earlyDangleTrace.map((entry) => entry.phase).join(" → ")}`,
  );

  qa.resetQuickPlayTrace();
  qa.setCursorPoint(dangleOrigin);
  panel = await openQuickPlay();
  await click(panel, "[data-action-id=drag_dangle]");
  await waitForClosed(qa, "popover");
  const dangleOverlay = await waitForWindow(qa, "quickplayOverlay");
  await waitForDom(dangleOverlay, "[data-overlay-mode=dangle]");
  await waitFor(() => execute(dangleOverlay, "[...document.images].every((image) => image.complete && image.naturalWidth > 0)"), "dangle overlay offline prop assets");
  await waitFor(() => dangleOverlay.isVisible(), "visible dangle overlay window");
  await waitFor(async () => {
    const session = qa.getQuickPlaySession();
    const currentCenterX = session.currentBounds ? session.currentBounds.x + session.currentBounds.width / 2 : Number.NEGATIVE_INFINITY;
    return session.targetPoint?.x < currentCenterX
      && await execute(pet, "document.querySelector('[data-actor-facing]')?.dataset.actorFacing === 'left' && document.querySelector('[data-actor-mirrored]')?.dataset.actorMirrored === 'true'");
  }, "dangle actor facing the lower-left fish target");
  await execute(dangleOverlay, "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
  const dangleOverlayCapture = await waitFor(async () => {
    const capture = await dangleOverlay.webContents.capturePage();
    const bitmap = capture.toBitmap();
    return bitmap.some((value, index) => index % 4 === 3 && value > 0) ? capture : null;
  }, "painted dangle hand, rod, cord, fish, and hint");
  const dangleOverlayScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-dangle-overlay.png");
  writeFileSync(dangleOverlayScreenshot, dangleOverlayCapture.toPNG());
  const dangleDownPoint = {
    x: dangleStart.x + Math.round(dangleStart.width / 2),
    y: placementWorkArea.y + placementWorkArea.height - 140,
  };
  qa.setCursorPoint(dangleDownPoint);
  await delay(700);
  // Drive the same rendered-fish IPC used by DangleProp. Merely changing the
  // QA cursor can be starved by macOS/GPU frame scheduling during the full
  // screenshot suite, producing >180ms gaps that correctly reset the product
  // gate. These samples remain >1,000ms of meaningful non-jitter movement.
  await execute(dangleOverlay, `(async () => {
    for (let index = 0; index < 56; index += 1) {
      window.tokenpet.quickPlayOverlayInput({
        type: 'move',
        screenX: ${dangleDownPoint.x},
        screenY: ${dangleDownPoint.y} + (index % 2 === 0 ? -16 : 16),
        timestamp: Date.now(),
      });
      await new Promise((resolve) => setTimeout(resolve, 24));
    }
    return true;
  })()`);
  const frontPounce = await waitFor(
    () => qa.getQuickPlayTrace().find((entry) => entry.phase === "pounce" && entry.actorDirection === "front") ?? null,
    "dangle meaningful movement pounce gate with authored front direction",
  );
  verify("Dangle straight-down pursuit uses authored front-facing frames", Boolean(frontPounce), "the pounce trace captured the front bundle before later live-fish pursuit retargeting");
  const pursuedBounds = pet.getBounds();
  const chasePoint = { x: placementWorkArea.x + Math.round(placementWorkArea.width * .88), y: placementWorkArea.y + Math.round(placementWorkArea.height * .48) };
  qa.setCursorPoint(chasePoint);
  await waitFor(async () => {
    const session = qa.getQuickPlaySession();
    return session.actorDirection === "back-right"
      && await execute(pet, "document.querySelector('[data-actor-animation]')?.dataset.actorAnimation === 'action.dangle_pursuit_run_back_right' && document.querySelector('[data-actor-mirrored]')?.dataset.actorMirrored === 'false'");
  }, "dangle actor selecting the authored upper-right diagonal pursuit");
  verify("Dangle upper-right pursuit uses native diagonal frames", true, "the session and renderer selected action.dangle_pursuit_run_back_right without runtime mirroring");
  await waitFor(() => {
    const trace = qa.getQuickPlayTrace();
    const liveBounds = pet.getBounds();
    return trace.some((entry) => entry.phase === "pursuit")
      && liveBounds.x >= pursuedBounds.x + 180
      && liveBounds.y !== pursuedBounds.y;
  }, "dangle authored multi-axis pursuit", 30_000);
  verify("Dangle requires more than one second of meaningful movement", JSON.stringify(pursuedBounds) !== JSON.stringify(dangleStart), `continuous pointer motion armed an authored pounce at ${JSON.stringify(pursuedBounds)}`);
  const reverseStartedAt = Date.now();
  const reverseStartBounds = pet.getBounds();
  const sideReversePoint = { x: placementWorkArea.x + Math.round(placementWorkArea.width * .12), y: chasePoint.y };
  qa.setCursorPoint(sideReversePoint);
  await waitFor(async () => {
    const session = qa.getQuickPlaySession();
    const currentCenterX = session.currentBounds ? session.currentBounds.x + session.currentBounds.width / 2 : Number.NEGATIVE_INFINITY;
    return session.targetPoint?.x < currentCenterX
      && await execute(pet, "document.querySelector('[data-actor-facing]')?.dataset.actorFacing === 'left' && document.querySelector('[data-actor-mirrored]')?.dataset.actorMirrored === 'true'");
  }, "dangle actor reversing toward the rendered fish");
  await waitFor(() => qa.getQuickPlayTrace().some((entry) => entry.at >= reverseStartedAt && entry.phase === "pursuit" && entry.bounds?.x < reverseStartBounds.x), "dangle replanned leftward pursuit");
  const reversedBounds = pet.getBounds();
  await execute(dangleOverlay, `window.tokenpet.quickPlayOverlayInput({ type: 'click', screenX: ${sideReversePoint.x}, screenY: ${sideReversePoint.y}, timestamp: Date.now() })`);
  await waitForClosed(qa, "quickplayOverlay");
  qa.setCursorPoint(null);
  await waitForQuickPlayEnd("drag_dangle");
  const dangleTrace = qa.getQuickPlayTrace();
  verify(
    "Dangle uses offline phases and returns to exact starting bounds",
    JSON.stringify(pet.getBounds()) === JSON.stringify(dangleStart)
      && existsSync(dangleOverlayScreenshot)
      && ["alert", "stalk", "crouch", "pounce", "play", "pursuit", "release", "return", "settle"].every((phase) => dangleTrace.some((entry) => entry.phase === phase)),
    `painted offline prop rig; authored trace ${dangleTrace.map((entry) => entry.phase).join(" → ")} ends at the exact captured home`,
  );
  verify("Dangle faces the rendered fish throughout target changes", reversedBounds.x < reverseStartBounds.x, "the actor faced lower-left, turned right when the fish crossed it, then interrupted the stale route and moved left when the fish crossed back");
  quickPlaySummaries.push({ action: "drag_dangle", startBounds: dangleStart, earlyReleaseTrace: earlyDangleTrace, pursuedBounds, chasePoint, reversePoint: sideReversePoint, reversedBounds, endBounds: pet.getBounds(), overlayScreenshot: dangleOverlayScreenshot, trace: dangleTrace });

  const yarnPoint = { x: placementWorkArea.x + Math.round(placementWorkArea.width * .61), y: placementWorkArea.y + Math.round(placementWorkArea.height * .62) };
  qa.setQuickPlayTimeScale(1);
  const yarn = await runClosedQuickPlayAction("toss_yarn", { mode: "yarn", point: yarnPoint });
  qa.setQuickPlayTimeScale(20);
  const yarnOutboundBounds = yarn.trace.filter((entry) => entry.phase === "outbound" && entry.bounds).map((entry) => entry.bounds);
  verify(
    "Toss yarn uses eight-direction chase, baked mouth carry, drop, and exact return",
    ["stand", "outbound", "pickup", "carry", "drop", "settle"].every((phase) => yarn.trace.some((entry) => entry.phase === phase))
      && JSON.stringify(yarn.endBounds) === JSON.stringify(yarn.startBounds)
      && /^action\.toss_yarn_chase_(right|left|front|back|front_right|front_left|back_right|back_left)$/.test(yarn.activeVisual?.animation ?? "")
      && /^action\.toss_yarn_carry_(right|left|front|back|front_right|front_left|back_right|back_left)$/.test(yarn.returnVisual?.animation ?? "")
      && /^action\.toss_yarn_pickup_(right|left|front|back|front_right|front_left|back_right|back_left)$/.test(yarn.pickupVisual?.animation ?? "")
      && /^action\.toss_yarn_drop_(right|left|front|back|front_right|front_left|back_right|back_left)$/.test(yarn.dropVisual?.animation ?? "")
      && [yarn.activeVisual, yarn.returnVisual, yarn.pickupVisual, yarn.dropVisual].every((visual) => visual?.variant === "orange")
      && yarn.activeVisual?.walkMotion?.stepDistancePx > 0
      && yarn.activeVisual?.walkMotion?.stepDistancePx <= 26
      && yarn.returnVisual?.walkMotion?.stepDistancePx > 0
      && yarn.returnVisual?.walkMotion?.stepDistancePx <= 18
      && JSON.stringify(yarn.activeVisual?.walkMotion?.rootStepKeyframes) === JSON.stringify([0, .36, 1, 1.36, 2, 2.36, 3, 3.36, 4])
      && JSON.stringify(yarn.returnVisual?.walkMotion?.rootStepKeyframes) === JSON.stringify([0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4])
      && yarn.activeVisual?.closeOpacity === "0"
      && yarn.returnVisual?.closeOpacity === "0"
      && new Set(yarnOutboundBounds.map((bounds) => `${bounds.x}:${bounds.y}`)).size >= 3
      && yarnOutboundBounds.some((bounds) => bounds.y !== yarn.startBounds.y)
      && [yarn.activeVisualScreenshot, yarn.pickupScreenshot, yarn.dropScreenshot].every((path) => path && existsSync(path)),
    `native phases ${yarn.trace.map((entry) => entry.phase).join(" → ")}; chase ${JSON.stringify(yarn.activeVisual)}; carry ${JSON.stringify(yarn.returnVisual)}`,
  );

  qa.resetQuickPlayTrace();
  const napBounds = pet.getBounds();
  const preNapDirectorState = qa.getReportedPetDirectorState();
  panel = await openQuickPlay();
  await click(panel, "[data-action-id=nap_here]");
  verify("Nap here keeps Quick Play open", safeWindow(qa, "popover")?.id === panel.id, "the panel remains visible during settle");
  await waitForQuickPlayEnd("nap_here");
  await waitFor(() => qa.getQuickPlaySession().resting === true, "persistent sleep state");
  await execute(pet, "document.querySelector('.pet-stage')?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true }))");
  await waitFor(
    () => execute(pet, "Boolean(document.querySelector('.pet-name-thought-token.is-visible[data-bubble-content-mode=token]'))"),
    "Nap token bubble render",
  );
  const timedNapInfo = qa.getTimedNapInfo();
  const napDisabled = await execute(panel, "document.querySelector('[data-action-id=nap_here]')?.disabled === true");
  const napVisual = await execute(pet, `(() => {
    const stage = document.querySelector('.pet-stage');
    const canvas = document.querySelector('.pet-generated-actor-canvas');
    const root = document.querySelector('.pet-generated-actor-canvas-root');
    return {
      animation: document.querySelector('[data-actor-animation]')?.dataset.actorAnimation,
      frame: canvas?.dataset.actorFrame,
      canvasAnimation: canvas ? getComputedStyle(canvas).animationName : null,
      resting: stage?.dataset.petResting,
      embeddedTokenVisible: Boolean(document.querySelector('.pet-actor-token-hotspot')),
      sleepTokenBubbleVisible: Boolean(document.querySelector('.pet-name-thought-token.is-visible[data-bubble-content-mode="token"]')),
      shadow: root ? getComputedStyle(root).filter : null,
    };
  })()`);
  const napScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-nap-here-grounded.png");
  writeFileSync(napScreenshot, (await pet.webContents.capturePage()).toPNG());
  verify(
    "Nap settles once into persistent sleep without moving the actor canvas",
    napDisabled
      && timedNapInfo.active
      && timedNapInfo.durationMs === 300_000
      && timedNapInfo.restoreAction === preNapDirectorState.action
      && preNapDirectorState.resting === false
      && timedNapInfo.remainingMs > 0
      && JSON.stringify(pet.getBounds()) === JSON.stringify(napBounds)
      && napVisual.animation === "action.sleep_loop"
      && /^sleep_loop-\d+$/.test(napVisual.frame ?? "")
      && (napVisual.canvasAnimation === "none" || napVisual.canvasAnimation === "")
      && napVisual.resting === "true"
      && !napVisual.embeddedTokenVisible
      && napVisual.sleepTokenBubbleVisible
      && napVisual.shadow !== "none"
      && existsSync(napScreenshot),
    `Nap owns a five-minute lease ${JSON.stringify(timedNapInfo)}, bounds remain fixed, the embedded frame is hidden, the token bubble is visible, and no whole-canvas bounce survives: ${JSON.stringify(napVisual)}`,
  );
  quickPlaySummaries.push({ action: "nap_here", startBounds: napBounds, endBounds: pet.getBounds(), trace: qa.getQuickPlayTrace(), resting: true });

  qa.resetQuickPlayTrace();
  await click(panel, "[data-action-id=wake_up]");
  verify("Wake up keeps Quick Play open", safeWindow(qa, "popover"), "the panel remains available while the five-second authored sequence plays");
  await waitForQuickPlayEnd("wake_up");
  await waitFor(() => qa.getQuickPlaySession().resting === false, "wake restored director state");
  const wakeTrace = qa.getQuickPlayTrace();
  const wakeTimedNapInfo = qa.getTimedNapInfo();
  const wakeRestoredDirectorState = qa.getReportedPetDirectorState();
  verify(
    "Wake up interrupts the timed Nap and restores the original state",
    ["stand", "outbound", "interact", "settle"].every((phase) => wakeTrace.some((entry) => entry.phase === phase))
      && !wakeTimedNapInfo.active
      && wakeRestoredDirectorState.resting === false
      && JSON.stringify(pet.getBounds()) === JSON.stringify(napBounds),
    `the five-second Wake sequence cancels the Nap lease and returns to the non-resting Director state ${JSON.stringify(wakeRestoredDirectorState)}`,
  );
  quickPlaySummaries.push({ action: "wake_up", startBounds: napBounds, endBounds: pet.getBounds(), trace: wakeTrace, resting: false });

  qa.setQuickPlayTimeScale(100);
  await waitFor(() => execute(panel, "document.querySelector('[data-action-id=nap_here]')?.disabled === false"), "Nap re-enabled after Wake");
  await click(panel, "[data-action-id=nap_here]");
  await waitForQuickPlayEnd("nap_here");
  await waitFor(() => qa.getQuickPlaySession().resting === true, "second timed Nap state");
  const automaticNapInfo = qa.getTimedNapInfo();
  await waitFor(() => qa.getQuickPlaySession().resting === false, "five-minute Nap automatic restore", 8_000);
  const automaticNapRestoredDirectorState = qa.getReportedPetDirectorState();
  verify(
    "Nap automatically restores after five minutes",
    automaticNapInfo.active
      && automaticNapInfo.durationMs === 300_000
      && automaticNapInfo.remainingMs > 0
      && !qa.getTimedNapInfo().active
      && automaticNapRestoredDirectorState.resting === false,
    `the production 300000ms lease runs at the QA clock and restores the non-resting Director state ${JSON.stringify(automaticNapRestoredDirectorState)} without a second action`,
  );
  qa.setQuickPlayTimeScale(20);

  qa.resetQuickPlayTrace();
  const danceStart = pet.getBounds();
  const dancePositionPath = join(userDataPath, "pet-position.json");
  const danceStoredBefore = existsSync(dancePositionPath)
    ? readFileSync(dancePositionPath, "utf8")
    : null;
  qa.setQuickPlayTimeScale(1);
  panel = await openQuickPlay();
  await click(panel, "[data-action-id=dance]");
  await waitForClosed(qa, "popover");
  await waitFor(() => qa.getQuickPlaySession().phase === "dance_reference_clip", "Dance video-reference phase");
  await delay(1_550);
  const danceScreenshot = join(root, "docs", "screenshots", "pet-story", "quick-play-dance-tongue-pop.png");
  writeFileSync(danceScreenshot, (await pet.webContents.capturePage()).toPNG());
  await waitForQuickPlayEnd("dance");
  const danceEnd = pet.getBounds();
  const danceStoredAfter = existsSync(dancePositionPath)
    ? readFileSync(dancePositionPath, "utf8")
    : null;
  const danceTrace = qa.getQuickPlayTrace();
  const dancePhases = danceTrace.map((entry) => entry.phase);
  verify(
    "Dance performs the detected fixed-bounds 10.133-second source loop and exact restore",
    JSON.stringify(danceEnd) === JSON.stringify(danceStart)
      && danceStoredAfter === danceStoredBefore
      && dancePhases.filter((phase) => phase === "dance_reference_clip").length === 1
      && dancePhases[0] === "stand"
      && dancePhases.includes("dance_rise")
      && dancePhases.includes("dance_restore")
      && existsSync(danceScreenshot)
      && danceTrace.every((entry) => !entry.bounds || JSON.stringify(entry.bounds) === JSON.stringify(danceStart)),
    `fixed bounds ${JSON.stringify(danceStart)} with semantic trace ${dancePhases.join(" → ")}`,
  );
  quickPlaySummaries.push({ action: "dance", startBounds: danceStart, endBounds: danceEnd, trace: danceTrace, screenshot: danceScreenshot });
  qa.setQuickPlayTimeScale(1);

  const settingsBeforeClose = JSON.stringify(qa.getSettings());
  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "button[aria-label='Close Quick Play']");
  await click(popover, "button[aria-label='Close Quick Play']");
  await waitForClosed(qa, "popover");
  const settingsAfterClose = JSON.stringify(qa.getSettings());
  verify(
    "Quick Play X closes only panel",
    pet.isVisible() && qa.getSettings().petVisible && settingsAfterClose === settingsBeforeClose,
    `pet stays visible and settings are unchanged; before=${settingsBeforeClose}; after=${settingsAfterClose}`,
  );

  const stablePetStorySnapshot = () => {
    const story = qa.getSettings().petStory;
    return JSON.stringify({ ...story, journey: { ...story.journey, lastSeenAt: null } });
  };
  const petStoryBeforeConsole = stablePetStorySnapshot();
  await doubleClickPet(pet);
  popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, ".open-console");
  await click(popover, ".open-console");
  let consoleWindow = await waitForWindow(qa, "console");
  await waitForDom(consoleWindow, "[data-console-tab=pet].active");
  await waitForDom(consoleWindow, "[data-pet-page=appearance]");
  verify("Open Console routes to Pet", !consoleWindow.webContents.isCrashed(), "real Console renderer opened Pet without crashing");
  const petStoryAfterConsole = stablePetStorySnapshot();
  verify("Open Console preserves pet state", petStoryAfterConsole === petStoryBeforeConsole, `opening Console did not dispatch or persist a pet action; before=${petStoryBeforeConsole}; after=${petStoryAfterConsole}`);
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
    accessories: (() => {
      const compositor = document.querySelector('[data-action-preview] .pet-accessory-compositor');
      return compositor ? {
        visible: compositor.dataset.accessoriesVisible,
        head: compositor.dataset.accessoryHead,
        ground: compositor.dataset.accessoryGround,
        effect: compositor.dataset.accessoryEffect,
      } : null;
    })(),
  }))()`);
  verify(
    "Console Actions v20 workbench defaults to Pet",
    JSON.stringify(actionWorkbench.ids) === JSON.stringify(["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "dance"])
      && actionWorkbench.selected === "walk_round_trip"
      && actionWorkbench.previewOnly === "Preview only"
      && actionWorkbench.footer === "Preview changes apply instantly. Your desktop pet stays still."
      && actionWorkbench.actorId === "golden-british"
      && actionWorkbench.captureCount === 0,
    `the exact eight-action isolated workbench uses the shared generated actor: ${JSON.stringify(actionWorkbench)}`,
  );
  verify(
    "Console Actions preview suppresses Appearance accessories",
    actionWorkbench.accessories?.visible === "false"
      && actionWorkbench.accessories.head === "none"
      && actionWorkbench.accessories.ground === "none"
      && actionWorkbench.accessories.effect === "none",
    `the action-only preview ignores the saved Head, Ground, and Effects selections: ${JSON.stringify(actionWorkbench.accessories)}`,
  );

  await click(consoleWindow, "[data-action-id=toss_yarn]");
  await waitForDom(consoleWindow, "[data-action-settings-for=toss_yarn]");
  await execute(consoleWindow, `(() => {
    const blue = [...document.querySelectorAll('[data-action-setting=yarnColor] button')].find((button) => button.textContent?.includes('Blue'));
    blue?.click();
  })()`);
  await waitFor(() => execute(consoleWindow, "document.querySelector('.action-preview-prop-toss_yarn img')?.getAttribute('src')?.includes('toss-yarn-blue')"), "Toss Yarn Console blue prop");
  const tossPreviewProp = await execute(consoleWindow, "document.querySelector('.action-preview-prop-toss_yarn img')?.getAttribute('src') ?? null");
  await click(consoleWindow, '[data-phase-id*="toss_yarn_chase_right"]');
  await waitFor(() => execute(consoleWindow, "document.querySelector('[data-action-preview] [data-actor-animation]')?.dataset.actorAnimation === 'action.toss_yarn_chase_right'"), "Toss Yarn Console chase phase");
  const tossPreviewChase = await execute(consoleWindow, `(() => {
    const actor = document.querySelector('[data-action-preview] [data-actor-animation]');
    const stage = document.querySelector('[data-action-preview-stage]');
    return { animation: actor?.dataset.actorAnimation ?? null, variant: actor?.dataset.actorVariant ?? null, contract: stage?.dataset.previewTossYarnContract ?? null };
  })()`);
  await click(consoleWindow, '[data-phase-id*="toss_yarn_carry_left"]');
  await waitFor(() => execute(consoleWindow, "document.querySelector('[data-action-preview] [data-actor-animation]')?.dataset.actorAnimation === 'action.toss_yarn_carry_left'"), "Toss Yarn Console mouth-carry phase");
  const tossPreviewCarry = await execute(consoleWindow, `(() => {
    const actor = document.querySelector('[data-action-preview] [data-actor-animation]');
    const stage = document.querySelector('[data-action-preview-stage]')?.getBoundingClientRect();
    const shell = document.querySelector('[data-action-preview] .pet-generated-actor-shell')?.getBoundingClientRect();
    const filmstripRows = new Set([...document.querySelectorAll('[data-action-filmstrip] > button')].map((button) => Math.round(button.getBoundingClientRect().top))).size;
    return {
      animation: actor?.dataset.actorAnimation ?? null,
      variant: actor?.dataset.actorVariant ?? null,
      actorContained: Boolean(stage && shell && shell.width <= stage.width && shell.height <= stage.height),
      filmstripRows,
    };
  })()`);
  const tossPreviewScreenshot = join(root, "docs", "screenshots", "pet-story", "console-actions-toss-yarn.png");
  writeFileSync(tossPreviewScreenshot, (await consoleWindow.webContents.capturePage()).toPNG());
  verify(
    "Console Toss Yarn Preview shares desktop assets and colour variants",
    tossPreviewProp?.includes("toss-yarn-blue")
      && tossPreviewChase.animation === "action.toss_yarn_chase_right"
      && tossPreviewChase.variant === "blue"
      && tossPreviewChase.contract === "offline-eight-direction-mouth-carry-exact-return"
      && tossPreviewCarry.animation === "action.toss_yarn_carry_left"
      && tossPreviewCarry.variant === "blue"
      && tossPreviewCarry.actorContained === true
      && tossPreviewCarry.filmstripRows === 1
      && existsSync(tossPreviewScreenshot),
    `shared preview ${JSON.stringify({ tossPreviewProp, tossPreviewChase, tossPreviewCarry, tossPreviewScreenshot })}`,
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
  qa.openConsole("pet");
  await waitForDom(consoleWindow, "[data-pet-page=appearance]");
  verify("Existing Console Pet route resets to Appearance", safeWindow(qa, "console")?.id === consoleWindow.id, "Quick Play's explicit Pet route reuses the Console window and resets its active Pet subpage to Appearance");

  await setPetSize(pet, 0.75);
  const hotActionRequest = { id: "hot_loop", nonce: Date.now() };
  qa.setSetting("petStory", { ...qa.getSettings().petStory, lastAction: hotActionRequest });
  await waitFor(() => qa.getSettings().petStory.lastAction?.nonce === hotActionRequest.nonce, "hot_loop action request");
  await delay(180);
  const smallHotChrome = await readPetChromeLayout(pet, "hot_loop");
  const smallHotEffect = await execute(pet, `(() => {
    const compositor = document.querySelector('.pet-accessory-compositor-desktop');
    return {
      effect: compositor?.dataset.accessoryEffect ?? null,
      source: compositor?.dataset.accessoryEffectSource ?? null,
      overlays: compositor?.querySelectorAll('.pet-accessory-overlay-effect').length ?? 0,
    };
  })()`);

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
  verify(
    "Desktop mood never overrides the selected Appearance effect",
    smallHotEffect.effect === "none" && smallHotEffect.source === "selected" && smallHotEffect.overlays === 0,
    `the default None selection remains visually empty during hot/focus transitions: ${JSON.stringify(smallHotEffect)}`,
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
    "Current-screen rehome uses visible safe bounds",
    summonResult.moved === true && boundsFitWorkArea(summonedBounds, workArea),
    `summoned to ${JSON.stringify(summonedBounds)} within ${JSON.stringify(workArea)}`,
  );
  verify("Current-screen rehome persists position", JSON.stringify(storedPosition) === JSON.stringify(summonedBounds), "safe rehomed bounds were written to isolated userData");

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
  await waitFor(() => menuBar.isVisible(), "visible Menu Bar window");
  menuBar.hide();
  qa.toggleMenuBar();
  await waitFor(() => safeWindow(qa, "menubar")?.id === menuBar.id && menuBar.isVisible(), "hidden Menu Bar re-show");
  verify(
    "Menu Bar click re-shows a retained hidden panel",
    safeWindow(qa, "menubar")?.id === menuBar.id && menuBar.isVisible(),
    "a usable but hidden panel is shown instead of being mistaken for an open panel to close",
  );
  const crashedMenuId = menuBar.id;
  await forceRendererCrash(menuBar, "Menu Bar");
  qa.toggleMenuBar();
  menuBar = await waitForWindow(qa, "menubar", crashedMenuId);
  await waitForDom(menuBar, ".menubar-panel");
  verify("Menu Bar crash self-heals", menuBar.id !== crashedMenuId, `crashed window ${crashedMenuId} was replaced by ${menuBar.id}`);
  await click(menuBar, "button[aria-label='Open settings']");
  await waitForDom(consoleWindow, "[data-console-tab=overview].active");
  verify("Menu Bar settings routes to Overview", safeWindow(qa, "console")?.id === consoleWindow.id, "the settings icon reuses the Console window at Overview");
  if (safeWindow(qa, "menubar")) qa.toggleMenuBar();
  await waitForClosed(qa, "menubar");
  qa.openConsole("pet");
  await waitForDom(consoleWindow, "[data-pet-page=appearance]");
  qa.toggleMenuBar();
  menuBar = await waitForWindow(qa, "menubar");
  await waitForDom(menuBar, ".menubar-footer button");
  await click(menuBar, ".menubar-footer button");
  await waitForDom(consoleWindow, "[data-console-tab=overview].active");
  verify("Menu Bar Open Console routes to Overview", safeWindow(qa, "console")?.id === consoleWindow.id, "the footer action reuses the Console window at Overview");
  if (safeWindow(qa, "menubar")) qa.toggleMenuBar();
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
