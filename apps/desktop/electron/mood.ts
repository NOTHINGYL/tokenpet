import type {
  MoodControlsSettings,
  MoodLookId,
  MoodPresentationSettings,
  MoodSignalWindow,
  MoodThresholdProfile,
  UsageSnapshot,
} from "./types.js";

export const moodSignalWindows: MoodSignalWindow[] = ["live", "today", "last7Days"];
export const moodLookIds: MoodLookId[] = ["sleepy", "focused", "hot", "overdrive"];

export const defaultMoodThresholdProfiles: Record<MoodSignalWindow, MoodThresholdProfile> = {
  live: { focused: 50_000, hot: 1_000_000, overdrive: 10_000_000 },
  today: { focused: 1_000_000, hot: 20_000_000, overdrive: 100_000_000 },
  last7Days: { focused: 10_000_000, hot: 100_000_000, overdrive: 500_000_000 },
};

export const defaultMoodPreviewValues: Record<MoodSignalWindow, number> = {
  live: 5_000_000,
  today: 50_000_000,
  last7Days: 250_000_000,
};

export const defaultMoodPresentation: Record<MoodLookId, MoodPresentationSettings> = {
  sleepy: { actorLoop: "sleep_loop", badgeVisible: true, badgeColor: "#2878e3" },
  focused: { actorLoop: "focus_loop", badgeVisible: true, badgeColor: "#18a33c" },
  hot: { actorLoop: "hot_loop", badgeVisible: true, badgeColor: "#ff5a1f" },
  overdrive: { actorLoop: "overdrive_loop", badgeVisible: true, badgeColor: "#f21f2d" },
};

const legacyDefaultBadgeColors: Record<MoodLookId, string> = {
  sleepy: "#4b7fc5",
  focused: "#219a5b",
  hot: "#d98312",
  overdrive: "#cf3f3f",
};

export const defaultMoodControls: MoodControlsSettings = {
  badgeVisible: true,
  badgeStyle: "iconLabel",
  entryPulse: true,
};

const spans: Record<MoodSignalWindow, { min: number; max: number }> = {
  live: { min: 10_000, max: 100_000_000 },
  today: { min: 100_000, max: 1_000_000_000 },
  last7Days: { min: 1_000_000, max: 10_000_000_000 },
};

