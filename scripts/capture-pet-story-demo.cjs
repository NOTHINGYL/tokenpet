const { app, BrowserWindow, ipcMain } = require("electron");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { settings: fixtureSettings, snapshot: fixtureSnapshot } = require("./pet-story-screenshot-fixture.cjs");

const root = join(__dirname, "..");
const rendererFile = join(root, "dist-renderer", "index.html");
const outputDir = join(root, "docs", "screenshots", "pet-story");
const frameDir = join(outputDir, "demo-frames");
const gifPath = join(outputDir, "tokenpet-story-demo.gif");
const sequencePath = join(outputDir, "demo-sequence.json");
const settings = structuredClone(fixtureSettings);
// The demo authors every beat explicitly. Suppress the normal 450ms ambient
// startup wake so asset loading speed cannot race the launch-frame capture.
settings.petStory.quietMode = true;
let usage = launchUsage();
let window;
let rendererLoadSequence = 0;
const emptyQuickPlaySession = {
  activeAction: null,
  startedAt: null,
  phase: "idle",
  phaseStartedAt: null,
  startBounds: null,
  startDirectorState: null,
  targetPoint: null,
  walkMotion: null,
  pointerMode: "none",
  resting: false,
  restingUntil: null,
  failure: null,
};

const steps = [
  { id: "launch", caption: "Launch · local-first companion", event: null },
  { id: "wake", caption: "Wake up · approved actor", event: { type: "quickPlay.action", action: "wake_up" } },
  { id: "token-update", caption: "Token frame updates · 61.5M", event: { type: "token.delta", tokens: 61_500_000, burnRate: "steady" } },
  { id: "click", caption: "Click · click_purr", event: { type: "pointer.click" } },
  { id: "drag", caption: "Drag · drag_dangle", event: { type: "pointer.dragStart" } },
  { id: "drop", caption: "Drop · drop_bounce", event: { type: "pointer.drop" } },
  { id: "milestone", caption: "Milestone · milestone_celebrate", event: { type: "milestone.reached", milestone: "fifty-million" } },
];

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

app.on("window-all-closed", () => {
  // This deterministic QA process owns shutdown.
});

function clone(value) {
  return structuredClone(value);
}

function launchUsage() {
  const next = clone(fixtureSnapshot);
  next.todayTokens = 0;
  next.sevenDayTokens = 0;
  next.allTimeTokens = 0;
  next.todayCost = 0;
  next.sevenDayCost = 0;
  next.burnRate = "quiet";
  next.analysis = { ...next.analysis, daily: [], activeDays: 0, sessionCount: 0 };
  next.providers = next.providers.map((provider) => ({
    ...provider,
    todayTokens: 0,
    sevenDayTokens: 0,
    allTimeTokens: 0,
  }));
  return next;
}

function updateUsageToDemoValue() {
  usage = clone(fixtureSnapshot);
  usage.todayTokens = 750_000;
  usage.sevenDayTokens = 61_500_000;
  usage.allTimeTokens = 61_500_000;
  usage.burnRate = "steady";
  usage.providers = usage.providers.map((provider) => provider.id === "codex" || provider.id === "ccusage"
    ? { ...provider, todayTokens: usage.todayTokens, sevenDayTokens: usage.sevenDayTokens, allTimeTokens: usage.allTimeTokens }
    : provider);
}

