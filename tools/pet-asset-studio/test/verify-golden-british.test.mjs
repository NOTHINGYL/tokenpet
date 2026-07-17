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
const petWalkV5Root = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/walk-round-trip-v5");
const petWalkV5ReportPath = resolve(petWalkV5Root, "asset-report.json");
const feedClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/feed-snack-v2");
const feedAssetReportPath = resolve(feedClipRoot, "asset-report.json");
const cursorClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/play-cursor-v2");
const cursorAssetReportPath = resolve(cursorClipRoot, "asset-report.json");
const dangleClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/dangle-toy-v2");
const dangleAssetReportPath = resolve(dangleClipRoot, "asset-report.json");
const tossYarnClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/toss-yarn-v2");
const tossYarnAssetReportPath = resolve(tossYarnClipRoot, "asset-report.json");
const wakeUpClipRoot = resolve(repoRoot, "assets/source/pet-actors/golden-british/story-actions/wake-up-v2");
const wakeUpAssetReportPath = resolve(wakeUpClipRoot, "asset-report.json");

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

test("Pet ships eight-direction walk and destination-look rasters without runtime transforms", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const report = JSON.parse(await readFile(petWalkV5ReportPath, "utf8"));
  const directions = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  assert.equal(report.schemaVersion, "tokenpet-pet-walk-assets/v5");
  assert.equal(report.walkFrames, 64);
  assert.equal(report.lookFrames, 64);
  assert.equal(report.offlineMirrors.runtimeTransform, "none");
  assert.deepEqual(report.directions, directions);
  for (const direction of directions) {
    const walk = manifest.animations[`action.walk_round_trip_walk_${direction}`];
    const look = manifest.animations[`action.walk_round_trip_look_${direction}`];
    assert.equal(walk?.frames.length, 8, `${direction} walk needs a complete four-footfall cycle`);
    assert.equal(look?.frames.length, 8, `${direction} look needs a complete stationary sequence`);
    assert.equal(walk.locomotion.kind, "authored-root-motion");
    assert.equal(walk.locomotion.nominalStepDistancePx, 18);
    assert.equal(walk.locomotion.footfallsPerCycle, 4);
    assert.ok(walk.frames.every((frame) => frame.bodyTransform === undefined));
    assert.ok(look.frames.every((frame) => frame.bodyTransform === undefined));
    assert.ok(walk.frames.every((frame, index) => frame.src.endsWith(`walk_round_trip_walk_${direction}_${String(index + 1).padStart(2, "0")}.png`)));
    assert.ok(look.frames.every((frame, index) => frame.src.endsWith(`walk_round_trip_look_${direction}_${String(index + 1).padStart(2, "0")}.png`)));
  }
  const frameOutputs = report.outputs.filter((entry) => entry.path.includes("/frames/"));
  assert.equal(frameOutputs.length, 128);
  assert.ok(frameOutputs.every((entry) => entry.cornerAlpha.every((alpha) => alpha === 0)));
  for (const direction of directions) {
    for (const phase of ["walk", "look"]) {
      assert.ok((await stat(resolve(petWalkV5Root, `pet-${phase}-${direction.replaceAll("_", "-")}-preview.gif`))).size > 0);
    }
  }
  assert.ok((await stat(resolve(petWalkV5Root, "pet-eight-direction-contact-sheet.png"))).size > 0);
});

