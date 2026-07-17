import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const storyBuildPath = join(root, "dist-electron/story.js");
const windowBehaviorBuildPath = join(root, "dist-electron/window-behavior.js");
const quickPlayChoreographyBuildPath = join(root, "dist-electron/quick-play-choreography.js");
const feedSnackExecutorBuildPath = join(root, "dist-electron/quick-play/executors/feed-snack.js");
const dangleToyExecutorBuildPath = join(root, "dist-electron/quick-play/executors/dangle-toy.js");
const playCursorExecutorBuildPath = join(root, "dist-electron/quick-play/executors/play-cursor.js");
const tossYarnExecutorBuildPath = join(root, "dist-electron/quick-play/executors/toss-yarn.js");

assert.ok(existsSync(storyBuildPath), "dist-electron/story.js is missing; run npm run build:main before runtime QA");
assert.ok(existsSync(windowBehaviorBuildPath), "dist-electron/window-behavior.js is missing; run npm run build:main before runtime QA");
assert.ok(existsSync(quickPlayChoreographyBuildPath), "dist-electron/quick-play-choreography.js is missing; run npm run build:main before runtime QA");
assert.ok(existsSync(feedSnackExecutorBuildPath), "Feed Snack executor build is missing; run npm run build:main before runtime QA");
assert.ok(existsSync(dangleToyExecutorBuildPath), "Dangle Toy executor build is missing; run npm run build:main before runtime QA");
assert.ok(existsSync(playCursorExecutorBuildPath), "Play Cursor executor build is missing; run npm run build:main before runtime QA");
assert.ok(existsSync(tossYarnExecutorBuildPath), "Toss Yarn executor build is missing; run npm run build:main before runtime QA");

const story = await import(`${pathToFileURL(storyBuildPath).href}?qa=${Date.now()}`);
const windowBehavior = await import(`${pathToFileURL(windowBehaviorBuildPath).href}?qa=${Date.now()}`);
const quickPlay = await import(`${pathToFileURL(quickPlayChoreographyBuildPath).href}?qa=${Date.now()}`);
const feedSnackExecutor = await import(`${pathToFileURL(feedSnackExecutorBuildPath).href}?qa=${Date.now()}`);
const dangleToyExecutor = await import(`${pathToFileURL(dangleToyExecutorBuildPath).href}?qa=${Date.now()}`);
const playCursorExecutor = await import(`${pathToFileURL(playCursorExecutorBuildPath).href}?qa=${Date.now()}`);
const tossYarnExecutor = await import(`${pathToFileURL(tossYarnExecutorBuildPath).href}?qa=${Date.now()}`);
const directorBundle = await build({
  entryPoints: [join(root, "apps/desktop/src/features/pet-story/PetDirector.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const directorCode = directorBundle.outputFiles[0].text;
const director = await import(`data:text/javascript;base64,${Buffer.from(directorCode).toString("base64")}`);
const outfitBundle = await build({
  entryPoints: [join(root, "apps/desktop/src/features/pet-actor/outfitResolver.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const outfitCode = outfitBundle.outputFiles[0].text;
const outfit = await import(`data:text/javascript;base64,${Buffer.from(outfitCode).toString("base64")}`);
const actorLayoutBundle = await build({
  entryPoints: [join(root, "apps/desktop/src/features/pet-generated-actor/actorLayout.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  write: false,
  logLevel: "silent",
});
const actorLayoutCode = actorLayoutBundle.outputFiles[0].text;
const actorLayout = await import(`data:text/javascript;base64,${Buffer.from(actorLayoutCode).toString("base64")}`);

const results = [];

function verify(name, callback) {
  callback();
  results.push(name);
}

function usage(overrides = {}) {
  const allTimeTokens = overrides.allTimeTokens ?? 0;
  const todayTokens = overrides.todayTokens ?? 0;
  const activeDays = overrides.activeDays ?? 0;
  const providers = overrides.providers ?? [
    { id: "ccusage", label: "ccusage", status: "connected", detail: "bundled", todayTokens, sevenDayTokens: todayTokens, allTimeTokens },
  ];
  return {
    todayTokens,
    sevenDayTokens: overrides.sevenDayTokens ?? todayTokens,
    allTimeTokens,
    todayCost: 0,
    sevenDayCost: 0,
    topModel: "local",
    topTool: "local",
    burnRate: overrides.burnRate ?? "quiet",
    status: "ready",
    generatedAt: "2026-07-09T19:00:00.000Z",
    providers,
    analysis: {
      daily: [],
      models: [],
      sessions: [],
      costStructure: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningOutputTokens: 0 },
      activeDays,
      sessionCount: 0,
      cacheHitRate: 0,
      dailyAverageTokens: 0,
      nextSevenDayForecast: 0,
      nextThirtyDayForecast: 0,
    },
  };
}

function boundsFitWorkAreaForTest(bounds, area) {
  return bounds.x >= area.x
    && bounds.y >= area.y
    && bounds.x + bounds.width <= area.x + area.width
    && bounds.y + bounds.height <= area.y + area.height;
}

function connectedProvider(id = "codex") {
  return [{ id, label: id, status: "connected", detail: "synthetic", todayTokens: 0, sevenDayTokens: 0, allTimeTokens: 0 }];
}

verify("lifecycle ignores ccusage helper as a source", () => {
  assert.equal(story.lifecycleFromUsage(usage()), "egg");
  assert.equal(director.lifecycleFromUsage(usage()), "egg");
});

verify("lifecycle stage boundaries", () => {
  assert.equal(story.lifecycleFromUsage(usage({ providers: connectedProvider(), allTimeTokens: 0 })), "newKitten");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 999_999 })), "newKitten");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 1_000_000 })), "deskBuddy");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 49_999_999, activeDays: 6 })), "deskBuddy");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 50_000_000 })), "flowCompanion");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 2_000_000, activeDays: 7 })), "flowCompanion");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 500_000_000 })), "guardianCompanion");
  assert.equal(story.lifecycleFromUsage(usage({ allTimeTokens: 2_000_000, activeDays: 30 })), "guardianCompanion");
});

