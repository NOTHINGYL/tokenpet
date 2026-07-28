const { app, BrowserWindow, ipcMain } = require("electron");
const { createHash } = require("node:crypto");
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const ffmpegPath = require("ffmpeg-static");
const { settings: initialSettings, snapshot } = require("./pet-story-screenshot-fixture.cjs");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

const root = join(__dirname, "..");
const rendererFile = join(root, "dist-renderer", "index.html");
const screenshotDir = join(root, "docs", "screenshots", "pet-story");
const outputDir = join(root, "docs", "readme");
const outputGif = join(outputDir, "tokenpet-actions-showcase.gif");
const settings = structuredClone(initialSettings);
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

const actions = [
  { id: "walk_round_trip", label: "Pet" },
  { id: "token_snack", label: "Feed snack" },
  { id: "play_cursor", label: "Play cursor" },
  { id: "drag_dangle", label: "Dangle toy" },
  { id: "toss_yarn", label: "Toss yarn" },
  { id: "nap_here", label: "Nap here" },
  { id: "wake_up", label: "Wake up" },
  { id: "dance", label: "Dance" },
];

const staticAssets = [
  { source: "desktop-pet.png", output: "desktop-companion.png", surface: "Desktop companion" },
  { source: "quick-play-unlocked.png", output: "quick-play.png", surface: "Quick Play" },
  { source: "console-overview.png", output: "console-overview.png", surface: "Console overview" },
  { source: "console-appearance.png", output: "console-appearance.png", surface: "Pet appearance" },
  { source: "console-mood-reactions.png", output: "console-mood-reactions.png", surface: "Mood and reactions" },
];

function clone(value) {
  return structuredClone(value);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function broadcast(channel, value) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, clone(value));
  }
}

function registerFixtureBridge() {
  let quickPlaySession = clone(emptyQuickPlaySession);
  ipcMain.handle("qa:get-usage", () => clone(snapshot));
  ipcMain.handle("qa:refresh-usage", () => clone(snapshot));
  ipcMain.handle("qa:get-settings", () => clone(settings));
  ipcMain.handle("qa:set-setting", (_event, key, value) => {
    settings[key] = clone(value);
    broadcast("qa:settings-updated", settings);
    return clone(settings);
  });
  ipcMain.handle("qa:get-state", () => ({ settings: clone(settings) }));
  ipcMain.handle("qa:get-quick-play-session", () => clone(quickPlaySession));
  ipcMain.handle("qa:set-quick-play-session", (_event, session) => {
    quickPlaySession = clone({ ...emptyQuickPlaySession, ...session });
    broadcast("qa:quick-play-session-changed", quickPlaySession);
    return clone(quickPlaySession);
  });
  ipcMain.handle("qa:set-quick-play-director-suppressed", (_event, suppressed) => Boolean(suppressed));
  ipcMain.handle("qa:dispatch-action", () => ({ accepted: true }));
  ipcMain.handle("qa:summon", () => ({ moved: true }));
  ipcMain.handle("qa:capture-moment", () => ({ saved: true, filePath: "synthetic-pet-moment.png" }));
  ipcMain.handle("qa:start-drag", () => ({ started: true }));
  ipcMain.handle("qa:end-drag", () => ({ moved: true }));
  for (const channel of ["qa:open-console", "qa:quit", "qa:toggle-popover", "qa:close-popover", "qa:close-pet"]) {
    ipcMain.on(channel, () => undefined);
  }
}

function rendererUrl(view) {
  const url = new URL(pathToFileURL(rendererFile));
  url.searchParams.set("view", view);
  return url.href;
}

async function evaluate(window, callback, ...args) {
  const source = `(${callback.toString()})(...${JSON.stringify(args)})`;
  return window.webContents.executeJavaScript(source, true);
}

