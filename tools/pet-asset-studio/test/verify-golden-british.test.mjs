import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertValidPetActorManifest, PET_ACTOR_QUICK_PLAY_ACTION_IDS } from "../../../packages/pet-asset-schema/dist/index.js";
import { buildGoldenBritish } from "../src/build-golden-british.mjs";

const toolDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(toolDir, "../..");
const bundleDir = resolve(repoRoot, "apps/desktop/public/pet-actors/golden-british");
const sourceSpecPath = resolve(repoRoot, "assets/source/pet-actors/golden-british/source.json");
const walkClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/walk-round-trip-v4");
const walkRegistrationPath = resolve(walkClipRoot, "locomotion-report.json");
const feedClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/feed-snack-v2");
const feedAssetReportPath = resolve(feedClipRoot, "asset-report.json");

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function inspectPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(buffer.subarray(0, 8).equals(signature), "frame must use the PNG binary signature");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
}

test("Golden British build is deterministic and schema-valid", async () => {
  await buildGoldenBritish();
  const firstManifest = await readFile(resolve(bundleDir, "actor.json"));
  const firstReport = await readFile(resolve(bundleDir, "qa/asset-report.json"));
  const second = await buildGoldenBritish();
  const secondManifest = await readFile(resolve(bundleDir, "actor.json"));
  const secondReport = await readFile(resolve(bundleDir, "qa/asset-report.json"));
  assert.equal(second.changed, 0, "a second build with identical inputs must not rewrite outputs");
  assert.deepEqual(secondManifest, firstManifest);
  assert.deepEqual(secondReport, firstReport);

  const manifest = JSON.parse(secondManifest.toString("utf8"));
  assert.doesNotThrow(() => assertValidPetActorManifest(manifest));
});

test("every ready capability resolves to a same-id production animation", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  for (const capability of manifest.capabilities.filter((entry) => entry.status === "ready")) {
    const animationKey = `action.${capability.id}`;
    assert.ok(manifest.animations[animationKey], `${capability.id} cannot claim ready without ${animationKey}`);
  }
  for (const quickPlayId of PET_ACTOR_QUICK_PLAY_ACTION_IDS) {
    const capability = manifest.capabilities.find((entry) => entry.id === quickPlayId);
    assert.ok(["ready", "fallback"].includes(capability?.status), `${quickPlayId} should resolve through the actor bundle`);
    if (capability.status === "fallback") {
      assert.equal(manifest.capabilities.find((entry) => entry.id === capability.fallbackId)?.status, "ready", `${quickPlayId} fallback must terminate at a ready actor state`);
    }
  }
});

test("high-value actions use approved multi-frame sequences and desktop traversal is explicit", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  for (const actionId of ["blink", "hot_loop", "overdrive_loop", "click_purr", "drop_bounce", "token_snack", "play_cursor", "milestone_celebrate"]) {
    assert.ok(manifest.animations[`action.${actionId}`].frames.length >= 2, `${actionId} must not ship as a single swapped image`);
  }

  const traversal = manifest.animations["action.run_across"];
  assert.equal(traversal.kind, "oneShot");
  assert.equal(traversal.frames.length, 12, "run_across needs its declared 12-step sequence");
  assert.ok(new Set(traversal.frames.map((frame) => frame.src)).size >= 4, "run_across must use multiple approved action poses");
  assert.ok(traversal.frames.reduce((total, frame) => total + frame.durationMs, 0) >= 2_000);
  assert.equal(manifest.capabilities.find((entry) => entry.id === "run_across")?.runtimeBehavior, "choreography");

  const naturalWalk = manifest.animations["action.walk_round_trip"];
  assert.equal(naturalWalk.loop, true);
  assert.equal(naturalWalk.frames.length, 8, "walk_round_trip needs a complete eight-phase four-beat feline gait cycle");
  assert.equal(new Set(naturalWalk.frames.map((frame) => frame.src)).size, 8, "every gait phase must use its own approved walking pose");
  assert.ok(naturalWalk.frames.every((frame) => /walk_round_trip_v4_\d\d\.png$/.test(frame.src)), "the Pet action must use its dedicated v4 authored-root-motion artwork");
  assert.deepEqual(naturalWalk.locomotion.rootStepKeyframes, [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]);
  assert.equal(naturalWalk.locomotion.phases.length, naturalWalk.frames.length);
  assert.deepEqual(naturalWalk.locomotion.phases.map((phase) => phase.contacts[0]), ["near-hind", "near-hind", "near-fore", "near-fore", "far-hind", "far-hind", "far-fore", "far-fore"]);
  assert.equal(manifest.animations["action.walk_round_trip_look"].frames.length, 2, "the destination pause needs authored planted-paw look poses");
});

