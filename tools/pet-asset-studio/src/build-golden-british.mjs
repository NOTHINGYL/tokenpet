import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(toolDir, "../../..");
const sourcePath = resolve(repoRoot, "assets/source/pet-actors/golden-british/source.json");
const outputDir = resolve(repoRoot, "apps/desktop/public/pet-actors/golden-british");
const frameDir = resolve(outputDir, "frames");
const thumbnailDir = resolve(outputDir, "thumbnails");
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

function poseDefs() {
  return `
    <defs>
      <filter id="poseShadow" x="-24%" y="-24%" width="148%" height="148%">
        <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#1f2937" flood-opacity="0.14"/>
      </filter>
      <filter id="softBlur" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="0.35"/>
      </filter>
      <linearGradient id="furMain" x1="28%" y1="12%" x2="76%" y2="92%">
        <stop offset="0%" stop-color="#ffe8a8"/>
        <stop offset="44%" stop-color="#f7b94c"/>
        <stop offset="100%" stop-color="#d98922"/>
      </linearGradient>
      <radialGradient id="furLight" cx="42%" cy="34%" r="66%">
        <stop offset="0%" stop-color="#fff0c8"/>
        <stop offset="58%" stop-color="#f6bf58"/>
        <stop offset="100%" stop-color="#dc8a24"/>
      </radialGradient>
      <linearGradient id="earPink" x1="20%" y1="10%" x2="76%" y2="94%">
        <stop offset="0%" stop-color="#ffe1d4"/>
        <stop offset="100%" stop-color="#f4987b"/>
      </linearGradient>
      <radialGradient id="eyeGloss" cx="34%" cy="25%" r="64%">
        <stop offset="0%" stop-color="#fff8df"/>
        <stop offset="28%" stop-color="#5a3515"/>
        <stop offset="100%" stop-color="#100b07"/>
      </radialGradient>
      <radialGradient id="groundShadow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#1f2937" stop-opacity="0.18"/>
        <stop offset="62%" stop-color="#1f2937" stop-opacity="0.07"/>
        <stop offset="100%" stop-color="#1f2937" stop-opacity="0"/>
      </radialGradient>
    </defs>`;
}

function poseGround(options = {}) {
  const cy = options.thumbnail ? 842 : 852;
  const opacity = options.thumbnail ? 0.12 : 0.18;
  return `<ellipse cx="512" cy="${cy}" rx="300" ry="58" fill="url(#groundShadow)" opacity="${opacity}"/>`;
}

function tokenFrameShell() {
  return `
    <g filter="url(#poseShadow)">
      <rect x="300" y="682" width="424" height="150" rx="75" fill="#fff8dd" stroke="#efdba5" stroke-width="5"/>
      <rect x="348" y="714" width="328" height="94" rx="47" fill="#fffdf0" stroke="#f2e2ba" stroke-width="3" opacity="0.96"/>
    </g>`;
}