verify("threshold migration and ordering", () => {
  const migrated = story.normalizePetStory({ moodThresholds: { focused: 1_000, hot: 10_000, overdrive: 50_000 } });
  assert.deepEqual(migrated.moodThresholds, story.defaultPetStory.moodThresholds);
  const custom = story.normalizePetStory({ moodThresholds: { focused: 75_000, hot: 2_000_000, overdrive: 2_000_000_000 } });
  assert.deepEqual(custom.moodThresholds, { focused: 75_000, hot: 2_000_000, overdrive: 2_000_000_000 });
  const clamped = story.normalizePetStory({ moodThresholds: { focused: 90, hot: 20, overdrive: 10 } });
  assert.ok(clamped.moodThresholds.focused < clamped.moodThresholds.hot);
  assert.ok(clamped.moodThresholds.hot < clamped.moodThresholds.overdrive);
});

verify("mood boundaries", () => {
  const thresholds = director.defaultPetStory.moodThresholds;
  assert.equal(director.moodFromUsage(usage({ todayTokens: 49_999 }), thresholds), "sleepy");
  assert.equal(director.moodFromUsage(usage({ todayTokens: 50_000 }), thresholds), "focused");
  assert.equal(director.moodFromUsage(usage({ todayTokens: 999_999 }), thresholds), "focused");
  assert.equal(director.moodFromUsage(usage({ todayTokens: 1_000_000 }), thresholds), "hot");
  assert.equal(director.moodFromUsage(usage({ todayTokens: 999_999_999 }), thresholds), "hot");
  assert.equal(director.moodFromUsage(usage({ todayTokens: 1_000_000_000 }), thresholds), "overdrive");
});

verify("first source milestone and local memory", () => {
  const reconciled = story.reconcilePetStory(story.defaultPetStory, usage({ providers: connectedProvider() }), "2026-07-09T19:00:00.000Z");
  assert.equal(reconciled.story.journey.stage, "newKitten");
  assert.ok(reconciled.story.journey.milestoneIds.includes("first-source"));
  assert.ok(reconciled.story.journey.memories.some((memory) => memory.id === "milestone:first-source"));
  assert.ok(reconciled.events.some((event) => event.type === "milestone.reached"));
});

verify("ccusage-only empty observation stays an egg", () => {
  const reconciled = story.reconcilePetStory(story.defaultPetStory, usage(), "2026-07-09T19:00:00.000Z");
  assert.equal(reconciled.story.journey.stage, "egg");
  assert.ok(!reconciled.story.journey.milestoneIds.includes("first-source"));
  assert.equal(reconciled.story.journey.memories.length, 0);
});

verify("token delta, warm mapping, and stage change events", () => {
  const previous = story.normalizePetStory({
    ...story.defaultPetStory,
    journey: {
      ...story.defaultJourneyState,
      stage: "deskBuddy",
      firstSeenAt: "2026-07-08T10:00:00.000Z",
      lastSeenAt: "2026-07-09T18:00:00.000Z",
      lastUsageTokens: 49_000_000,
      milestoneIds: ["first-token", "first-million"],
    },
  });
  const reconciled = story.reconcilePetStory(previous, usage({ allTimeTokens: 50_000_000, todayTokens: 75_000, burnRate: "warm" }), "2026-07-09T19:00:00.000Z");
  assert.ok(reconciled.events.some((event) => event.type === "token.delta" && event.burnRate === "steady"));
  assert.ok(reconciled.events.some((event) => event.type === "lifecycle.stageChanged" && event.stage === "flowCompanion"));
  assert.ok(reconciled.story.journey.memories.some((memory) => memory.kind === "stage" && memory.stage === "flowCompanion"));
});

verify("daily digest creates one local memory", () => {
  const previous = story.normalizePetStory({
    ...story.defaultPetStory,
    journey: {
      ...story.defaultJourneyState,
      stage: "deskBuddy",
      firstSeenAt: "2026-07-07T10:00:00.000Z",
      lastSeenAt: "2026-07-08T23:00:00.000Z",
      lastUsageTokens: 2_000_000,
    },
  });
  const reconciled = story.reconcilePetStory(previous, usage({ allTimeTokens: 2_000_000 }), "2026-07-09T08:00:00.000Z");
  assert.ok(reconciled.events.some((event) => event.type === "day.digestReady"));
  assert.equal(reconciled.story.journey.memories.filter((memory) => memory.id === "digest:2026-07-08").length, 1);
  assert.equal(reconciled.story.journey.lastDigestDate, "2026-07-08");
});

verify("director direct manipulation priority and end state", () => {
  let state = director.createPetDirectorState("focused");
  const drag = director.directPetEvent(state, { type: "pointer.dragStart" }, { actorId: "golden-british", now: 1_000 });
  assert.equal(drag.decision.resolved, "drag_dangle");
  state = drag.state;
  const moodWhileDragging = director.directPetEvent(state, { type: "token.delta", tokens: 50, burnRate: "hot" }, { actorId: "golden-british", now: 1_020 });
  assert.equal(moodWhileDragging.decision, null);
  state = moodWhileDragging.state;
  const drop = director.directPetEvent(state, { type: "pointer.drop" }, { actorId: "golden-british", now: 1_030 });
  assert.equal(drop.decision.resolved, "drop_bounce");
  const completed = director.completePetDirectorAction(drop.state, 3_000);
  assert.equal(completed.currentAction, "hot_loop");
});

verify("director click cooldown", () => {
  const state = director.createPetDirectorState("focused");
  const first = director.directPetEvent(state, { type: "pointer.click" }, { actorId: "golden-british", now: 10_000 });
  assert.equal(first.decision.resolved, "click_purr");
  const repeated = director.directPetEvent(first.state, { type: "pointer.click" }, { actorId: "golden-british", now: 10_100 });
  assert.equal(repeated.decision, null);
});

verify("overdrive is a bounded burst that cools to hot", () => {
  const directed = director.directPetEvent(
    director.createPetDirectorState("focused"),
    { type: "token.delta", tokens: 10_000, burnRate: "overdrive" },
    { actorId: "golden-british", now: 11_000 },
  );
  assert.equal(directed.decision.resolved, "overdrive_loop");
  assert.equal(directed.decision.durationMs, 3_200);
  assert.equal(directed.state.activeUntil, 14_200);
  assert.ok(Number.isFinite(directed.state.activeUntil));
  assert.equal(directed.state.moodLoop, "hot_loop");
  assert.equal(director.completePetDirectorAction(directed.state, 14_200).currentAction, "hot_loop");
});