test("Feed Snack ships dedicated eight-direction approach, single-prop consumption, return and prop assets", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const feedIds = ["feed_snack_stretch", "feed_snack_walk_slow", "feed_snack_arrive", "feed_snack_lick", "feed_snack_eat", "feed_snack_return_run", "feed_snack_settle"];
  for (const id of feedIds) assert.ok(manifest.animations[`action.${id}`]?.frames.length > 0, `${id} needs approved Feed frames`);

  const directions = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  const phaseCounts = { walk_slow: 8, return_run: 8, arrive: 3, lick: 2, bite: 2, chew: 2, swallow: 3 };
  for (const direction of directions) {
    for (const [phase, count] of Object.entries(phaseCounts)) {
      const action = manifest.animations[`action.feed_snack_${phase}_${direction}`];
      assert.equal(action?.frames.length, count, `${phase} ${direction} needs ${count} registered frames`);
      assert.ok(action.frames.every((frame) => frame.src.includes("feed_snack_")), `${phase} ${direction} must use Feed-only rasters`);
    }
  }

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

  const uniqueDirectionalFrames = new Set(directions.flatMap((direction) =>
    Object.keys(phaseCounts).flatMap((phase) => manifest.animations[`action.feed_snack_${phase}_${direction}`].frames.map((frame) => frame.src)),
  ));
  assert.equal(uniqueDirectionalFrames.size, 216, "all eight directions own distinct locomotion, arrival and eight-frame consume bundles");

  const report = JSON.parse(await readFile(feedAssetReportPath, "utf8"));
  assert.equal(report.schemaVersion, "tokenpet-feed-snack-assets/v4");
  assert.equal(report.catFrames, 256);
  assert.deepEqual(report.directions, directions);
  assert.equal(report.offlineMirrors.runtimeTransform, "none");
  assert.equal(report.outputs.filter((entry) => entry.path.includes("/frames/feed_snack_")).length, 256);
  const transparentOutputs = report.outputs.filter((entry) => entry.path.includes("/frames/") || entry.path.includes("/props/"));
  assert.equal(transparentOutputs.length, 259);
  assert.ok(transparentOutputs.every((entry) => entry.cornerAlpha?.every((alpha) => alpha === 0)));
  for (const artifact of ["feed-snack-contact-sheet.png", "feed-walk-slow-front-preview.gif", "feed-interaction-back-right-preview.gif", "feed-consume-front-right-preview.gif", "feed-return-run-front-left-preview.gif"]) {
    assert.ok((await stat(resolve(feedClipRoot, artifact))).size > 0, `${artifact} must remain available for Feed visual review`);
  }
  for (const prop of ["snack-paw.png", "snack-fish.png", "snack-token.png"]) {
    const buffer = await readFile(resolve(bundleDir, "props", prop));
    const png = inspectPng(buffer);
    assert.deepEqual({ width: png.width, height: png.height }, { width: 512, height: 512 });
    assert.ok([4, 6].includes(png.colorType), `${prop} must preserve transparency`);
  }
});

test("Play Cursor ships registered eyes-head-ears whole-cat poses", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const animation = manifest.animations["action.play_cursor"];
  const expectedRoles = [
    "neutral", "notice",
    "eye_left", "eye_right", "eye_up", "eye_down",
    "head_left", "head_right", "head_up", "head_down",
    "ear_left", "ear_right", "ear_up", "ear_down",
    "blink", "settle",
  ];
  assert.equal(animation.frames.length, 16);
  assert.deepEqual(animation.frames.map((frame) => frame.src), expectedRoles.map((role) => `frames/play_cursor_${role}.png`));
  assert.equal(new Set(animation.frames.map((frame) => frame.src)).size, 16);
  assert.equal(animation.bodyTransform, undefined, "the runtime must swap whole poses without warping the actor");

  const report = JSON.parse(await readFile(cursorAssetReportPath, "utf8"));
  assert.equal(report.schemaVersion, "tokenpet-play-cursor-assets/v2");
  assert.equal(report.generationMode, "offline-authored-whole-frame-directional-poses");
  assert.deepEqual(report.registration, {
    visibleCenterX: 512,
    visibleGroundLineY: 818,
    runtimeBodyTransform: "forbidden",
  });
  const outputs = report.outputs.slice(0, 16);
  assert.equal(outputs.length, 16);
  assert.ok(outputs.every((entry) => entry.cornerAlpha.every((alpha) => alpha === 0)));
  assert.ok(outputs.every((entry) => entry.alphaBounds[3] === 818));
  assert.ok(outputs.every((entry) => Math.abs((entry.alphaBounds[0] + entry.alphaBounds[2]) / 2 - 512) <= 1));
  for (const artifact of ["play-cursor-contact-sheet.png", "play-cursor-direction-preview.gif"]) {
    assert.ok((await stat(resolve(cursorClipRoot, artifact))).size > 0, `${artifact} must remain available for directional visual review`);
  }
});

