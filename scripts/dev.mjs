import { spawn } from "node:child_process";
import { createConnection } from "node:net";

const devServerUrl = "http://127.0.0.1:5173";
const children = new Set();

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  children.add(child);
  child.on("exit", (code) => {
    children.delete(child);
    if (code && !options.allowFailure) {
      shutdown(code);
    }
  });

  return child;
}

function runOnce(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("exit", (code) => {
      if (code) {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function waitForPort(port, host) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function attempt() {
      const socket = createConnection({ port, host }, () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > 15000) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    }

    attempt();
  });
}

function shutdown(code = 0) {
  for (const child of children) {
    child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

await runOnce("npm", ["run", "build:main"]);
const vite = run("npm", ["exec", "vite", "--", "--config", "apps/desktop/vite.config.ts", "--host", "127.0.0.1"]);

await waitForPort(5173, "127.0.0.1");

const electron = run("npm", ["exec", "electron", "--", "."], {
  env: {
    ...process.env,
    QUOTAPET_DEV_SERVER_URL: devServerUrl,
  },
});

electron.on("exit", (code) => {
  vite.kill();
  shutdown(code ?? 0);
});
