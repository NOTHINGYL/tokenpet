import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "docs", "screenshots", "pet-story");
const gifPath = join(outputDir, "tokenpet-story-demo.gif");
const sequencePath = join(outputDir, "demo-sequence.json");
const captureSource = readFileSync(join(root, "scripts", "capture-pet-story-demo.cjs"), "utf8");
const report = JSON.parse(readFileSync(sequencePath, "utf8"));
const checks = [];

function verify(name, condition, detail) {
  assert.ok(condition, `${name}: ${detail}`);
  checks.push({ name, detail });
}

const expectedSequence = ["wake_up", "token.delta", "click_purr", "drag_dangle", "drop_bounce", "milestone_celebrate"];
const expectedCaptureIds = ["launch", "wake", "token-update", "click", "drag", "drop", "milestone"];

verify("demo GIF exists", existsSync(gifPath) && statSync(gifPath).size > 50_000, "public launch GIF is a non-trivial generated artifact");
const gif = readFileSync(gifPath);
verify("demo GIF format", ["GIF87a", "GIF89a"].includes(gif.subarray(0, 6).toString("ascii")), "artifact has a valid GIF signature");
verify("demo GIF dimensions", gif.readUInt16LE(6) === 420 && gif.readUInt16LE(8) === 420, "public GIF is the expected 420×420 README size");
verify("scripted demo route", captureSource.includes('url.searchParams.set("demo", "pet-story")') && captureSource.includes('url.searchParams.set("view", "pet")'), "dedicated demo query loads the real Pet renderer surface");
verify("synthetic fixture", report.fixture === "synthetic local demo data; no private user data", "demo declares synthetic/no-private-data provenance");
verify("required sequence", JSON.stringify(report.requiredSequence) === JSON.stringify(expectedSequence), "wake, token update, click, drag, drop, and milestone beats are explicit");
verify("capture order", JSON.stringify(report.captures.map((capture) => capture.id)) === JSON.stringify(expectedCaptureIds), "renderer captures follow the public first-minute story order");
verify("unique renderer frames", new Set(report.captures.map((capture) => capture.sha256)).size === report.captures.length, "every demo beat produces a distinct screenshot hash");

for (const capture of report.captures) {
  const framePath = join(root, capture.file);
  verify(`demo frame ${capture.id}`, existsSync(framePath) && statSync(framePath).size > 10_000, "renderer capture exists and is non-trivial");
  verify(`approved actor ${capture.id}`, capture.renderer.generatedCanvases === 1 && capture.renderer.fallbackCanvases === 0, "capture contains exactly one generated actor and no fallback/placeholder");
  const expectedTokenMode = capture.id === "wake" ? "pet-token-hidden" : "pet-token-embedded";
  verify(`actor chrome ${capture.id}`, capture.renderer.tokenMode === expectedTokenMode && capture.renderer.canvasWidth === 1024 && capture.renderer.canvasHeight === 1024, capture.id === "wake" ? "Wake uses its chrome-free 1024px whole-cat sequence" : "capture uses the manifest-driven 1024px actor and embedded frame");
}

const tokenUpdate = report.captures.find((capture) => capture.id === "token-update");
verify("token update value", tokenUpdate?.usage.sevenDayTokens === 61_500_000 && tokenUpdate?.usage.allTimeTokens === 61_500_000, "demo updates the real token label to the synthetic 61.5M fixture value");

console.log(`Pet Story demo QA: ${checks.length} checks passed.`);