test("Dangle Toy ships complete eight-direction cat packs and dedicated root motion", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const expectedCounts = {
    dangle_alert: 2,
    dangle_stalk: 2,
    dangle_crouch: 2,
    dangle_pounce: 4,
    dangle_pounce_front: 4,
    dangle_pounce_back: 4,
    dangle_pounce_front_left: 4,
    dangle_pounce_front_right: 4,
    dangle_pounce_back_left: 4,
    dangle_pounce_back_right: 4,
    dangle_play: 4,
    dangle_play_front: 4,
    dangle_play_back: 4,
    dangle_play_front_left: 4,
    dangle_play_front_right: 4,
    dangle_play_back_left: 4,
    dangle_play_back_right: 4,
    dangle_pursuit_run: 8,
    dangle_pursuit_run_front: 8,
    dangle_pursuit_run_back: 8,
    dangle_pursuit_run_front_left: 8,
    dangle_pursuit_run_front_right: 8,
    dangle_pursuit_run_back_left: 8,
    dangle_pursuit_run_back_right: 8,
    dangle_return_walk: 8,
    dangle_return_walk_front: 8,
    dangle_return_walk_back: 8,
    dangle_return_walk_front_left: 8,
    dangle_return_walk_front_right: 8,
    dangle_return_walk_back_left: 8,
    dangle_return_walk_back_right: 8,
    dangle_settle: 2,
  };
  for (const [id, count] of Object.entries(expectedCounts)) {
    const animation = manifest.animations[`action.${id}`];
    assert.equal(animation.frames.length, count, `${id} must include all approved offline poses`);
    assert.equal(animation.frames.some((frame) => frame.bodyTransform), false, `${id} cannot warp a flat raster`);
  }
  const locomotionFrames = [];
  for (const id of ["dangle_pursuit_run", "dangle_pursuit_run_front", "dangle_pursuit_run_back", "dangle_pursuit_run_front_left", "dangle_pursuit_run_front_right", "dangle_pursuit_run_back_left", "dangle_pursuit_run_back_right"]) {
    const pursuit = manifest.animations[`action.${id}`];
    assert.deepEqual(pursuit.locomotion.rootStepKeyframes, [0, .36, 1, 1.36, 2, 2.36, 3, 3.36, 4]);
    assert.equal(pursuit.locomotion.nominalStepDistancePx, 26);
    locomotionFrames.push(...pursuit.frames);
  }
  for (const id of ["dangle_return_walk", "dangle_return_walk_front", "dangle_return_walk_back", "dangle_return_walk_front_left", "dangle_return_walk_front_right", "dangle_return_walk_back_left", "dangle_return_walk_back_right"]) {
    const returning = manifest.animations[`action.${id}`];
    assert.deepEqual(returning.locomotion.rootStepKeyframes, [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]);
    assert.equal(returning.locomotion.nominalStepDistancePx, 18);
    locomotionFrames.push(...returning.frames);
  }
  assert.equal(new Set(locomotionFrames.map((frame) => frame.sha256)).size, 112);

  const report = JSON.parse(await readFile(dangleAssetReportPath, "utf8"));
  assert.equal(report.schemaVersion, "tokenpet-dangle-toy-assets/v4");
  assert.equal(report.offlineMirrors.runtimeTransform, "none");
  assert.match(report.generationMode, /built-in imagegen/);
  const frameOutputs = report.outputs.filter((entry) => entry.path.includes("/frames/dangle_"));
  const propOutputs = report.outputs.filter((entry) => entry.path.includes("/props/dangle-"));
  assert.equal(frameOutputs.length, 176);
  assert.equal(new Set(frameOutputs.map((entry) => entry.sha256)).size, 176);
  assert.equal(propOutputs.length, 8);
  assert.ok([...frameOutputs, ...propOutputs].every((entry) => entry.cornerAlpha.every((alpha) => alpha === 0)));
  assert.ok(
    propOutputs
      .filter((entry) => !entry.path.endsWith("dangle-catch-spark.png") && !entry.path.endsWith("dangle-trail.png"))
      .every((entry) => entry.alphaComponentSizes.length === 1),
    "each coherent wand, fish, and connector prop must be one clean component without adjacent-cell bleed",
  );
  assert.ok(frameOutputs.every((entry) => entry.alphaBounds[3] === 818));
  for (const artifact of [
    "dangle-toy-contact-sheet.png",
    "dangle-alert-pounce-play-preview.gif",
    "dangle-pursuit-run-preview.gif",
    "dangle-pursuit-run-front-preview.gif",
    "dangle-pursuit-run-back-preview.gif",
    "dangle-pursuit-run-front-right-preview.gif",
    "dangle-pursuit-run-front-left-preview.gif",
    "dangle-pursuit-run-back-right-preview.gif",
    "dangle-pursuit-run-back-left-preview.gif",
    "dangle-return-walk-preview.gif",
    "dangle-return-walk-front-preview.gif",
    "dangle-return-walk-back-preview.gif",
    "dangle-return-walk-front-right-preview.gif",
    "dangle-return-walk-front-left-preview.gif",
    "dangle-return-walk-back-right-preview.gif",
    "dangle-return-walk-back-left-preview.gif",
  ]) {
    assert.ok((await stat(resolve(dangleClipRoot, artifact))).size > 0, `${artifact} must remain available for Dangle visual review`);
  }
  for (const prop of ["dangle-wand.png", "dangle-wand-flex.png", "dangle-fish-mint.png", "dangle-fish-blue.png", "dangle-fish-feather.png", "dangle-connector.png", "dangle-catch-spark.png", "dangle-trail.png"]) {
    const png = inspectPng(await readFile(resolve(bundleDir, "props", prop)));
    assert.deepEqual({ width: png.width, height: png.height }, { width: 512, height: 512 });
    assert.ok([4, 6].includes(png.colorType));
  }
});