test("walk frames share a registered body anchor before native root motion", async () => {
  const registration = JSON.parse(await readFile(walkRegistrationPath, "utf8"));
  assert.equal(registration.schemaVersion, "tokenpet-locomotion-report/v2");
  assert.equal(registration.frames.length, 8);
  assert.deepEqual(registration.sourceCellOrder, [1, 5, 2, 6, 3, 7, 4, 8], "the two hind-leg rows must be interleaved by fore-leg phase");
  assert.deepEqual(registration.rootStepKeyframes, [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]);
  assert.equal(registration.footfallsPerCycle, 4);
  assert.ok(registration.frames.some((frame) => Math.abs(frame.shiftX) >= 20), "the source-sheet composition drift must be measured and corrected");
  assert.ok(registration.maxResidualPx <= 0.5, "registered eye/body anchors may differ by at most half a source pixel");
  assert.ok(registration.frames.every((frame) => frame.residualPx <= 0.5));
  for (const artifact of ["walk-cycle-preview.gif", "walk-root-motion-preview.gif", "walk-root-motion-contact-sheet.png"]) {
    assert.ok((await stat(resolve(walkClipRoot, artifact))).size > 0, `${artifact} must remain available for visual gait review`);
  }
});

test("Feed Snack ships dedicated approach, interaction, return and prop assets", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const feedIds = ["feed_snack_stretch", "feed_snack_walk_slow", "feed_snack_arrive", "feed_snack_lick", "feed_snack_eat", "feed_snack_return_run", "feed_snack_settle"];
  for (const id of feedIds) assert.ok(manifest.animations[`action.${id}`]?.frames.length > 0, `${id} needs approved Feed frames`);

  const walk = manifest.animations["action.feed_snack_walk_slow"];
  const returning = manifest.animations["action.feed_snack_return_run"];
  assert.equal(walk.frames.length, 8);
  assert.equal(returning.frames.length, 8);
  assert.ok(walk.frames.every((frame) => /feed_snack_walk_slow_\d\d\.png$/.test(frame.src)));
  assert.ok(returning.frames.every((frame) => /feed_snack_return_run_\d\d\.png$/.test(frame.src)));
  assert.deepEqual(walk.locomotion.rootStepKeyframes, [0, .14, 1, 1.14, 2, 2.14, 3, 3.14, 4]);
  assert.deepEqual(returning.locomotion.rootStepKeyframes, [0, .32, 1, 1.32, 2, 2.32, 3, 3.32, 4]);
  assert.equal(walk.locomotion.nominalStepDistancePx, 16);
  assert.equal(returning.locomotion.nominalStepDistancePx, 24);

  const report = JSON.parse(await readFile(feedAssetReportPath, "utf8"));
  assert.equal(report.schemaVersion, "tokenpet-feed-snack-assets/v2");
  assert.equal(report.outputs.filter((entry) => entry.path.includes("feed_snack_")).length, 24);
  const transparentOutputs = report.outputs.filter((entry) => entry.path.includes("/frames/") || entry.path.includes("/props/"));
  assert.equal(transparentOutputs.length, 27);
  assert.ok(transparentOutputs.every((entry) => entry.cornerAlpha?.every((alpha) => alpha === 0)));
  for (const artifact of ["feed-snack-contact-sheet.png", "feed-walk-slow-preview.gif", "feed-return-run-preview.gif"]) {
    assert.ok((await stat(resolve(feedClipRoot, artifact))).size > 0, `${artifact} must remain available for Feed visual review`);
  }
  for (const prop of ["snack-paw.png", "snack-fish.png", "snack-token.png"]) {
    const buffer = await readFile(resolve(bundleDir, "props", prop));
    const png = inspectPng(buffer);
    assert.deepEqual({ width: png.width, height: png.height }, { width: 512, height: 512 });
    assert.ok([4, 6].includes(png.colorType), `${prop} must preserve transparency`);
  }
});

