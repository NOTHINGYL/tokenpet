const { app, BrowserWindow } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const rendererUrl = (view) => `file://${join(root, "dist-renderer/index.html")}?view=${view}`;
const outputDir = join(root, "docs", "screenshots");
const windows = [];

app.on("window-all-closed", () => {
  // Keep the screenshot runner alive until all captures finish.
});

async function capture(view, fileName, options) {
  const window = new BrowserWindow({
    width: options.width,
    height: options.height,
    show: false,
    backgroundColor: "#eef2f6",
    webPreferences: {
      preload: join(__dirname, "screenshot-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  windows.push(window);

  await window.loadURL(rendererUrl(view));
  await window.webContents.insertCSS(`
    html,
    body {
      background: #eef2f6 !important;
    }

    body {
      padding: 24px !important;
    }

    #root {
      width: calc(100vw - 48px) !important;
      height: calc(100vh - 48px) !important;
    }
  `);
  await new Promise((resolve) => setTimeout(resolve, 700));

  const image = await window.webContents.capturePage();
  writeFileSync(join(outputDir, fileName), image.toPNG());
}

app.whenReady().then(async () => {
  mkdirSync(outputDir, { recursive: true });

  await capture("console", "console-v05.png", { width: 1280, height: 1400 });
  await capture("menubar", "menubar-v05.png", { width: 548, height: 408 });
  await capture("pet", "pet-v05.png", { width: 320, height: 320 });

  for (const window of windows) {
    window.destroy();
  }

  app.quit();
});