verify("desktop action requests retain explicit lifecycles outside the isolated Console preview", () => {
  const actions = [
    ["idle_breathe", "actor.actionRequested", 2_400],
    ["blink", "actor.actionRequested", 1_600],
    ["sleep_loop", "actor.actionRequested", 2_400],
    ["focus_loop", "actor.actionRequested", 2_400],
    ["hot_loop", "actor.actionRequested", 2_400],
    ["overdrive_loop", "actor.actionRequested", 3_200],
    ["click_purr", "quickPlay.action", 1_450],
    ["drag_dangle", "quickPlay.action", 8_000],
    ["drop_bounce", "actor.actionRequested", 1_600],
    ["token_snack", "quickPlay.action", 7_000],
    ["play_cursor", "quickPlay.action", 10_000],
    ["run_across", "actor.actionRequested", 2_400],
    ["milestone_celebrate", "actor.actionRequested", 1_600],
  ];

  for (const [index, [action, eventType, expectedDuration]] of actions.entries()) {
    const now = 14_500 + index * 4_000;
    const directed = director.directPetEvent(
      director.createPetDirectorState("focused"),
      { type: eventType, action },
      { actorId: "golden-british", now },
    );
    assert.equal(directed.decision.requested, action);
    assert.equal(directed.decision.resolved, action);
    assert.equal(directed.decision.durationMs, expectedDuration);
    if (action === "run_across") assert.equal(directed.decision.sideEffect, "traverse");
    if (expectedDuration === 0) {
      assert.equal(directed.state.activeUntil, Number.POSITIVE_INFINITY);
    } else {
      assert.equal(directed.state.activeUntil, now + expectedDuration);
      assert.ok(Number.isFinite(directed.state.activeUntil));
      assert.equal(director.completePetDirectorAction(directed.state, now + expectedDuration).currentAction, "focus_loop");
    }
  }

  const firstPreview = director.directPetEvent(
    director.createPetDirectorState("focused"),
    { type: "actor.actionRequested", action: "overdrive_loop" },
    { actorId: "golden-british", now: 90_000 },
  );
  const repeatedPreview = director.directPetEvent(
    firstPreview.state,
    { type: "actor.actionRequested", action: "overdrive_loop" },
    { actorId: "golden-british", now: 90_050 },
  );
  assert.equal(repeatedPreview.decision?.requested, "overdrive_loop", "explicit Console previews must bypass ambient cooldowns");
});

verify("threshold reaction fires exactly once per mood crossing", () => {
  assert.equal(director.thresholdCrossingEvent("focused", "focused", true), null);
  assert.equal(director.thresholdCrossingEvent("focused", "hot", false), null);
  const event = director.thresholdCrossingEvent("focused", "hot", true);
  assert.deepEqual(event, { type: "mood.thresholdCrossed", previous: "focused", mood: "hot" });
  const directed = director.directPetEvent(
    director.createPetDirectorState("focused"),
    event,
    { actorId: "golden-british", now: 15_000 },
  );
  assert.equal(directed.decision.requested, "hot_loop");
  assert.equal(directed.decision.durationMs, 1_600);
  assert.equal(directed.state.moodLoop, "hot_loop");
});

verify("ambient scheduler is deterministic and policy-aware", () => {
  const now = 1_000_000;
  const base = {
    now,
    dateKey: "2026-07-09",
    minuteOfDay: 12 * 60,
    lastActivityAt: now - 30_000,
    lastBlinkAt: now - 10_000,
    lastWakeDate: "2026-07-09",
    lastRestAttemptAt: 0,
    resting: false,
    lifecycleStage: "deskBuddy",
    behaviorMode: "balanced",
    quietMode: false,
    reduceMotion: false,
    nightStart: "22:00",
    nightEnd: "07:00",
  };

  assert.deepEqual(
    director.selectAmbientPetEvent({ ...base, lastWakeDate: null }),
    { kind: "wake", event: { type: "ambient.wake", reason: "startup" } },
  );
  assert.equal(
    director.selectAmbientPetEvent({ ...base, lifecycleStage: "egg", lastWakeDate: null }),
    null,
    "Token Egg must wait calmly for first source/token hatch instead of playing startup wake",
  );
  assert.deepEqual(
    director.selectAmbientPetEvent({ ...base, dateKey: "2026-07-10", lastWakeDate: "2026-07-09" }),
    { kind: "wake", event: { type: "ambient.wake", reason: "day" } },
  );
  assert.equal(director.selectAmbientPetEvent({ ...base, lastWakeDate: null, quietMode: true }), null);
  assert.deepEqual(
    director.selectAmbientPetEvent({ ...base, minuteOfDay: 23 * 60 }),
    { kind: "rest", event: { type: "ambient.rest", reason: "night" } },
  );
  assert.deepEqual(
    director.selectAmbientPetEvent({ ...base, lastActivityAt: now - 10 * 60_000 }),
    { kind: "rest", event: { type: "ambient.rest", reason: "inactivity" } },
  );
  assert.deepEqual(
    director.selectAmbientPetEvent({ ...base, resting: true, lastActivityAt: now - 1_000 }),
    { kind: "wake", event: { type: "ambient.wake", reason: "activity" } },
  );
  assert.deepEqual(
    director.selectAmbientPetEvent({ ...base, lastBlinkAt: now - 75_000 }),
    { kind: "blink", event: { type: "ambient.blink" } },
  );
  assert.equal(director.selectAmbientPetEvent({ ...base, lastBlinkAt: now - 75_000, reduceMotion: true }), null);
  assert.equal(director.selectAmbientPetEvent({ ...base, lastBlinkAt: now - 200_000, behaviorMode: "focusFriendly" }), null);
  assert.equal(director.isPetNightTime(23 * 60, "22:00", "07:00"), true);
  assert.equal(director.isPetNightTime(12 * 60, "22:00", "07:00"), false);
});

