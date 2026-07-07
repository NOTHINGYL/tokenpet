import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../../..");
const sourcePath = resolve(repoRoot, "assets/source/pet-actors/golden-british/source.json");
const outputDir = resolve(repoRoot, "apps/desktop/public/pet-actors/golden-british");
const frameDir = resolve(outputDir, "frames");

const moods = ["sleepy", "focused", "hot", "overdrive"];

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function rectAttributes(rect) {
  return `x="${round(rect.x)}" y="${round(rect.y)}" width="${round(rect.width)}" height="${round(rect.height)}"`;
}

function createContentHash(...parts) {
  const hash = createHash("sha256");
  parts.forEach((part) => hash.update(part));
  return hash.digest("hex").slice(0, 16);
}

function moodEffectSvg(effect, artboard) {
  if (effect === "sleep") {
    return `
      <g opacity="0.82" filter="url(#softBlur)">
        <path d="M734 166c21-35 67-28 77 8c-21-17-51-8-59 22c-6-10-12-20-18-30Z" fill="#dbeafe"/>
        <text x="792" y="162" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="#60a5fa">Z</text>
        <text x="834" y="126" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="800" fill="#93c5fd">Z</text>
      </g>`;
  }

  if (effect === "warm-glow") {
    return `
      <ellipse cx="${artboard.width / 2}" cy="692" rx="420" ry="198" fill="url(#warmGlow)" opacity="0.58"/>
      <g opacity="0.74">
        <path d="M744 608c28-31 24-54 13-80c38 24 52 58 31 101c-9 18-27 35-44 42c7-22 3-42 0-63Z" fill="#f97316"/>
        <path d="M782 626c19-21 15-39 7-57c29 18 38 44 23 75c-7 13-20 25-32 30c5-16 3-30 2-48Z" fill="#fbbf24"/>
      </g>`;
  }

  if (effect === "spark") {
    return `
      <g opacity="0.82" filter="url(#softBlur)">
        <path d="M762 242l16 33l35 5l-25 25l6 35l-32-17l-31 17l6-35l-26-25l36-5l15-33Z" fill="#facc15"/>
        <path d="M832 348l9 20l22 3l-16 15l4 22l-20-11l-19 11l3-22l-16-15l22-3l11-20Z" fill="#fdba74"/>
        <path d="M701 318l7 15l17 3l-12 12l3 17l-15-8l-15 8l3-17l-12-12l17-3l7-15Z" fill="#bbf7d0"/>
      </g>`;
  }

  return "";
}

function frameSvg(source, imageBase64, moodId) {
  const artboard = source.artboard;
  const placement = source.sourceImagePlacement;
  const mood = source.moods[moodId];
  const effect = moodEffectSvg(mood.frameEffect, artboard).trim();
  const effectBlock = effect ? `${effect}\n` : "";
  const imageHref = `data:image/png;base64,${imageBase64}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}">
  <defs>
    <filter id="bodyShadow" x="-18%" y="-18%" width="136%" height="136%">
      <feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#1f2937" flood-opacity="0.16"/>
    </filter>
    <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="0.35"/>
    </filter>
    <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1f2937" stop-opacity="0.18"/>
      <stop offset="62%" stop-color="#1f2937" stop-opacity="0.07"/>
      <stop offset="100%" stop-color="#1f2937" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="warmGlow" cx="48%" cy="52%" r="56%">
      <stop offset="0%" stop-color="#fde68a" stop-opacity="0.6"/>
      <stop offset="64%" stop-color="#fed7aa" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#fed7aa" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="506" cy="838" rx="340" ry="68" fill="url(#groundShadow)"/>
${effectBlock}
  <image href="${imageHref}" ${rectAttributes(placement)} preserveAspectRatio="xMidYMid meet" filter="url(#bodyShadow)"/>
</svg>
`;
}

function buildManifest(source, contentHash) {
  const animations = {};

  moods.forEach((moodId) => {
    const frame = {
      id: `${moodId}-idle-base`,
      mood: moodId,
      src: `frames/${moodId}-idle.svg`,
      kind: "svg",
      rect: { x: 0, y: 0, width: source.artboard.width, height: source.artboard.height },
      durationMs: source.motion.idle.durationMs,
      bodyTransform: {
        origin: {
          x: source.artboard.width / 2,
          y: source.sourceImagePlacement.y + source.sourceImagePlacement.height * 0.92
        },
        translateY: source.motion.idle.bobAmplitude,
        scaleX: source.motion.idle.breathAmplitude * -0.4,
        scaleY: source.motion.idle.breathAmplitude
      }
    };

    animations[`${moodId}.idle`] = {
      id: `${moodId}.idle`,
      mood: moodId,
      motionState: "idle",
      fps: source.motion.idle.fps,
      loop: true,
      frames: [frame]
    };
  });

  return {
    schemaVersion: "pet-actor/v1",
    actorId: source.actorId,
    displayName: source.displayName,
    breedId: source.breedId,
    sourceVersion: source.sourceVersion,
    generatedBy: "@tokenpet/pet-asset-studio",
    generatedAt: "2026-07-06T00:00:00.000Z",
    contentHash,
    artboard: source.artboard,
    defaultAnimation: "focused.idle",
    defaultTokenMode: "embedded",
    dynamicSlots: {
      tokenText: {
        ...source.dynamicSlots.tokenText,
        fontWeight: 850
      },
      externalToken: {
        mode: "below",
        x: 330,
        y: 796,
        width: 364,
        height: 108,
        maxFontSize: 70
      },
      moodBadge: source.dynamicSlots.moodBadge
    },
    animations,
    compatibility: {
      bakedAccessories: ["collar", "embedded-token-frame"],
      runtimeAccessoryPolicy: "disabled",
      supportedCatTypes: [source.breedId]
    }
  };
}

async function writeIfChanged(path, value) {
  try {
    const existing = await readFile(path, "utf8");
    if (existing === value) return false;
  } catch {
    // File does not exist yet.
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
  return true;
}

async function main() {
  const sourceText = await readFile(sourcePath, "utf8");
  const source = JSON.parse(sourceText);
  const imagePath = resolve(repoRoot, source.sourceImage);
  const imageBuffer = await readFile(imagePath);
  const imageBase64 = imageBuffer.toString("base64");
  const contentHash = createContentHash(sourceText, imageBuffer);
  const manifest = buildManifest(source, contentHash);

  await mkdir(frameDir, { recursive: true });

  const writes = [];
  for (const moodId of moods) {
    writes.push(writeIfChanged(resolve(frameDir, `${moodId}-idle.svg`), frameSvg(source, imageBase64, moodId)));
  }
  writes.push(writeIfChanged(resolve(outputDir, "actor.json"), `${JSON.stringify(manifest, null, 2)}\n`));

  const changed = (await Promise.all(writes)).filter(Boolean).length;
  console.log(`pet-asset-studio: generated Golden British actor (${changed} file${changed === 1 ? "" : "s"} changed)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
