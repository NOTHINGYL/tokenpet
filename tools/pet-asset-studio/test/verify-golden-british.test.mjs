import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertValidPetActorManifest, PET_ACTOR_QUICK_PLAY_ACTION_IDS } from "../../../packages/pet-asset-schema/src/index.ts";
import { buildGoldenBritish } from "../src/build-golden-british.mjs";

const toolDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(toolDir, "../..");
const bundleDir = resolve(repoRoot, "apps/desktop/public/pet-actors/golden-british");
const sourceSpecPath = resolve(repoRoot, "assets/source/pet-actors/golden-british/source.json");

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
    assert.equal(manifest.capabilities.find((entry) => entry.id === quickPlayId)?.status, "ready", `${quickPlayId} should be actor-ready`);
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
