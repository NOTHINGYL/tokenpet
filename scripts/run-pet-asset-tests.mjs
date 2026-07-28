import { spawnSync } from "node:child_process";
import { authoringAssetStatus } from "./pet-asset-mode.mjs";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const status = authoringAssetStatus();
if (status.available) {
  process.stdout.write(`Pet asset tests: full authoring suite (${status.reason}).\n`);
  run(npm, ["--prefix", "packages/pet-asset-schema", "test"]);
  run(npm, ["--prefix", "tools/pet-asset-studio", "test"]);
} else {
  process.stdout.write(`Pet asset tests: prebuilt production suite (${status.reason}).\n`);
  run(npm, ["run", "build:pet-schema"]);
  run(process.execPath, ["scripts/verify-prebuilt-pet-assets.mjs"]);
}
