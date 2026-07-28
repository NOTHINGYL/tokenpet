import { spawnSync } from "node:child_process";
import { authoringAssetStatus } from "./pet-asset-mode.mjs";

const status = authoringAssetStatus();
const script = status.available ? "scripts/verify-pet-story.mjs" : "scripts/verify-prebuilt-pet-assets.mjs";
process.stdout.write(`Pet Story verification: ${status.available ? "authoring + runtime static suite" : "prebuilt production asset suite"} (${status.reason}).\n`);
const result = spawnSync(process.execPath, [script], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