test("Toss Yarn ships eight-direction chase and baked three-colour mouth-carry packs", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const directions = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  const phaseCounts = { chase: 8, carry: 8, pickup: 4, drop: 6 };
  for (const direction of directions) {
    for (const [phase, count] of Object.entries(phaseCounts)) {
      const animation = manifest.animations[`action.toss_yarn_${phase}_${direction}`];
      assert.equal(animation.frames.length, count);
      assert.equal(animation.frames.some((frame) => frame.bodyTransform), false);
      if (phase !== "chase") {
        assert.deepEqual(Object.keys(animation.variants).sort(), ["blue", "orange", "violet"]);
        assert.ok(Object.values(animation.variants).every((frames) => frames.length === count));
      }
    }
    const chase = manifest.animations[`action.toss_yarn_chase_${direction}`];
    const carry = manifest.animations[`action.toss_yarn_carry_${direction}`];
    assert.deepEqual(chase.locomotion.rootStepKeyframes, [0, .36, 1, 1.36, 2, 2.36, 3, 3.36, 4]);
    assert.equal(chase.locomotion.nominalStepDistancePx, 26);
    assert.deepEqual(carry.locomotion.rootStepKeyframes, [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]);
    assert.equal(carry.locomotion.nominalStepDistancePx, 18);
  }

  const report = JSON.parse(await readFile(tossYarnAssetReportPath, "utf8"));
  assert.equal(report.schemaVersion, "tokenpet-toss-yarn-assets/v2");
  assert.equal(report.catFrames, 496);
  assert.equal(report.offlineMirrors.runtimeTransform, "none");
  assert.match(report.gridExtraction, /cross-cell clipping and neighbour bleed forbidden/);
  assert.match(report.generationMode, /built-in imagegen/);
  const frameOutputs = report.outputs.filter((entry) => entry.path.includes("/frames/toss_yarn_"));
  const propOutputs = report.outputs.filter((entry) => entry.path.includes("/props/toss-yarn-"));
  assert.equal(frameOutputs.length, 496);
  assert.equal(propOutputs.length, 8);
  assert.ok([...frameOutputs, ...propOutputs].every((entry) => entry.cornerAlpha.every((alpha) => alpha === 0)));
  assert.ok(frameOutputs.every((entry) => entry.alphaBounds[3] === 818));
  for (const artifact of [
    "toss-yarn-contact-sheet.png",
    ...directions.map((direction) => `toss-yarn-chase-${direction.replaceAll("_", "-")}-preview.gif`),
    ...directions.map((direction) => `toss-yarn-carry-${direction.replaceAll("_", "-")}-preview.gif`),
    "toss-yarn-pickup-carry-drop-preview.gif",
  ]) {
    assert.ok((await stat(resolve(tossYarnClipRoot, artifact))).size > 0, `${artifact} must remain available for Toss Yarn visual review`);
  }
  for (const color of ["orange", "blue", "violet"]) {
    for (const suffix of ["", "-roll"]) {
      const png = inspectPng(await readFile(resolve(bundleDir, "props", `toss-yarn-${color}${suffix}.png`)));
      assert.deepEqual({ width: png.width, height: png.height }, { width: 512, height: 512 });
    }
  }
});