verify("ambient events still pass through priority and actor capability gates", () => {
  const initial = director.createPetDirectorState("focused");
  const blink = director.directPetEvent(initial, { type: "ambient.blink" }, { actorId: "golden-british", now: 50_000 });
  assert.equal(blink.decision.resolved, "blink");
  const reducedBlink = director.directPetEvent(initial, { type: "ambient.blink" }, { actorId: "golden-british", reduceMotion: true, now: 50_000 });
  assert.equal(reducedBlink.decision.resolved, "idle_breathe");
  assert.equal(director.directPetEvent(initial, { type: "ambient.blink" }, { actorId: "ragdoll", now: 50_000 }).decision, null);

  const rest = director.directPetEvent(initial, { type: "ambient.rest", reason: "inactivity" }, { actorId: "golden-british", now: 51_000 });
  assert.equal(rest.state.resting, true);
  assert.equal(director.completePetDirectorAction(rest.state, 53_000).currentAction, "sleep_loop");
  const wake = director.directPetEvent(rest.state, { type: "ambient.wake", reason: "activity" }, { actorId: "golden-british", now: 53_100 });
  assert.equal(wake.state.resting, false);

  const startupWake = director.directPetEvent(initial, { type: "ambient.wake", reason: "startup" }, { actorId: "golden-british", now: 60_000 });
  const firstSource = director.directPetEvent(startupWake.state, { type: "milestone.reached", milestone: "first-source" }, { actorId: "golden-british", now: 60_100 });
  assert.equal(firstSource.decision.requested, "hatch");
  assert.equal(firstSource.decision.resolved, "milestone_celebrate");
  assert.ok(firstSource.decision.priority > startupWake.decision.priority);
});

verify("approved static fallbacks suppress every runtime wearable", () => {
  const resolved = outfit.resolveActorOutfit(
    {
      tokenBubbleId: "pill",
      accessoryIds: ["collar", "focus-crown", "desk-mat", "hot-sparks"],
      accessorySettings: { tokenFrameId: "pillow", textOnlyFrame: false },
    },
    { id: "ragdoll", tokenFrameMode: "below" },
  );
  assert.equal(outfit.STATIC_FALLBACK_RUNTIME_ACCESSORIES, false);
  assert.deepEqual(resolved.accessoryIds, []);
  assert.deepEqual(resolved.suppressedAccessoryIds.sort(), ["collar", "desk-mat", "focus-crown", "hot-sparks"].sort());
  assert.equal(resolved.tokenMode, "hidden");
  assert.equal(resolved.effectBehindHead, false);
  assert.equal(resolved.moodBadgeRaised, false);

  const generatedActorLoadFailure = outfit.resolveActorOutfit(
    {
      tokenBubbleId: "pill",
      accessoryIds: [],
      accessorySettings: { tokenFrameId: "pillow", textOnlyFrame: false },
    },
    { id: "golden-british", tokenFrameMode: "embedded" },
  );
  assert.equal(generatedActorLoadFailure.tokenMode, "hidden");

  const hiddenGoldenFrame = outfit.resolveActorOutfit(
    {
      tokenBubbleId: "hidden",
      accessoryIds: [],
      accessorySettings: { tokenFrameId: "hidden", textOnlyFrame: true },
    },
    { id: "golden-british", tokenFrameMode: "embedded" },
  );
  assert.equal(hiddenGoldenFrame.tokenMode, "hidden");
});

