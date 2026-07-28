import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const actorDir = join(root, "apps/desktop/public/pet-actors/golden-british");
const manifestPath = join(actorDir, "actor.json");
const requiredQuickPlayActions = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "dance",
];
const directions = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
const requiredProps = [
  "dangle-fish-blue.png", "dangle-fish-feather.png", "dangle-fish-mint.png", "dangle-wand.png",
  "snack-fish.png", "snack-paw.png", "snack-token.png",
  "toss-yarn-blue-roll.png", "toss-yarn-blue.png", "toss-yarn-orange-roll.png", "toss-yarn-orange.png",
  "toss-yarn-violet-roll.png", "toss-yarn-violet.png",
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function inspectPng(buffer, label) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${label} is not a PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export async function verifyPrebuiltPetAssets() {
  assert.ok(existsSync(manifestPath), "Prebuilt Golden British actor manifest is missing");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const schemaModulePath = join(root, "packages/pet-asset-schema/dist/index.js");
  assert.ok(existsSync(schemaModulePath), "Pet asset schema is not built; run npm run build:pet-schema");
  const { assertValidPetActorManifest } = await import(schemaModulePath);
  assert.doesNotThrow(() => assertValidPetActorManifest(manifest));
  assert.deepEqual(manifest.artboard, { width: 1024, height: 1024 });

  for (const actionId of requiredQuickPlayActions) {
    assert.ok(manifest.animations[`action.${actionId}`], `Prebuilt actor is missing action.${actionId}`);
  }
  for (const direction of directions) {
    assert.equal(manifest.animations[`action.walk_round_trip_walk_${direction}`]?.frames.length, 8, `Pet walk ${direction} is incomplete`);
    assert.equal(manifest.animations[`action.feed_snack_walk_slow_${direction}`]?.frames.length, 8, `Feed snack ${direction} is incomplete`);
    assert.equal(manifest.animations[`action.toss_yarn_chase_${direction}`]?.frames.length, 8, `Toss yarn ${direction} is incomplete`);
  }
  for (const capability of manifest.capabilities.filter((item) => item.status === "ready")) {
    assert.ok(manifest.animations[`action.${capability.id}`], `Ready capability ${capability.id} has no animation`);
  }

  const frameByPath = new Map();
  for (const animation of Object.values(manifest.animations)) {
    for (const frame of animation.frames ?? []) frameByPath.set(frame.src, frame);
    for (const variant of Object.values(animation.variants ?? {})) {
      for (const frame of variant) frameByPath.set(frame.src, frame);
    }
  }
  assert.ok(frameByPath.size >= 1_100, `Expected the complete action bundle, found only ${frameByPath.size} frames`);
  for (const [relativePath, frame] of frameByPath) {
    const filePath = join(actorDir, relativePath);
    assert.ok(existsSync(filePath), `Missing prebuilt frame ${relativePath}`);
    const buffer = readFileSync(filePath);
    assert.equal(sha256(buffer), frame.sha256, `Prebuilt frame hash changed: ${relativePath}`);
    assert.deepEqual(inspectPng(buffer, relativePath), manifest.artboard, `Unexpected frame geometry: ${relativePath}`);
  }
  const runtimeFrames = readdirSync(join(actorDir, "frames")).filter((file) => file.endsWith(".png"));
  assert.equal(runtimeFrames.length, frameByPath.size, "Prebuilt bundle contains stale or unregistered frames");

  for (const prop of requiredProps) {
    const path = join(actorDir, "props", prop);
    assert.ok(existsSync(path) && statSync(path).size > 0, `Missing Quick Play prop ${prop}`);
    inspectPng(readFileSync(path), `props/${prop}`);
  }
  for (const mediaPath of [
    "apps/desktop/public/pet-video/dance-golden-style.webm",
    "apps/desktop/public/pet-audio/dance-video-reference.m4a",
  ]) {
    const filePath = join(root, mediaPath);
    assert.ok(existsSync(filePath) && statSync(filePath).size > 32_000, `Missing production Dance media ${mediaPath}`);
  }

  const bytes = [...frameByPath.keys()].reduce((total, path) => total + statSync(join(actorDir, path)).size, 0);
  const summary = {
    actorId: manifest.actorId,
    animations: Object.keys(manifest.animations).length,
    frames: frameByPath.size,
    frameBytes: bytes,
    quickPlayActions: requiredQuickPlayActions.length,
    directions: directions.length,
  };
  process.stdout.write(`Prebuilt pet asset QA passed: ${summary.frames} hashed frames, ${summary.quickPlayActions} Quick Play actions, ${summary.directions} directions.\n`);
  return summary;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) verifyPrebuiltPetAssets().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