test("Wake Up ships 24 registered whole-cat frames, review media, and local meow cues", async () => {
  const manifest = JSON.parse(await readFile(resolve(bundleDir, "actor.json"), "utf8"));
  const expectedCounts = {
    wake_up_blink: 4,
    wake_up_roll: 4,
    wake_up_stretch: 8,
    wake_up_gather: 8,
  };
  for (const [id, count] of Object.entries(expectedCounts)) {
    const animation = manifest.animations[`action.${id}`];
    assert.equal(animation.frames.length, count);
    assert.equal(animation.frames.some((frame) => frame.bodyTransform), false);
    assert.ok(animation.frames.every((frame) => frame.src.includes(`/wake_up_${id.replace("wake_up_", "")}_`)));
  }
  const stable = manifest.animations["action.wake_up"];
  assert.equal(stable.frames.length, 24);
  assert.equal(stable.frames.reduce((total, frame) => total + frame.durationMs, 0), 5_000);
  assert.equal(new Set(stable.frames.map((frame) => frame.sha256)).size, 24);

  const report = JSON.parse(await readFile(wakeUpAssetReportPath, "utf8"));
  assert.equal(report.schemaVersion, "tokenpet-wake-up-assets/v2");
  assert.equal(report.frameCount, 24);
  assert.equal(report.durationMs, 5_000);
  assert.equal(report.registration.runtimeBodyTransform, "forbidden");
  assert.match(report.generationMode, /built-in imagegen/);
  const frameOutputs = report.outputs.filter((entry) => entry.path.includes("/frames/wake_up_"));
  assert.equal(frameOutputs.length, 24);
  assert.ok(frameOutputs.every((entry) => entry.cornerAlpha.every((alpha) => alpha === 0)));
  assert.ok(frameOutputs.every((entry) => entry.alphaBounds[3] === 818));
  assert.equal(report.audio.length, 3);
  for (const artifact of ["wake-up-contact-sheet.png", "wake-up-preview.gif"]) {
    assert.ok((await stat(resolve(wakeUpClipRoot, artifact))).size > 0, `${artifact} must remain available for Wake Up visual review`);
  }
  for (const voice of ["soft", "cozy", "playful"]) {
    assert.ok((await stat(resolve(repoRoot, `apps/desktop/public/pet-audio/wake-meow-${voice}.wav`))).size > 1_000);
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
