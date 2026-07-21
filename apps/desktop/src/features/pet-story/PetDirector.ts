import goldenBritishActorManifestJson from "../../../public/pet-actors/golden-british/actor.json";
import type { PetActorCapability, PetActorManifest } from "../../../../../packages/pet-asset-schema/src";
import type {
  MoodLookId,
  MotionActionId,
  PetActionId,
  PetBehaviorMode,
  PetDirectorEvent,
  PetJourneyState,
  PetLifeStage,
  PetStorySettings,
  UsageSnapshot,
} from "../../types";

export const defaultJourneyState: PetJourneyState = {
  schemaVersion: 1,
  stage: "egg",
  milestoneIds: [],
  memories: [],
  firstSeenAt: null,
  lastSeenAt: null,
  lastUsageTokens: 0,
  activeDays: 0,
  lastDigestDate: null,
};

export const defaultPetStory: PetStorySettings = {
  behaviorMode: "balanced",
  moodThresholds: { focused: 50_000, hot: 1_000_000, overdrive: 1_000_000_000 },
  quietMode: false,
  followCursor: false,
  lockPosition: false,
  reduceMotion: false,
  soundEnabled: false,
  soundStyle: "soft",
  volume: 45,
  cueIds: ["wake", "purr", "drop", "snack", "milestone"],
  cueVolumes: { wake: 70, purr: 60, drop: 55, snack: 65, milestone: 75, hot: 75, rest: 50 },
  interactionRules: { click: true, drag: true, drop: true, feed: true, cursor: true },
  safety: {
    batteryLowPause: true,
    muteDuringFocus: true,
    quietHoursEnabled: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
    screenSharingStillness: true,
    respectSystemVolume: true,
  },
  reactionRules: { oneShotOnThreshold: true, coolDownAfterOverdrive: true },
  companionSettings: { keepTinyMenuForm: true, showMemoryCards: true, celebrateMilestones: true },
  actionSettings: { schemaVersion: 1, byAction: {} },
  pinnedStage: null,
  lastAction: null,
  journey: defaultJourneyState,
};

export type CapabilityStatus = "ready" | "fallback" | "planned" | "unavailable";
export type PetCapability = {
  id: PetActionId;
  status: CapabilityStatus;
  fallbackId?: PetActionId;
  reason?: string;
  uiBehavior?: "show" | "disable" | "hide";
};

export const actionIds: PetActionId[] = [
  "idle_breathe",
  "blink",
  "sleep_loop",
  "focus_loop",
  "hot_loop",
  "overdrive_loop",
  "hatch",
  "click_purr",
  "drag_dangle",
  "drop_bounce",
  "token_snack",
  "play_cursor",
  "run_across",
  "walk_round_trip",
  "milestone_celebrate",
  "level_up",
  "daily_digest",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "dance",
  "settle_down",
  "focus_start",
  "cool_down",
  "summon_to_screen",
  "capture_moment",
];

const actorManifests: Record<string, PetActorManifest> = {
  "golden-british": goldenBritishActorManifestJson as unknown as PetActorManifest,
};

const legacyAnimationIds: Partial<Record<PetActionId, string>> = {
  idle_breathe: "idle-breathe",
  blink: "blink",
  sleep_loop: "desk-nap",
  focus_loop: "idle-breathe",
  hot_loop: "tail-wag",
  overdrive_loop: "jump",
  click_purr: "blink",
  drag_dangle: "stretch",
  drop_bounce: "jump",
  token_snack: "blink",
  play_cursor: "pounce-cursor",
  walk_round_trip: "run_across",
  milestone_celebrate: "celebrate",
};

export function actorManifestFor(actorId: string) {
  return actorManifests[actorId] ?? null;
}

export function actorAnimationCandidates(actionId: PetActionId) {
  const legacy = legacyAnimationIds[actionId];
  return [`action.${actionId}`, ...(legacy ? [`action.${legacy}`] : [])];
}

