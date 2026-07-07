import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../../..");
const sourcePath = resolve(repoRoot, "assets/source/pet-actors/golden-british/source.json");
const outputDir = resolve(repoRoot, "apps/desktop/public/pet-actors/golden-british");
const frameDir = resolve(outputDir, "frames");
const runtimeSourceDir = resolve(outputDir, "source");

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

function visualEffectSvg(effect, artboard) {
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

  if (effect === "tail-wag") {
    return `
      <g opacity="0.68" fill="none" stroke-linecap="round">
        <path d="M788 520c54 18 91 6 120-29" stroke="#f6ad42" stroke-width="9"/>
        <path d="M810 562c46 20 84 14 116-18" stroke="#fed7aa" stroke-width="7"/>
        <path d="M832 492c38 11 68 3 93-24" stroke="#f59e0b" stroke-width="6"/>
      </g>`;
  }

  if (effect === "blink") {
    return `
      <g opacity="0.78" fill="none" stroke="#4a2c14" stroke-linecap="round" stroke-width="8">
        <path d="M306 405c31 18 67 18 100 0"/>
        <path d="M500 400c34 19 73 18 108-2"/>
      </g>`;
  }

  if (effect === "stretch") {
    return `
      <g opacity="0.52" fill="none" stroke="#93c5fd" stroke-linecap="round" stroke-width="5">
        <path d="M184 706c-34 2-64-5-92-22"/>
        <path d="M196 742c-42 9-82 6-120-8"/>
        <path d="M748 306c30-9 60-7 91 6"/>
      </g>`;
  }

  if (effect === "run-dust") {
    return `
      <g opacity="0.54" fill="#e5e7eb">
        <ellipse cx="174" cy="682" rx="48" ry="24"/>
        <ellipse cx="225" cy="640" rx="38" ry="19"/>
        <ellipse cx="284" cy="610" rx="30" ry="15"/>
      </g>
      <g opacity="0.46" fill="none" stroke="#60a5fa" stroke-dasharray="10 12" stroke-linecap="round" stroke-width="4">
        <path d="M204 532c128-116 304-133 468-42"/>
      </g>`;
  }

  if (effect === "jump-arc") {
    return `
      <g opacity="0.72" fill="none" stroke="#4f7ee8" stroke-dasharray="8 12" stroke-linecap="round" stroke-width="4">
        <path d="M332 522c92-122 224-158 350-74"/>
      </g>
      <path d="M676 431l42 14l-34 28" fill="none" stroke="#4f7ee8" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/>
      <ellipse cx="384" cy="828" rx="140" ry="30" fill="#cbd5e1" opacity="0.26"/>`;
  }

  if (effect === "celebrate") {
    return `
      <g opacity="0.88">
        <circle cx="270" cy="280" r="7" fill="#ef4444"/>
        <circle cx="744" cy="254" r="8" fill="#22c55e"/>
        <circle cx="802" cy="414" r="6" fill="#3b82f6"/>
        <path d="M318 338l18 18m0-18l-18 18" stroke="#f59e0b" stroke-linecap="round" stroke-width="5"/>
        <path d="M710 340l18 18m0-18l-18 18" stroke="#ef4444" stroke-linecap="round" stroke-width="5"/>
        <path d="M588 236l12 24l26 4l-19 19l5 26l-24-12l-23 12l4-26l-18-19l26-4l11-24Z" fill="#facc15"/>
      </g>`;
  }

  if (effect === "cursor") {
    return `
      <g opacity="0.82">
        <path d="M782 552l92 50l-39 16l28 55l-28 14l-28-56l-32 30l7-109Z" fill="#ffffff" stroke="#31446a" stroke-linejoin="round" stroke-width="5"/>
        <path d="M720 492c42 10 76 32 102 66" fill="none" stroke="#60a5fa" stroke-dasharray="7 12" stroke-linecap="round" stroke-width="4"/>
      </g>`;
  }

  if (effect === "edge") {
    return `
      <g opacity="0.62">
        <rect x="812" y="300" width="132" height="408" rx="34" fill="#e5e7eb"/>
        <rect x="844" y="332" width="72" height="344" rx="24" fill="#94a3b8" opacity="0.58"/>
      </g>`;
  }

  return "";
}

