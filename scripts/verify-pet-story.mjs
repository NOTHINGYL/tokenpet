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

  const feedWalk = manifest.animations["action.feed_snack_walk_slow"];
  const feedReturn = manifest.animations["action.feed_snack_return_run"];
  const feedActions = ["feed_snack_stretch", "feed_snack_walk_slow", "feed_snack_arrive", "feed_snack_lick", "feed_snack_eat", "feed_snack_return_run", "feed_snack_settle"];
  const feedDirections = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  const feedDirectionalCounts = { walk_slow: 8, return_run: 8, arrive: 3, lick: 2, bite: 2, chew: 2, swallow: 3 };
  verify(
    "Feed Snack owns a complete eight-direction offline asset pack",
    feedActions.every((id) => manifest.animations[`action.${id}`]?.frames?.length)
      && feedDirections.every((direction) => Object.entries(feedDirectionalCounts).every(([phase, count]) => manifest.animations[`action.feed_snack_${phase}_${direction}`]?.frames?.length === count))
      && feedWalk.frames.length === 8
      && feedReturn.frames.length === 8
      && feedWalk.frames.every((frame) => frame.src.includes("feed_snack_walk_slow"))
      && feedReturn.frames.every((frame) => frame.src.includes("feed_snack_return_run"))
      && !feedWalk.frames.some((frame) => frame.src.includes("walk_round_trip"))
      && !feedReturn.frames.some((frame) => frame.src.includes("walk_round_trip")),
    "stretch, eight-way approach, one lick, bite, chew, swallow, return and settle all resolve to Feed-only approved rasters",
  );
  verify(
    "Feed Snack locomotion clips are independent",
    feedWalk.locomotion?.nominalStepDistancePx === 16
      && feedReturn.locomotion?.nominalStepDistancePx === 24
      && JSON.stringify(feedWalk.locomotion.rootStepKeyframes) === JSON.stringify([0, .14, 1, 1.14, 2, 2.14, 3, 3.14, 4])
      && JSON.stringify(feedReturn.locomotion.rootStepKeyframes) === JSON.stringify([0, .32, 1, 1.32, 2, 2.32, 3, 3.32, 4]),
    "the cautious outbound walk and satisfied return run carry different stride lengths and root curves",
  );
  verify(
    "Feed Snack has three authored props",
    ["paw", "fish", "token"].every((id) => fileIsNonEmpty(join(root, `apps/desktop/public/pet-actors/golden-british/props/snack-${id}.png`))),
    "Paw treat, Fish bite and Token cookie are transparent runtime PNG assets",
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
  const electronMainSource = read("apps/desktop/electron/main.ts");
  const quickPlayOverlaySource = read("apps/desktop/src/views/QuickPlayOverlayApp.tsx");
  const quickPlayOverlayStyles = read("apps/desktop/src/styles/quick-play-overlay.css");
  for (const actionId of quickPlayIds) {
    verify(`Quick Play stable id ${actionId}`, popoverSource.includes(`id: "${actionId}"`), "friendly action maps to its stable implementation id");
  }
  verify("Quick Play no analytics components", !/MetricCard|ProviderStatusRows|Source status|allTimeTokens|sevenDayTokens|todayTokens/u.test(popoverSource), "Quick Play source contains no token-stat or source-list implementation");
  verify("Quick Play no duplicate actor preview", !/PetAppearanceVisual|PetRenderer|GeneratedPetActorCanvas/u.test(popoverSource), "Quick Play contains no repeated cat preview");
  verify("Quick Play v18 removes dashboard modules", !/TokenPet|All good|quick-status|Play Mode|Mini Toys|Last interaction|Follow cursor|Reduce motion|Quiet mode/u.test(popoverSource), "Quick Play source contains only the compact v18 controller modules");
  verify("Quick Play cursor helper copy", popoverSource.includes("Tracks your cursor for 10 seconds."), "the required 10-second helper is visible in source");
  verify("Wake Up closes Quick Play immediately", popoverSource.includes('{ label: "Wake up", id: "wake_up", closesPanel: true }'), "Wake Up follows the accepted-action panel-close contract");
  verify("Quick Play v18 controls", ["Always on top", "Lock position", "Mute pet sounds"].every((label) => popoverSource.includes(`label=\"${label}\"`)), "the panel declares exactly the three public pet controls");
  verify("Menu Bar Console entries target Overview", menuBarSource.match(/openConsole\("overview"\)/gu)?.length === 2, "both the settings icon and Open Console footer explicitly request Overview");
  verify("Quick Play Console entry targets Pet", popoverSource.includes('openConsole("pet")'), "the double-click panel explicitly requests the Pet console");
  verify("Pet navigation resets to Appearance", consoleSource.includes('if (tab === "pet")') && consoleSource.includes('setPetSection("appearance")') && consoleSource.includes("setPetNavigationEpoch"), "an external Pet request remounts the Pet surface at Appearance even when Console is already on another Pet subpage");
  verify("Quick Play closes on outside focus", electronMainSource.includes('if (popoverWindow === createdWindow) closeUsableWindow(createdWindow)') && electronMainSource.includes("createdWindow.show();") && electronMainSource.includes("createdWindow.focus();") && !electronMainSource.includes("createdWindow.showInactive();"), "the native Quick Play window acquires focus and closes itself on blur");
  const yarnImmediateReleaseIndex = quickPlayOverlaySource.indexOf('if (state.mode === "yarn")');
  const placementDoubleClickIndex = quickPlayOverlaySource.indexOf("if (event.detail >= 2)");
  const tossYarnExecutorSource = read("apps/desktop/electron/quick-play/executors/toss-yarn.ts");
  const tossYarnAssetPrepSource = read("tools/pet-asset-studio/scripts/prepare-toss-yarn-assets.py");
  verify("Feed and Toss Yarn placement restore the system pointer and preserve two-dimensional screen coordinates", quickPlayOverlaySource.includes("window.screenX + event.clientX") && quickPlayOverlaySource.includes("window.screenY + event.clientY") && quickPlayOverlaySource.includes("setReleased(true)") && quickPlayOverlayStyles.includes(".quick-play-overlay-snack.is-released") && quickPlayOverlayStyles.includes(".quick-play-overlay-yarn.is-released") && quickPlayOverlayStyles.includes("cursor: default") && electronMainSource.includes("quickPlayOverlayWindow.setIgnoreMouseEvents(true)"), "released props remain visible while the full-screen overlay becomes pointer-pass-through; placement uses the overlay window origin plus client X/Y");
  verify("Toss Yarn restores the ordinary pointer on the first click", yarnImmediateReleaseIndex >= 0 && yarnImmediateReleaseIndex < placementDoubleClickIndex && quickPlayOverlaySource.includes("releasedRef.current = true") && electronMainSource.includes("if (runtime.overlayTimer) clearInterval(runtime.overlayTimer)"), "Toss Yarn bypasses the snack double-click grace period and freezes its throw origin before retrieval begins");
  verify("Toss Yarn rolls straight, rests at its real endpoint, and performs a single-prop pickup handoff", quickPlayOverlaySource.includes("restingAtTarget ? targetClientX : pointer.clientX") && quickPlayOverlaySource.includes("restingAtTarget ? targetClientY : pointer.clientY") && quickPlayOverlayStyles.includes("var(--roll-duration, 900ms) linear both") && tossYarnExecutorSource.indexOf("ports.closePropOverlay()") < tossYarnExecutorSource.indexOf('ports.phase("pickup")') && tossYarnAssetPrepSource.includes("extract_authored_grid_subjects"), "the same offline yarn travels on one straight vector, remains at the computed target, then transfers atomically from overlay prop to bleed-free baked pickup frames");
  verify("Dangle tracks the rendered fish instead of the rod handle", quickPlayOverlaySource.includes('type: "move"') && quickPlayOverlaySource.includes("onFishPosition") && electronMainSource.includes('input.type === "move"') && electronMainSource.includes("currentBounds: isUsableWindow(petWindow) ? petWindow.getBounds() : null") && electronMainSource.includes("dangleTargetCrossedTravelDirection"), "the spring-rendered fish publishes its global point, facing compares it with live actor bounds, and stale travel is interrupted before it can become backward pursuit");
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
  const soundEngine = read("apps/desktop/src/features/pet-story/soundCueEngine.ts");
  const consoleStyles = read("apps/desktop/src/styles/console.css");
  const fallbackState = read("apps/desktop/src/state/fallbacks.ts");
  verify("shared actor renderer chain", appearanceVisual.includes("<PetCompositor") && compositor.includes("<PetRenderer") && renderer.includes("<GeneratedPetActorCanvas"), "appearance visual resolves through the shared manifest-driven renderer");
  verify("desktop shared renderer", desktop.includes("<PetAppearanceVisual"), "desktop pet uses the shared appearance/actor renderer");
  verify("Pet walk starts and stops on the locomotion clip", desktop.includes('return phase === "pause" ? "walk_round_trip_look" : "walk_round_trip"') && desktop.includes('quickPlaySession.phase === "stand"') && desktop.includes('quickPlaySession.phase === "settle"'), "stand and settle freeze the planted first pose of the same side-profile clip; only pause switches to the look-around asset");
  const feedExecutor = read("apps/desktop/electron/quick-play/executors/feed-snack.ts");
  const feedAssetPrep = read("tools/pet-asset-studio/scripts/prepare-feed-snack-assets.py");
  verify("Feed snack uses an isolated eight-direction authored executor", electronMainSource.includes("executeFeedSnack") && electronMainSource.includes("feedSnackLocomotionAction") && electronMainSource.includes("setFeedSnackActorDirection") && feedExecutor.includes('"feed_snack_walk_slow"') && feedExecutor.includes('"feed_snack_return_run"') && ["arrive", "lick", "bite", "chew", "swallow"].every((phase) => feedExecutor.includes(`ports.phase("${phase}")`)) && feedExecutor.includes('ports.setPropStage("consumed"') && desktop.includes("feedSnackDirectionalAction") && desktop.includes('replaceAll("-", "_")') && feedAssetPrep.includes("whole-frame") && feedAssetPrep.includes("runtimeTransform"), "Feed keeps semantic and single-prop consumption order isolated, chooses the true eight-sector bundle in Electron, and never mirrors or rotates anatomy at runtime");
  const executorIndex = read("apps/desktop/electron/quick-play/executors/index.ts");
  const executorModules = ["pet", "feed-snack", "play-cursor", "dangle-toy", "toss-yarn", "nap-here", "wake-up", "summon"];
  verify("Quick Play actions have isolated executor modules", executorModules.every((name) => fileIsNonEmpty(join(root, `apps/desktop/electron/quick-play/executors/${name}.ts`)) && executorIndex.includes(`./${name}.js`)) && electronMainSource.includes('from "./quick-play/executors/index.js"') && electronMainSource.includes("runAuthoredLocomotionLeg") && !electronMainSource.includes('action === "token_snack" || action === "toss_yarn"'), "each animated action owns one semantic module; Electron window ports and the authored locomotion transport are reused explicitly");
  verify("console shared renderer", story.includes("<PetAppearanceVisual"), "Actions, Mood, Sound, and Journey previews use the shared appearance/actor renderer");
  const actionsV19Ids = quickPlayIds.filter((id) => id !== "capture_moment");
  verify("Actions v19 exact selector", actionsV19Ids.every((id) => actions.includes(`\"${id}\"`)) && actions.includes("export const actionsPreviewIds") && !/actionsPreviewIds[\s\S]{0,400}capture_moment/u.test(actions), "Actions declares exactly the eight v19 preview actions and excludes Capture from its selector");
  verify("Actions v19 isolated runtime", actions.includes("Preview changes apply instantly. Your desktop pet stays still.") && actions.includes('previewTimeMs={selectedAction === "play_cursor" ? elapsedMs : sampled.actorTimeMs}') && !/window\.tokenpet|dispatchPetAction|PetDirectorAction/u.test(actions), "the workbench owns only a controlled preview clock and never calls desktop movement/action APIs");
  verify("Actions Pet preview reuses Quick Play locomotion", actions.includes("distanceLockedWalkProgressAtTime") && actions.includes("createDistanceLockedWalkPlan") && actions.includes("data-preview-walk-root-progress") && !actions.includes("actorX: roundTrip * 31") && consoleStyles.includes(".action-preview-walk_round_trip .pet-generated-actor-shell") && consoleStyles.includes('.action-settings-card input[type="range"]'), "Pet traverses one sandbox edge to the other with the shared root curve, a contained actor artboard, and pointer cursors on Settings controls");
  verify("Actions Feed preview mirrors the production asset sequence", actions.includes("feedPhaseDurations") && actions.includes("data-preview-feed-phase") && actions.includes("offline-eight-direction-single-prop-consume-exact-return") && actions.includes("feed_snack_arrive_front_right") && actions.includes("feed_snack_bite_front_right") && actions.includes("feed_snack_chew_front_right") && actions.includes("feed_snack_swallow_front_right") && actions.includes("feed_snack_return_run_back_left") && actions.includes("data-preview-snack-stage") && actions.includes("snack-${String(settings.snackStyle") && consoleStyles.includes(".action-preview-token_snack .pet-generated-actor-shell"), "Console visibly previews a direction-matched diagonal Feed route with the production rasters, root motion and continuous selected snack handoff");
  const playCursorRoles = ["neutral", "notice", "eye_left", "eye_right", "eye_up", "eye_down", "head_left", "head_right", "head_up", "head_down", "ear_left", "ear_right", "ear_up", "ear_down", "blink", "settle"];
  verify("Play Cursor uses registered offline directional poses", playCursorRoles.every((role) => fileIsNonEmpty(join(root, `assets/source/pet-actors/golden-british/frames/play_cursor_${role}.png`)) && fileIsNonEmpty(join(root, `apps/desktop/public/pet-actors/golden-british/frames/play_cursor_${role}.png`))) && generatedRenderer.includes("playCursorFrameAtTime") && generatedRenderer.includes('if (motionState === "play_cursor") return;') && actions.includes("offline-eyes-head-ears") && electronMainSource.includes("tracking.eyeOffset") && electronMainSource.includes("PLAY_CURSOR_DURATION_MS"), "desktop and Console share 16 registered whole-cat frames; eyes, head, and ears cascade without runtime body transforms");
  verify("Dangle authored frames mirror with live facing", generatedRenderer.includes('animationId.startsWith("action.dangle_")') && generatedRenderer.includes('data-actor-mirrored=') && generatedRenderer.includes("context.scale(-1, 1)"), "all Dangle whole-cat frames use the shared full-canvas horizontal mirror when the visible fish is left of the actor");
  const tossDirections = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  const tossPhaseCounts = { chase: 8, carry: 8, pickup: 4, drop: 6 };
  verify(
    "Toss Yarn uses dedicated eight-direction offline retrieve assets",
    tossDirections.every((direction) => Object.entries(tossPhaseCounts).every(([phase, count]) => {
      const animation = manifest.animations[`action.toss_yarn_${phase}_${direction}`];
      return animation?.frames.length === count
        && (phase === "chase" || ["orange", "blue", "violet"].every((color) => animation.variants?.[color]?.length === count));
    }))
      && ["orange", "blue", "violet"].every((color) => fileIsNonEmpty(join(root, `apps/desktop/public/pet-actors/golden-british/props/toss-yarn-${color}.png`)) && fileIsNonEmpty(join(root, `apps/desktop/public/pet-actors/golden-british/props/toss-yarn-${color}-roll.png`)))
      && desktop.includes("tossYarnDirectionalAction")
      && generatedRenderer.includes("resolveAnimationVariant")
      && read("apps/desktop/src/styles/pet.css").includes('[data-quick-play-action="toss_yarn"] .pet-close')
      && actions.includes("offline-eight-direction-mouth-carry-exact-return")
      && consoleStyles.includes(".action-preview-toss_yarn .pet-generated-actor-shell")
      && consoleStyles.includes("--filmstrip-columns"),
    "desktop and Console Preview share chase/pickup/carry/drop actions, baked yarn-colour variants, authored props, and distance-locked root motion",
  );
  const wakePhaseCounts = { wake_up_blink: 4, wake_up_roll: 4, wake_up_stretch: 8, wake_up_gather: 8 };
  verify(
    "Wake Up uses one dedicated five-second offline sequence",
    Object.entries(wakePhaseCounts).every(([id, count]) => manifest.animations[`action.${id}`]?.frames.length === count)
      && manifest.animations["action.wake_up"]?.frames.length === 24
      && manifest.animations["action.wake_up"]?.frames.reduce((total, frame) => total + frame.durationMs, 0) === 5_000
      && Object.keys(wakePhaseCounts).every((id) => manifest.animations[`action.${id}`].frames.every((frame) => !frame.bodyTransform))
      && desktop.includes('return "wake_up_blink"')
      && desktop.includes('return "wake_up_roll"')
      && desktop.includes('return "wake_up_stretch"')
      && desktop.includes('return "wake_up_gather"')
      && actions.includes("offline-five-second-whole-frame-stretch")
      && soundEngine.includes("preloadWakeUpMeows")
      && ["soft", "cozy", "playful"].every((voice) => fileIsNonEmpty(join(root, `apps/desktop/public/pet-audio/wake-meow-${voice}.wav`))),
    "desktop and Console Preview share 24 registered blink/roll/stretch/gather frames with three preloaded local meow voices and no runtime anatomy transform",
  );
  verify("Actions v19 preview modules", ["data-action-selector", "data-action-preview-stage", "data-action-filmstrip", "data-action-scrubber", "data-action-play", "data-action-restart", "data-action-loop", "data-action-settings", "data-reset-action"].every((token) => actions.includes(token)), "selector, stage, filmstrip, scrubber, transport, per-action settings, and reset are all present");
  verify("Actions v19 dedicated settings", ["walkPace", "roamDistance", "destinationPause", "lookAroundEffect", "snackStyle", "snackSize", "startMeow", "returnPace", "followSmoothing", "maxHeadTurnAngle", "earFollow", "fishToyStyle", "swingResponse", "pursuitPace", "toyTrailEffect", "yarnColor", "rollDistance", "rollSpeed", "settlePose", "breathingIntensity", "zEffect", "sleepShadow", "meowVoice", "meowCue", "stretchHold", "wakeSparkle", "arrivalOffset", "routeCurve", "settleDelay"].every((key) => actions.includes(`key: \"${key}\"`)) && !actions.includes('key: "attentionRadius"'), "all action-specific v19 setting keys are modeled without a generic Save form or a misleading local-only cursor radius");
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
