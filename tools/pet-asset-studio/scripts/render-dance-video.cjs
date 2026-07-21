const { app, BrowserWindow } = require("electron");
const { spawn } = require("node:child_process");
const { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const crypto = require("node:crypto");

const root = resolve(__dirname, "../../..");
const rendererHtml = join(root, "tools", "pet-asset-studio", "dance-video", "style-renderer.html");
const sourceRoot = join(root, "assets", "source", "pet-actors", "golden-british", "story-actions", "dance-video-v3");
const referenceRoot = join(root, "assets", "source", "pet-actors", "golden-british", "story-actions", "dance-video-reference-v2");
const publicRoot = join(root, "apps", "desktop", "public", "pet-video");
const publicAudioRoot = join(root, "apps", "desktop", "public", "pet-audio");
const sourceVideo = join(sourceRoot, "dance-golden-style.webm");
const publicVideo = join(publicRoot, "dance-golden-style.webm");
const referenceAudio = join(referenceRoot, "reference-audio.m4a");
const sourceAudio = join(sourceRoot, "dance-loop-reference.m4a");
const publicAudio = join(publicAudioRoot, "dance-video-reference.m4a");
const sourcePreview = join(sourceRoot, "dance-golden-style-preview.png");
const manifestPath = join(sourceRoot, "manifest.json");
const ffmpegPath = require("ffmpeg-static");

const width = 512;
const height = 512;
const fps = 60;
const durationMs = 10_133;
const frameCount = Math.ceil(durationMs / 1_000 * fps);
const previewOnly = process.argv.includes("--preview-only");

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("force-device-scale-factor", "1");

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function sha256(path) {
  return crypto.createHash("sha256").update(await readFile(path)).digest("hex");
}

async function waitForRenderer(window) {
  await window.webContents.executeJavaScript(`new Promise((resolve) => {
    if (window.renderDanceFrame) return resolve(true);
    window.addEventListener('dance-style:ready', () => resolve(true), { once: true });
  })`);
}

async function render() {
  await mkdir(sourceRoot, { recursive: true });
  await mkdir(publicRoot, { recursive: true });
  await mkdir(publicAudioRoot, { recursive: true });
  const frameRoot = await mkdtemp(join(tmpdir(), "tokenpet-dance-style-"));
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    webPreferences: { backgroundThrottling: false },
  });
  let encodedWidth = width;
  let encodedHeight = height;

  try {
    await window.loadFile(rendererHtml);
    await waitForRenderer(window);
    if (previewOnly) {
      await window.webContents.executeJavaScript(`new Promise((resolve) => {
        window.renderDanceFrame(3300);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })`);
      const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
      const preview = image.getSize().width === width && image.getSize().height === height
        ? image
        : image.resize({ width, height, quality: "best" });
      await writeFile(sourcePreview, preview.toPNG());
      process.stdout.write(`dance-video-style: wrote preview ${sourcePreview}\n`);
      return;
    }
    for (let index = 0; index < frameCount; index += 1) {
      const milliseconds = index / fps * 1_000;
      await window.webContents.executeJavaScript(`new Promise((resolve) => {
        window.renderDanceFrame(${milliseconds});
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })`);
      const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
      const outputImage = image.getSize().width === width && image.getSize().height === height
        ? image
        : image.resize({ width, height, quality: "best" });
      const png = outputImage.toPNG();
      const filename = `frame-${String(index).padStart(4, "0")}.png`;
      await writeFile(join(frameRoot, filename), png);
      if (index === Math.round(frameCount * 0.16)) await writeFile(sourcePreview, png);
      if (index % 120 === 0 || index === frameCount - 1) {
        process.stdout.write(`dance-video-style: rendered ${index + 1}/${frameCount}\n`);
      }
    }

    await run(ffmpegPath, [
      "-y",
      "-framerate", String(fps),
      "-i", join(frameRoot, "frame-%04d.png"),
      "-t", (durationMs / 1_000).toFixed(3),
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuva420p",
      "-crf", "30",
      "-b:v", "0",
      "-deadline", "good",
      "-cpu-used", "2",
      "-row-mt", "1",
      "-auto-alt-ref", "0",
      "-metadata:s:v:0", "alpha_mode=1",
      "-an",
      sourceVideo,
    ]);
    await copyFile(sourceVideo, publicVideo);
    await run(ffmpegPath, [
      "-y",
      "-i", referenceAudio,
      "-t", (durationMs / 1_000).toFixed(3),
      "-vn",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      sourceAudio,
    ]);
    await copyFile(sourceAudio, publicAudio);

    const manifest = {
      schemaVersion: "tokenpet-dance-video/v2",
      renderer: "loop-detected-registered-golden-british-video-v9",
      sourceReference: "private authoring reference (not distributed)",
      loopAnalysis: "assets/source/pet-actors/golden-british/story-actions/dance-video-v3/reference-loop-analysis.json",
      sourceDurationMs: 20_422,
      selectedLoopPeriodMs: durationMs,
      video: "assets/source/pet-actors/golden-british/story-actions/dance-video-v3/dance-golden-style.webm",
      runtimeVideo: "apps/desktop/public/pet-video/dance-golden-style.webm",
      audio: "apps/desktop/public/pet-audio/dance-video-reference.m4a",
      authoringAudio: "assets/source/pet-actors/golden-british/story-actions/dance-video-v3/dance-loop-reference.m4a",
      width: encodedWidth,
      height: encodedHeight,
      fps,
      frameCount,
      durationMs,
      codec: "vp9",
      pixelFormat: "yuva420p",
      hasAlpha: true,
      audioMuxed: false,
      synchronization: "shared-source-clock-100ms-correction",
      sourceKeyframes: {
        canonicalRegisteredFrames: 48,
        mixedIdentityMasterFrames: 0,
        publishedTimelineFrames: frameCount,
      },
      motion: {
        closedMouth: "offline-full-pose-forward-blend-collar-pivot-connected-impact-head-shake",
        tongueOut: "offline-fixed-cadence-counterphase-head-haunch-groove",
        paws: "planted",
        bodyAnchor: "fixed-512x818-source-to-256x414-output",
        visibleHeightPx: 336,
      },
      sha256: await sha256(sourceVideo),
      audioSha256: await sha256(sourceAudio),
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    process.stdout.write(`dance-video-style: wrote ${sourceVideo}\n`);
    process.stdout.write(`dance-video-style: copied ${publicVideo}\n`);
    process.stdout.write(`dance-video-style: wrote ${sourceAudio}\n`);
    process.stdout.write(`dance-video-style: copied ${publicAudio}\n`);
  } finally {
    if (!window.isDestroyed()) window.destroy();
    await rm(frameRoot, { recursive: true, force: true });
  }
}

app.whenReady().then(async () => {
  try {
    await render();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