function actorHasAnimation(manifest: PetActorManifest, actionId: PetActionId) {
  return actorAnimationCandidates(actionId).some((animationId) => Boolean(manifest.animations[animationId]));
}

function normalizeCapability(value: PetActorCapability): PetCapability | null {
  if (!actionIds.includes(value.id as PetActionId)) return null;
  const fallbackId = value.fallbackId && actionIds.includes(value.fallbackId as PetActionId) ? (value.fallbackId as PetActionId) : undefined;
  return {
    id: value.id as PetActionId,
    status: value.status,
    ...(fallbackId ? { fallbackId } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
    ...(value.uiBehavior ? { uiBehavior: value.uiBehavior } : {}),
  };
}

export function capabilityFor(actorId: string, id: PetActionId): PetCapability {
  const manifest = actorManifestFor(actorId);
  if (!manifest) {
    return id === "idle_breathe"
      ? { id, status: "ready", uiBehavior: "show", reason: "Approved static fallback image." }
      : {
          id,
          status: "planned",
          reason: "This cat currently uses an approved still image; actor motion is planned.",
          uiBehavior: "disable",
        };
  }

  const declared = manifest.capabilities.find((capability) => capability.id === id);
  const capability = declared ? normalizeCapability(declared) : null;
  if (!capability) {
    return {
      id,
      status: "planned",
      reason: "The current actor bundle does not declare this action yet.",
      uiBehavior: "disable",
    };
  }

  if (capability.status === "ready" && !actorHasAnimation(manifest, id)) {
    return {
      id,
      status: "planned",
      reason: `The actor declares ${id}, but its generated animation is missing.`,
      uiBehavior: "disable",
    };
  }

  return capability;
}

const reducedMotionFallback: Partial<Record<PetActionId, PetActionId>> = {
  overdrive_loop: "hot_loop",
  drag_dangle: "idle_breathe",
  drop_bounce: "idle_breathe",
  play_cursor: "idle_breathe",
  milestone_celebrate: "click_purr",
  hatch: "click_purr",
  level_up: "click_purr",
  toss_yarn: "idle_breathe",
};

export type ResolvedPetAction = {
  requested: PetActionId;
  resolved: PetActionId;
  status: "ready" | "fallback";
  chain: PetActionId[];
};

export function resolveAction(actorId: string, requested: PetActionId, reduceMotion = false): ResolvedPetAction | null {
  const manifest = actorManifestFor(actorId);
  const declaredReducedMotionFallback = manifest?.animations[`action.${requested}`]?.reducedMotionFallback as PetActionId | undefined;
  let current = reduceMotion ? declaredReducedMotionFallback ?? reducedMotionFallback[requested] ?? requested : requested;
  const chain: PetActionId[] = [requested];
  const seen = new Set<PetActionId>();
  let usedFallback = current !== requested;

  while (!seen.has(current)) {
    seen.add(current);
    if (!chain.includes(current)) chain.push(current);
    const capability = capabilityFor(actorId, current);

    if (capability.status === "planned" || capability.status === "unavailable") return null;
    if (capability.status === "ready") {
      if (manifest && !actorHasAnimation(manifest, current)) return null;
      return { requested, resolved: current, status: usedFallback ? "fallback" : "ready", chain };
    }
    if (!capability.fallbackId) return null;

    usedFallback = true;
    current = capability.fallbackId;
  }

  return null;
}

export function moodFromUsage(
  usage: UsageSnapshot,
  thresholds: { focused: number; hot: number; overdrive: number },
): MoodLookId {
  const rate = usage.todayTokens;
  if (usage.burnRate.toLowerCase().includes("overdrive") || rate >= thresholds.overdrive) return "overdrive";
  if (usage.burnRate.toLowerCase().includes("hot") || rate >= thresholds.hot) return "hot";
  if (rate >= thresholds.focused || usage.burnRate.toLowerCase().includes("steady")) return "focused";
  return "sleepy";
}

export function moodAction(mood: MoodLookId): PetActionId {
  if (mood === "sleepy") return "sleep_loop";
  if (mood === "focused") return "focus_loop";
  return `${mood}_loop`;
}

export function lifecycleFromUsage(usage: UsageSnapshot): PetLifeStage {
  const connected = usage.providers.some((provider) => provider.id !== "ccusage" && provider.status === "connected") || usage.allTimeTokens > 0;
  if (!connected && usage.allTimeTokens === 0) return "egg";
  if (usage.allTimeTokens >= 500_000_000 || usage.analysis.activeDays >= 30) return "guardianCompanion";
  if (usage.allTimeTokens >= 50_000_000 || usage.analysis.activeDays >= 7) return "flowCompanion";
  if (usage.allTimeTokens >= 1_000_000) return "deskBuddy";
  return "newKitten";
}

export const directorPriority = {
  directManipulation: 500,
  userReaction: 400,
  milestone: 300,
  moodLoop: 200,
  lifecycleIdle: 100,
} as const;

export type PetAmbientSchedulerInput = {
  now: number;
  dateKey: string;
  minuteOfDay: number;
  lastActivityAt: number;
  lastBlinkAt: number;
  lastWakeDate: string | null;
  lastRestAttemptAt: number;
  resting: boolean;
  lifecycleStage: PetLifeStage;
  behaviorMode: PetBehaviorMode;
  quietMode: boolean;
  reduceMotion: boolean;
  nightStart?: string;
  nightEnd?: string;
};

export type PetAmbientSuggestion = {
  kind: "blink" | "rest" | "wake";
  event: PetDirectorEvent;
};

const ambientBlinkIntervalMs: Record<PetBehaviorMode, number> = {
  gentle: 110_000,
  balanced: 75_000,
  playful: 48_000,
  focusFriendly: Number.POSITIVE_INFINITY,
};

const ambientInactivityMs: Record<PetBehaviorMode, number> = {
  gentle: 8 * 60_000,
  balanced: 10 * 60_000,
  playful: 12 * 60_000,
  focusFriendly: 20 * 60_000,
};

function clockMinutes(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

export function isPetNightTime(minuteOfDay: number, start = "22:00", end = "07:00") {
  const startMinute = clockMinutes(start, 22 * 60);
  const endMinute = clockMinutes(end, 7 * 60);
  const current = Math.min(Math.max(Math.floor(minuteOfDay), 0), 24 * 60 - 1);
  if (startMinute === endMinute) return false;
  return startMinute < endMinute
    ? current >= startMinute && current < endMinute
    : current >= startMinute || current < endMinute;
}

/**
 * Deterministic ambient-story scheduler. The caller owns timestamps and sends the
 * returned event through PetDirector, so capability, priority and reduced-motion
 * policy remain centralized and tests never depend on random timers.
 */
export function selectAmbientPetEvent(input: PetAmbientSchedulerInput): PetAmbientSuggestion | null {
  if (input.lifecycleStage === "egg") return null;
  const night = isPetNightTime(input.minuteOfDay, input.nightStart, input.nightEnd);
  const idleFor = Math.max(0, input.now - input.lastActivityAt);
  const restAttemptDue = input.now - input.lastRestAttemptAt >= 30_000;

  if (night) {
    return !input.resting && restAttemptDue
      ? { kind: "rest", event: { type: "ambient.rest", reason: "night" } }
      : null;
  }

  if (input.resting) {
    const activityResumed = idleFor <= 5_000;
    const newDay = input.lastWakeDate !== input.dateKey;
    return !input.quietMode && (activityResumed || newDay)
      ? { kind: "wake", event: { type: "ambient.wake", reason: activityResumed ? "activity" : "day" } }
      : null;
  }

  if (input.lastWakeDate !== input.dateKey) {
    return input.quietMode
      ? null
      : { kind: "wake", event: { type: "ambient.wake", reason: input.lastWakeDate ? "day" : "startup" } };
  }

  if (idleFor >= ambientInactivityMs[input.behaviorMode] && restAttemptDue) {
    return { kind: "rest", event: { type: "ambient.rest", reason: "inactivity" } };
  }

  if (input.quietMode || input.reduceMotion || input.behaviorMode === "focusFriendly") return null;
  if (input.now - input.lastBlinkAt >= ambientBlinkIntervalMs[input.behaviorMode]) {
    return { kind: "blink", event: { type: "ambient.blink" } };
  }

  return null;
}

export function thresholdCrossingEvent(previous: MoodLookId, next: MoodLookId, enabled: boolean): PetDirectorEvent | null {
  return enabled && previous !== next ? { type: "mood.thresholdCrossed", previous, mood: next } : null;
}

export type PetDirectorDecision = ResolvedPetAction & {
  priority: number;
  durationMs: number;
  returnTo: PetActionId;
  sideEffect?: "summon" | "capture" | "traverse";
};

export type PetDirectorState = {
  currentAction: PetActionId;
  moodLoop: PetActionId;
  previousMoodLoop: PetActionId;
  resting: boolean;
  activePriority: number;
  activeUntil: number;
  lastPlayedAt: Partial<Record<PetActionId, number>>;
};

export function createPetDirectorState(mood: MoodLookId = "focused"): PetDirectorState {
  const loop = moodAction(mood);
  return {
    currentAction: loop,
    moodLoop: loop,
    previousMoodLoop: loop,
    resting: false,
    activePriority: directorPriority.moodLoop,
    activeUntil: 0,
    lastPlayedAt: {},
  };
}

type DirectorRequest = {
  action: PetActionId;
  priority: number;
  durationMs: number;
  persistent?: "rest" | "wake";
  moodLoop?: PetActionId;
  sideEffect?: "summon" | "capture" | "traverse";
  ignoreCooldown?: boolean;
};

function requestForEvent(event: PetDirectorEvent): DirectorRequest {
  if (event.type === "ambient.blink") {
    return { action: "blink", priority: directorPriority.moodLoop, durationMs: 900 };
  }
  if (event.type === "ambient.rest") {
    return { action: "nap_here", priority: directorPriority.moodLoop, durationMs: 1_300, persistent: "rest" };
  }
  if (event.type === "ambient.wake") {
    return { action: "wake_up", priority: directorPriority.moodLoop, durationMs: 1_350, persistent: "wake" };
  }
  if (event.type === "mood.thresholdCrossed") {
    const loop = moodAction(event.mood);
    const action: PetActionId = event.mood === "focused"
      ? "focus_start"
      : event.mood === "sleepy"
        ? "settle_down"
        : loop;
    return {
      action,
      priority: directorPriority.moodLoop,
      durationMs: event.mood === "overdrive" ? 3_200 : 1_600,
      moodLoop: event.mood === "overdrive" ? "hot_loop" : loop,
      ignoreCooldown: true,
    };
  }
  if (event.type === "actor.actionRequested") {
    const persistent = event.action === "nap_here" ? "rest" : event.action === "wake_up" ? "wake" : undefined;
    const loopPreviewDuration = event.action === "overdrive_loop" ? 3_200 : event.action.endsWith("_loop") ? 2_400 : 0;
    return {
      action: event.action,
      priority: event.action.endsWith("_loop") || event.action === "idle_breathe" || event.action === "blink"
        ? directorPriority.moodLoop
        : directorPriority.userReaction,
      durationMs: event.action === "idle_breathe" ? 2_400 : loopPreviewDuration || (event.action === "run_across" ? 2_400 : 1_600),
      ...(persistent ? { persistent } : {}),
      ...(event.action === "summon_to_screen" ? { sideEffect: "summon" as const } : {}),
      ...(event.action === "capture_moment" ? { sideEffect: "capture" as const } : {}),
      ...(event.action === "run_across" ? { sideEffect: "traverse" as const } : {}),
      ignoreCooldown: true,
    };
  }
  if (event.type === "pointer.dragStart") return { action: "drag_dangle", priority: directorPriority.directManipulation, durationMs: 0 };
  if (event.type === "pointer.drop") return { action: "drop_bounce", priority: directorPriority.directManipulation, durationMs: 900 };
  if (event.type === "pointer.click") return { action: "click_purr", priority: directorPriority.userReaction, durationMs: 1_450 };
  if (event.type === "milestone.reached") {
    return {
      action: event.milestone === "first-source" || event.milestone === "first-token" ? "hatch" : "milestone_celebrate",
      priority: directorPriority.milestone,
      durationMs: 2_200,
    };
  }
  if (event.type === "lifecycle.stageChanged") {
    return {
      action: event.stage === "newKitten" ? "hatch" : "level_up",
      priority: directorPriority.milestone,
      durationMs: 2_300,
    };
  }
  if (event.type === "day.digestReady") return { action: "daily_digest", priority: directorPriority.milestone, durationMs: 1_800 };
  if (event.type === "token.delta") {
    const nextMood: MoodLookId = event.burnRate === "overdrive" ? "overdrive" : event.burnRate === "hot" ? "hot" : event.burnRate === "steady" ? "focused" : "sleepy";
    const loop = moodAction(nextMood);
    if (nextMood === "overdrive") {
      return { action: loop, priority: directorPriority.moodLoop, durationMs: 3_200, moodLoop: "hot_loop" };
    }
    return { action: loop, priority: directorPriority.moodLoop, durationMs: 0, moodLoop: loop };
  }

  const action = event.action;
  if (action === "nap_here") return { action, priority: directorPriority.userReaction, durationMs: 1_800, persistent: "rest" };
  if (action === "wake_up") return { action, priority: directorPriority.userReaction, durationMs: 5_000, persistent: "wake" };
  if (action === "dance") return { action, priority: directorPriority.userReaction, durationMs: 5_200 };
  if (action === "walk_round_trip") return { action, priority: directorPriority.userReaction, durationMs: 5_500, sideEffect: "traverse" };
  if (action === "capture_moment") return { action, priority: directorPriority.userReaction, durationMs: 1_250, sideEffect: "capture" };
  if (action === "token_snack") return { action, priority: directorPriority.userReaction, durationMs: 7_000 };
  if (action === "play_cursor") return { action, priority: directorPriority.userReaction, durationMs: 10_000 };
  if (action === "drag_dangle") return { action, priority: directorPriority.userReaction, durationMs: 8_000 };
  if (action === "toss_yarn") return { action, priority: directorPriority.userReaction, durationMs: 5_500 };
  return { action, priority: directorPriority.userReaction, durationMs: 1_450 };
}

const cooldowns: Partial<Record<PetActionId, number>> = {
  click_purr: 260,
  token_snack: 800,
  play_cursor: 600,
  toss_yarn: 900,
  milestone_celebrate: 4_000,
  level_up: 4_000,
  daily_digest: 4_000,
};

export function directPetEvent(
  state: PetDirectorState,
  event: PetDirectorEvent,
  options: { actorId: string; reduceMotion?: boolean; behaviorMode?: PetBehaviorMode; quietMode?: boolean; now?: number },
): { state: PetDirectorState; decision: PetDirectorDecision | null } {
  const now = options.now ?? Date.now();
  const request = requestForEvent(event);
  let nextState = { ...state, lastPlayedAt: { ...state.lastPlayedAt } };

  if (request.moodLoop) {
    nextState = { ...nextState, previousMoodLoop: state.moodLoop, moodLoop: request.moodLoop };
    if (state.resting) return { state: nextState, decision: null };
  }

  const activeIsBlocking = state.activeUntil > now && state.activePriority > request.priority;
  if (activeIsBlocking) return { state: nextState, decision: null };

  const modeCooldownMultiplier = options.behaviorMode === "playful" ? 0.65 : options.behaviorMode === "gentle" ? 1.35 : options.behaviorMode === "focusFriendly" ? 1.75 : 1;
  const manifestCooldown = actorManifestFor(options.actorId)?.animations[`action.${request.action}`]?.cooldownMs;
  const cooldown = (manifestCooldown ?? cooldowns[request.action] ?? 0) * modeCooldownMultiplier;
  const lastPlayedAt = state.lastPlayedAt[request.action] ?? -Infinity;
  if (!request.ignoreCooldown && request.priority < directorPriority.directManipulation && now - lastPlayedAt < cooldown) {
    return { state: nextState, decision: null };
  }

  let behaviorAction = request.action;
  if (options.behaviorMode === "gentle" && behaviorAction === "overdrive_loop") behaviorAction = "hot_loop";
  if (options.behaviorMode === "focusFriendly" && ["hot_loop", "overdrive_loop"].includes(behaviorAction)) behaviorAction = "focus_loop";
  if (options.behaviorMode === "focusFriendly" && ["milestone_celebrate", "level_up"].includes(behaviorAction)) behaviorAction = "click_purr";
  if (options.quietMode && ["hatch", "milestone_celebrate", "level_up"].includes(behaviorAction)) behaviorAction = state.moodLoop;
  const resolvedForMode = resolveAction(options.actorId, behaviorAction, options.reduceMotion);
  const resolved = resolvedForMode
    ? {
        ...resolvedForMode,
        requested: request.action,
        status: resolvedForMode.status === "fallback" || behaviorAction !== request.action ? "fallback" as const : "ready" as const,
        chain: behaviorAction === request.action ? resolvedForMode.chain : [request.action, ...resolvedForMode.chain],
      }
    : null;
  if (!resolved) return { state: nextState, decision: null };

  const resting = request.persistent === "rest" ? true : request.persistent === "wake" ? false : state.resting;
  const returnTo = resting ? "sleep_loop" : request.moodLoop ?? nextState.moodLoop;
  const activeUntil = request.durationMs > 0 ? now + request.durationMs : Number.POSITIVE_INFINITY;
  nextState = {
    ...nextState,
    currentAction: resolved.resolved,
    resting,
    activePriority: request.priority,
    activeUntil,
    lastPlayedAt: { ...nextState.lastPlayedAt, [request.action]: now },
  };

  return {
    state: nextState,
    decision: {
      ...resolved,
      priority: request.priority,
      durationMs: request.durationMs,
      returnTo,
      ...(request.sideEffect ? { sideEffect: request.sideEffect } : {}),
    },
  };
}

export function completePetDirectorAction(state: PetDirectorState, now = Date.now()): PetDirectorState {
  const returnTo = state.resting ? "sleep_loop" : state.moodLoop;
  return {
    ...state,
    currentAction: returnTo,
    activePriority: state.resting ? directorPriority.userReaction : directorPriority.moodLoop,
    activeUntil: now,
  };
}

/** Compatibility adapter for legacy Appearance motion controls. Story/Quick Play should use PetActionId directly. */
export function rendererAction(id: PetActionId): MotionActionId {
  const map: Partial<Record<PetActionId, MotionActionId>> = {
    idle_breathe: "idle-breathe",
    blink: "blink",
    sleep_loop: "desk-nap",
    focus_loop: "idle-breathe",
    hot_loop: "tail-wag",
    overdrive_loop: "jump",
    click_purr: "blink",
    drag_dangle: "stretch",
    drop_bounce: "jump",
    token_snack: "blink",
    play_cursor: "pounce-cursor",
    run_across: "run-across",
    milestone_celebrate: "celebrate",
    level_up: "celebrate",
    daily_digest: "desk-nap",
  };
  return map[id] ?? "idle-breathe";
}
