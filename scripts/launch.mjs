import { spawn } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const electronCommand = join(root, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron");

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", "build"], {
      cwd: root,
      shell: false,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code) {
        reject(new Error(`Build failed with exit code ${code}`));
        return;
      }

      resolve();
    });
  });
}

await runBuild();

const replacementExitCode = 75;
const startupProbeMs = 900;
const replacementRetryMs = 250;
const replacementAttempts = 24;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function launchAttempt() {
  return new Promise((resolve, reject) => {
    const child = spawn(electronCommand, [".", "--tokenpet-replace-running"], {
      cwd: root,
      detached: true,
      shell: false,
      stdio: "ignore",
    });

    let settled = false;
    const startupTimer = setTimeout(() => {
      settled = true;
      child.unref();
      resolve(child.pid);
    }, startupProbeMs);

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      reject(error);
    });

    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      if (code === replacementExitCode) {
        resolve(null);
        return;
      }
      reject(new Error(`TokenPet exited during startup with code ${code ?? "unknown"}`));
    });
  });
}

let launchedPid = null;
for (let attempt = 0; attempt < replacementAttempts; attempt += 1) {
  launchedPid = await launchAttempt();
  if (launchedPid) break;
  await delay(replacementRetryMs);
}

if (!launchedPid) {
  throw new Error("Timed out waiting for the previous TokenPet instance to exit");
}

console.log(`TokenPet launched in the background. PID: ${launchedPid}`);
console.log("The pet close button hides the companion; use Quit TokenPet from its right-click menu to exit the app.");