function registerBridge() {
  ipcMain.handle("qa:get-usage", () => clone(usage));
  ipcMain.handle("qa:refresh-usage", () => clone(usage));
  ipcMain.handle("qa:get-settings", () => clone(settings));
  ipcMain.handle("qa:set-setting", (_event, key, value) => {
    settings[key] = clone(value);
    window?.webContents.send("qa:settings-updated", clone(settings));
    return clone(settings);
  });
  ipcMain.handle("qa:get-state", () => ({ settings: clone(settings), usage: clone(usage) }));
  ipcMain.handle("qa:get-quick-play-session", () => clone(emptyQuickPlaySession));
  ipcMain.handle("qa:dispatch-action", (_event, action) => {
    window?.webContents.send("qa:director-event", { type: "quickPlay.action", action });
    return { accepted: true };
  });
  ipcMain.handle("qa:summon", () => ({ moved: true }));
  ipcMain.handle("qa:capture-moment", () => ({ saved: false }));
  ipcMain.handle("qa:start-drag", () => ({ started: true }));
  ipcMain.handle("qa:end-drag", () => ({ moved: true }));
  for (const channel of ["qa:open-console", "qa:toggle-popover", "qa:close-popover", "qa:close-pet", "qa:quit"]) {
    ipcMain.on(channel, () => undefined);
  }
}

