const { app, BrowserWindow } = require("electron");
const { mkdir, writeFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = resolve(__dirname, "../../..");
const videoPath = join(root, "apps", "desktop", "public", "pet-video", "dance-golden-style.webm");
const audioPath = join(root, "apps", "desktop", "public", "pet-audio", "dance-video-reference.m4a");
const verifierPath = join(root, "tools", "pet-asset-studio", "dance-video", "verify.html");
const screenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-alpha-qa.png");
const tongueScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-style-tongue-qa.png");
const tonguePopScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-tongue-pop-qa.png");
const tongueRetractScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-tongue-retract-qa.png");
const closedMouthLeftScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-closed-mouth-left-qa.png");
const closedMouthRightScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-closed-mouth-right-qa.png");
const tongueCounterLeftScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-tongue-counter-left-qa.png");
const tongueCounterRightScreenshotPath = join(root, "docs", "screenshots", "pet-story", "dance-video-tongue-counter-right-qa.png");
const testColor = { red: 255, green: 0, blue: 255 };

app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function readPixel(bitmap, width, x, y) {
  const offset = (y * width + x) * 4;
  return {
    blue: bitmap[offset],
    green: bitmap[offset + 1],
    red: bitmap[offset + 2],
    alpha: bitmap[offset + 3],
  };
}

function matchesTestColor(pixel) {
  return pixel.red >= 225 && pixel.blue >= 225 && pixel.green <= 65;
}

async function verify() {
  const width = 640;
  const height = 640;
  const window = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    resizable: false,
    backgroundColor: "#ff00ff",
    webPreferences: { backgroundThrottling: false },
  });
  try {
    await window.loadFile(verifierPath);
    await window.webContents.executeJavaScript(`window.loadDanceVideo(${JSON.stringify(pathToFileURL(videoPath).href)})`);
    const videoInfo = await window.webContents.executeJavaScript(`(() => {
      const video = document.querySelector("#dance");
      return { duration: video.duration, readyState: video.readyState };
    })()`);
    const audioInfo = await window.webContents.executeJavaScript(`new Promise((resolve) => {
      const audio = new Audio(${JSON.stringify(pathToFileURL(audioPath).href)});
      const finish = (result) => {
        audio.pause();
        resolve({ ...result, duration: audio.duration, currentTime: audio.currentTime, muted: audio.muted });
      };
      const timeout = setTimeout(() => finish({ loaded: false, played: false, reason: 'timeout' }), 5000);
      audio.preload = 'auto';
      audio.volume = 0;
      audio.addEventListener('error', () => {
        clearTimeout(timeout);
        finish({ loaded: false, played: false, reason: audio.error?.message || 'media-error' });
      }, { once: true });
      audio.addEventListener('loadedmetadata', async () => {
        try {
          audio.currentTime = .2;
          await audio.play();
          setTimeout(() => {
            clearTimeout(timeout);
            finish({ loaded: true, played: !audio.paused && audio.currentTime > .3 });
          }, 250);
        } catch (error) {
          clearTimeout(timeout);
          finish({ loaded: true, played: false, reason: String(error) });
        }
      }, { once: true });
      audio.load();
    })`);
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await mkdir(join(root, "docs", "screenshots", "pet-story"), { recursive: true });
    await writeFile(screenshotPath, image.toPNG());
    const bitmap = image.toBitmap();
    const capturedSize = image.getSize();
    const samples = [
      readPixel(bitmap, capturedSize.width, 8, 8),
      readPixel(bitmap, capturedSize.width, capturedSize.width - 9, 8),
      readPixel(bitmap, capturedSize.width, 8, capturedSize.height - 9),
      readPixel(bitmap, capturedSize.width, capturedSize.width - 9, capturedSize.height - 9),
    ];
    const alphaVisible = samples.every(matchesTestColor);
    await window.webContents.executeJavaScript("window.seekDanceVideo(1.8)");
    const tongueImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(tongueScreenshotPath, tongueImage.toPNG());
    await window.webContents.executeJavaScript("window.seekDanceVideo(.96)");
    const tonguePopImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(tonguePopScreenshotPath, tonguePopImage.toPNG());
    await window.webContents.executeJavaScript("window.seekDanceVideo(2.55)");
    const tongueRetractImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(tongueRetractScreenshotPath, tongueRetractImage.toPNG());
    await window.webContents.executeJavaScript("window.seekDanceVideo(3.233)");
    const closedMouthLeftImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(closedMouthLeftScreenshotPath, closedMouthLeftImage.toPNG());
    await window.webContents.executeJavaScript("window.seekDanceVideo(3.400)");
    const closedMouthRightImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(closedMouthRightScreenshotPath, closedMouthRightImage.toPNG());
    await window.webContents.executeJavaScript("window.seekDanceVideo(1.217)");
    const tongueCounterLeftImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(tongueCounterLeftScreenshotPath, tongueCounterLeftImage.toPNG());
    await window.webContents.executeJavaScript("window.seekDanceVideo(1.533)");
    const tongueCounterRightImage = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    await writeFile(tongueCounterRightScreenshotPath, tongueCounterRightImage.toPNG());
    const durationCorrect = videoInfo.duration >= 10.12 && videoInfo.duration <= 10.15;
    process.stdout.write(`${JSON.stringify({ alphaVisible, durationCorrect, audioInfo, videoInfo, capturedSize, samples, screenshotPath, tongueScreenshotPath, tonguePopScreenshotPath, tongueRetractScreenshotPath, closedMouthLeftScreenshotPath, closedMouthRightScreenshotPath, tongueCounterLeftScreenshotPath, tongueCounterRightScreenshotPath }, null, 2)}\n`);
    if (!alphaVisible || !durationCorrect || !audioInfo.loaded || !audioInfo.played) process.exitCode = 1;
  } finally {
    window.destroy();
  }
}

app.whenReady().then(verify).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => app.quit());
