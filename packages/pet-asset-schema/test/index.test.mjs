import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertValidPetActorManifest,
  resolveActorCapability,
  validatePetActorManifest,
  validatePetActorSourceSpec,
} from "../dist/index.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readFixture() {
  return JSON.parse(await readFile(resolve(packageDir, "fixtures/golden-british.actor.json"), "utf8"));
}

async function readSourceFixture() {
  return JSON.parse(await readFile(resolve(packageDir, "../../assets/source/pet-actors/golden-british/source.json"), "utf8"));
}

async function readTossYarnSourceFixture() {
  const fixture = await readSourceFixture();
  const fragment = JSON.parse(await readFile(resolve(packageDir, "../../assets/source/pet-actors/golden-british/story-actions/toss-yarn-v2/source-actions.json"), "utf8"));
  fixture.actions = { ...fixture.actions, ...fragment.actions };
  return fixture;
}

async function readPetWalkSourceFixture() {
  const fixture = await readSourceFixture();
  const fragment = JSON.parse(await readFile(resolve(packageDir, "../../assets/source/pet-actors/golden-british/story-actions/walk-round-trip-v5/source-actions.json"), "utf8"));
  fixture.actions = { ...fixture.actions, ...fragment.actions };
  return fixture;
}

function issueCodes(value) {
  const result = validatePetActorManifest(value);
  return result.success ? [] : result.issues.map((issue) => issue.code);
}

function sourceIssueCodes(value) {
  const result = validatePetActorSourceSpec(value);
  return result.success ? [] : result.issues.map((issue) => issue.code);
}

test("Golden British sample manifest fixture is valid", async () => {
  const fixture = await readFixture();
  const result = validatePetActorManifest(fixture);
  assert.equal(result.success, true, result.success ? undefined : JSON.stringify(result.issues, null, 2));
  assert.doesNotThrow(() => assertValidPetActorManifest(fixture));
});

test("missing tokenSlot and moodBadgeSlot fail validation", async () => {
  const fixture = await readFixture();
  delete fixture.tokenSlot;
  delete fixture.moodBadgeSlot;
  const codes = issueCodes(fixture);
  assert.ok(codes.includes("rect.required"));
  assert.ok(codes.includes("slot.tokenMirror"));
  assert.ok(codes.includes("slot.moodMirror"));
});

test("fallback ids must exist, be acyclic, and terminate at ready", async () => {
  const fixture = await readFixture();
  fixture.capabilities.find((capability) => capability.id === "click_purr").fallbackId = "hot_loop";
  assert.ok(issueCodes(fixture).includes("capability.fallbackMissing"));

  const cyclic = await readFixture();
  cyclic.capabilities.push({ id: "hot_loop", status: "fallback", fallbackId: "click_purr" });
  cyclic.capabilities.find((capability) => capability.id === "click_purr").fallbackId = "hot_loop";
  assert.ok(issueCodes(cyclic).includes("capability.fallbackCycle"));
});

test("ready capabilities must have a same-id action animation", async () => {
  const fixture = await readFixture();
  const click = fixture.capabilities.find((capability) => capability.id === "click_purr");
  click.status = "ready";
  delete click.fallbackId;
  assert.ok(issueCodes(fixture).includes("capability.readyAnimation"));
});

test("source frames reject invalid choreography timing", async () => {
  const fixture = await readSourceFixture();
  fixture.actions.idle_breathe.sourceFrames[0].durationMs = 0;
  assert.ok(sourceIssueCodes(fixture).includes("source.frameDuration"));
});

test("locomotion clips reject unordered root motion and incomplete paw phases", async () => {
  const fixture = await readSourceFixture();
  fixture.actions.walk_round_trip.locomotion.rootStepKeyframes[2] = .1;
  fixture.actions.walk_round_trip.locomotion.phases.pop();
  const codes = sourceIssueCodes(fixture);
  assert.ok(codes.includes("locomotion.rootOrder"));
  assert.ok(codes.includes("locomotion.phases"));
});

test("Pet walk source accepts all eight vector-selected walk and look actions", async () => {
  const fixture = await readPetWalkSourceFixture();
  const directions = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  assert.equal(sourceIssueCodes(fixture).length, 0);
  for (const direction of directions) {
    const walk = fixture.actions[`walk_round_trip_walk_${direction}`];
    const look = fixture.actions[`walk_round_trip_look_${direction}`];
    assert.equal(walk.sourceFrames.length, 8);
    assert.equal(look.sourceFrames.length, 8);
    assert.equal(walk.locomotion.footfallsPerCycle, 4);
    assert.equal(look.locomotion, undefined);
  }
});