function frontHead(options = {}) {
  const eyes = options.eyes ?? "open";
  const mouth = options.mouth ?? "smile";
  const crown = options.crown ?? false;
  const leftEye = eyes === "closed" ? `<path d="M-82 -34c30 20 67 20 98 0" fill="none" stroke="#4a2c14" stroke-linecap="round" stroke-width="10"/>` : `<ellipse cx="-48" cy="-42" rx="38" ry="48" fill="url(#eyeGloss)"/><circle cx="-62" cy="-58" r="10" fill="#fff8dd"/>`;
  const rightEye = eyes === "closed" ? `<path d="M44 -34c30 20 67 20 98 0" fill="none" stroke="#4a2c14" stroke-linecap="round" stroke-width="10"/>` : `<ellipse cx="58" cy="-42" rx="38" ry="48" fill="url(#eyeGloss)"/><circle cx="44" cy="-58" r="10" fill="#fff8dd"/>`;
  const mouthShape = mouth === "open"
    ? `<ellipse cx="8" cy="52" rx="28" ry="24" fill="#6b2b16"/><path d="M-18 42c10 15 27 24 46 0" fill="none" stroke="#8b451f" stroke-linecap="round" stroke-width="5"/>`
    : `<path d="M-30 38c16 28 42 28 48 1c7 27 37 27 51-1" fill="none" stroke="#8b451f" stroke-linecap="round" stroke-width="6"/>`;
  const crownSvg = crown
    ? `<g transform="translate(4 -162) scale(0.82)">
        <path d="M-92 54l22-88l50 56l31-76l39 76l54-56l18 88c-56 22-153 22-214 0Z" fill="#f7c948" stroke="#b7791f" stroke-width="6" stroke-linejoin="round"/>
        <circle cx="-70" cy="-38" r="10" fill="#fff0a6"/><circle cx="10" cy="-58" r="11" fill="#22a06b"/><circle cx="88" cy="-38" r="10" fill="#fff0a6"/>
      </g>`
    : "";

  return `
    <g class="pose-head">
      <path d="M-145 -132l-58 -110c64 0 112 43 134 103Z" fill="url(#furMain)" stroke="#d98922" stroke-width="7" stroke-linejoin="round"/>
      <path d="M137 -134l61 -108c-67-1-116 41-138 103Z" fill="url(#furMain)" stroke="#d98922" stroke-width="7" stroke-linejoin="round"/>
      <path d="M-151 -143l-25 -48c31 7 58 28 75 62Z" fill="url(#earPink)" opacity="0.84"/>
      <path d="M143 -144l26 -47c-31 7-59 28-77 62Z" fill="url(#earPink)" opacity="0.84"/>
      <ellipse cx="0" cy="-36" rx="178" ry="154" fill="url(#furLight)" stroke="#e2942e" stroke-width="6"/>
      <path d="M-88 -154c23 38 24 68 5 91M-35 -177c12 42 10 76-4 104M32 -176c-10 42-7 76 8 103M86 -154c-24 40-25 72-5 96" fill="none" stroke="#db8a1e" stroke-linecap="round" stroke-width="12" opacity="0.42"/>
      ${leftEye}
      ${rightEye}
      <path d="M-10 16c13-8 28-8 41 0c-6 16-34 16-41 0Z" fill="#f47b57"/>
      ${mouthShape}
      <path d="M-128 28c-45-8-79-3-105 17M-126 52c-42 6-74 20-96 42M132 28c45-8 79-3 105 17M130 52c42 6 74 20 96 42" fill="none" stroke="#c98225" stroke-linecap="round" stroke-width="4" opacity="0.45"/>
      ${crownSvg}
    </g>`;
}

function sittingPose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 500 : 430;
  const scale = thumbnail ? 1.08 : 1;
  const eyes = options.eyes ?? "open";
  const tailWag = options.tailWag ?? false;
  const crown = options.crown ?? false;

  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g transform="translate(512 ${y}) scale(${scale})" filter="url(#poseShadow)">
      ${tailWag ? `<ellipse cx="262" cy="178" rx="112" ry="54" fill="#e7962a" opacity="0.24" transform="rotate(-28 262 178)"/><ellipse cx="272" cy="126" rx="112" ry="52" fill="#e7962a" opacity="0.2" transform="rotate(-42 272 126)"/>` : ""}
      <ellipse cx="202" cy="168" rx="128" ry="68" fill="url(#furMain)" stroke="#d98922" stroke-width="6" transform="rotate(-18 202 168)"/>
      <ellipse cx="0" cy="180" rx="208" ry="174" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <path d="M-112 44c33 42 41 84 18 130M-52 30c22 55 23 106 4 154M52 30c-22 56-21 108-1 156M116 48c-36 45-43 88-17 131" fill="none" stroke="#d98720" stroke-linecap="round" stroke-width="13" opacity="0.34"/>
      <g transform="translate(0 -70)">${frontHead({ eyes, crown })}</g>
      <ellipse cx="-112" cy="315" rx="78" ry="60" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
      <ellipse cx="112" cy="315" rx="78" ry="60" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
      <ellipse cx="${tailWag ? -122 : -86}" cy="${tailWag ? 240 : 272}" rx="54" ry="38" fill="#ffd47b" stroke="#e7a13c" stroke-width="5" transform="rotate(${tailWag ? -28 : 0})"/>
    </g>`;
}

function stretchPose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 540 : 454;
  const scale = thumbnail ? 1.08 : 0.98;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g transform="translate(512 ${y}) scale(${scale})" filter="url(#poseShadow)">
      <ellipse cx="50" cy="206" rx="270" ry="116" fill="url(#furMain)" stroke="#d98922" stroke-width="7" transform="rotate(-4 50 206)"/>
      <path d="M-98 104c29 42 36 84 16 122M-24 96c17 54 17 96-2 136M72 100c-22 50-18 90 8 128" fill="none" stroke="#d98720" stroke-linecap="round" stroke-width="12" opacity="0.32"/>
      <ellipse cx="276" cy="132" rx="122" ry="48" fill="url(#furMain)" stroke="#d98922" stroke-width="6" transform="rotate(-50 276 132)"/>
      <g transform="translate(-212 42) rotate(-9) scale(0.88)">${frontHead({ eyes: "open" })}</g>
      <ellipse cx="-248" cy="326" rx="86" ry="38" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(10 -248 326)"/>
      <ellipse cx="-120" cy="332" rx="98" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(4 -120 332)"/>
      <ellipse cx="188" cy="318" rx="82" ry="36" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
      <path d="M-322 352c-38 8-79 4-122-14M-298 386c-42 14-86 16-132 7" fill="none" stroke="#93c5fd" stroke-linecap="round" stroke-width="8" opacity="0.7"/>
    </g>`;
}

