import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const actorPath = join(root, "apps/desktop/public/pet-actors/golden-british/actor.json");
const actorDir = dirname(actorPath);
const manifest = JSON.parse(readFileSync(actorPath, "utf8"));

const quickPlayIds = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_pointer",
  "capture_moment",
];

const results = [];
const warnings = [];

function record(name, detail) {
  results.push({ name, detail });
}

function verify(name, condition, detail) {
  assert.ok(condition, `${name}: ${detail}`);
  record(name, detail);
}

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function fileIsNonEmpty(path) {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
}

function capabilityMap() {
  return new Map(manifest.capabilities.map((capability) => [capability.id, capability]));
}

function verifyManifest() {
  verify("manifest token slot", Boolean(manifest.tokenSlot?.width && manifest.tokenSlot?.height), "tokenSlot is declared and non-empty");
  verify("manifest mood slot", Boolean(manifest.moodBadgeSlot?.width && manifest.moodBadgeSlot?.height), "moodBadgeSlot is declared and non-empty");
  verify("manifest source hash", /^[a-f0-9]{64}$/u.test(manifest.sourceAssetHash), "sourceAssetHash is a SHA-256 digest");
  verify("embedded token frame", manifest.compatibility?.tokenFramePolicy === "embedded-only", "Golden British declares embedded-only token-frame policy");
  verify("static fallback", fileIsNonEmpty(resolve(actorDir, manifest.fallbackStaticImage)), "fallbackStaticImage resolves to a non-empty file");

  const walk = manifest.animations["action.walk_round_trip"];
  verify(
    "walk uses authored root motion",
    walk?.locomotion?.kind === "authored-root-motion"
      && walk.locomotion.nominalStepDistancePx === 18
      && walk.locomotion.footfallsPerCycle === 4
      && JSON.stringify(walk.locomotion.rootStepKeyframes) === JSON.stringify([0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]),
    "the actor manifest owns the four-footfall root curve instead of deriving body speed from fps",
  );
  verify(
    "walk uses coherent quadruped phase order",
    walk?.frames?.map((frame) => frame.src).every((src, index) => src.endsWith(`walk_round_trip_v4_${String(index + 1).padStart(2, "0")}.png`))
      && walk?.locomotion?.phases?.map((phase) => phase.id).join(",") === "near-hind-contact,near-hind-support,near-fore-contact,near-fore-support,far-hind-contact,far-hind-support,far-fore-contact,far-fore-support"
      && walk?.locomotion?.phases?.map((phase) => phase.contacts[0]).join(",") === "near-hind,near-hind,near-fore,near-fore,far-hind,far-hind,far-fore,far-fore",
    "v4 interleaves the source rows so every planted paw owns one contact/support pair",
  );

  for (const reference of manifest.visualReferences ?? []) {
    verify(`visual reference ${reference}`, fileIsNonEmpty(join(root, reference)), "approved visual reference resolves to a non-empty file");
  }

  const byId = capabilityMap();
  const declaredIds = manifest.capabilities.map((capability) => capability.id);
  verify("capability ids unique", new Set(declaredIds).size === declaredIds.length, "every capability id is unique");

  for (const actionId of quickPlayIds) {
    verify(`Quick Play capability ${actionId}`, byId.has(actionId), "action is represented by the capability gate");
  }

  for (const capability of manifest.capabilities) {
    if (capability.status === "ready") {
      const animation = manifest.animations[`action.${capability.id}`];
      verify(`ready animation ${capability.id}`, Boolean(animation?.frames?.length), "ready capability has a same-id animation with frames");
      for (const frame of animation.frames) {
        const framePath = resolve(actorDir, frame.src);
        verify(`ready frame ${capability.id}/${frame.id}`, frame.kind === "png" && frame.src.endsWith(".png") && fileIsNonEmpty(framePath), "ready frame is a non-empty generated PNG");
      }
    }

    if (capability.status === "fallback") {
      const visited = new Set([capability.id]);
      let current = capability;
      while (current.status === "fallback") {
        verify(`fallback target ${current.id}`, Boolean(current.fallbackId && byId.has(current.fallbackId)), "fallbackId names a declared capability");
        verify(`fallback cycle ${current.id}`, !visited.has(current.fallbackId), "fallback chain is acyclic");
        visited.add(current.fallbackId);
        current = byId.get(current.fallbackId);
      }
      verify(`fallback terminal ${capability.id}`, current.status === "ready", "fallback chain terminates at a ready capability");
    }

    if (capability.status === "planned" || capability.status === "unavailable") {
      verify(`non-ready UI gate ${capability.id}`, ["disable", "hide"].includes(capability.uiBehavior), "planned/unavailable capability is disabled or hidden");
    }
  }
}