test("Feed Snack owns dedicated outbound and return locomotion clips", async () => {
  const fixture = await readSourceFixture();
  const outbound = fixture.actions.feed_snack_walk_slow;
  const returning = fixture.actions.feed_snack_return_run;
  assert.equal(outbound.sourceFrames.length, 8);
  assert.equal(returning.sourceFrames.length, 8);
  assert.notDeepEqual(outbound.sourceFrames.map((frame) => frame.src), fixture.actions.walk_round_trip.sourceFrames.map((frame) => frame.src));
  assert.notDeepEqual(returning.sourceFrames.map((frame) => frame.src), fixture.actions.walk_round_trip.sourceFrames.map((frame) => frame.src));
  assert.equal(outbound.locomotion.nominalStepDistancePx, 16);
  assert.equal(returning.locomotion.nominalStepDistancePx, 24);
  assert.equal(sourceIssueCodes(fixture).includes("source.locomotionAction"), false);

  fixture.actions.token_snack.locomotion = structuredClone(outbound.locomotion);
  assert.ok(sourceIssueCodes(fixture).includes("source.locomotionAction"));
});

test("Play Cursor owns a complete directional whole-frame pose bundle", async () => {
  const fixture = await readSourceFixture();
  const action = fixture.actions.play_cursor;
  const expectedRoles = [
    "neutral", "notice",
    "eye_left", "eye_right", "eye_up", "eye_down",
    "head_left", "head_right", "head_up", "head_down",
    "ear_left", "ear_right", "ear_up", "ear_down",
    "blink", "settle",
  ];
  assert.equal(action.sourceFrames.length, expectedRoles.length);
  assert.deepEqual(
    action.sourceFrames.map((frame) => frame.src.split("/").at(-1)),
    expectedRoles.map((role) => `play_cursor_${role}.png`),
  );
  assert.equal(new Set(action.sourceFrames.map((frame) => frame.src)).size, expectedRoles.length);
  assert.ok(action.sourceFrames.every((frame) => frame.kind === "approved-raster"));
  assert.equal(action.bodyTransform, undefined, "runtime image wobble/warping is forbidden for cursor tracking");
  assert.equal(action.loop, true);
  assert.equal(sourceIssueCodes(fixture).length, 0);
});

test("Dangle Toy owns complete eight-direction offline phases and locomotion clips", async () => {
  const fixture = await readSourceFixture();
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
    const action = fixture.actions[id];
    assert.equal(action.sourceFrames.length, count, `${id} must own its complete offline sequence`);
    assert.ok(action.sourceFrames.every((frame) => frame.src.includes(`/frames/${id}_`) && frame.kind === "approved-raster"));
    assert.equal(action.bodyTransform, undefined, `${id} cannot warp a flat cat at runtime`);
  }
  for (const id of ["dangle_pursuit_run", "dangle_pursuit_run_front", "dangle_pursuit_run_back", "dangle_pursuit_run_front_left", "dangle_pursuit_run_front_right", "dangle_pursuit_run_back_left", "dangle_pursuit_run_back_right"]) {
    assert.deepEqual(fixture.actions[id].locomotion.rootStepKeyframes, [0, .36, 1, 1.36, 2, 2.36, 3, 3.36, 4]);
    assert.equal(fixture.actions[id].locomotion.nominalStepDistancePx, 26);
  }
  for (const id of ["dangle_return_walk", "dangle_return_walk_front", "dangle_return_walk_back", "dangle_return_walk_front_left", "dangle_return_walk_front_right", "dangle_return_walk_back_left", "dangle_return_walk_back_right"]) {
    assert.deepEqual(fixture.actions[id].locomotion.rootStepKeyframes, [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]);
    assert.equal(fixture.actions[id].locomotion.nominalStepDistancePx, 18);
  }
  assert.equal(fixture.actions.drag_dangle.bodyTransform, undefined);
  assert.ok(fixture.actions.drag_dangle.sourceFrames.every((frame) => !frame.src.endsWith("/drag_dangle.png")));
  assert.equal(sourceIssueCodes(fixture).length, 0);
});

test("Toss Yarn owns eight-direction chase, pickup, mouth-carry, drop, and colour variants", async () => {
  const fixture = await readTossYarnSourceFixture();
  const directions = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  const phaseCounts = { chase: 8, carry: 8, pickup: 4, drop: 6 };
  for (const direction of directions) {
    for (const [phase, count] of Object.entries(phaseCounts)) {
      const id = `toss_yarn_${phase}_${direction}`;
      const action = fixture.actions[id];
      assert.equal(action.sourceFrames.length, count, `${id} must own a complete offline sequence`);
      assert.equal(action.bodyTransform, undefined, `${id} cannot warp a side-view raster at runtime`);
      assert.ok(action.sourceFrames.every((frame) => frame.src.includes(`/frames/toss_yarn_${phase}_${direction}_`)));
      if (phase !== "chase") {
        assert.deepEqual(Object.keys(action.variants).sort(), ["blue", "orange", "violet"]);
        assert.ok(Object.values(action.variants).every((frames) => frames.length === count));
      }
    }
    assert.equal(fixture.actions[`toss_yarn_chase_${direction}`].locomotion.nominalStepDistancePx, 26);
    assert.equal(fixture.actions[`toss_yarn_carry_${direction}`].locomotion.nominalStepDistancePx, 18);
  }
  assert.equal(sourceIssueCodes(fixture).length, 0);
});

