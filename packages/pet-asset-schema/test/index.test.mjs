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
