import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertValidPetActorManifest,
  assertValidPetActorSourceSpec,
  PET_ACTOR_MOODS,
} from "../../../packages/pet-asset-schema/src/index.ts";

const GENERATOR_NAME = "@tokenpet/pet-asset-studio";
const GENERATOR_VERSION = "1.0.0-story";
const GENERATED_AT = "2026-07-09T00:00:00.000Z";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../../..");
const sourcePath = resolve(repoRoot, "assets/source/pet-actors/golden-british/source.json");
const outputDir = resolve(repoRoot, "apps/desktop/public/pet-actors/golden-british");
const frameDir = resolve(outputDir, "frames");
const runtimeSourceDir = resolve(outputDir, "source");
const qaDir = resolve(outputDir, "qa");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashInputSet(entries) {
  const hash = createHash("sha256");
  for (const [path, buffer] of [...entries].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(path);
    hash.update("\0");
    hash.update(buffer);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function toRuntimeRelativePath(repoRelativePath) {
  return relative(outputDir, resolve(repoRoot, repoRelativePath)).replaceAll("\\", "/");
}

function outputFrameName(actionId, index, total) {
  return total === 1 ? `${actionId}.png` : `${actionId}-${String(index + 1).padStart(2, "0")}.png`;
}

function defaultFrameDuration(action) {
  if (action.kind === "loop") return Math.max(900, Math.round(1000 / action.fps) * 12);
  if (action.kind === "transition") return 900;
  return 1200;
}

function createAnimation(actionId, action, frameInputs, artboard) {
  const durationMs = defaultFrameDuration(action);
  const frames = frameInputs.map((input, index) => {
    const fileName = outputFrameName(actionId, index, frameInputs.length);
    return {
      id: `${actionId}-${index + 1}`,
      mood: action.mood,
      src: `frames/${fileName}`,
      kind: "png",
      rect: { x: 0, y: 0, width: artboard.width, height: artboard.height },
      durationMs,
      sha256: input.sha256,
      sourceAssetId: `${actionId}:${index + 1}`,
      ...(action.bodyTransform ? { bodyTransform: action.bodyTransform } : {}),
    };
  });

  return {
    id: `action.${actionId}`,
    kind: action.kind,
    mood: action.mood,
    motionState: actionId,
    fps: action.fps,
    loop: action.loop,
    priority: action.priority,
    ...(action.cooldownMs ? { cooldownMs: action.cooldownMs } : {}),
    ...(action.reducedMotionFallback ? { reducedMotionFallback: action.reducedMotionFallback } : {}),
    frames,
  };
}

function createMoodAlias(mood, actionId, actionAnimation) {
  return {
    ...actionAnimation,
    id: `${mood}.idle`,
    kind: "loop",
    mood,
    motionState: actionId,
    loop: true,
    moodTags: [mood],
  };
}

function buildManifest(source, sourceSpecSha256, inputSetSha256, sourceFrames) {
  const animations = {};
  for (const [actionId, action] of Object.entries(source.actions)) {
    animations[`action.${actionId}`] = createAnimation(actionId, action, sourceFrames.get(actionId), source.artboard);
  }

  const moodActions = {
    sleepy: "sleep_loop",
    focused: "focus_loop",
    hot: "hot_loop",
    overdrive: "overdrive_loop",
  };
  for (const mood of PET_ACTOR_MOODS) {
    const actionId = moodActions[mood];
    animations[`${mood}.idle`] = createMoodAlias(mood, actionId, animations[`action.${actionId}`]);
  }

  const fontWeight = source.tokenSlot.fontWeight ?? 850;
  const tokenSlot = { ...source.tokenSlot, fontWeight };
  const contentHash = sha256(`${sourceSpecSha256}\n${inputSetSha256}\n${GENERATOR_NAME}@${GENERATOR_VERSION}`);

  return {
    schemaVersion: "pet-actor/v2",
    actorId: source.actorId,
    displayName: source.displayName,
    breedId: source.breedId,
    sourceVersion: source.sourceVersion,
    lifecycleStage: source.lifecycleStage,
    generatedBy: GENERATOR_NAME,
    generatedAt: GENERATED_AT,
    contentHash,
    sourceAssetHash: source.sourceImageSha256,
    artboard: source.artboard,
    ...(source.footLineY === undefined ? {} : { footLineY: source.footLineY }),
    defaultAnimation: "action.idle_breathe",
    defaultTokenMode: "embedded",
    tokenSlot,
    moodBadgeSlot: source.moodBadgeSlot,
    dynamicSlots: {
      tokenText: tokenSlot,
      moodBadge: source.moodBadgeSlot,
    },
    animations,
    capabilities: source.capabilities,
    fallbackStaticImage: toRuntimeRelativePath(source.fallbackStaticImage),
    visualReferences: source.visualReferences,
    compatibility: source.compatibility,
    reproducibility: {
      generator: GENERATOR_NAME,
      generatorVersion: GENERATOR_VERSION,
      sourceSpecSha256,
      inputSetSha256,
    },
  };
}

function createAssetReport(source, manifest, outputFiles) {
  const capabilityCounts = manifest.capabilities.reduce((counts, capability) => {
    counts[capability.status] = (counts[capability.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    schemaVersion: "pet-actor-qa/v1",
    actorId: manifest.actorId,
    validated: true,
    productionAssetPolicy: "approved-raster-only",
    catGeometryPolicy: "runtime-forbidden",
    duplicateTokenFrameCheck: "pass: embedded-only and no externalToken slot",
    artboard: manifest.artboard,
    tokenSlot: manifest.tokenSlot,
    moodBadgeSlot: manifest.moodBadgeSlot,
    sourceAssetHash: manifest.sourceAssetHash,
    contentHash: manifest.contentHash,
    visualReferences: manifest.visualReferences,
    capabilityCounts,
    outputFiles,
    notes: source.notes,
  };
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function createContactSheet(manifest) {
  const capabilityById = new Map(manifest.capabilities.map((capability) => [capability.id, capability]));
  const cards = Object.entries(manifest.animations)
    .filter(([key]) => key.startsWith("action."))
    .map(([key, animation]) => {
      const actionId = key.slice("action.".length);
      const frame = animation.frames[0];
      const capability = capabilityById.get(actionId);
      return `<article class="card">
        <div class="frame">
          <img src="../${escapeHtml(frame.src)}" alt="${escapeHtml(actionId)} approved actor frame">
          <span class="token-slot" aria-label="token slot"></span>
          <span class="mood-slot" aria-label="mood badge slot"></span>
        </div>
        <div class="meta"><strong>${escapeHtml(actionId)}</strong><span class="${escapeHtml(capability?.status ?? "unavailable")}">${escapeHtml(capability?.status ?? "unavailable")}</span></div>
        <small>${escapeHtml(animation.kind)} · ${escapeHtml(animation.mood)} · ${animation.fps} fps</small>
      </article>`;
    })
    .join("\n");

  const token = manifest.tokenSlot;
  const badge = manifest.moodBadgeSlot;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Golden British actor QA contact sheet</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #f6f7fb; color: #111827; }
    main { max-width: 1480px; margin: 0 auto; padding: 32px; }
    h1 { margin: 0; font-size: 32px; } p { color: #526077; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
    .card { background: white; border: 1px solid #dbe1ea; border-radius: 18px; padding: 14px; box-shadow: 0 8px 24px rgba(31, 41, 55, .08); }
    .frame { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: linear-gradient(135deg, #f8fafc, #eef2f7); }
    img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .token-slot, .mood-slot { position: absolute; box-sizing: border-box; pointer-events: none; border: 2px dashed rgba(15, 118, 110, .78); }
    .token-slot { left: ${(token.x / manifest.artboard.width) * 100}%; top: ${(token.y / manifest.artboard.height) * 100}%; width: ${(token.width / manifest.artboard.width) * 100}%; height: ${(token.height / manifest.artboard.height) * 100}%; }
    .mood-slot { left: ${(badge.x / manifest.artboard.width) * 100}%; top: ${(badge.y / manifest.artboard.height) * 100}%; width: ${(badge.width / manifest.artboard.width) * 100}%; height: ${(badge.height / manifest.artboard.height) * 100}%; border-color: rgba(37, 99, 235, .72); border-radius: 999px; }
    .meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
    .meta span { border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .ready { color: #166534; background: #dcfce7; } .fallback { color: #9a3412; background: #ffedd5; } .planned { color: #1e40af; background: #dbeafe; } .unavailable { color: #991b1b; background: #fee2e2; }
    small { display: block; margin-top: 5px; color: #64748b; }
  </style>
</head>
<body>
  <main>
    <h1>Golden British actor QA</h1>
    <p>Approved raster production frames. Teal box = embedded token text slot; blue pill = mood badge slot. No runtime anatomy or second token-frame background is permitted.</p>
    <section class="grid">${cards}</section>
  </main>
</body>
</html>
`;
}

async function writeIfChanged(path, value) {
  const next = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  try {
    const current = await readFile(path);
    if (Buffer.compare(current, next) === 0) return false;
  } catch {
    // The generated file does not exist yet.
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next);
  return true;
}

async function removeStaleFiles(directory, desiredNames) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || desiredNames.has(entry.name)) continue;
    await unlink(resolve(directory, entry.name));
    removed += 1;
  }
  return removed;
}

async function readAndVerifySourceFrames(source) {
  const allInputs = [];
  const byAction = new Map();
  for (const [actionId, action] of Object.entries(source.actions)) {
    const frames = [];
    for (const frame of action.sourceFrames) {
      const buffer = await readFile(resolve(repoRoot, frame.src));
      const actualSha256 = sha256(buffer);
      if (actualSha256 !== frame.expectedSha256) {
        throw new Error(`${frame.src}: expected SHA-256 ${frame.expectedSha256}, got ${actualSha256}`);
      }
      const input = { source: frame, buffer, sha256: actualSha256 };
      frames.push(input);
      allInputs.push([frame.src, buffer]);
    }
    byAction.set(actionId, frames);
  }
  return { byAction, allInputs };
}

export async function buildGoldenBritish() {
  const sourceText = await readFile(sourcePath, "utf8");
  const source = JSON.parse(sourceText);
  assertValidPetActorSourceSpec(source);

  const sourceImageBuffer = await readFile(resolve(repoRoot, source.sourceImage));
  const actualSourceImageHash = sha256(sourceImageBuffer);
  if (actualSourceImageHash !== source.sourceImageSha256) {
    throw new Error(`${source.sourceImage}: expected SHA-256 ${source.sourceImageSha256}, got ${actualSourceImageHash}`);
  }

  const { byAction: sourceFrames, allInputs } = await readAndVerifySourceFrames(source);
  const sourceSpecSha256 = sha256(sourceText);
  const inputSetSha256 = hashInputSet(allInputs);
  const manifest = buildManifest(source, sourceSpecSha256, inputSetSha256, sourceFrames);
  assertValidPetActorManifest(manifest);

  const writes = [];
  const expectedFrameNames = new Set();
  const outputFiles = [];
  for (const [actionId, action] of Object.entries(source.actions)) {
    const inputs = sourceFrames.get(actionId);
    for (const [index, input] of inputs.entries()) {
      const fileName = outputFrameName(actionId, index, inputs.length);
      expectedFrameNames.add(fileName);
      writes.push(writeIfChanged(resolve(frameDir, fileName), input.buffer));
      outputFiles.push({ path: `frames/${fileName}`, sha256: input.sha256, source: action.sourceFrames[index].src });
    }
  }

  writes.push(writeIfChanged(resolve(runtimeSourceDir, "golden-british.png"), sourceImageBuffer));
  writes.push(writeIfChanged(resolve(outputDir, "actor.json"), `${JSON.stringify(manifest, null, 2)}\n`));
  const report = createAssetReport(source, manifest, outputFiles);
  writes.push(writeIfChanged(resolve(qaDir, "asset-report.json"), `${JSON.stringify(report, null, 2)}\n`));
  writes.push(writeIfChanged(resolve(qaDir, "contact-sheet.html"), createContactSheet(manifest)));

  const changed = (await Promise.all(writes)).filter(Boolean).length;
  const removedFrames = await removeStaleFiles(frameDir, expectedFrameNames);
  await rm(resolve(outputDir, "thumbnails"), { recursive: true, force: true });
  console.log(`pet-asset-studio: generated Golden British story actor (${changed} changed, ${removedFrames} stale frame files removed)`);
  return { manifest, report, changed, removedFrames };
}

const isDirectRun = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  buildGoldenBritish().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