function rendererUrl() {
  const url = new URL(pathToFileURL(rendererFile));
  url.searchParams.set("view", "pet");
  url.searchParams.set("demo", "pet-story");
  // A distinct navigation URL guarantees that the second demo load starts a
  // fresh renderer/director instead of retaining the preceding Wake Up action.
  url.searchParams.set("demoLoad", String(++rendererLoadSequence));
  return url.href;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function evaluate(callback, ...args) {
  return window.webContents.executeJavaScript(`(${callback.toString()})(...${JSON.stringify(args)})`, true);
}

async function waitFor(callback, label, timeoutMs = 20_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await evaluate(callback)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
}

async function waitForActor() {
  await waitFor(() => {
    const root = document.querySelector(".pet-generated-actor-canvas-root.is-ready");
    const canvas = root?.querySelector("canvas");
    if (!canvas) return false;
    const pixels = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data ?? [];
    for (let index = 3; index < pixels.length; index += 2048) if (pixels[index] > 0) return true;
    return false;
  }, "non-empty generated actor");
}

async function loadPet() {
  await window.loadURL(rendererUrl());
  await waitForActor();
  await window.webContents.insertCSS(".pet-close{display:none!important}.pet-stage{cursor:default!important}");
  await delay(160);
}

function emit(event) {
  window.webContents.send("qa:director-event", clone(event));
}

async function captureStep(step) {
  await delay(220);
  const image = await window.webContents.capturePage();
  const png = image.toPNG();
  const file = `${String(steps.indexOf(step) + 1).padStart(2, "0")}-${step.id}.png`;
  writeFileSync(join(frameDir, file), png);
  const renderer = await evaluate(() => ({
    generatedCanvases: document.querySelectorAll(".pet-generated-actor-canvas").length,
    fallbackCanvases: document.querySelectorAll(".pet-actor-canvas-shell:not(.pet-generated-actor-shell)").length,
    tokenMode: [...(document.querySelector(".pet-generated-actor-shell")?.classList ?? [])].find((name) => name.startsWith("pet-token-")) ?? null,
    actorAnimation: document.querySelector(".pet-generated-actor-shell")?.getAttribute("data-actor-animation") ?? null,
    sleepTokenBubbleVisible: Boolean(document.querySelector('.pet-name-thought-token.is-visible[data-bubble-content-mode="token"]')),
    quickPlayAction: document.querySelector(".pet-stage")?.getAttribute("data-quick-play-action") ?? null,
    quickPlayPhase: document.querySelector(".pet-stage")?.getAttribute("data-quick-play-phase") ?? null,
    canvasWidth: document.querySelector(".pet-generated-actor-canvas")?.width ?? 0,
    canvasHeight: document.querySelector(".pet-generated-actor-canvas")?.height ?? 0,
  }));
  assert.equal(renderer.generatedCanvases, 1, `${step.id} must render exactly one generated actor canvas`);
  assert.equal(renderer.fallbackCanvases, 0, `${step.id} must not show the static fallback`);
  const sleepVisual = renderer.actorAnimation === "action.sleep_loop";
  const expectedTokenMode = step.id === "wake" || sleepVisual ? "pet-token-hidden" : "pet-token-embedded";
  assert.equal(
    renderer.tokenMode,
    expectedTokenMode,
    `${step.id === "wake" ? "wake must show the dedicated chrome-free whole-cat sequence" : sleepVisual ? `${step.id} sleep must hide the embedded frame` : `${step.id} must retain the embedded token frame`}: ${JSON.stringify(renderer)}`,
  );
  if (sleepVisual) assert.equal(renderer.sleepTokenBubbleVisible, true, `${step.id} sleep must retain the persistent token bubble: ${JSON.stringify(renderer)}`);
  return {
    ...step,
    file: `docs/screenshots/pet-story/demo-frames/${file}`,
    sha256: createHash("sha256").update(png).digest("hex"),
    width: image.getSize().width,
    height: image.getSize().height,
    renderer,
    usage: { todayTokens: usage.todayTokens, sevenDayTokens: usage.sevenDayTokens, allTimeTokens: usage.allTimeTokens },
  };
}

function findPillowPython() {
  const candidates = [
    process.env.TOKENPET_PYTHON,
    process.env.HOME ? join(process.env.HOME, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "bin", "python3") : null,
    "python3",
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    if (candidate.includes("/") && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-c", "import PIL"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("Generating the demo GIF requires Python with Pillow. Set TOKENPET_PYTHON to a compatible interpreter.");
}

function buildGif(python) {
  const result = spawnSync(python, [join(__dirname, "build-pet-story-demo-gif.py"), "--frames", frameDir, "--output", gifPath], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Demo GIF builder failed:\n${result.stderr || result.stdout}`);
  assert.ok(existsSync(gifPath), "demo GIF was not written");
}

async function run() {
  mkdirSync(frameDir, { recursive: true });
  settings.petStory = {
    ...settings.petStory,
    behaviorMode: "balanced",
    quietMode: false,
    reduceMotion: false,
    soundEnabled: false,
    followCursor: false,
    safety: { ...settings.petStory.safety, batteryLowPause: false, quietHoursEnabled: false },
  };
  registerBridge();
  window = new BrowserWindow({
    width: 260,
    height: 260,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "screenshot-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  await loadPet();
  const captures = [];
  captures.push(await captureStep(steps[0]));

  emit(steps[1].event);
  captures.push(await captureStep(steps[1]));
  // Wake Up owns a five-second chrome-free sequence. Wait for that authored
  // action to settle before asserting that the ordinary embedded token frame
  // has returned for the token-update beat.
  await delay(5_200);

  updateUsageToDemoValue();
  await loadPet();
  emit(steps[2].event);
  captures.push(await captureStep(steps[2]));

  emit(steps[3].event);
  captures.push(await captureStep(steps[3]));
  await delay(1_500);

  emit(steps[4].event);
  captures.push(await captureStep(steps[4]));

  emit(steps[5].event);
  captures.push(await captureStep(steps[5]));
  await delay(950);

  emit(steps[6].event);
  captures.push(await captureStep(steps[6]));

  const uniqueFrames = new Set(captures.map((capture) => capture.sha256));
  assert.equal(uniqueFrames.size, captures.length, "every launch-demo beat must produce a distinct renderer capture");
  const report = {
    fixture: "synthetic local demo data; no private user data",
    renderer: "dist-renderer PetApp + PetDirector + generated actor manifest",
    requiredSequence: ["wake_up", "token.delta", "click_purr", "drag_dangle", "drop_bounce", "milestone_celebrate"],
    captures,
  };
  writeFileSync(sequencePath, `${JSON.stringify(report, null, 2)}\n`);
  buildGif(findPillowPython());
  console.log(`Pet Story launch demo: ${captures.length} renderer-driven beats; ${gifPath}`);
}

function finish(exitCode) {
  if (window && !window.isDestroyed()) window.destroy();
  if (exitCode === 0) app.quit();
  else app.exit(exitCode);
}

app.whenReady().then(async () => {
  try {
    await run();
    finish(0);
  } catch (error) {
    console.error(error);
    finish(1);
  }
});
