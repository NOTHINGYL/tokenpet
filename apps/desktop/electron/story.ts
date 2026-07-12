import type {
  PetActionId,
  PetDirectorEvent,
  PetJourneyState,
  PetLifeStage,
  PetMemory,
  PetStorySettings,
  UsageSnapshot,
} from "./types.js";

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

const lifeStages: PetLifeStage[] = ["egg", "newKitten", "deskBuddy", "flowCompanion", "guardianCompanion"];
const actionIds: PetActionId[] = [
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
  "milestone_celebrate",
  "level_up",
  "daily_digest",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "settle_down",
  "focus_start",
  "cool_down",
  "summon_to_screen",
  "capture_moment",
];

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.min(Math.max(next, min), max) : fallback;
}

function uniqueStrings(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback;
  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

function normalizeMemories(value: unknown): PetMemory[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((memory): memory is PetMemory => {
      if (!memory || typeof memory !== "object") return false;
      const candidate = memory as Partial<PetMemory>;
      return typeof candidate.id === "string" && typeof candidate.title === "string" && typeof candidate.message === "string" && typeof candidate.createdAt === "string";
    })
    .slice(-40);
}

export function normalizePetStory(value: unknown): PetStorySettings {
  const source = value && typeof value === "object" ? (value as Partial<PetStorySettings>) : {};
  const storedThresholds = source.moodThresholds;
  const usesLegacyDefaults = storedThresholds?.focused === 1_000
    && storedThresholds.hot === 10_000
    && storedThresholds.overdrive === 50_000;
  const thresholdSource = !storedThresholds || usesLegacyDefaults ? defaultPetStory.moodThresholds : storedThresholds;
  const maxThreshold = Number.MAX_SAFE_INTEGER;
  const focused = clamp(thresholdSource.focused, 0, maxThreshold - 2, defaultPetStory.moodThresholds.focused);
  const hot = clamp(thresholdSource.hot, focused + 1, maxThreshold - 1, Math.max(defaultPetStory.moodThresholds.hot, focused + 1));
  const overdrive = clamp(
    thresholdSource.overdrive,
    hot + 1,
    maxThreshold,
    Math.max(defaultPetStory.moodThresholds.overdrive, hot + 1),
  );
  const journeySource = source.journey && typeof source.journey === "object" ? source.journey : defaultJourneyState;
  const stage = lifeStages.includes(journeySource.stage) ? journeySource.stage : defaultJourneyState.stage;
  const pinnedStage = source.pinnedStage && lifeStages.includes(source.pinnedStage) ? source.pinnedStage : null;
  const lastAction =
    source.lastAction && actionIds.includes(source.lastAction.id) && Number.isFinite(source.lastAction.nonce)
      ? { id: source.lastAction.id, nonce: source.lastAction.nonce }
      : null;
  const cueVolumeSource = source.cueVolumes ?? defaultPetStory.cueVolumes;
  const interactionSource = source.interactionRules ?? defaultPetStory.interactionRules;
  const safetySource = source.safety ?? defaultPetStory.safety;
  const reactionSource = source.reactionRules ?? defaultPetStory.reactionRules;
  const companionSource = source.companionSettings ?? defaultPetStory.companionSettings;
  const actionSettingsSource = source.actionSettings?.byAction && typeof source.actionSettings.byAction === "object"
    ? source.actionSettings.byAction
    : {};
  const previewActionIds = new Set(["walk_round_trip", "token_snack", "play_cursor", "drag_dangle", "toss_yarn", "nap_here", "wake_up", "summon_to_pointer"]);
  const actionSettingsByAction = Object.fromEntries(Object.entries(actionSettingsSource).flatMap(([actionId, values]) => {
    if (!previewActionIds.has(actionId) || !values || typeof values !== "object") return [];
    const safeValues = Object.fromEntries(Object.entries(values).filter(([, settingValue]) => ["string", "number", "boolean"].includes(typeof settingValue)));
    return [[actionId, safeValues]];
  })) as PetStorySettings["actionSettings"]["byAction"];

  return {
    behaviorMode: ["gentle", "balanced", "playful", "focusFriendly"].includes(source.behaviorMode ?? "")
      ? source.behaviorMode!
      : defaultPetStory.behaviorMode,
    moodThresholds: { focused, hot, overdrive },
    quietMode: Boolean(source.quietMode),
    followCursor: Boolean(source.followCursor),
    lockPosition: Boolean(source.lockPosition),
    reduceMotion: Boolean(source.reduceMotion),
    soundEnabled: Boolean(source.soundEnabled),
    soundStyle: ["soft", "cozy", "playful"].includes(source.soundStyle ?? "") ? source.soundStyle! : defaultPetStory.soundStyle,
    volume: clamp(source.volume, 0, 100, defaultPetStory.volume),
    cueIds: uniqueStrings(source.cueIds, defaultPetStory.cueIds),
    cueVolumes: {
      wake: clamp(cueVolumeSource.wake, 0, 100, defaultPetStory.cueVolumes.wake),
      purr: clamp(cueVolumeSource.purr, 0, 100, defaultPetStory.cueVolumes.purr),
      drop: clamp(cueVolumeSource.drop, 0, 100, defaultPetStory.cueVolumes.drop),
      snack: clamp(cueVolumeSource.snack, 0, 100, defaultPetStory.cueVolumes.snack),
      milestone: clamp(cueVolumeSource.milestone, 0, 100, defaultPetStory.cueVolumes.milestone),
      hot: clamp(cueVolumeSource.hot, 0, 100, defaultPetStory.cueVolumes.hot),
      rest: clamp(cueVolumeSource.rest, 0, 100, defaultPetStory.cueVolumes.rest),
    },
    interactionRules: {
      click: interactionSource.click !== false,
      drag: interactionSource.drag !== false,
      drop: interactionSource.drop !== false,
      feed: interactionSource.feed !== false,
      cursor: interactionSource.cursor !== false,
    },
    safety: {
      batteryLowPause: safetySource.batteryLowPause !== false,
      muteDuringFocus: safetySource.muteDuringFocus !== false,
      quietHoursEnabled: safetySource.quietHoursEnabled !== false,
      quietHoursStart: typeof safetySource.quietHoursStart === "string" ? safetySource.quietHoursStart : defaultPetStory.safety.quietHoursStart,
      quietHoursEnd: typeof safetySource.quietHoursEnd === "string" ? safetySource.quietHoursEnd : defaultPetStory.safety.quietHoursEnd,
      screenSharingStillness: safetySource.screenSharingStillness !== false,
      respectSystemVolume: safetySource.respectSystemVolume !== false,
    },
    reactionRules: {
      oneShotOnThreshold: reactionSource.oneShotOnThreshold !== false,
      coolDownAfterOverdrive: reactionSource.coolDownAfterOverdrive !== false,
    },
    companionSettings: {
      // The top-bar companion is part of the permanent product identity. Keep
      // the stored field for schema compatibility, but migrate legacy false
      // values back to visible.
      keepTinyMenuForm: true,
      showMemoryCards: companionSource.showMemoryCards !== false,
      celebrateMilestones: companionSource.celebrateMilestones !== false,
    },
    actionSettings: { schemaVersion: 1, byAction: actionSettingsByAction },
    pinnedStage,
    lastAction,
    journey: {
      schemaVersion: 1,
      stage,
      milestoneIds: uniqueStrings(journeySource.milestoneIds),
      memories: normalizeMemories(journeySource.memories),
      firstSeenAt: typeof journeySource.firstSeenAt === "string" ? journeySource.firstSeenAt : null,
      lastSeenAt: typeof journeySource.lastSeenAt === "string" ? journeySource.lastSeenAt : null,
      lastUsageTokens: clamp(journeySource.lastUsageTokens, 0, Number.MAX_SAFE_INTEGER, 0),
      activeDays: clamp(journeySource.activeDays, 0, Number.MAX_SAFE_INTEGER, 0),
      lastDigestDate: typeof journeySource.lastDigestDate === "string" ? journeySource.lastDigestDate : null,
    },
  };
}

export function lifecycleFromUsage(usage: UsageSnapshot): PetLifeStage {
  const hasSource = usage.providers.some((provider) => provider.id !== "ccusage" && provider.status === "connected") || usage.allTimeTokens > 0;
  if (!hasSource && usage.allTimeTokens === 0) return "egg";
  if (usage.allTimeTokens >= 500_000_000 || usage.analysis.activeDays >= 30) return "guardianCompanion";
  if (usage.allTimeTokens >= 50_000_000 || usage.analysis.activeDays >= 7) return "flowCompanion";
  if (usage.allTimeTokens >= 1_000_000) return "deskBuddy";
  return "newKitten";
}

type MilestoneDefinition = {
  id: string;
  title: string;
  message: string;
  reached: (usage: UsageSnapshot) => boolean;
};

const milestones: MilestoneDefinition[] = [
  { id: "first-source", title: "First source connected", message: "Your first local token source woke the companion.", reached: (usage) => usage.providers.some((provider) => provider.id !== "ccusage" && provider.status === "connected") },
  { id: "first-token", title: "First token flow", message: "Local token flow became a little warmth.", reached: (usage) => usage.allTimeTokens > 0 },
  { id: "first-million", title: "Desk Buddy", message: "One million local tokens grew a steady desk companion.", reached: (usage) => usage.allTimeTokens >= 1_000_000 },
  { id: "seven-active-days", title: "A cozy week", message: "Seven active local days unlocked a cozier rhythm.", reached: (usage) => usage.analysis.activeDays >= 7 },
  { id: "fifty-million", title: "Flow Companion", message: "Fifty million local tokens made the companion more responsive.", reached: (usage) => usage.allTimeTokens >= 50_000_000 },
  { id: "thirty-active-days", title: "A trusted month", message: "Thirty active local days built a quiet bond.", reached: (usage) => usage.analysis.activeDays >= 30 },
  { id: "guardian", title: "Guardian Companion", message: "A long local journey unlocked the guardian stage.", reached: (usage) => usage.allTimeTokens >= 500_000_000 },
];

function memoryForMilestone(definition: MilestoneDefinition, usage: UsageSnapshot, now: string): PetMemory {
  return {
    id: `milestone:${definition.id}`,
    kind: definition.id === "first-source" ? "firstSource" : "milestone",
    title: definition.title,
    message: definition.message,
    createdAt: now,
    tokens: usage.allTimeTokens,
  };
}

export function reconcilePetStory(storyValue: unknown, usage: UsageSnapshot, now = new Date().toISOString()) {
  const story = normalizePetStory(storyValue);
  const previous = story.journey;
  const firstObservation = previous.firstSeenAt === null;
  const stage = lifecycleFromUsage(usage);
  const reached = milestones.filter((definition) => definition.reached(usage));
  const newlyReached = reached.filter((definition) => !previous.milestoneIds.includes(definition.id));
  const milestoneIds = [...new Set([...previous.milestoneIds, ...reached.map((definition) => definition.id)])];
  const memories = [...previous.memories, ...newlyReached.map((definition) => memoryForMilestone(definition, usage, now))];
  const events: PetDirectorEvent[] = [];

  if (previous.lastUsageTokens > 0 && usage.allTimeTokens > previous.lastUsageTokens) {
    const burnRate = usage.burnRate.includes("overdrive") || usage.todayTokens >= story.moodThresholds.overdrive
      ? "overdrive"
      : usage.burnRate.includes("hot") || usage.todayTokens >= story.moodThresholds.hot
        ? "hot"
        : usage.todayTokens >= story.moodThresholds.focused || usage.burnRate.includes("steady") || usage.burnRate.includes("warm")
          ? "steady"
          : "quiet";
    events.push({ type: "token.delta", tokens: usage.allTimeTokens - previous.lastUsageTokens, burnRate });
  }

  if (newlyReached.length) {
    const milestone = firstObservation ? newlyReached[0] : newlyReached.at(-1)!;
    events.push({ type: "milestone.reached", milestone: milestone.id });
  }

  if (!firstObservation && previous.stage !== stage) {
    memories.push({
      id: `stage:${stage}:${now}`,
      kind: "stage",
      title: stage.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()),
      message: "Your companion grew naturally through local use.",
      createdAt: now,
      tokens: usage.allTimeTokens,
      stage,
    });
    events.push({ type: "lifecycle.stageChanged", stage });
  }

  const today = now.slice(0, 10);
  const previousDay = previous.lastSeenAt?.slice(0, 10) ?? null;
  let lastDigestDate = previous.lastDigestDate;
  if (previousDay && previousDay !== today && previous.lastDigestDate !== previousDay) {
    memories.push({
      id: `digest:${previousDay}`,
      kind: "dailyDigest",
      title: "A local day together",
      message: "I kept you company while you focused. This memory stayed on your machine.",
      createdAt: now,
      tokens: previous.lastUsageTokens,
      stage: previous.stage,
    });
    lastDigestDate = previousDay;
    events.push({ type: "day.digestReady" });
  }

  const journey: PetJourneyState = {
    schemaVersion: 1,
    stage,
    milestoneIds,
    memories: memories.slice(-40),
    firstSeenAt: previous.firstSeenAt ?? now,
    lastSeenAt: now,
    lastUsageTokens: Math.max(usage.allTimeTokens, 0),
    activeDays: Math.max(previous.activeDays, usage.analysis.activeDays),
    lastDigestDate,
  };

  const nextStory: PetStorySettings = { ...story, journey };
  return { story: nextStory, events, changed: JSON.stringify(nextStory) !== JSON.stringify(story) };
}