function runPose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 540 : 438;
  const scale = thumbnail ? 1.08 : 0.96;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g opacity="0.44" fill="#e5e7eb">
      <ellipse cx="246" cy="${thumbnail ? 786 : 742}" rx="58" ry="28"/>
      <ellipse cx="316" cy="${thumbnail ? 748 : 704}" rx="42" ry="20"/>
      <ellipse cx="372" cy="${thumbnail ? 720 : 676}" rx="30" ry="14"/>
    </g>
    <g transform="translate(512 ${y}) scale(${scale}) rotate(-4)" filter="url(#poseShadow)">
      <ellipse cx="24" cy="180" rx="232" ry="126" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <path d="M-64 84c26 42 30 80 10 118M28 78c17 50 17 92-1 124M104 94c-18 43-14 79 10 110" fill="none" stroke="#d98720" stroke-linecap="round" stroke-width="12" opacity="0.32"/>
      <ellipse cx="-226" cy="168" rx="125" ry="44" fill="url(#furMain)" stroke="#d98922" stroke-width="6" transform="rotate(20 -226 168)"/>
      <g transform="translate(208 14) scale(0.78)">${frontHead({ eyes: "open" })}</g>
      <ellipse cx="-80" cy="308" rx="88" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(28 -80 308)"/>
      <ellipse cx="50" cy="308" rx="96" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(-22 50 308)"/>
      <ellipse cx="168" cy="286" rx="76" ry="30" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(18 168 286)"/>
    </g>`;
}

function jumpPose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 494 : 378;
  const scale = thumbnail ? 1.02 : 0.92;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <path d="M314 ${thumbnail ? 648 : 590}c100-130 238-164 382-74" fill="none" stroke="#4f7ee8" stroke-dasharray="9 12" stroke-linecap="round" stroke-width="5" opacity="0.72"/>
    <path d="M690 ${thumbnail ? 574 : 516}l43 14l-35 28" fill="none" stroke="#4f7ee8" stroke-linecap="round" stroke-linejoin="round" stroke-width="5" opacity="0.72"/>
    <g transform="translate(512 ${y}) scale(${scale}) rotate(-12)" filter="url(#poseShadow)">
      <ellipse cx="-24" cy="160" rx="215" ry="126" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <ellipse cx="-236" cy="132" rx="126" ry="42" fill="url(#furMain)" stroke="#d98922" stroke-width="6" transform="rotate(26 -236 132)"/>
      <g transform="translate(194 -12) scale(0.76)">${frontHead({ eyes: "open", mouth: "open" })}</g>
      <ellipse cx="-98" cy="284" rx="78" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(-34 -98 284)"/>
      <ellipse cx="26" cy="290" rx="76" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(34 26 290)"/>
      <ellipse cx="156" cy="260" rx="68" ry="30" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(-18 156 260)"/>
    </g>`;
}