verify("all Quick Play ids resolve and keep stable names", () => {
  const ids = ["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "summon_to_pointer", "capture_moment"];
  for (const [index, action] of ids.entries()) {
    const directed = director.directPetEvent(
      director.createPetDirectorState("focused"),
      { type: "quickPlay.action", action },
      { actorId: "golden-british", now: 20_000 + index * 2_000 },
    );
    assert.equal(directed.decision.requested, action);
    assert.equal(directed.decision.resolved, action);
  }
});

verify("nap/wake persistent end states", () => {
  const initial = director.createPetDirectorState("focused");
  const nap = director.directPetEvent(initial, { type: "quickPlay.action", action: "nap_here" }, { actorId: "golden-british", now: 30_000 });
  assert.equal(nap.state.resting, true);
  assert.equal(director.completePetDirectorAction(nap.state, 32_000).currentAction, "sleep_loop");
  const wake = director.directPetEvent(nap.state, { type: "quickPlay.action", action: "wake_up" }, { actorId: "golden-british", now: 32_100 });
  assert.equal(wake.state.resting, false);
  assert.equal(director.completePetDirectorAction(wake.state, 34_000).currentAction, "focus_loop");
});

verify("summon/capture side effects", () => {
  const summon = director.directPetEvent(director.createPetDirectorState("focused"), { type: "quickPlay.action", action: "summon_to_pointer" }, { actorId: "golden-british", now: 40_000 });
  const capture = director.directPetEvent(director.createPetDirectorState("focused"), { type: "quickPlay.action", action: "capture_moment" }, { actorId: "golden-british", now: 42_000 });
  assert.equal(summon.decision.sideEffect, "summon");
  assert.equal(capture.decision.sideEffect, "capture");
});

verify("desktop window placement, safe bounds and PNG contract", () => {
  const workArea = { x: -1920, y: -1080, width: 1920, height: 1080 };
  assert.deepEqual(
    windowBehavior.clampBoundsToWorkArea({ x: -9999, y: 9999, width: 260, height: 260 }, workArea),
    { x: -1920, y: -260, width: 260, height: 260 },
  );
  assert.deepEqual(
    windowBehavior.summonBoundsForCursor(
      { x: 4_000, y: 4_000, width: 260, height: 260 },
      { x: -10, y: -10 },
      workArea,
    ),
    { x: -298, y: -298, width: 260, height: 260 },
  );
  assert.deepEqual(
    windowBehavior.popoverPositionForBounds(
      { x: -320, y: -300, width: 260, height: 260 },
      { width: 280, height: 480 },
      workArea,
    ),
    { x: -606, y: -492 },
  );

  const standardWorkArea = { x: 0, y: 0, width: 1512, height: 869 };
  const popover = { width: 280, height: 480 };
  assert.deepEqual(windowBehavior.petVisibleBoundsForPopover({ x: 0, y: 0, width: 260, height: 260 }, 0.75), { x: 71, y: 101, width: 147, height: 143 });
  assert.deepEqual(windowBehavior.petVisibleBoundsForPopover({ x: 0, y: 0, width: 260, height: 260 }, 1), { x: 55, y: 78, width: 184, height: 157 });
  assert.deepEqual(windowBehavior.petVisibleBoundsForPopover({ x: 0, y: 0, width: 260, height: 260 }, 1.25), { x: 34, y: 32, width: 225, height: 196 });
  const bitmap = new Uint8Array(10 * 10 * 4);
  for (let y = 4; y <= 6; y += 1) {
    for (let x = 3; x <= 5; x += 1) bitmap[(y * 10 + x) * 4 + 3] = 255;
  }
  assert.deepEqual(windowBehavior.alphaBoundsForBitmap(bitmap, 10, 10, 10, 10), { x: 1, y: 2, width: 7, height: 7 });
  const overlapArea = (pet, position) => {
    const width = Math.max(0, Math.min(pet.x + pet.width, position.x + popover.width) - Math.max(pet.x, position.x));
    const height = Math.max(0, Math.min(pet.y + pet.height, position.y + popover.height) - Math.max(pet.y, position.y));
    return width * height;
  };
  const clearance = (pet, position) => {
    const horizontal = Math.max(pet.x - (position.x + popover.width), position.x - (pet.x + pet.width), 0);
    const vertical = Math.max(pet.y - (position.y + popover.height), position.y - (pet.y + pet.height), 0);
    return Math.hypot(horizontal, vertical);
  };
  const boundsFitWorkAreaForTest = (bounds, area) => bounds.x >= area.x
    && bounds.y >= area.y
    && bounds.x + bounds.width <= area.x + area.width
    && bounds.y + bounds.height <= area.y + area.height;
  const centeredPet = { x: 626, y: 305, width: 260, height: 260 };
  const centeredVisiblePet = windowBehavior.petVisibleBoundsForPopover(centeredPet, 1);
  const centeredPosition = windowBehavior.popoverPositionForBounds(centeredVisiblePet, popover, standardWorkArea, 12, 6);
  assert.deepEqual(centeredPosition, { x: 871, y: 222 });
  assert.equal(overlapArea(centeredVisiblePet, centeredPosition), 0, "a vertically centered pet must push Quick Play beside its visible pixels");
  assert.ok(clearance(centeredVisiblePet, centeredPosition) >= 6, "Quick Play keeps a compact visual gap from a centered pet");

  const topPet = { x: 626, y: 12, width: 260, height: 260 };
  const topVisiblePet = windowBehavior.petVisibleBoundsForPopover(topPet, 1);
  const topPosition = windowBehavior.popoverPositionForBounds(topVisiblePet, popover, standardWorkArea, 12, 6);
  assert.deepEqual(topPosition, { x: 871, y: 12 });
  assert.equal(overlapArea(topVisiblePet, topPosition), 0, "a top-edge pet should still prefer a clear side placement");
  assert.ok(clearance(topVisiblePet, topPosition) >= 6, "Quick Play keeps a compact visual gap from a top-edge pet");

  const rightPet = { x: 1240, y: 305, width: 260, height: 260 };
  const rightVisiblePet = windowBehavior.petVisibleBoundsForPopover(rightPet, 1);
  const rightPosition = windowBehavior.popoverPositionForBounds(rightVisiblePet, popover, standardWorkArea, 12, 6);
  assert.deepEqual(rightPosition, { x: 1009, y: 222 });
  assert.equal(overlapArea(rightVisiblePet, rightPosition), 0, "a right-edge pet must place Quick Play to its left");
  assert.ok(clearance(rightVisiblePet, rightPosition) >= 6, "Quick Play keeps a compact visual gap from a right-edge pet");

  const traversalStart = { x: 24, y: 300, width: 260, height: 260 };
  const fullTraversal = windowBehavior.createPetTraversalPlan(traversalStart, standardWorkArea, false);
  const reducedTraversal = windowBehavior.createPetTraversalPlan(traversalStart, standardWorkArea, true);
  assert.equal(fullTraversal.durationMs, 2_400);
  assert.equal(fullTraversal.target.x, 1_228);
  assert.equal(reducedTraversal.durationMs, 900);
  assert.ok(reducedTraversal.target.x > traversalStart.x && reducedTraversal.target.x < fullTraversal.target.x);
  const walkingFrame = windowBehavior.petTraversalBoundsAtProgress(fullTraversal, 0.125);
  assert.ok(walkingFrame.x > traversalStart.x, "native traversal must change real window x before completion");
  assert.notEqual(walkingFrame.y, traversalStart.y, "normal traversal adds a light gait offset");
  assert.deepEqual(windowBehavior.petTraversalBoundsAtProgress(fullTraversal, 1), fullTraversal.target);
  assert.equal(boundsFitWorkAreaForTest(walkingFrame, standardWorkArea), true);

  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.equal(windowBehavior.hasPngSignature(png), true);
  assert.equal(windowBehavior.hasPngSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), false);
});

verify("desktop mood badge stays anchored to the scaled actor", () => {
  const declared = { x: 408, y: 72, width: 208, height: 70, align: "center", maxTextLength: 10, maxFontSize: 44 };
  const manifest = { artboard: { width: 1024, height: 1024 }, footLineY: 832 };
  assert.deepEqual(actorLayout.resolveActorMoodBadgeRect(manifest, declared, "preview"), declared);
  assert.equal(actorLayout.resolveActorMoodBadgeRect(manifest, declared, "desktop").y, 383);
});