async function waitFor(window, callback, args, label, timeoutMs = 20_000) {
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

async function click(window, selector) {
  const clicked = await evaluate(window, (value) => {
    const element = document.querySelector(value);
    if (!(element instanceof HTMLButtonElement) || element.disabled) return false;
    element.click();
    return true;
  }, selector);
  if (!clicked) throw new Error(`Unable to click ${selector}`);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function imageDimensions(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${filePath} is not a PNG`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function exportStaticAssets() {
  return staticAssets.map((asset) => {
    const sourcePath = join(screenshotDir, asset.source);
    const outputPath = join(outputDir, asset.output);
    if (!existsSync(sourcePath)) throw new Error(`Missing screenshot source: ${sourcePath}`);
    copyFileSync(sourcePath, outputPath);
    return {
      kind: "screenshot",
      surface: asset.surface,
      file: `docs/readme/${asset.output}`,
      source: `docs/screenshots/pet-story/${asset.source}`,
      ...imageDimensions(outputPath),
      bytes: statSync(outputPath).size,
      sha256: sha256(outputPath),
    };
  });
}

async function prepareActionsWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 780,
    show: false,
    frame: false,
    backgroundColor: "#f5f7fa",
    webPreferences: {
      preload: join(__dirname, "screenshot-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  await window.loadURL(rendererUrl("console"));
  await waitFor(window, () => Boolean(document.querySelector("#root > *")), [], "Console renderer");
  await evaluate(window, async () => {
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.complete
      ? Promise.resolve()
      : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })));
  });
  await click(window, "[data-console-tab=pet]");
  await waitFor(window, () => Boolean(document.querySelector("[data-pet-page=appearance]")), [], "Pet Appearance");
  await click(window, "[data-pet-section=actions]");
  await waitFor(window, () => Boolean(document.querySelector("[data-pet-page=actions]")), [], "Pet Actions");
  await waitFor(window, () => Boolean(document.querySelector("[data-action-preview] .pet-generated-actor-canvas-root.is-ready")), [], "ready action actor");

  await evaluate(window, () => {
    const style = document.createElement("style");
    style.id = "readme-actions-capture-style";
    style.textContent = `
      html, body, #root { width: 100%; height: 100%; overflow: hidden !important; background: #f4f7f5 !important; }
      .console-shell { display: block !important; width: 100% !important; height: 100% !important; min-height: 0 !important; }
      .console-sidebar, .console-header, .pet-console-subnav, .action-settings-card,
      .action-filmstrip, .action-preview-footer { display: none !important; }
      .console-view, .console-content, .pet-appearance-panel.appearance-v22.pet-story-root {
        display: block !important; width: 100% !important; height: 100% !important;
        min-width: 0 !important; min-height: 0 !important; padding: 0 !important;
        margin: 0 !important; overflow: hidden !important;
      }
      .actions-workbench-page {
        display: grid !important; width: 100% !important; height: 100% !important;
        box-sizing: border-box !important; grid-template-rows: 108px minmax(0, 1fr) !important;
        gap: 12px !important; padding: 16px !important;
        background: linear-gradient(145deg, #f7faf8 0%, #f4f6fa 100%) !important;
      }
      .action-selector { grid-template-columns: repeat(8, minmax(0, 1fr)) !important; gap: 9px !important; }
      .action-selector > button { min-height: 108px !important; padding: 8px 5px !important; }
      .action-selector > button img { width: 52px !important; height: 48px !important; }
      .action-selector > button strong { font-size: 11px !important; }
      .actions-workspace { display: block !important; min-height: 0 !important; }
      .action-preview-card {
        height: 100% !important; min-height: 0 !important; box-sizing: border-box !important;
        grid-template-rows: auto minmax(0, 1fr) 18px 44px !important;
        padding: 14px 16px 10px !important; border-radius: 14px !important;
      }
      .action-preview-header { padding-bottom: 8px !important; }
      .action-preview-header h2 { font-size: 18px !important; }
      .action-preview-header > span { font-size: 10px !important; }
      .action-preview-stage { min-height: 0 !important; border-radius: 10px !important; }
      .action-transport > span, .action-loop-toggle strong { font-size: 10px !important; }
      .action-preview-coordinate-readout { display: none !important; }
    `;
    document.head.append(style);
  });
  await delay(350);
  return window;
}

async function seekAction(window, actionId, fraction) {
  await click(window, `[data-action-id="${actionId}"]`);
  await waitFor(window, (id) => document.querySelector("[data-pet-page=actions][data-selected-action]")?.dataset.selectedAction === id, [actionId], `${actionId} selection`);
  await evaluate(window, () => {
    const label = document.querySelector("[data-action-id].selected strong")?.textContent?.trim();
    const heading = document.querySelector(".action-preview-header h2");
    if (label && heading) heading.textContent = `${label} · Action Preview`;
  });
  const seekResult = await evaluate(window, (progress) => {
    const input = document.querySelector("[data-action-scrubber]");
    if (!(input instanceof HTMLInputElement)) return null;
    const maximum = Number(input.max);
    const value = Math.max(0, Math.min(maximum, Math.round(maximum * progress)));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { maximum, value };
  }, fraction);
  if (!seekResult) throw new Error(`Unable to seek ${actionId}`);
  await delay(actionId === "dance" ? 115 : 45);
  return seekResult;
}

async function captureActionsGif() {
  const frameRate = 10;
  const framesPerAction = 24;
  const totalFrames = actions.length * framesPerAction;
  const durationMs = totalFrames / frameRate * 1000;
  const frameDir = mkdtempSync(join(tmpdir(), "tokenpet-readme-actions-"));
  const window = await prepareActionsWindow();
  const segments = [];
  let frameNumber = 1;

  try {
    for (const action of actions) {
      const firstFrame = frameNumber;
      let sourceDurationMs = 0;
      for (let actionFrame = 0; actionFrame < framesPerAction; actionFrame += 1) {
        const fraction = actionFrame / (framesPerAction - 1);
        const seek = await seekAction(window, action.id, fraction);
        sourceDurationMs = seek.maximum;
        const image = await window.webContents.capturePage();
        const framePath = join(frameDir, `frame-${String(frameNumber).padStart(4, "0")}.png`);
        writeFileSync(framePath, image.toPNG());
        frameNumber += 1;
      }
      segments.push({
        id: action.id,
        label: action.label,
        firstFrame,
        frameCount: framesPerAction,
        showcaseDurationMs: framesPerAction / frameRate * 1000,
        sourceDurationMs,
      });
      process.stdout.write(`Captured README action: ${action.label}\n`);
    }

    const inputPattern = join(frameDir, "frame-%04d.png");
    const filter = [
      `fps=${frameRate},scale=720:-2:flags=lanczos,split[s0][s1]`,
      "[s0]palettegen=max_colors=160:stats_mode=diff[p]",
      "[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
    ].join(";");
    const encoded = spawnSync(ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-framerate", String(frameRate), "-i", inputPattern,
      "-filter_complex", filter,
      "-loop", "0", outputGif,
    ], { encoding: "utf8" });
    if (encoded.status !== 0) {
      throw new Error(`ffmpeg failed (${encoded.status}): ${encoded.stderr || encoded.stdout}`);
    }
    if (!existsSync(outputGif) || statSync(outputGif).size === 0) throw new Error("README GIF was not created");

    return {
      kind: "animation",
      surface: "Eight Quick Play actions",
      file: "docs/readme/tokenpet-actions-showcase.gif",
      width: 720,
      durationMs,
      frameRate,
      frameCount: totalFrames,
      loop: true,
      bytes: statSync(outputGif).size,
      sha256: sha256(outputGif),
      segments,
    };
  } finally {
    if (!window.isDestroyed()) window.destroy();
    rmSync(frameDir, { recursive: true, force: true });
  }
}

async function run() {
  mkdirSync(outputDir, { recursive: true });
  registerFixtureBridge();
  const screenshots = exportStaticAssets();
  const animation = await captureActionsGif();
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    fixture: "synthetic local demo data; no private user data",
    renderer: "TokenPet production renderer captured through Electron",
    deterministicExport: {
      actions: actions.map(({ id, label }) => ({ id, label })),
      note: "Every action is sampled across its complete source timeline into a fixed 2.4 second showcase segment.",
    },
    assets: [...screenshots, animation],
  };
  writeFileSync(join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`README assets exported: ${screenshots.length} screenshots + ${basename(outputGif)} (${(animation.bytes / 1024 / 1024).toFixed(2)} MiB, ${(animation.durationMs / 1000).toFixed(1)} sec).\n`);
}

app.whenReady().then(run).then(() => app.quit()).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  app.exit(1);
});
