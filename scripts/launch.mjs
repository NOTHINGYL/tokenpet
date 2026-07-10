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

const child = spawn(electronCommand, ["."], {
  cwd: root,
  detached: true,
  shell: false,
  stdio: "ignore",
});

child.unref();

console.log(`TokenPet launched in the background. PID: ${child.pid}`);
console.log("The pet close button hides the companion; use Quit TokenPet from its right-click menu to exit the app.");