verify("Quick Play choreography keeps Pet exact-return and Summon safe", () => {
  const workArea = { x: -1440, y: 24, width: 1440, height: 876 };
  const start = { x: -420, y: 180, width: 260, height: 260 };
  const target = quickPlay.sampleSafeRandomTarget(start, workArea, { random: () => .12, roamDistance: "far" });
  assert.notDeepEqual(target, start);
  assert.equal(boundsFitWorkAreaForTest(target, workArea), true);
  const plan = quickPlay.createRoundTripPath(start, target, workArea, { durationMs: 1_200, pauseMs: 700, routeCurve: "gentle" });
  assert.equal(quickPlay.boundsAtRoundTripTime(plan, 1_250).phase, "pause");
  assert.deepEqual(quickPlay.boundsAtRoundTripTime(plan, plan.durationMs).bounds, start);
  assert.equal(quickPlay.boundsAtRoundTripTime(plan, plan.durationMs).complete, true);

  const lowerRandom = [.5, .9];
  const lowerTarget = quickPlay.sampleSafeRandomTarget(start, workArea, {
    random: () => lowerRandom.shift() ?? .9,
    roamDistance: "medium",
    minimumVerticalDistance: 120,
  });
  const upperRandom = [.5, 0];
  const upperTarget = quickPlay.sampleSafeRandomTarget(start, workArea, {
    random: () => upperRandom.shift() ?? 0,
    roamDistance: "medium",
    minimumVerticalDistance: 120,
  });
  assert.ok(lowerTarget.y > start.y + 200, "Pet target sampling must include the lower part of the display");
  assert.ok(upperTarget.y <= start.y - 120, "Pet target sampling must include the upper part of the display");
  assert.equal(boundsFitWorkAreaForTest(lowerTarget, workArea), true);
  assert.equal(boundsFitWorkAreaForTest(upperTarget, workArea), true);
  const diagonalDistance = Math.hypot(lowerTarget.x - start.x, lowerTarget.y - start.y);
  const diagonalWalk = quickPlay.createDistanceLockedWalkPlan(diagonalDistance, 100);
  assert.equal(diagonalWalk.durationMs, diagonalWalk.stepDurationMs * diagonalWalk.stepCount, "two-dimensional travel still contains only complete authored footfalls");
  assert.ok(diagonalWalk.stepDistancePx > 17 && diagonalWalk.stepDistancePx <= 19, "two-dimensional root distance remains matched to the authored stride");

  for (const [randomX, randomY] of [[.1, .15], [.5, .85], [.9, .25]]) {
    const values = [randomX, randomY];
    const sampled = quickPlay.sampleSafeRandomTarget(start, workArea, {
      random: () => values.shift() ?? randomY,
      roamDistance: "medium",
      minimumVerticalDistance: 120,
      maximumAttempts: 1,
    });
    assert.ok(Math.abs(sampled.y - start.y) >= 120, "every Pet invocation must leave the current desktop row visibly");
    assert.equal(boundsFitWorkAreaForTest(sampled, workArea), true);
  }
});

verify("Pet gait locks each authored paw contact to one real desktop footfall", () => {
  const walk = quickPlay.createDistanceLockedWalkPlan(245, 90);
  assert.equal(walk.stepCount, 14, "245 px should resolve to fourteen artwork-matched paw contacts");
  assert.ok(walk.stepDistancePx > 17 && walk.stepDistancePx <= 18, "every completed footfall must advance one artwork-matched non-sliding distance");
  assert.equal(walk.cycleDurationMs, walk.stepDurationMs * 4, "the eight-frame gait is exactly four alternating paw contacts");
  assert.equal(walk.durationMs, walk.stepDurationMs * walk.stepCount, "travel duration is derived from complete steps instead of an unrelated window speed");
  const frameDurationMs = walk.stepDurationMs / 2;
  assert.deepEqual(walk.rootMotion.rootStepKeyframes, [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4]);
  assert.ok(quickPlay.distanceLockedWalkProgressAtTime(walk, frameDurationMs * .5) > 0, "authored contact root motion begins without a detached leg-only hold");
  assert.ok(
    Math.abs(quickPlay.distanceLockedWalkProgressAtTime(walk, frameDurationMs) - .18 / walk.stepCount) < 1e-9,
    "the contact pose may carry only its authored 18 percent of one physical footfall",
  );
  assert.ok(
    Math.abs(quickPlay.distanceLockedWalkProgressAtTime(walk, frameDurationMs * 2) - 1 / walk.stepCount) < 1e-9,
    "the matching support pose must complete the physical footfall",
  );
  for (let step = 1; step <= walk.stepCount; step += 1) {
    assert.ok(
      Math.abs(quickPlay.distanceLockedWalkProgressAtTime(walk, walk.stepDurationMs * step) - step / walk.stepCount) < 1e-9,
      `step ${step} must land at exactly ${step} stride(s)`,
    );
  }
  const accelerated = quickPlay.scaleDistanceLockedWalkPlan(walk, 8);
  assert.equal(accelerated.stepDistancePx, walk.stepDistancePx, "QA/time scaling may change cadence but never stride length");
  assert.equal(accelerated.stepDurationMs, walk.stepDurationMs / 8);
  assert.deepEqual(accelerated.rootMotion, walk.rootMotion, "time scaling must retain the authored asset curve");
  assert.equal(quickPlay.distanceLockedWalkProgressAtTime(accelerated, accelerated.durationMs), 1);
  const largerActorWalk = quickPlay.createDistanceLockedWalkPlan(245, 90, 1.25);
  assert.ok(largerActorWalk.stepDistancePx > walk.stepDistancePx, "a larger visible cat advances a proportionally larger physical footfall");
});

verify("Quick Play semantic timelines preserve strict action contracts", () => {
  const feed = quickPlay.createQuickPlayActionTimeline("token_snack", quickPlay.QUICK_PLAY_ACTION_DEFAULTS.token_snack, 280);
  const feedIds = feed.phases.map((phase) => phase.id);
  assert.deepEqual(
    feedIds.filter((id) => id.startsWith("snack_") && !["snack_stretch"].includes(id)),
    ["snack_single_lick", "snack_bite_handoff", "snack_chew", "snack_swallow", "snack_consumed_hold"],
  );
  assert.ok(feedIds.includes("arrive_and_lower"));
  const cursor = quickPlay.createQuickPlayActionTimeline("play_cursor", quickPlay.QUICK_PLAY_ACTION_DEFAULTS.play_cursor);
  assert.equal(cursor.durationMs, 10_000);
  const wake = quickPlay.createQuickPlayActionTimeline("wake_up", quickPlay.QUICK_PLAY_ACTION_DEFAULTS.wake_up);
  assert.equal(wake.durationMs, 5_000);
  assert.ok(wake.phases.some((phase) => phase.id === "long_full_body_stretch"));
  const gentleNap = quickPlay.createQuickPlayActionTimeline("nap_here", quickPlay.QUICK_PLAY_ACTION_DEFAULTS.nap_here);
  assert.equal(gentleNap.durationMs, 1_300);
  assert.deepEqual(gentleNap.phases.map((phase) => phase.id), ["grounded_pause", "enter_sleep_loop"]);
  const quickNap = quickPlay.createQuickPlayActionTimeline("nap_here", { settlePace: "quick", sleepShadow: false });
  assert.equal(quickNap.durationMs, 800);
  assert.deepEqual(quickPlay.normalizeQuickPlayActionConfig("nap_here", {
    settlePace: "quick",
    sleepShadow: false,
    settlePose: "side",
    breathingIntensity: 100,
    zEffect: true,
  }), { settlePace: "quick", sleepShadow: false });
});

