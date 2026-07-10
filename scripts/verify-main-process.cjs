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

mkdirSync(userDataPath, { recursive: true });
mkdirSync(picturesPath, { recursive: true });
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
  environment: "isolated temporary userData with synthetic/default settings; local usage loading disabled",
  checks: [],
  failure: null,
};

function record(name, detail) {
  report.checks.push({ name, detail });
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

async function run() {
  const moduleUrl = `${pathToFileURL(join(root, "dist-electron", "main.js")).href}?qa=${Date.now()}`;
  const main = await import(moduleUrl);
  await main.tokenPetReady;
  const qa = main.mainProcessQa;
  verify("main-process QA guard", qa.enabled === true, "production main is running through the explicit QA environment guard");

  let pet = await waitForWindow(qa, "pet");
  await waitForDom(pet, ".pet-stage");
  await waitForActor(pet);
  const bridgeReady = await execute(pet, "Boolean(window.tokenpet?.togglePopover && window.tokenpet?.close)");
  verify("actual pet preload bridge", bridgeReady, "the real preload exposes pet window controls");

  await doubleClickPet(pet);
  let popover = await waitForWindow(qa, "popover");
  await waitForDom(popover, "[data-testid=quick-play-panel]");
  verify("double-click opens independent Quick Play", popover.getParentWindow() === null, `created independent BrowserWindow ${popover.id}`);

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
  await waitFor(() => consoleWindow.isFocused(), "Console focus", 5_000);
  verify("Open Console focuses window", consoleWindow.isVisible() && consoleWindow.isFocused(), "new Console is visible and focused");

  consoleWindow.minimize();
  await waitFor(() => consoleWindow.isMinimized(), "Console minimize");
  qa.openConsole("pet");
  await waitFor(() => !consoleWindow.isMinimized() && consoleWindow.isVisible() && consoleWindow.isFocused(), "Console restore/focus", 5_000);
  verify("Open Console restores existing window", safeWindow(qa, "console")?.id === consoleWindow.id, "existing Console was restored and focused instead of duplicated");

  const crashedConsoleId = consoleWindow.id;
  await forceRendererCrash(consoleWindow, "Console");
  qa.openConsole("pet");
  consoleWindow = await waitForWindow(qa, "console", crashedConsoleId);
  await waitForDom(consoleWindow, "[data-console-tab=pet].active");
  await waitForDom(consoleWindow, "[data-pet-page=appearance]");
  verify("Console crash self-heals", !consoleWindow.webContents.isCrashed(), `crashed window ${crashedConsoleId} was replaced by ${consoleWindow.id}`);

  qa.setSetting("petVisible", true);
  pet = await waitForWindow(qa, "pet");
  await waitForDom(pet, ".pet-stage");
  await execute(pet, "window.tokenpet.setAppSetting('alwaysOnTop', false)");
  await waitFor(() => !qa.getSettings().alwaysOnTop && !pet.isAlwaysOnTop(), "Always on top off");
  await execute(pet, "window.tokenpet.setAppSetting('alwaysOnTop', true)");
  await waitFor(() => qa.getSettings().alwaysOnTop && pet.isAlwaysOnTop(), "Always on top on");
  verify("Always on top control", pet.isAlwaysOnTop(), "real setting updates the desktop BrowserWindow level");

  await execute(pet, `window.tokenpet.getAppSettings().then((settings) => window.tokenpet.setAppSetting('petStory', {
    ...settings.petStory,
    followCursor: true,
    lockPosition: true,
  }))`);
  await waitFor(() => qa.getSettings().petStory.followCursor && qa.getSettings().petStory.lockPosition, "Follow/Lock settings");
  const lockedDrag = await execute(pet, "window.tokenpet.startDrag()");
  verify("Lock position blocks main-process drag", lockedDrag.started === false, "main IPC rejects drag even if renderer code is bypassed");

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
  await click(pet, ".pet-close");
  await waitFor(() => !qa.getSettings().petVisible && !pet.isVisible(), "pet hide");
  verify("Pet X hides without quitting", !pet.isDestroyed() && safeWindow(qa, "console") !== null, "pet BrowserWindow remains alive and Console keeps running");
  await execute(consoleWindow, "window.tokenpet.setAppSetting('petVisible', true)");
  await waitFor(() => qa.getSettings().petVisible && pet.isVisible(), "pet restore");
  verify("Hidden pet restores", pet.id === petIdBeforeHide && pet.isVisible(), "Show pet reuses and reveals the hidden desktop window");

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

  const crashedPetId = pet.id;
  await forceRendererCrash(pet, "Pet");
  qa.setSetting("petVisible", true);
  pet = await waitForWindow(qa, "pet", crashedPetId);
  await waitForDom(pet, ".pet-stage");
  verify("Pet crash self-heals", pet.id !== crashedPetId, `crashed window ${crashedPetId} was replaced by ${pet.id}`);

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