function napPose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 575 : 480;
  const scale = thumbnail ? 1.05 : 0.98;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g transform="translate(512 ${y}) scale(${scale})" filter="url(#poseShadow)">
      <ellipse cx="18" cy="218" rx="245" ry="132" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <ellipse cx="200" cy="184" rx="112" ry="48" fill="url(#furMain)" stroke="#d98922" stroke-width="6" transform="rotate(-36 200 184)"/>
      <g transform="translate(-154 78) scale(0.76) rotate(-8)">${frontHead({ eyes: "closed" })}</g>
      <ellipse cx="-86" cy="324" rx="92" ry="36" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
      <ellipse cx="64" cy="320" rx="86" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
    </g>
    <g opacity="0.88" filter="url(#softBlur)">
      <text x="666" y="${thumbnail ? 388 : 314}" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="850" fill="#60a5fa">Z</text>
      <text x="716" y="${thumbnail ? 340 : 266}" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="850" fill="#93c5fd">Z</text>
    </g>`;
}

function celebratePose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 520 : 428;
  const scale = thumbnail ? 1.02 : 0.95;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g opacity="0.88">
      <circle cx="278" cy="${thumbnail ? 276 : 216}" r="8" fill="#ef4444"/>
      <circle cx="736" cy="${thumbnail ? 250 : 190}" r="8" fill="#22c55e"/>
      <path d="M324 ${thumbnail ? 344 : 284}l18 18m0-18l-18 18" stroke="#f59e0b" stroke-linecap="round" stroke-width="5"/>
      <path d="M702 ${thumbnail ? 338 : 278}l18 18m0-18l-18 18" stroke="#ef4444" stroke-linecap="round" stroke-width="5"/>
    </g>
    <g transform="translate(512 ${y}) scale(${scale})" filter="url(#poseShadow)">
      <ellipse cx="0" cy="222" rx="162" ry="204" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <path d="M-72 62c22 56 23 106 3 160M14 44c12 64 8 122-6 178M83 68c-24 54-24 104 0 151" fill="none" stroke="#d98720" stroke-linecap="round" stroke-width="12" opacity="0.32"/>
      <g transform="translate(0 -98)">${frontHead({ eyes: "closed", mouth: "open", crown: true })}</g>
      <ellipse cx="-180" cy="122" rx="40" ry="102" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(-36 -180 122)"/>
      <ellipse cx="180" cy="122" rx="40" ry="102" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(36 180 122)"/>
      <ellipse cx="-66" cy="386" rx="64" ry="42" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
      <ellipse cx="66" cy="386" rx="64" ry="42" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
    </g>`;
}