verify("Feed snack travel owns two distance-locked four-footfall gaits", () => {
  const distance = 280;
  const config = quickPlay.QUICK_PLAY_ACTION_DEFAULTS.token_snack;
  const timeline = quickPlay.createQuickPlayActionTimeline("token_snack", config, distance);
  const outward = quickPlay.createDistanceLockedWalkPlan(distance, config.walkPace, 1, quickPlay.FEED_SNACK_WALK_ROOT_MOTION);
  const returnPace = quickPlay.feedSnackReturnPacePercent(config.returnPace);
  const returning = quickPlay.createDistanceLockedWalkPlan(distance, returnPace, 1, quickPlay.FEED_SNACK_RETURN_ROOT_MOTION);
  assert.equal(timeline.phases.find((phase) => phase.id === "walk_slow")?.durationMs, outward.durationMs);
  assert.equal(timeline.phases.find((phase) => phase.id === "run_return")?.durationMs, returning.durationMs);
  assert.equal(outward.rootMotion.footfallsPerCycle, 4);
  assert.equal(returning.rootMotion.footfallsPerCycle, 4);
  assert.notDeepEqual(outward.rootMotion.rootStepKeyframes, returning.rootMotion.rootStepKeyframes);
  assert.equal(outward.rootMotion.nominalStepDistancePx, 16);
  assert.equal(returning.rootMotion.nominalStepDistancePx, 24);
  assert.ok(returning.stepDurationMs < outward.stepDurationMs, "the satisfied return uses a quicker dedicated clock");
  assert.equal(quickPlay.distanceLockedWalkProgressAtTime(outward, outward.durationMs), 1);
  assert.equal(quickPlay.distanceLockedWalkProgressAtTime(returning, returning.durationMs), 1);
  const start = { x: 120, y: 80, width: 260, height: 260 };
  const snack = { x: 860, y: 610 };
  const target = quickPlay.feedSnackTargetBounds(start, snack, { x: 0, y: 0, width: 1_440, height: 900 });
  assert.equal(target.facing, "right");
  assert.ok(Math.abs(target.bounds.x + target.bounds.width / 2 + target.bounds.width * .245 - snack.x) <= 1, "the authored nose anchor must land on the snack instead of the window center");
  const lowerTarget = quickPlay.feedSnackTargetBounds(start, { x: 540, y: 852 }, { x: 0, y: 25, width: 1_440, height: 875 });
  assert.ok(lowerTarget.bounds.y - start.y >= 120, "a lower-screen snack must change the native pet row substantially");
  assert.equal(lowerTarget.bounds.y, 640, "the lower target clamps only at the active display work-area edge");
});

const feedExecutorPhases = [];
const feedExecutorLocomotion = [];
const feedExecutorPropStages = [];
let feedExecutorOverlayClosed = false;
let feedExecutorCompleted = false;
const feedExecutorResult = await feedSnackExecutor.executeFeedSnack({
    phase: (phase) => feedExecutorPhases.push(phase),
    delay: async () => true,
    locomote: async (phase, actionId, pacePercent) => {
      feedExecutorLocomotion.push({ phase, actionId, pacePercent });
      return true;
    },
    setPropStage: (stage, durationMs) => feedExecutorPropStages.push({ stage, durationMs }),
    closePropOverlay: () => { feedExecutorOverlayClosed = true; },
    complete: async () => { feedExecutorCompleted = true; },
  }, { walkPace: 82, returnPacePercent: 140 });
verify("Feed Snack executor preserves isolated semantic ordering", () => {
  assert.equal(feedExecutorResult, true);
  assert.deepEqual(feedExecutorPhases, ["stand", "arrive", "lick", "bite", "chew", "swallow", "settle"]);
  assert.deepEqual(feedExecutorPropStages, [
    { stage: "bite", durationMs: 380 },
    { stage: "chew", durationMs: 440 },
    { stage: "swallow", durationMs: 720 },
    { stage: "consumed", durationMs: 120 },
  ]);
  assert.deepEqual(feedExecutorLocomotion, [
    { phase: "outbound", actionId: "feed_snack_walk_slow", pacePercent: 82 },
    { phase: "return", actionId: "feed_snack_return_run", pacePercent: 140 },
  ]);
  assert.equal(feedExecutorOverlayClosed, true);
  assert.equal(feedExecutorCompleted, true);
});

verify("Quick Play dangle gate rejects jitter and requires over one second", () => {
  let state = quickPlay.createDangleMovementState();
  for (let time = 0; time <= 1_100; time += 100) {
    state = quickPlay.accumulateDangleMovement(state, { x: time / 10, y: 40 }, time);
  }
  assert.equal(state.armed, true);
  let exactBoundary = quickPlay.createDangleMovementState();
  for (let time = 0; time <= 1_000; time += 100) {
    exactBoundary = quickPlay.accumulateDangleMovement(exactBoundary, { x: time / 10, y: 40 }, time);
  }
  assert.equal(exactBoundary.armed, false, "the gate remains strictly greater than 1,000ms");
  let jitter = quickPlay.createDangleMovementState();
  for (let time = 0; time <= 3_000; time += 100) {
    jitter = quickPlay.accumulateDangleMovement(jitter, { x: (time / 100) % 2 * .2, y: 40 }, time);
  }
  assert.equal(jitter.armed, false);
});

verify("Dangle selects authored eight-sector camera directions", () => {
  const origin = { x: 500, y: 300, width: 260, height: 260 };
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, x: 210, y: 520 }), "front-left", "lower-left target uses its diagonal frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, x: 790, y: 520 }), "front-right", "lower-right target uses its diagonal frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, x: 210, y: 80 }), "back-left", "upper-left target uses its diagonal frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, x: 790, y: 80 }), "back-right", "upper-right target uses its diagonal frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, y: 620 }), "front", "straight-down target uses front frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, y: 20 }), "back", "screen-up target uses rear frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, x: 900, y: 360 }), "right", "shallow right diagonal keeps side frames");
  assert.equal(quickPlay.dangleActorDirection(origin, { ...origin, x: 100, y: 360 }), "left", "shallow left diagonal keeps mirrored side frames");
});