function frameSvg(source, effectName, imageHref) {
  const artboard = source.artboard;
  const placement = source.sourceImagePlacement;
  const effect = visualEffectSvg(effectName, artboard).trim();
  const effectBlock = effect ? `${effect}\n` : "";

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
  const origin = {
    x: source.artboard.width / 2,
    y: source.sourceImagePlacement.y + source.sourceImagePlacement.height * 0.92
  };

  function createFrame({ id, mood, src, durationMs, translateX, translateY, scaleX, scaleY, rotation }) {
    return {
      id,
      mood,
      src,
      kind: "svg",
      rect: { x: 0, y: 0, width: source.artboard.width, height: source.artboard.height },
      durationMs,
      bodyTransform: {
        origin,
        translateX,
        translateY,
        scaleX,
        scaleY,
        rotation
      }
    };
  }

  moods.forEach((moodId) => {
    const frame = createFrame({
      id: `${moodId}-idle-base`,
      mood: moodId,
      src: `frames/${moodId}-idle.svg`,
      durationMs: source.motion.idle.durationMs,
      translateX: 0,
      translateY: source.motion.idle.bobAmplitude,
      scaleX: source.motion.idle.breathAmplitude * -0.4,
      scaleY: source.motion.idle.breathAmplitude,
      rotation: 0
    });

    animations[`${moodId}.idle`] = {
      id: `${moodId}.idle`,
      mood: moodId,
      motionState: "idle",
      fps: source.motion.idle.fps,
      loop: true,
      frames: [frame]
    };
  });

  Object.entries(source.actions ?? {}).forEach(([actionId, action]) => {
    const frame = createFrame({
      id: `${actionId}-base`,
      mood: action.mood,
      src: `frames/${actionId}.svg`,
      durationMs: action.durationMs,
      translateX: action.translateX,
      translateY: action.translateY,
      scaleX: action.scaleX,
      scaleY: action.scaleY,
      rotation: action.rotation
    });

    animations[`action.${actionId}`] = {
      id: `action.${actionId}`,
      mood: action.mood,
      motionState: actionId,
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
    defaultAnimation: "action.idle-breathe",
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

async function writeBufferIfChanged(path, value) {
  try {
    const existing = await readFile(path);
    if (Buffer.compare(existing, value) === 0) return false;
  } catch {
    // File does not exist yet.
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
  return true;
}

async function main() {
  const sourceText = await readFile(sourcePath, "utf8");
  const source = JSON.parse(sourceText);
  const imagePath = resolve(repoRoot, source.sourceImage);
  const imageBuffer = await readFile(imagePath);
  const imageHref = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  const contentHash = createContentHash(sourceText, imageBuffer);
  const manifest = buildManifest(source, contentHash);

  await mkdir(frameDir, { recursive: true });

  const writes = [writeBufferIfChanged(resolve(runtimeSourceDir, "golden-british.png"), imageBuffer)];
  for (const moodId of moods) {
    writes.push(writeIfChanged(resolve(frameDir, `${moodId}-idle.svg`), frameSvg(source, source.moods[moodId].frameEffect, imageHref)));
  }
  Object.entries(source.actions ?? {}).forEach(([actionId, action]) => {
    writes.push(writeIfChanged(resolve(frameDir, `${actionId}.svg`), frameSvg(source, action.effect, imageHref)));
  });
  writes.push(writeIfChanged(resolve(outputDir, "actor.json"), `${JSON.stringify(manifest, null, 2)}\n`));

  const changed = (await Promise.all(writes)).filter(Boolean).length;
  console.log(`pet-asset-studio: generated Golden British actor (${changed} file${changed === 1 ? "" : "s"} changed)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
