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
  "dance",
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
  const petWalkDirections = ["right", "left", "front", "back", "front_right", "front_left", "back_right", "back_left"];
  verify(
    "Pet owns complete eight-direction walk and look assets",
    petWalkDirections.every((direction) => {
      const directionalWalk = manifest.animations[`action.walk_round_trip_walk_${direction}`];
      const directionalLook = manifest.animations[`action.walk_round_trip_look_${direction}`];
      return directionalWalk?.frames.length === 8
        && directionalLook?.frames.length === 8
        && directionalWalk.frames.every((frame, index) => frame.src.endsWith(`walk_round_trip_walk_${direction}_${String(index + 1).padStart(2, "0")}.png`))
        && directionalLook.frames.every((frame, index) => frame.src.endsWith(`walk_round_trip_look_${direction}_${String(index + 1).padStart(2, "0")}.png`))
        && directionalWalk.locomotion?.nominalStepDistancePx === 18
        && directionalWalk.locomotion?.footfallsPerCycle === 4;
    }),
    "all eight camera sectors have dedicated registered walk/look rasters and the shared distance-locked root profile",
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
    "apps/desktop/src/features/pet-story/MoodReactionsPanel.tsx",
  ];
  const missingHandlers = petUiFiles.flatMap(buttonDiagnostics);
  verify("reachable Pet buttons", missingHandlers.length === 0, missingHandlers.length ? `enabled buttons without handlers: ${missingHandlers.join(", ")}` : "every reachable enabled Pet button has an interaction handler");

  const consoleDiagnostics = buttonDiagnostics("apps/desktop/src/views/ConsoleApp.tsx");
  if (consoleDiagnostics.length) warnings.push(`Console-wide enabled buttons without handlers: ${consoleDiagnostics.join(", ")}`);

  const popoverSource = read("apps/desktop/src/views/PopoverApp.tsx");
  const desktop = read("apps/desktop/src/views/PetApp.tsx");
  const menuBarSource = read("apps/desktop/src/views/MenuBarApp.tsx");
  const consoleSource = read("apps/desktop/src/views/ConsoleApp.tsx");
  const electronMainSource = read("apps/desktop/electron/main.ts");
  const usageSource = read("apps/desktop/electron/usage.ts");
  const hourlyUsageSource = read("apps/desktop/electron/hourly-usage.ts");
  const quickPlayOverlaySource = read("apps/desktop/src/views/QuickPlayOverlayApp.tsx");
  const quickPlayOverlayStyles = read("apps/desktop/src/styles/quick-play-overlay.css");
  const appearanceSource = read("apps/desktop/src/features/pet-appearance/AppearancePanel.tsx");
  const petNameBubbleSource = read("apps/desktop/src/features/pet-appearance/PetNameBubble.tsx");
  const petIdentitySource = read("apps/desktop/src/features/pet-appearance/petIdentity.ts");
  const catTypePickerSource = read("apps/desktop/src/features/pet-appearance/CatTypePicker.tsx");
  const appearanceStateSource = read("apps/desktop/src/features/pet-appearance/appearanceState.ts");
  const accessoriesSource = read("apps/desktop/src/features/pet-appearance/AccessoriesPage.tsx");
  const accessoryCatalogSource = read("apps/desktop/src/features/pet-appearance/catalog.ts");
  for (const actionId of quickPlayIds) {
    verify(`Quick Play stable id ${actionId}`, popoverSource.includes(`id: "${actionId}"`), "friendly action maps to its stable implementation id");
  }
  verify("Quick Play no analytics components", !/MetricCard|ProviderStatusRows|Source status|allTimeTokens|sevenDayTokens|todayTokens/u.test(popoverSource), "Quick Play source contains no token-stat or source-list implementation");
  verify("Quick Play no duplicate actor preview", !/PetAppearanceVisual|PetRenderer|GeneratedPetActorCanvas/u.test(popoverSource), "Quick Play contains no repeated cat preview");
  verify("Quick Play v20 removes dashboard modules", !/TokenPet|All good|quick-status|Play Mode|Mini Toys|Last interaction|Follow cursor|Reduce motion|Quiet mode/u.test(popoverSource), "Quick Play source contains only the compact v20 controller modules");
  verify("Quick Play cursor helper copy", popoverSource.includes("Tracks your cursor for 10 seconds."), "the required 10-second helper is visible in source");
  verify("Quick Play Nap helper copy", popoverSource.includes('{ label: "Nap here", id: "nap_here", closesPanel: false, helper: "5 min" }') && popoverSource.includes("Sleeps here for 5 minutes."), "Nap Here visibly advertises the bounded five-minute rest");
  verify("Wake Up keeps Quick Play open", popoverSource.includes('{ label: "Wake up", id: "wake_up", closesPanel: false }'), "Wake Up follows the v20 keep-open contract");
  verify("Dance closes Quick Play immediately", popoverSource.includes('{ label: "Dance", id: "dance", closesPanel: true }'), "Dance begins only after the compact panel closes");
  verify("Quick Play v18 controls", ["Always on top", "Lock position", "Mute pet sounds"].every((label) => popoverSource.includes(`label=\"${label}\"`)), "the panel declares exactly the three public pet controls");
  verify("Menu Bar Console entries target Overview", menuBarSource.match(/openConsole\("overview"\)/gu)?.length === 2, "both the settings icon and Open Console footer explicitly request Overview");
  verify(
    "Visible token surfaces have explicit ownership",
    consoleSource.includes("tokenValue={usage.allTimeTokens}")
      && electronMainSource.includes("trayTokenTitle = compactNumber(moodSignalFromUsage(snapshot, settings.petStory.moodSignalWindow))")
      && desktop.includes("tokenValue={moodSignal}")
      && desktop.includes('getTokenBubbleLabel("pill", usage, moodSignal)'),
    "Console sidebar is pinned to Local all time while the native Menu Bar title, desktop frame, and sleep bubble follow the selected Mood signal",
  );
  verify(
    "Live one-hour signal uses process-independent local history",
    usageSource.includes("readTrailingHourTokens")
      && usageSource.includes("historicalOneHourTokens")
      && usageSource.includes("Math.max(0, historicalTokens, sampled.tokens)")
      && hourlyUsageSource.includes('join(homeDirectory, ".codex", "sessions")')
      && hourlyUsageSource.includes('join(homeDirectory, ".claude", "projects")')
      && hourlyUsageSource.includes("last_token_usage")
      && hourlyUsageSource.includes('record.type === "assistant"')
      && hourlyUsageSource.includes("REVERSE_READ_CHUNK_BYTES")
      && hourlyUsageSource.includes("discardingOversizedLine")
      && !hourlyUsageSource.includes("readFileSync"),
    "Live 1 hour reconstructs timestamped numeric Codex/Claude usage across app launches, scans large session logs backwards without whole-file reads, and retains the in-process sampler only as a log-write-lag fallback",
  );
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
  const v20Artwork = ["header-paw", "walk-round-trip", "token-snack", "play-cursor", "drag-dangle", "toss-yarn", "nap-here", "wake-up", "dance", "capture-moment", "control-pin", "control-lock", "control-mute"];
  verify("Quick Play v20 normative artwork", v20Artwork.every((name) => fileIsNonEmpty(join(root, `apps/desktop/public/quick-play-v18/${name}.png`))) && popoverSource.includes("./quick-play-v18/"), "all title, action, cat-illustration, and control icons are deterministic local artwork from the normative v20 design");
  verify(
    "Appearance v1 exact module ownership",
    appearanceSource.includes("appearance-v22-workbench")
      && !appearanceSource.includes("appearance-accessories-summary")
      && !appearanceSource.includes("AccessoriesPage")
      && !appearanceSource.includes("open-accessories")
      && catTypePickerSource.includes("appearance-cat-type-strip")
      && !appearanceSource.includes("TokenFrameSummary")
      && !appearanceSource.includes("MoodBadgeCard")
      && !appearanceSource.includes("MoodLooksCard")
      && !appearanceSource.includes("MoodLooksPage")
      && appearanceSource.includes("PetIdentityCard")
      && !appearanceSource.includes("SkinCard")
      && !appearanceSource.includes("pet-preview-actions"),
    "Appearance exposes only the five-cat strip, natural held-hover preview, Display, Pet Identity, and the single page footer; the deferred Accessories surface is absent",
  );
  verify(
    "Pet v1 hides deferred navigation",
    appearanceSource.includes("petConsoleSections.filter((section) => section.enabled)")
      && accessoryCatalogSource.includes('{ id: "sound", label: "Sound Cues", enabled: false }')
      && accessoryCatalogSource.includes('{ id: "journey", label: "Journey", enabled: false }'),
    "Sound Cues and Journey remain implemented behind the catalog capability gate but are not rendered in the public Pet navigation",
  );
  verify(
    "Pet Identity 10-grapheme contract",
    petIdentitySource.includes("MAX_PET_NAME_GRAPHEMES = 10")
      && appearanceSource.includes("最多10个字符")
      && appearanceSource.includes("showNameOnHover")
      && petNameBubbleSource.includes("pet-name-thought-dot-large")
      && petNameBubbleSource.includes("pet-name-thought-dot-small")
      && read("apps/desktop/src/views/PetApp.tsx").includes("PetNameBubble"),
    "one grapheme-aware setting drives the console held-hover preview and the real desktop hover bubble; invalid drafts stay local and the bubble owns exactly two thought dots",
  );
  verify(
    "Appearance Display controls are live",
    appearanceStateSource.includes("opacity: 1,")
      && read("apps/desktop/electron/appearance.ts").includes("opacity: 1,")
      && appearanceSource.includes('label="Shadow"')
      && !appearanceSource.includes('valueLabel={generatedGolden ? "Baked"')
      && read("apps/desktop/src/styles/console.css").includes("input:not(:disabled)::-webkit-slider-thumb { cursor: pointer; }")
      && read("apps/desktop/src/styles/pet.css").includes("calc(.24 * var(--pet-visual-shadow))")
      && read("apps/desktop/src/features/pet-appearance/previewExport.ts").includes(".24 * appearance.shadow"),
    "Opacity defaults to 100%, every enabled range advertises pointer interaction, and Shadow reaches generated/fallback runtime canvases plus exported previews",
  );
  verify(
    "Appearance v31 minimal accessory defaults",
    appearanceStateSource.includes('neckId: "collar"')
      && appearanceStateSource.includes('headId: "none"')
      && appearanceStateSource.includes('baseId: "none"')
      && appearanceStateSource.includes('effectId: "none"')
      && appearanceStateSource.includes('accessoryIds: ["collar"]')
      && appearanceStateSource.includes("migratePreviousAmbientDefaults")
      && appearanceSource.includes("Capture preview")
      && appearanceSource.includes("Reset appearance"),
    "Bell collar is the sole reset default; Head, Ground, and Effects migrate/reset to None while Capture stays preview-local and Reset stays footer-owned",
  );
  verify(
    "Accessories v28 four-category catalog",
    !accessoriesSource.includes("TokenFrameSection")
      && !accessoriesSource.includes("AccessoriesDetails")
      && ["Bell collar", "Bow tie", "Bandana", "Halo", "Focus crown", "Study glasses", "Desk mat", "Round rug", "Star blanket", "Sparkle aura", "Leaf drift", "Hot sparks"].every((label) => accessoryCatalogSource.includes(`label: "${label}"`))
      && fileIsNonEmpty(join(root, "apps/desktop/public/assets/pets/appearance/accessories/round-rug.png"))
      && fileIsNonEmpty(join(root, "apps/desktop/public/assets/pets/appearance/accessories/star-blanket.png")),
    "the expanded catalog owns exactly Neck, Head, Ground, and Effects; planned wearables stay gated and both new transparent ground assets are present",
  );

  const appearanceVisual = read("apps/desktop/src/features/pet-appearance/PetAppearanceVisual.tsx");
  const compositor = read("apps/desktop/src/features/pet-appearance/PetCompositor.tsx");
  const renderer = read("apps/desktop/src/features/pet-runtime/PetRenderer.tsx");
  const generatedRenderer = read("apps/desktop/src/features/pet-generated-actor/GeneratedPetActorCanvas.tsx");
  const fallbackRenderer = read("apps/desktop/src/features/pet-actor/actorCanvasRenderer.ts");
  const fallbackOutfit = read("apps/desktop/src/features/pet-actor/outfitResolver.ts");
  const story = read("apps/desktop/src/features/pet-story/PetStoryPanel.tsx");
  const actions = read("apps/desktop/src/features/pet-story/ActionsWorkbench.tsx");
  const moodPanel = read("apps/desktop/src/features/pet-story/MoodReactionsPanel.tsx");
  const moodRuntime = read("apps/desktop/src/features/pet-story/moodRuntime.ts");
  const rendererTypes = read("apps/desktop/src/types.ts");
  const storyRuntime = read("apps/desktop/electron/story.ts");
  const usageRuntime = read("apps/desktop/electron/usage.ts");
  const danceVideoLayer = read("apps/desktop/src/features/pet-story/DanceVideoLayer.tsx");
  const danceVideoRenderer = read("tools/pet-asset-studio/dance-video/style-scene.mjs");
  const danceVideoManifest = JSON.parse(read("assets/source/pet-actors/golden-british/story-actions/dance-video-v3/manifest.json"));
  const soundEngine = read("apps/desktop/src/features/pet-story/soundCueEngine.ts");
  const consoleStyles = read("apps/desktop/src/styles/console.css");
  const petStyles = read("apps/desktop/src/styles/pet.css");
  const fallbackState = read("apps/desktop/src/state/fallbacks.ts");
  verify("shared actor renderer chain", appearanceVisual.includes("<PetCompositor") && compositor.includes("<PetRenderer") && renderer.includes("<GeneratedPetActorCanvas"), "appearance visual resolves through the shared manifest-driven renderer");
  verify("desktop shared renderer", desktop.includes("<PetAppearanceVisual"), "desktop pet uses the shared appearance/actor renderer");
  verify(
    "Sleepy owns a frame-free persistent token bubble",
    generatedRenderer.includes('animation.id === "action.sleep_loop"')
      && generatedRenderer.includes('data-sleep-token-frame-hidden')
      && desktop.includes('getTokenBubbleLabel("pill", usage, moodSignal)')
      && desktop.includes('contentMode={sleepVisual && !sleepBubbleShowsName ? "token" : "name"}')
      && compositor.includes('const isSleepVisual')
      && compositor.includes('getAccessory(effectId)')
      && compositor.includes('data-accessory-effect-source="selected"')
      && !compositor.includes('mood-override')
      && !compositor.includes('ambientEffectId'),
    "sleep_loop suppresses the embedded Token frame, every mood respects the selected Appearance effect, and the persistent token bubble swaps to the pet name only while hover naming is enabled",
  );
  verify(
    "Quick Play suppresses ambient appearance accessories",
    appearanceVisual.includes("showAccessories?: boolean")
      && compositor.includes("props.showAccessories !== false")
      && compositor.includes('data-accessories-visible={showAccessories ? "true" : "false"}')
      && desktop.includes("showAccessories={quickPlaySession.activeAction === null}"),
    "all eight animated Quick Play actions temporarily hide Ground, Effects, and Head layers without mutating the saved accessory selection, then restore them at idle",
  );
  verify(
    "Desktop close is hover-only",
    desktop.includes('petHovered ? "is-hovered" : ""')
      && petStyles.includes(".pet-stage.is-hovered .pet-close")
      && /\.pet-close\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?pointer-events:\s*none;/u.test(petStyles)
      && /\.pet-stage\.is-hovered \.pet-close,[\s\S]*?opacity:\s*1;[\s\S]*?pointer-events:\s*auto;/u.test(petStyles),
    "the desktop close control is absent at rest, appears only while the pet is hovered, and remains keyboard-visible through focus-within",
  );
  verify(
    "Quick Play uses one planted visual-size system",
    generatedRenderer.includes("actionVisualNormalization")
      && generatedRenderer.includes('animationId.startsWith("action.dangle_")')
      && generatedRenderer.includes('animationId.startsWith("action.toss_yarn_")')
      && generatedRenderer.includes("scale: .62, anchorX: 512, anchorY: 818")
      && generatedRenderer.includes("data-actor-visual-normalization-scale")
      && generatedRenderer.includes("data-actor-visual-ground-anchor")
      && !desktop.includes("appearance.size * .84")
      && desktop.includes("scale={appearance.size}")
      && actions.includes("scale={actorPreviewAppearance.size}")
      && danceVideoLayer.includes("data-dance-video-scale")
      && petStyles.includes("scale(var(--dance-video-scale, 1))"),
    "Pet, Feed, Cursor, Nap, Wake and Dance keep their approved baseline footprint; oversized Dangle/Yarn art is reduced to 62% around the shared 512/818 paw anchor, and Dance follows Cat Size",
  );
  const petWalkAssetPrep = read("tools/pet-asset-studio/scripts/prepare-pet-walk-assets.py");
  verify("Pet selects registered eight-direction walk and look clips", desktop.includes("petWalkDirectionalAction") && desktop.includes('replaceAll("-", "_")') && electronMainSource.includes("setPetActorDirection") && electronMainSource.includes("petWalkLocomotionAction") && electronMainSource.includes("dangleActorDirection(from, to)") && petWalkAssetPrep.includes("whole-frame") && petWalkAssetPrep.includes('"runtimeTransform": "none"'), "stand, outbound, destination look, reverse return, and settle use the vector-selected native/offline-mirrored raster without runtime facing transforms");
  const feedExecutor = read("apps/desktop/electron/quick-play/executors/feed-snack.ts");
  const feedAssetPrep = read("tools/pet-asset-studio/scripts/prepare-feed-snack-assets.py");
  verify("Feed snack uses an isolated eight-direction authored executor", electronMainSource.includes("executeFeedSnack") && electronMainSource.includes("feedSnackLocomotionAction") && electronMainSource.includes("setFeedSnackActorDirection") && feedExecutor.includes('"feed_snack_walk_slow"') && feedExecutor.includes('"feed_snack_return_run"') && ["arrive", "lick", "bite", "chew", "swallow"].every((phase) => feedExecutor.includes(`ports.phase("${phase}")`)) && feedExecutor.includes('ports.setPropStage("consumed"') && desktop.includes("feedSnackDirectionalAction") && desktop.includes('replaceAll("-", "_")') && feedAssetPrep.includes("whole-frame") && feedAssetPrep.includes("runtimeTransform"), "Feed keeps semantic and single-prop consumption order isolated, chooses the true eight-sector bundle in Electron, and never mirrors or rotates anatomy at runtime");
  const executorIndex = read("apps/desktop/electron/quick-play/executors/index.ts");
  const executorModules = ["pet", "feed-snack", "play-cursor", "dangle-toy", "toss-yarn", "nap-here", "wake-up", "dance"];
  verify("Quick Play actions have isolated executor modules", executorModules.every((name) => fileIsNonEmpty(join(root, `apps/desktop/electron/quick-play/executors/${name}.ts`)) && executorIndex.includes(`./${name}.js`)) && electronMainSource.includes('from "./quick-play/executors/index.js"') && electronMainSource.includes("runAuthoredLocomotionLeg") && !electronMainSource.includes('action === "token_snack" || action === "toss_yarn"'), "each animated action owns one semantic module; Electron window ports and the authored locomotion transport are reused explicitly");
  verify("console shared renderer", story.includes("<PetAppearanceVisual") && moodPanel.includes("<PetAppearanceVisual"), "Actions, Mood, Sound, and Journey previews use the shared appearance/actor renderer");
  verify(
    "Mood v37 exact single-screen modules",
    story.includes("<MoodReactionsPanel")
      && [
        "data-mood-page-layout",
        "data-mood-window",
        "data-mood-threshold",
        "data-mood-preview-token",
        "data-mood-controls",
        "data-mood-badge-toggle",
        "data-mood-badge-color",
        "data-mood-badge-style",
        "data-mood-entry-pulse",
        "data-reset-thresholds",
      ].every((token) => moodPanel.includes(token))
      && ["Live · 1 hour", "Today", "Last 7 days", "Preview token level", "Mood controls", "Badge colors", "Badge style", "Entry pulse"].every((label) => moodPanel.includes(label))
      && !["Selected mood:", "Actor loop · fixed", "data-mood-actor-loop"].some((label) => moodPanel.includes(label)),
    "the page declares the v37 signal rail, one-way simulator, global Mood controls, and one-window reset surfaces without a second Mood selector",
  );
  verify(
    "Mood v37 independent recommended profiles",
    moodRuntime.includes('["live", "today", "last7Days"]')
      && moodRuntime.includes("live: { focused: 50_000, hot: 1_000_000, overdrive: 10_000_000 }")
      && moodRuntime.includes("today: { focused: 1_000_000, hot: 20_000_000, overdrive: 100_000_000 }")
      && moodRuntime.includes("last7Days: { focused: 10_000_000, hot: 100_000_000, overdrive: 500_000_000 }")
      && moodPanel.includes("moodThresholdProfiles")
      && moodPanel.includes("moodSignalWindow"),
    "Live, Today, and Last 7 days own the documented independent defaults and selected-window compatibility mirror",
  );
  verify(
    "Mood v37 logarithmic 2x clamp",
    moodRuntime.includes("Math.log10")
      && moodRuntime.includes("focused * 2")
      && moodRuntime.includes("hot * 2")
      && moodRuntime.includes("profile.hot / 2")
      && moodRuntime.includes("profile.overdrive / 2")
      && moodPanel.includes("Reset thresholds"),
    "only positive thresholds enter logarithmic space and adjacent editable nodes preserve the mandatory 2x separation",
  );
  verify(
    "Mood v37 semantic icon mapping",
    ["sleepy", "focused", "hot", "overdrive"].every((mood) => moodPanel.includes(`props.mood === "${mood}"`) || mood === "overdrive")
      && moodPanel.includes('"data-mood-icon": props.mood')
      && moodPanel.includes("MoodSemanticIcon"),
    "one reusable moon/target/local-flame/lightning component labels the threshold rail, preview badge, and selected mood",
  );
  verify(
    "Hot semantic icon is a deterministic offline asset",
    fileIsNonEmpty(join(root, "apps/desktop/public/assets/icons/mood-hot.svg"))
      && moodPanel.includes("mood-semantic-icon-hot")
      && read("apps/desktop/src/styles/console.css").includes('mask: url("../../public/assets/icons/mood-hot.svg")')
      && read("apps/desktop/src/features/pet-story/moodVisuals.ts").includes('moodHotIconAssetPath = "assets/icons/mood-hot.svg"')
      && read("apps/desktop/src/features/pet-generated-actor/GeneratedPetActorCanvas.tsx").includes("moodHotIconAssetPath"),
    "Console and desktop badges reuse the same crisp local Hot glyph instead of drawing the former uneven inline flame",
  );
  verify(
    "Hot and Overdrive use bounded reaction pulses over the Focus steady pose",
    desktop.includes("ambientRestAllowedForMood(mood)")
      && desktop.includes('event.type === "ambient.rest"')
      && desktop.includes('type: "mood.reactionPulse"')
      && desktop.includes('"mood.reactionPulse", "token.delta"')
      && desktop.includes("MOOD_REACTION_REPLAY_INTERVAL_MS")
      && desktop.includes("quickPlayActiveRef.current || timedNapActiveRef.current")
      && read("apps/desktop/src/features/pet-story/PetDirector.ts").includes("MOOD_REACTION_DURATION_MS = 10_000")
      && read("apps/desktop/src/features/pet-story/PetDirector.ts").includes("MOOD_REACTION_REPLAY_INTERVAL_MS = 5 * 60_000")
      && read("apps/desktop/src/features/pet-story/PetDirector.ts").includes('return mood === "sleepy" ? "sleep_loop" : "focus_loop"'),
    "only Sleepy may auto-rest; Hot/Overdrive play for ten seconds on entry and every five minutes, return to Focus, and skip scheduled pulses while Quick Play or timed Nap Here owns the actor",
  );
  verify(
    "Mood stateless one-way preview and global presentation persistence",
    moodPanel.includes("const previewUsage =")
      && moodPanel.includes("realtimePreviewValue")
      && moodPanel.includes("setPreviewValueState")
      && !moodPanel.includes("moodPreviewValues")
      && moodPanel.includes("moodPresentation:")
      && moodPanel.includes("moodControls:")
      && moodPanel.includes("previewPresentation.actorLoop")
      && moodPanel.includes("previewPresentation.badgeColor")
      && moodPanel.includes("moodControls.badgeVisible")
      && moodPanel.includes("moodControls.badgeStyle")
      && moodPanel.includes("moodControls.entryPulse")
      && !moodPanel.includes("setSelectedMood")
      && !moodPanel.includes("data-select-preview-mood")
      && !/window\.tokenpet|dispatchPetAction|PetDirectorEvent/u.test(moodPanel),
    "the simulator keeps only local transient state while global Badge controls flow into the simulator and desktop without any preview-to-runtime or persisted-preview path",
  );
  verify(
    "Mood v37 retires the old rule dashboard",
    !/Reaction Rules|Preview Scenarios|Lifetime|Total tokens|Quiet in focus mode|Cool down after overdrive|Overdrive cooldown|One-shot on threshold crossing/u.test(moodPanel),
    "Mood exposes no Lifetime signal, duplicate scenarios, Focus mute, user cooldown, or legacy reaction-rule module",
  );
  verify(
    "Mood v37 settings schema",
    rendererTypes.includes('export type MoodSignalWindow = "live" | "today" | "last7Days"')
      && ["moodSignalWindow", "moodThresholdProfiles", "moodPreviewValues", "moodPresentation", "moodControls"].every((field) => rendererTypes.includes(field))
      && ["defaultMoodThresholdProfiles", "normalizeMoodThresholdProfile", "normalizeMoodControls", "moodThresholdSpan", "stabilizeMood"].every((helper) => moodRuntime.includes(helper))
      && ["defaultMoodThresholdProfiles", "normalizeMoodThresholdProfile", "normalizeMoodControls", "moodThresholdSpan"].every((helper) => storyRuntime.includes(helper)),
    "renderer/Electron settings share bounded-window profiles, backward-compatible legacy preview storage, four colors, and normalized global Badge controls",
  );
  verify(
    "Mood v37 Today rolls over at local midnight",
    usageRuntime.includes("currentLocalDateKey")
      && usageRuntime.includes("usageCache.localDateKey === currentLocalDateKey")
      && usageRuntime.includes("localDateKey: currentLocalDateKey"),
    "the 15-second usage cache is reusable only inside the same local calendar day, so Today re-reads immediately after midnight",
  );
  const actionsV19Ids = quickPlayIds.filter((id) => id !== "capture_moment");
  verify("Actions v20 exact selector", actionsV19Ids.every((id) => actions.includes(`\"${id}\"`)) && actions.includes("export const actionsPreviewIds") && !/actionsPreviewIds[\s\S]{0,400}capture_moment/u.test(actions), "Actions declares exactly the eight v20 preview actions and excludes Capture from its selector");
  verify("Actions defaults to the first Pet action", actions.includes('useState<ActionsPreviewId>("walk_round_trip")') && !actions.includes('useState<ActionsPreviewId>("dance")'), "each Actions workbench mount starts with Pet and its settings instead of retaining Dance");
  verify("Actions v20 isolated runtime", actions.includes("Preview changes apply instantly. Your desktop pet stays still.") && actions.includes('previewTimeMs={selectedAction === "play_cursor" ? elapsedMs : sampled.actorTimeMs}') && !/window\.tokenpet|dispatchPetAction|PetDirectorAction/u.test(actions), "the workbench owns only a controlled preview clock and never calls desktop movement/action APIs");
  verify(
    "Actions preview suppresses saved Appearance accessories",
    actions.includes("showAccessories={false}")
      && actions.includes('neckId: "none"')
      && actions.includes('headId: "none"')
      && actions.includes('baseId: "none"')
      && actions.includes('effectId: "none"'),
    "all eight action previews use the clean Quick Play presentation without mutating or rendering the saved accessory selection",
  );
  verify(
    "Menu bar pet follows Mood signal and self-heals",
    electronMainSource.includes("target.setTitle(trayTokenTitle)")
      && electronMainSource.includes("trayTokenTitle = compactNumber(moodSignalFromUsage(snapshot, settings.petStory.moodSignalWindow))")
      && electronMainSource.includes("TRAY_HEALTH_INTERVAL_MS = 30_000")
      && electronMainSource.includes('powerMonitor.on("resume", recoverTrayAfterSystemChange)')
      && electronMainSource.includes('screen.on("display-metrics-changed", recoverTrayAfterSystemChange)')
      && electronMainSource.includes("ensureTray({ recreate: true })")
      && electronMainSource.includes("settings.petStory.moodSignalWindow !== previousMoodSignalWindow")
      && electronMainSource.includes("void loadAndPublishUsage()"),
    "the macOS status item preserves the colored cat, follows the selected bounded Mood signal immediately, and repairs itself after wake/display changes",
  );
  verify("Actions Pet preview reuses Quick Play locomotion", actions.includes("distanceLockedWalkProgressAtTime") && actions.includes("createDistanceLockedWalkPlan") && actions.includes('resolveAnimation(manifest, "walk_round_trip_walk_front_right")') && actions.includes("offline-eight-direction-vector-selected-distance-locked") && actions.includes("data-preview-walk-root-progress") && !actions.includes("actorX: roundTrip * 31") && consoleStyles.includes(".action-preview-walk_round_trip .pet-generated-actor-shell") && consoleStyles.includes('.action-settings-card input[type="range"]'), "Pet traverses the diagonal sandbox with the production front-right action/root curve, a contained actor artboard, and pointer cursors on Settings controls");
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
  const nap = manifest.animations["action.nap_here"];
  const napExecutorSource = read("apps/desktop/electron/quick-play/executors/nap-here.ts");
  verify(
    "Nap Here settles into the frame-free sleep pose without a jump",
    nap?.frames.length === 2
      && JSON.stringify(nap.frames.map((frame) => frame.src)) === JSON.stringify(["frames/idle_breathe.png", "frames/sleep_loop.png"])
      && nap.frames.reduce((total, frame) => total + frame.durationMs, 0) === 1_300
      && nap.frames.every((frame) => !frame.bodyTransform && !frame.src.includes("nap_here.png"))
      && desktop.includes("data-pet-resting")
      && actions.includes("grounded-direct-settle-sleep-bubble")
      && !petStyles.includes("quick-nap-breathe")
      && !petStyles.includes("quick-nap-z"),
    "desktop and Console share a grounded idle-to-sleep sequence with a persistent token bubble and no floating cushion or whole-canvas translation",
  );
  verify(
    "Nap Here owns an interruptible five-minute rest lease",
    napExecutorSource.includes("NAP_HERE_DURATION_MS = 5 * 60 * 1_000")
      && napExecutorSource.includes("ports.markResting(NAP_HERE_DURATION_MS)")
      && electronMainSource.includes("beginTimedNap(")
      && electronMainSource.includes("restoreTimedNap({ publish: false })")
      && electronMainSource.includes('if (quickAction !== "nap_here") interruptRestForQuickPlayAction()')
      && desktop.includes("timedNapRestoreRef")
      && desktop.includes("previousResting && !quickPlaySession.resting"),
    "Nap restores automatically after 300000ms; any accepted different Quick Play action consumes the lease and restores the pre-Nap Director snapshot after that action",
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
  const dancePhaseCounts = { dance_rise: 4, dance_eye_snap: 8, dance_tongue_pop: 8, dance_tongue_hold: 16, dance_tongue_sway: 16, dance_tongue_retract: 8, dance_smug_hold: 8, dance_smug_sway_left: 4, dance_smug_sway_right: 4, dance_eyes_reset: 8, dance_restore: 4 };
  const danceExecutor = read("apps/desktop/electron/quick-play/executors/dance.ts");
  const danceAssetPrep = read("tools/pet-asset-studio/scripts/prepare-dance-assets.py");
  verify(
    "Dance uses the detected minimal-loop Golden British alpha-video timeline and synchronized audio",
    Object.entries(dancePhaseCounts).every(([id, count]) => manifest.animations[`action.${id}`]?.frames.length === count)
      && manifest.animations["action.dance"]?.frames.length === 595
      && manifest.animations["action.dance_reference_clip"]?.frames.length === 595
      && manifest.animations["action.dance"]?.frames.reduce((total, frame) => total + frame.durationMs, 0) === 10_133
      && new Set(manifest.animations["action.dance"].frames.map((frame) => frame.src)).size === 46
      && Object.keys(dancePhaseCounts).every((id) => manifest.animations[`action.${id}`].frames.every((frame) => !frame.bodyTransform))
      && manifest.capabilities.some((entry) => entry.id === "dance" && entry.status === "ready")
      && !manifest.capabilities.some((entry) => entry.id === "summon_to_pointer")
      && electronMainSource.includes('if (action === "dance")')
      && electronMainSource.includes("Dance must preserve byte-exact pet-window bounds")
      && danceExecutor.includes("assertFixedBounds")
      && danceAssetPrep.includes('"runtimeBodyTransform": "forbidden"')
      && danceAssetPrep.includes('"sourceFrameScheduling": "one-manifest-entry-per-true-presentation-frame-in-detected-minimal-loop"')
      && danceAssetPrep.includes('"closedMouthMechanics": "15-to-20-percent-head-neck-forward-projection-with-stable-lower-body"')
      && danceAssetPrep.includes('"tongueOutMechanics": "12-to-15-percent-pelvis-haunch-displacement-with-planted-paws-on-source-audio-onsets"')
      && actions.includes("loop-detected-registered-golden-british-vp9-alpha-trimmed-audio-fixed-anchor-fallback")
      && desktop.includes("<DanceVideoLayer")
      && actions.includes("<DanceVideoLayer")
      && danceVideoLayer.includes("pet-video/dance-golden-style.webm")
      && danceVideoLayer.includes("window.setInterval(() => synchronize(), 100)")
      && danceVideoManifest.renderer === "loop-detected-registered-golden-british-video-v9"
      && danceVideoManifest.motion?.closedMouth === "offline-full-pose-forward-blend-collar-pivot-connected-impact-head-shake"
      && danceVideoManifest.motion?.tongueOut === "offline-fixed-cadence-counterphase-head-haunch-groove"
      && danceVideoManifest.codec === "vp9"
      && danceVideoManifest.pixelFormat === "yuva420p"
      && danceVideoManifest.hasAlpha === true
      && danceVideoManifest.frameCount === 608
      && danceVideoManifest.durationMs === 10_133
      && danceVideoManifest.selectedLoopPeriodMs === 10_133
      && danceVideoManifest.width === 512
      && danceVideoManifest.height === 512
      && danceVideoManifest.sourceKeyframes.canonicalRegisteredFrames === 48
      && danceVideoManifest.sourceKeyframes.mixedIdentityMasterFrames === 0
      && danceVideoManifest.motion.bodyAnchor === "fixed-512x818-source-to-256x414-output"
      && danceVideoManifest.motion.visibleHeightPx === 336
      && danceVideoRenderer.includes("window.renderDanceFrame")
      && soundEngine.includes("dance-video-reference.m4a")
      && soundEngine.includes("waitForDanceReferenceReady")
      && soundEngine.includes("danceReferencePlayGeneration")
      && soundEngine.includes("if (userInitiated) return true")
      && soundEngine.includes("syncDanceReferenceSound")
      && electronMainSource.includes('appendSwitch("autoplay-policy", "no-user-gesture-required")')
      && fileIsNonEmpty(join(root, "apps/desktop/public/pet-audio/dance-video-reference.m4a"))
      && fileIsNonEmpty(join(root, "apps/desktop/public/pet-video/dance-golden-style.webm"))
      && statSync(join(root, "apps/desktop/public/pet-video/dance-golden-style.webm")).size < 10 * 1024 * 1024,
    "Quick Play and Console Preview share a 512px, sub-10MiB, 608-frame fixed-anchor VP9-alpha render and its synchronized 10.133-second source-loop audio",
  );
  verify("Actions v20 preview modules", ["data-action-selector", "data-action-preview-stage", "data-action-filmstrip", "data-action-scrubber", "data-action-play", "data-action-restart", "data-action-loop", "data-action-settings", "data-reset-action"].every((token) => actions.includes(token)), "selector, stage, filmstrip, scrubber, transport, per-action settings, and reset are all present");
  verify("Actions v20 dedicated settings", ["walkPace", "roamDistance", "destinationPause", "lookAroundEffect", "snackStyle", "snackSize", "startMeow", "returnPace", "followSmoothing", "maxHeadTurnAngle", "earFollow", "fishToyStyle", "swingResponse", "pursuitPace", "toyTrailEffect", "yarnColor", "rollDistance", "rollSpeed", "settlePace", "sleepShadow", "meowVoice", "meowCue", "stretchHold", "wakeSparkle", "danceSound"].every((key) => actions.includes(`key: \"${key}\"`)) && !["attentionRadius", "settlePose", "breathingIntensity", "zEffect", "arrivalOffset", "routeCurve", "settleDelay", "tempo", "loopCount"].some((key) => actions.includes(`key: \"${key}\"`)), "all action-specific v20 setting keys are modeled without controls that would desynchronize the exact Dance reference clip");
  verify("Actions v20 old modules removed", !/Behavior Mode|Actor States|Interaction Rules|Director Priority|Live Actor Preview|Run across desktop|Summon/u.test(actions), "the Actions implementation contains none of the retired director-dashboard or Summon modules");
  verify("ambient story scheduler", desktop.includes("selectAmbientPetEvent") && desktop.includes("ambientRef") && desktop.includes("window.setInterval(tick"), "desktop pet schedules deterministic blink, rest, and wake events through PetDirector");
  verify("Token Egg ambient gate", desktop.includes("lifecycleStage: lifecycleFromUsage(usage)"), "ambient wake/rest/blink receives lifecycle state so Stage 0 can wait for the first-source/token hatch");
  verify(
    "Mood v37 global badge presentation reaches both actor paths",
    desktop.includes("moodBadgeVisible={story.moodControls.badgeVisible}")
      && desktop.includes("moodBadgeColor={story.moodPresentation[mood].badgeColor}")
      && desktop.includes("moodBadgeStyle={story.moodControls.badgeStyle}")
      && desktop.includes("moodBadgePulse={moodBadgePulseActive}")
      && generatedRenderer.includes("plan.moodBadgeColor ?? undefined")
      && generatedRenderer.includes("plan.moodBadgeStyle")
      && generatedRenderer.includes("plan.moodBadgePulse")
      && generatedRenderer.includes("drawMoodSemanticIcon(")
      && generatedRenderer.includes("data-mood-badge-icon={plan.moodBadgeRect ? plan.moodId : undefined}")
      && generatedRenderer.includes("data-mood-badge-color={plan.moodBadgeRect ? plan.moodBadgeColor ?? undefined : undefined}")
      && fallbackRenderer.includes("badge.color")
      && fallbackRenderer.includes("drawMoodSemanticIcon(")
      && read("apps/desktop/src/features/pet-actor/PetActorCanvas.tsx").includes("data-mood-badge-icon={frame.moodBadge ? props.moodId : undefined}")
      && read("apps/desktop/src/features/pet-actor/PetActorCanvas.tsx").includes("data-mood-badge-color={frame.moodBadge ? props.moodBadgeColor : undefined}")
      && read("apps/desktop/src/features/pet-actor/actorFrame.ts").includes("props.moodBadgeVisible")
      && read("apps/desktop/src/features/pet-actor/actorFrame.ts").includes("props.moodBadgeColor"),
    "global visibility, shared style, entry pulse, and the resolved mood color flow through generated and approved static-fallback mood badges",
  );
  verify("static fallback accessory safety", fallbackOutfit.includes("STATIC_FALLBACK_RUNTIME_ACCESSORIES = false") && fallbackOutfit.includes("accessoryIds: STATIC_FALLBACK_RUNTIME_ACCESSORIES ? suppressed : []"), "approved static fallback images suppress old runtime wearable settings until a manifest declares compatible slots");
  verify("static fallback composition safety", fallbackOutfit.includes('return "hidden"') && !fallbackRenderer.includes("function drawTokenFrame") && !fallbackRenderer.includes("context.createLinearGradient") && !fallbackRenderer.includes("context.filter =") && !fallbackRenderer.includes('slot === "baseBack"') && fallbackRenderer.includes('badge.style === "iconOnly"'), "approved static fallbacks stay frozen exactly as shipped while the shared icon-only badge presentation remains available");
  verify(
    "Mood stabilized signal and bounded reaction scheduling",
    desktop.includes("stabilizeMood(moodStabilizerRef.current")
      && desktop.includes("window.setInterval(tick, 1_000)")
      && desktop.includes("const moodChanged = previousMoodRef.current !== mood")
      && desktop.includes('dispatchDirectorEvent({ type: "mood.reactionPulse", mood })')
      && desktop.includes("const loop = moodSteadyAction(immediateMood)")
      && desktop.includes("resting: immediateMood === \"sleepy\""),
    "the desktop evaluates the bounded signal every second, synchronizes the steady sleep/focus baseline immediately, and starts a bounded Hot/Overdrive pulse only when the stabilized Mood changes",
  );
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