function pouncePose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 574 : 474;
  const scale = thumbnail ? 1.05 : 0.96;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g transform="translate(512 ${y}) scale(${scale}) rotate(-5)" filter="url(#poseShadow)">
      <ellipse cx="10" cy="194" rx="258" ry="112" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <ellipse cx="-228" cy="158" rx="128" ry="42" fill="url(#furMain)" stroke="#d98922" stroke-width="6" transform="rotate(22 -228 158)"/>
      <g transform="translate(210 36) scale(0.82) rotate(4)">${frontHead({ eyes: "open" })}</g>
      <ellipse cx="-100" cy="310" rx="96" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(12 -100 310)"/>
      <ellipse cx="56" cy="314" rx="108" ry="34" fill="#ffd47b" stroke="#e7a13c" stroke-width="6" transform="rotate(-10 56 314)"/>
      <ellipse cx="190" cy="292" rx="74" ry="30" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
    </g>
    <g opacity="0.82">
      <path d="M780 ${thumbnail ? 530 : 474}l92 50l-39 16l28 55l-28 14l-28-56l-32 30l7-109Z" fill="#ffffff" stroke="#31446a" stroke-linejoin="round" stroke-width="5"/>
    </g>`;
}

function edgePeekPose(options = {}) {
  const includeTokenFrame = options.includeTokenFrame ?? true;
  const thumbnail = options.thumbnail ?? false;
  const y = thumbnail ? 520 : 424;
  const scale = thumbnail ? 1 : 0.94;
  const edgeX = thumbnail ? 760 : 806;
  return `
    ${includeTokenFrame ? tokenFrameShell() : ""}
    <g opacity="0.68">
      <rect x="${edgeX}" y="${thumbnail ? 280 : 246}" width="126" height="426" rx="34" fill="#e5e7eb"/>
      <rect x="${edgeX + 32}" y="${thumbnail ? 316 : 282}" width="68" height="352" rx="24" fill="#94a3b8" opacity="0.54"/>
    </g>
    <g transform="translate(${thumbnail ? 646 : 662} ${y}) scale(${scale})" filter="url(#poseShadow)">
      <ellipse cx="78" cy="190" rx="174" ry="154" fill="url(#furMain)" stroke="#d98922" stroke-width="7"/>
      <g transform="translate(-48 -78) scale(0.9)">${frontHead({ eyes: "open" })}</g>
      <ellipse cx="-70" cy="342" rx="74" ry="48" fill="#ffd47b" stroke="#e7a13c" stroke-width="6"/>
    </g>`;
}

function poseSceneSvg(pose, options = {}) {
  switch (pose) {
    case "tail-wag":
      return sittingPose({ ...options, tailWag: true });
    case "blink":
      return sittingPose({ ...options, eyes: "closed" });
    case "stretch":
      return stretchPose(options);
    case "run":
      return runPose(options);
    case "jump":
      return jumpPose(options);
    case "nap":
      return napPose(options);
    case "celebrate":
      return celebratePose(options);
    case "pounce":
      return pouncePose(options);
    case "edge-peek":
      return edgePeekPose(options);
    case "sitting":
    default:
      return sittingPose(options);
  }
}

function poseFrameSvg(source, pose, options = {}) {
  const artboard = source.artboard;
  const scene = poseSceneSvg(pose, options);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${artboard.width}" height="${artboard.height}" viewBox="0 0 ${artboard.width} ${artboard.height}">
  ${poseDefs()}
  ${poseGround(options)}
  ${scene}
</svg>
`;
}

function frameSvg(source, effectName, imageHref, pose = "source") {
  if (pose !== "source") {
    return poseFrameSvg(source, pose, { includeTokenFrame: true, thumbnail: false });
  }

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

function thumbnailSvg(source, pose) {
  return poseFrameSvg(source, pose, { includeTokenFrame: false, thumbnail: true });
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
  const normalizedValue = value
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  try {
    const existing = await readFile(path, "utf8");
    if (existing === normalizedValue) return false;
  } catch {
    // File does not exist yet.
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, normalizedValue, "utf8");
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
  await mkdir(thumbnailDir, { recursive: true });

  const writes = [writeBufferIfChanged(resolve(runtimeSourceDir, "golden-british.png"), imageBuffer)];
  for (const moodId of moods) {
    writes.push(writeIfChanged(resolve(frameDir, `${moodId}-idle.svg`), frameSvg(source, source.moods[moodId].frameEffect, imageHref)));
  }
  Object.entries(source.actions ?? {}).forEach(([actionId, action]) => {
    const pose = action.pose ?? "source";
    writes.push(writeIfChanged(resolve(frameDir, `${actionId}.svg`), frameSvg(source, action.effect, imageHref, pose)));
    writes.push(writeIfChanged(resolve(thumbnailDir, `${actionId}.svg`), thumbnailSvg(source, pose)));
  });
  writes.push(writeIfChanged(resolve(outputDir, "actor.json"), `${JSON.stringify(manifest, null, 2)}\n`));

  const changed = (await Promise.all(writes)).filter(Boolean).length;
  console.log(`pet-asset-studio: generated Golden British actor (${changed} file${changed === 1 ? "" : "s"} changed)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