const earlyDanglePhases = [];
let earlyDangleStopped = false;
let earlyDangleReturned = false;
const earlyDangleResult = await dangleToyExecutor.executeDangleToy({
  phase: (phase) => earlyDanglePhases.push(phase),
  delay: (durationMs) => durationMs === 280 ? Promise.resolve(true) : new Promise(() => {}),
  waitForRelease: async () => ({ x: 10, y: 20, velocityX: 0, velocityY: 0 }),
  closePropOverlay: () => {},
  stopPursuit: async () => { earlyDangleStopped = true; },
  returnHome: async () => { earlyDangleReturned = true; return true; },
  complete: async () => {},
});
verify("Dangle executor accepts a release before the one-second gate", () => {
  assert.equal(earlyDangleResult, true);
  assert.deepEqual(earlyDanglePhases, ["alert", "release", "return", "settle"]);
  assert.equal(earlyDangleStopped, true);
  assert.equal(earlyDangleReturned, true);
});

const fullDanglePhases = [];
let resolveFullDangleRelease;
const fullDangleRelease = new Promise((resolve) => { resolveFullDangleRelease = resolve; });
const fullDanglePromise = dangleToyExecutor.executeDangleToy({
  phase: (phase) => fullDanglePhases.push(phase),
  delay: async () => true,
  waitForRelease: () => fullDangleRelease,
  closePropOverlay: () => {},
  stopPursuit: async () => {},
  returnHome: async () => true,
  complete: async () => {},
});
await new Promise((resolve) => setImmediate(resolve));
resolveFullDangleRelease({ x: 500, y: 400, velocityX: 20, velocityY: 30 });
const fullDangleResult = await fullDanglePromise;
verify("Dangle executor preserves isolated setup, release and exact-return semantics", () => {
  assert.equal(fullDangleResult, true);
  assert.deepEqual(fullDanglePhases, ["alert", "stalk", "crouch", "release", "return", "settle"]);
});

const tossYarnEvents = [];
const tossYarnResult = await tossYarnExecutor.executeTossYarn({
  phase: (phase) => tossYarnEvents.push(`phase:${phase}`),
  delay: async (durationMs) => { tossYarnEvents.push(`delay:${durationMs}`); return true; },
  approach: async () => { tossYarnEvents.push("locomote:chase"); return true; },
  carryHome: async () => { tossYarnEvents.push("locomote:mouth-carry-home"); return true; },
  closePropOverlay: () => tossYarnEvents.push("overlay:handoff-to-pickup"),
  complete: async () => tossYarnEvents.push("complete:exact-home"),
});
verify("Toss Yarn executor isolates chase, pickup, mouth-carry, drop, and exact return", () => {
  assert.equal(tossYarnResult, true);
  assert.deepEqual(tossYarnEvents, [
    "phase:stand", "delay:350",
    "phase:outbound", "locomote:chase",
    "overlay:handoff-to-pickup", "phase:pickup", "delay:670",
    "phase:carry", "locomote:mouth-carry-home",
    "phase:drop", "delay:1000",
    "phase:settle", "delay:280",
    "complete:exact-home",
  ]);
  const timeline = quickPlay.createQuickPlayActionTimeline("toss_yarn", quickPlay.QUICK_PLAY_ACTION_DEFAULTS.toss_yarn, 260);
  assert.deepEqual(timeline.phases.map((phase) => phase.id), ["roll", "run_to_yarn", "pick_up_yarn", "carry_yarn", "drop_yarn", "restore"]);
});

const cursorExecutorPhases = [];
const cursorExecutorDelays = [];
let cursorExecutorCompleted = false;
const cursorExecutorResult = await playCursorExecutor.executePlayCursor({
  phase: (phase) => cursorExecutorPhases.push(phase),
  delay: async (durationMs) => { cursorExecutorDelays.push(durationMs); return true; },
  complete: async () => { cursorExecutorCompleted = true; },
});

verify("Quick Play cursor smoothing anchors body and yarn roll terminates safely", () => {
  assert.equal(cursorExecutorResult, true);
  assert.deepEqual(cursorExecutorPhases, ["tracking", "settle"]);
  assert.deepEqual(cursorExecutorDelays, [9_650, 350]);
  assert.equal(cursorExecutorCompleted, true);
  assert.equal(cursorExecutorDelays.reduce((sum, value) => sum + value, 0), 10_000, "tracking and settle must fit the accepted ten-second deadline exactly");
  const cursorConfig = quickPlay.QUICK_PLAY_ACTION_DEFAULTS.play_cursor;
  let tracking = quickPlay.createCursorTrackingState();
  tracking = quickPlay.updateCursorTracking(tracking, { x: 140, y: 20 }, { x: 0, y: 0 }, 1_000, cursorConfig);
  const second = quickPlay.updateCursorTracking(tracking, { x: -140, y: 20 }, { x: 0, y: 0 }, 1_016, cursorConfig);
  assert.equal(second.withinAttention, true);
  assert.ok(Math.abs(second.headAngleDegrees - tracking.headAngleDegrees) <= 2, "angular velocity must be capped at 120°/s");
  const remote = quickPlay.updateCursorTracking(second, { x: 1_440, y: -900 }, { x: 0, y: 0 }, 1_032, cursorConfig);
  assert.equal(remote.withinAttention, true, "the complete desktop coordinate space remains trackable beyond the legacy local radius");
  assert.ok(Math.hypot(remote.eyeOffset.x, remote.eyeOffset.y) > .95, "a remote desktop point retains a full-strength authored direction");
  const workArea = { x: 0, y: 0, width: 1280, height: 800 };
  const yarn = quickPlay.createYarnRollPlan({ x: 1240, y: 760 }, { x: 900, y: 300 }, workArea, quickPlay.QUICK_PLAY_ACTION_DEFAULTS.toss_yarn);
  const final = quickPlay.yarnRollAtTime(yarn, yarn.durationMs);
  assert.equal(final.complete, true);
  assert.ok(final.point.x <= workArea.width - yarn.ballRadius && final.point.y <= workArea.height - yarn.ballRadius);
});

verify("reduced motion and capability policy", () => {
  const reduced = director.resolveAction("golden-british", "overdrive_loop", true);
  assert.equal(reduced.resolved, "hot_loop");
  assert.equal(reduced.status, "fallback");
  assert.equal(director.resolveAction("golden-british", "daily_digest", false), null);
  assert.equal(director.resolveAction("ragdoll", "click_purr", false), null);
  assert.equal(director.resolveAction("ragdoll", "idle_breathe", false).resolved, "idle_breathe");
});

console.log(`Pet Story runtime QA: ${results.length} groups passed.`);
for (const name of results) console.log(`  ✓ ${name}`);