function numberOr(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function moodThresholdSpan(window: MoodSignalWindow) {
  return { ...spans[window] };
}

export function normalizeMoodThresholdProfile(
  value: Partial<MoodThresholdProfile> | null | undefined,
  window: MoodSignalWindow,
): MoodThresholdProfile {
  const defaults = defaultMoodThresholdProfiles[window];
  const { min, max } = spans[window];
  const focused = clamp(Math.round(numberOr(value?.focused, defaults.focused)), min, max / 4);
  const hot = clamp(Math.round(numberOr(value?.hot, defaults.hot)), focused * 2, max / 2);
  const overdrive = clamp(Math.round(numberOr(value?.overdrive, defaults.overdrive)), hot * 2, max);
  return { focused, hot, overdrive };
}

export function updateMoodThreshold(
  profileValue: MoodThresholdProfile,
  window: MoodSignalWindow,
  mood: Exclude<MoodLookId, "sleepy">,
  value: number,
) {
  const profile = normalizeMoodThresholdProfile(profileValue, window);
  const { min, max } = spans[window];
  if (mood === "focused") return { ...profile, focused: Math.round(clamp(value, min, profile.hot / 2)) };
  if (mood === "hot") return { ...profile, hot: Math.round(clamp(value, profile.focused * 2, profile.overdrive / 2)) };
  return { ...profile, overdrive: Math.round(clamp(value, profile.hot * 2, max)) };
}

export function moodThresholdToLogRatio(value: number, window: MoodSignalWindow) {
  if (value <= 0) return 0;
  const { min, max } = spans[window];
  const positive = clamp(numberOr(value, min), min, max);
  return (Math.log10(positive) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
}

export function moodThresholdFromLogRatio(ratio: number, window: MoodSignalWindow) {
  const { min, max } = spans[window];
  const bounded = clamp(numberOr(ratio, 0), 0, 1);
  return Math.round(10 ** (Math.log10(min) + bounded * (Math.log10(max) - Math.log10(min))));
}

export function moodSignalFromUsage(usage: UsageSnapshot, window: MoodSignalWindow) {
  if (window === "live") {
    return Math.max(0, numberOr(usage.liveOneHourTokens ?? usage.liveFiveMinuteTokens, 0));
  }
  if (window === "today") return Math.max(0, numberOr(usage.todayTokens, 0));
  return Math.max(0, numberOr(usage.sevenDayTokens, 0));
}

export function resolveMood(value: number, thresholds: MoodThresholdProfile): MoodLookId {
  const signal = Math.max(0, numberOr(value, 0));
  if (signal >= thresholds.overdrive) return "overdrive";
  if (signal >= thresholds.hot) return "hot";
  if (signal >= thresholds.focused) return "focused";
  return "sleepy";
}

const rank: Record<MoodLookId, number> = { sleepy: 0, focused: 1, hot: 2, overdrive: 3 };

function entryThreshold(mood: MoodLookId, thresholds: MoodThresholdProfile) {
  if (mood === "focused") return thresholds.focused;
  if (mood === "hot") return thresholds.hot;
  if (mood === "overdrive") return thresholds.overdrive;
  return 0;
}

export type MoodStabilizerState = {
  currentMood: MoodLookId;
  upwardCandidate: MoodLookId | null;
  upwardCandidateSince: number | null;
  belowCurrentSince: number | null;
  overdriveCooldownUntil: number;
};

export function createMoodStabilizerState(mood: MoodLookId = "sleepy", now = 0): MoodStabilizerState {
  return {
    currentMood: mood,
    upwardCandidate: null,
    upwardCandidateSince: null,
    belowCurrentSince: null,
    overdriveCooldownUntil: mood === "overdrive" ? now : 0,
  };
}

export function stabilizeMood(
  previous: MoodStabilizerState,
  signalValue: number,
  thresholds: MoodThresholdProfile,
  now = Date.now(),
) {
  const signal = Math.max(0, numberOr(signalValue, 0));
  const rawMood = resolveMood(signal, thresholds);
  let candidate = rawMood;
  const state = { ...previous };
  let changed = false;

  if (candidate === "overdrive" && now < state.overdriveCooldownUntil && state.currentMood !== "overdrive") candidate = "hot";

  if (rank[candidate] > rank[state.currentMood]) {
    if (state.upwardCandidate !== candidate) {
      state.upwardCandidate = candidate;
      state.upwardCandidateSince = now;
    } else if (state.upwardCandidateSince !== null && now - state.upwardCandidateSince >= 2_000) {
      state.currentMood = candidate;
      state.upwardCandidate = null;
      state.upwardCandidateSince = null;
      state.belowCurrentSince = null;
      changed = true;
    }
    state.belowCurrentSince = null;
  } else if (rank[candidate] < rank[state.currentMood]) {
    state.upwardCandidate = null;
    state.upwardCandidateSince = null;
    if (signal < entryThreshold(state.currentMood, thresholds) * 0.85) {
      state.belowCurrentSince ??= now;
      if (now - state.belowCurrentSince >= 5_000) {
        const leavingOverdrive = state.currentMood === "overdrive";
        state.currentMood = candidate;
        state.belowCurrentSince = null;
        if (leavingOverdrive) state.overdriveCooldownUntil = now + 30_000;
        changed = true;
      }
    } else {
      state.belowCurrentSince = null;
    }
  } else {
    state.upwardCandidate = null;
    state.upwardCandidateSince = null;
    state.belowCurrentSince = null;
  }

  return { state, mood: state.currentMood, changed, rawMood };
}

const safeColor = /^#[0-9a-f]{6}$/i;

export function normalizeMoodPresentation(
  value: Partial<Record<MoodLookId, Partial<MoodPresentationSettings>>> | null | undefined,
): Record<MoodLookId, MoodPresentationSettings> {
  return Object.fromEntries(moodLookIds.map((mood) => {
    const defaults = defaultMoodPresentation[mood];
    const source = value?.[mood];
    const sourceColor = typeof source?.badgeColor === "string" ? source.badgeColor.toLowerCase() : "";
    return [mood, {
      // The mapping is immutable; normalize legacy editable values so the
      // persisted badge state can never disagree with the rendered pose.
      actorLoop: defaults.actorLoop,
      badgeVisible: source?.badgeVisible !== false,
      badgeColor: sourceColor === legacyDefaultBadgeColors[mood]
        ? defaults.badgeColor
        : typeof source?.badgeColor === "string" && safeColor.test(source.badgeColor)
          ? source.badgeColor
        : defaults.badgeColor,
    }];
  })) as Record<MoodLookId, MoodPresentationSettings>;
}

export function normalizeMoodControls(
  value: Partial<MoodControlsSettings> | null | undefined,
): MoodControlsSettings {
  return {
    badgeVisible: value?.badgeVisible !== false,
    badgeStyle: value?.badgeStyle === "iconOnly" ? "iconOnly" : "iconLabel",
    entryPulse: value?.entryPulse !== false,
  };
}