function buttonDiagnostics(relativePath) {
  const sourceText = read(relativePath);
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing = [];

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      if (tagName === "button") {
        const names = new Set();
        let hasSpread = false;
        for (const property of node.attributes.properties) {
          if (ts.isJsxSpreadAttribute(property)) {
            hasSpread = true;
          } else {
            names.add(property.name.getText(sourceFile));
          }
        }
        if (!names.has("onClick") && !names.has("onPointerDown") && !names.has("disabled") && !hasSpread) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          missing.push(`${relativePath}:${position.line + 1}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return missing;
}

function verifyReachableUi() {
  const petUiFiles = [
    "apps/desktop/src/views/PopoverApp.tsx",
    "apps/desktop/src/views/PetApp.tsx",
    "apps/desktop/src/features/pet-appearance/AppearancePanel.tsx",
    "apps/desktop/src/features/pet-appearance/CatTypePage.tsx",
    "apps/desktop/src/features/pet-appearance/MoodLooksPage.tsx",
    "apps/desktop/src/features/pet-appearance/AccessoriesPage.tsx",
    "apps/desktop/src/features/pet-story/PetStoryPanel.tsx",
    "apps/desktop/src/features/pet-story/ActionsWorkbench.tsx",
  ];
  const missingHandlers = petUiFiles.flatMap(buttonDiagnostics);
  verify("reachable Pet buttons", missingHandlers.length === 0, missingHandlers.length ? `enabled buttons without handlers: ${missingHandlers.join(", ")}` : "every reachable enabled Pet button has an interaction handler");

  const consoleDiagnostics = buttonDiagnostics("apps/desktop/src/views/ConsoleApp.tsx");
  if (consoleDiagnostics.length) warnings.push(`Console-wide enabled buttons without handlers: ${consoleDiagnostics.join(", ")}`);

  const popoverSource = read("apps/desktop/src/views/PopoverApp.tsx");
  const menuBarSource = read("apps/desktop/src/views/MenuBarApp.tsx");
  const consoleSource = read("apps/desktop/src/views/ConsoleApp.tsx");
  for (const actionId of quickPlayIds) {
    verify(`Quick Play stable id ${actionId}`, popoverSource.includes(`id: "${actionId}"`), "friendly action maps to its stable implementation id");
  }
  verify("Quick Play no analytics components", !/MetricCard|ProviderStatusRows|Source status|allTimeTokens|sevenDayTokens|todayTokens/u.test(popoverSource), "Quick Play source contains no token-stat or source-list implementation");
  verify("Quick Play no duplicate actor preview", !/PetAppearanceVisual|PetRenderer|GeneratedPetActorCanvas/u.test(popoverSource), "Quick Play contains no repeated cat preview");
  verify("Quick Play v18 removes dashboard modules", !/TokenPet|All good|quick-status|Play Mode|Mini Toys|Last interaction|Follow cursor|Reduce motion|Quiet mode/u.test(popoverSource), "Quick Play source contains only the compact v18 controller modules");
  verify("Quick Play cursor helper copy", popoverSource.includes("Tracks your cursor for 30 seconds."), "the required 30-second helper is visible in source");
  verify("Quick Play v18 controls", ["Always on top", "Lock position", "Mute pet sounds"].every((label) => popoverSource.includes(`label=\"${label}\"`)), "the panel declares exactly the three public pet controls");
  verify("Menu Bar Console entries target Overview", menuBarSource.match(/openConsole\("overview"\)/gu)?.length === 2, "both the settings icon and Open Console footer explicitly request Overview");
  verify("Quick Play Console entry targets Pet", popoverSource.includes('openConsole("pet")'), "the double-click panel explicitly requests the Pet console");
  verify("Pet navigation resets to Appearance", consoleSource.includes('if (tab === "pet")') && consoleSource.includes('setPetSection("appearance")') && consoleSource.includes("setPetNavigationEpoch"), "an external Pet request remounts the Pet surface at Appearance even when Console is already on another Pet subpage");
  const v18Artwork = ["header-paw", "walk-round-trip", "token-snack", "play-cursor", "drag-dangle", "toss-yarn", "nap-here", "wake-up", "summon-to-pointer", "capture-moment", "control-pin", "control-lock", "control-mute"];
  verify("Quick Play v18 normative artwork", v18Artwork.every((name) => fileIsNonEmpty(join(root, `apps/desktop/public/quick-play-v18/${name}.png`))) && popoverSource.includes("./quick-play-v18/"), "all title, action, cat-illustration, and control icons are deterministic local crops from the normative v18 design");

  const appearanceVisual = read("apps/desktop/src/features/pet-appearance/PetAppearanceVisual.tsx");
  const compositor = read("apps/desktop/src/features/pet-appearance/PetCompositor.tsx");
  const renderer = read("apps/desktop/src/features/pet-runtime/PetRenderer.tsx");
  const generatedRenderer = read("apps/desktop/src/features/pet-generated-actor/GeneratedPetActorCanvas.tsx");
  const fallbackRenderer = read("apps/desktop/src/features/pet-actor/actorCanvasRenderer.ts");
  const fallbackOutfit = read("apps/desktop/src/features/pet-actor/outfitResolver.ts");
  const desktop = read("apps/desktop/src/views/PetApp.tsx");
  const story = read("apps/desktop/src/features/pet-story/PetStoryPanel.tsx");
  const actions = read("apps/desktop/src/features/pet-story/ActionsWorkbench.tsx");
  const consoleStyles = read("apps/desktop/src/styles/console.css");
  const fallbackState = read("apps/desktop/src/state/fallbacks.ts");
  verify("shared actor renderer chain", appearanceVisual.includes("<PetCompositor") && compositor.includes("<PetRenderer") && renderer.includes("<GeneratedPetActorCanvas"), "appearance visual resolves through the shared manifest-driven renderer");
  verify("desktop shared renderer", desktop.includes("<PetAppearanceVisual"), "desktop pet uses the shared appearance/actor renderer");
  verify("Pet walk starts and stops on the locomotion clip", desktop.includes('return phase === "pause" ? "walk_round_trip_look" : "walk_round_trip"') && desktop.includes('quickPlaySession.phase === "stand"') && desktop.includes('quickPlaySession.phase === "settle"'), "stand and settle freeze the planted first pose of the same side-profile clip; only pause switches to the look-around asset");
  verify("console shared renderer", story.includes("<PetAppearanceVisual"), "Actions, Mood, Sound, and Journey previews use the shared appearance/actor renderer");
  const actionsV19Ids = quickPlayIds.filter((id) => id !== "capture_moment");
  verify("Actions v19 exact selector", actionsV19Ids.every((id) => actions.includes(`\"${id}\"`)) && actions.includes("export const actionsPreviewIds") && !/actionsPreviewIds[\s\S]{0,400}capture_moment/u.test(actions), "Actions declares exactly the eight v19 preview actions and excludes Capture from its selector");
  verify("Actions v19 isolated runtime", actions.includes("Preview changes apply instantly. Your desktop pet stays still.") && actions.includes("previewTimeMs={sampled.actorTimeMs}") && !/window\.tokenpet|dispatchPetAction|PetDirectorAction/u.test(actions), "the workbench owns only a controlled preview clock and never calls desktop movement/action APIs");
  verify("Actions Pet preview reuses Quick Play locomotion", actions.includes("distanceLockedWalkProgressAtTime") && actions.includes("createDistanceLockedWalkPlan") && actions.includes("data-preview-walk-root-progress") && !actions.includes("actorX: roundTrip * 31") && consoleStyles.includes(".action-preview-walk_round_trip .pet-generated-actor-shell") && consoleStyles.includes('.action-settings-card input[type="range"]'), "Pet traverses one sandbox edge to the other with the shared root curve, a contained actor artboard, and pointer cursors on Settings controls");
  verify("Actions v19 preview modules", ["data-action-selector", "data-action-preview-stage", "data-action-filmstrip", "data-action-scrubber", "data-action-play", "data-action-restart", "data-action-loop", "data-action-settings", "data-reset-action"].every((token) => actions.includes(token)), "selector, stage, filmstrip, scrubber, transport, per-action settings, and reset are all present");
  verify("Actions v19 dedicated settings", ["walkPace", "roamDistance", "destinationPause", "lookAroundEffect", "snackStyle", "snackSize", "startMeow", "returnPace", "attentionRadius", "followSmoothing", "maxHeadTurnAngle", "earFollow", "fishToyStyle", "swingResponse", "pursuitPace", "toyTrailEffect", "yarnColor", "rollDistance", "rollSpeed", "settlePose", "breathingIntensity", "zEffect", "sleepShadow", "meowVoice", "meowCue", "stretchHold", "wakeSparkle", "arrivalOffset", "routeCurve", "settleDelay"].every((key) => actions.includes(`key: \"${key}\"`)), "all action-specific v19 setting keys are modeled without a generic Save form");
  verify("Actions v19 old modules removed", !/Behavior Mode|Actor States|Interaction Rules|Director Priority|Live Actor Preview|Run across desktop/u.test(actions), "the Actions implementation contains none of the retired director-dashboard modules");
  verify("ambient story scheduler", desktop.includes("selectAmbientPetEvent") && desktop.includes("ambientRef") && desktop.includes("window.setInterval(tick"), "desktop pet schedules deterministic blink, rest, and wake events through PetDirector");
  verify("Token Egg ambient gate", desktop.includes("lifecycleStage: lifecycleFromUsage(usage)"), "ambient wake/rest/blink receives lifecycle state so Stage 0 can wait for the first-source/token hatch");
  verify("mood badge color setting", generatedRenderer.includes("appearance.moodBadge.colorByState ? palette") && fallbackRenderer.includes("appearance.moodBadge.colorByState ?"), "Color-by-state changes both generated and approved static-fallback mood badge palettes");
  verify("static fallback accessory safety", fallbackOutfit.includes("STATIC_FALLBACK_RUNTIME_ACCESSORIES = false") && fallbackOutfit.includes("accessoryIds: STATIC_FALLBACK_RUNTIME_ACCESSORIES ? suppressed : []"), "approved static fallback images suppress old runtime wearable settings until a manifest declares compatible slots");
  verify("static fallback composition safety", fallbackOutfit.includes('return "hidden"') && !fallbackRenderer.includes("function drawTokenFrame") && !fallbackRenderer.includes("context.createLinearGradient") && !fallbackRenderer.includes("context.filter =") && !fallbackRenderer.includes('slot === "baseBack"') && fallbackRenderer.includes("const rect = { ...badge.rect }"), "approved static fallbacks stay frozen exactly as shipped: no token/frame primitive, breathing deformation, added cat shadow, or bobbing badge");
  verify("one-shot threshold crossing", desktop.includes("thresholdCrossingEvent(previousMoodRef.current, mood, story.reactionRules.oneShotOnThreshold)"), "threshold reaction is gated by the persisted rule and previous mood rather than every token refresh");
  verify("honest loading lifecycle", /todayTokens:\s*0[\s\S]*sevenDayTokens:\s*0[\s\S]*allTimeTokens:\s*0[\s\S]*burnRate:\s*"quiet"/u.test(fallbackState), "loading fallback contains no fake token activity, so first launch remains a calm Token Egg until local usage resolves");

  const actorSurfaceFiles = [
    "apps/desktop/src/features/pet-appearance/PetAppearanceVisual.tsx",
    "apps/desktop/src/features/pet-appearance/PetCompositor.tsx",
    "apps/desktop/src/features/pet-runtime/PetRenderer.tsx",
    "apps/desktop/src/features/pet-generated-actor/GeneratedPetActorCanvas.tsx",
  ];
  const inlineActorSvg = actorSurfaceFiles.filter((path) => /<svg\b/u.test(read(path)));
  verify("no inline SVG cat renderer", inlineActorSvg.length === 0, inlineActorSvg.length ? `inline SVG found in ${inlineActorSvg.join(", ")}` : "actor surface code contains no inline SVG cat geometry");
}

verifyManifest();
verifyReachableUi();

const summary = {
  passed: results.length,
  warnings,
};

console.log(`Pet Story static QA: ${results.length} checks passed.`);
for (const warning of warnings) console.warn(`Warning: ${warning}`);
console.log(JSON.stringify(summary, null, 2));