test("Wake Up owns one dedicated five-second offline sequence split into four phases", async () => {
  const fixture = await readSourceFixture();
  const expectedCounts = {
    wake_up_blink: 4,
    wake_up_roll: 4,
    wake_up_stretch: 8,
    wake_up_gather: 8,
  };
  for (const [id, count] of Object.entries(expectedCounts)) {
    const action = fixture.actions[id];
    assert.equal(action.sourceFrames.length, count, `${id} must own its complete offline sequence`);
    assert.equal(action.bodyTransform, undefined, `${id} cannot scale or warp cat anatomy`);
    assert.ok(action.sourceFrames.every((frame) => frame.src.includes(`/frames/${id}_`) && frame.kind === "approved-raster"));
  }
  const stable = fixture.actions.wake_up;
  assert.equal(stable.sourceFrames.length, 24);
  assert.equal(stable.sourceFrames.reduce((total, frame) => total + frame.durationMs, 0), 5_000);
  assert.equal(new Set(stable.sourceFrames.map((frame) => frame.expectedSha256)).size, 24);
  assert.ok(stable.sourceFrames.every((frame) => !/(?:sleep_loop|drag_dangle|\/wake_up\.png)$/.test(frame.src)));
  assert.equal(stable.bodyTransform, undefined);
  assert.equal(sourceIssueCodes(fixture).length, 0);
});

test("every Quick Play action must be represented", async () => {
  const fixture = await readFixture();
  fixture.capabilities = fixture.capabilities.filter((capability) => capability.id !== "capture_moment");
  assert.ok(issueCodes(fixture).includes("capability.quickPlayCoverage"));
});

test("production SVG frames and a duplicate token frame are rejected", async () => {
  const fixture = await readFixture();
  fixture.animations["action.idle_breathe"].frames[0].kind = "svg";
  fixture.animations["action.idle_breathe"].frames[0].src = "frames/geometric-cat.svg";
  fixture.dynamicSlots.externalToken = { mode: "below", x: 348, y: 714, width: 328, height: 94, maxFontSize: 70 };
  const codes = issueCodes(fixture);
  assert.ok(codes.includes("frame.productionKind"));
  assert.ok(codes.includes("slot.duplicateTokenFrame"));
});

test("capability resolver follows a declared fallback to ready animation", async () => {
  const fixture = await readFixture();
  const resolved = resolveActorCapability(fixture, "token_snack");
  assert.equal(resolved.status, "fallback");
  assert.equal(resolved.resolvedId, "idle_breathe");
  assert.equal(resolved.animationId, "action.idle_breathe");
  assert.deepEqual(resolved.chain, ["token_snack", "idle_breathe"]);
});

test("source specs reject legacy aliases and ready claims without same-id source actions", () => {
  const source = {
    schemaVersion: "pet-actor-source/v2",
    actorId: "golden-british",
    displayName: "Golden British",
    breedId: "golden-british",
    sourceVersion: "fixture",
    lifecycleStage: "deskBuddy",
    sourceImage: "assets/source/idle.png",
    sourceImageSha256: "a".repeat(64),
    artboard: { width: 1024, height: 1024 },
    sourceImagePlacement: { x: 0, y: 0, width: 1024, height: 1024 },
    tokenSlot: { mode: "embedded", x: 348, y: 714, width: 328, height: 94, maxFontSize: 70, color: "#000" },
    moodBadgeSlot: { x: 408, y: 72, width: 208, height: 70, maxFontSize: 44 },
    actions: {
      "idle-breathe": {
        label: "Legacy alias",
        kind: "loop",
        mood: "focused",
        sourceFrames: [{ src: "assets/source/idle.png", kind: "approved-raster", expectedSha256: "b".repeat(64) }],
        fps: 12,
        loop: true,
        priority: 1,
      },
    },
    capabilities: [
      { id: "idle_breathe", status: "ready" },
      ...["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "summon_to_pointer", "capture_moment"].map((id) => ({
        id,
        status: "fallback",
        fallbackId: "idle_breathe",
      })),
    ],
    sourceLayers: [{ id: "cat", kind: "image", rect: { x: 0, y: 0, width: 1024, height: 1024 } }],
    visualReferences: ["docs/designs/actor.png"],
    fallbackStaticImage: "apps/desktop/public/assets/cat.png",
    compatibility: {
      bakedAccessories: ["embedded-token-frame"],
      runtimeAccessoryPolicy: "disabled",
      supportedCatTypes: ["golden-british"],
      tokenFramePolicy: "embedded-only",
    },
  };

  const result = validatePetActorSourceSpec(source);
  assert.equal(result.success, false);
  if (!result.success) {
    const codes = result.issues.map((issue) => issue.code);
    assert.ok(codes.includes("source.actionId"));
    assert.ok(codes.includes("capability.readySource"));
  }
});