test("production bundle contains approved 1024px raster frames and no SVG cat", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const files = await readdir(resolve(bundleDir, "frames"));
  assert.ok(files.length >= 17);
  assert.equal(files.some((file) => file.endsWith(".svg")), false, "SVG production frames are forbidden");
  assert.equal(files.some((file) => !file.endsWith(".png")), false, "Golden British production frames must be PNG");

  const checked = new Set();
  for (const animation of Object.values(manifest.animations)) {
    for (const frame of animation.frames) {
      if (checked.has(frame.src)) continue;
      checked.add(frame.src);
      const buffer = await readFile(resolve(bundleDir, frame.src));
      const png = inspectPng(buffer);
      assert.deepEqual({ width: png.width, height: png.height }, manifest.artboard);
      assert.ok([4, 6].includes(png.colorType), `${frame.src} must have an alpha channel`);
      assert.equal(sha256(buffer), frame.sha256, `${frame.src} digest must match actor.json`);
      assert.ok(frame.sourceAssetId, `${frame.src} must record its approved source id`);
    }
  }
});

test("source raster hashes, fallback, references, and QA artifacts all resolve", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const source = JSON.parse(await readFile(sourceSpecPath, "utf8"));
  const sourceImage = await readFile(resolve(repoRoot, source.sourceImage));
  assert.equal(sha256(sourceImage), source.sourceImageSha256);
  assert.equal(manifest.sourceAssetHash, source.sourceImageSha256);

  for (const action of Object.values(source.actions)) {
    for (const frame of action.sourceFrames) {
      const buffer = await readFile(resolve(repoRoot, frame.src));
      assert.equal(sha256(buffer), frame.expectedSha256, `${frame.src} changed without source-spec approval`);
    }
  }

  assert.ok((await stat(resolve(bundleDir, manifest.fallbackStaticImage))).isFile());
  for (const visualReference of manifest.visualReferences) {
    assert.ok((await stat(resolve(repoRoot, visualReference))).isFile(), `${visualReference} must exist`);
  }
  assert.ok((await stat(resolve(bundleDir, "qa/contact-sheet.html"))).isFile());
  const report = JSON.parse(await readFile(resolve(bundleDir, "qa/asset-report.json"), "utf8"));
  assert.equal(report.validated, true);
  assert.equal(report.productionAssetPolicy, "approved-raster-only");
});

test("embedded cream frame owns token geometry and cannot emit a duplicate bubble", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  assert.equal(manifest.compatibility.tokenFramePolicy, "embedded-only");
  assert.equal(manifest.tokenSlot.mode, "embedded");
  assert.equal(manifest.defaultTokenMode, "embedded");
  assert.equal(manifest.dynamicSlots.externalToken, undefined);
  assert.deepEqual(
    { x: manifest.tokenSlot.x, y: manifest.tokenSlot.y, width: manifest.tokenSlot.width, height: manifest.tokenSlot.height },
    { x: 348, y: 714, width: 328, height: 94 },
  );
});
