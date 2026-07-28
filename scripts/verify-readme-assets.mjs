import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = join(root, "README.md");
const assetDir = join(root, "docs", "readme");
const manifestPath = join(assetDir, "manifest.json");

assert.ok(existsSync(readmePath), "README.md is missing");
assert.ok(existsSync(manifestPath), "docs/readme/manifest.json is missing; run npm run capture:readme first");

const readme = readFileSync(readmePath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const animation = manifest.assets.find((asset) => asset.kind === "animation");
const screenshots = manifest.assets.filter((asset) => asset.kind === "screenshot");

assert.ok(!/^##\s+(Status|Version)\b/imu.test(readme), "README must not contain Status or Version sections");
assert.ok(!/Sound Cues|Journey|Accessories/iu.test(readme), "README must not advertise hidden Pet surfaces");
assert.match(readme, /inspired by[^\n]*real cat/iu, "README must include the real-cat inspiration");
assert.match(readme, /npm run launch/u, "README must include the source launch command");
assert.equal(screenshots.length, 5, "README export must contain five key screenshots");
assert.ok(animation, "README action animation is missing from the manifest");
assert.ok(animation.durationMs >= 15_000 && animation.durationMs <= 25_000, "README GIF must be 15–25 seconds");
assert.equal(animation.segments.length, 8, "README GIF must cover all eight actions");
assert.deepEqual(animation.segments.map((segment) => segment.id), [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "dance",
]);

for (const asset of manifest.assets) {
  const filePath = join(root, asset.file);
  assert.ok(existsSync(filePath), `Missing README asset: ${asset.file}`);
  assert.ok(statSync(filePath).size > 0, `Empty README asset: ${asset.file}`);
  assert.ok(readme.includes(asset.file.replace(/^docs\//u, "./docs/")), `README does not reference ${asset.file}`);
}

const gif = readFileSync(join(root, animation.file));
assert.ok(["GIF87a", "GIF89a"].includes(gif.subarray(0, 6).toString("ascii")), "Action showcase is not a GIF");
assert.equal(gif.readUInt16LE(6), animation.width, "GIF width does not match the manifest");

process.stdout.write(`README media QA passed: ${screenshots.length} screenshots, ${animation.segments.length} actions, ${(animation.durationMs / 1000).toFixed(1)} sec GIF.\n`);
