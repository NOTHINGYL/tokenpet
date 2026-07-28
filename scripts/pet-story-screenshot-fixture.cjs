const daily = Array.from({ length: 42 }, (_value, index) => {
  const date = new Date("2026-07-09T00:00:00");
  date.setDate(date.getDate() - (41 - index));
  const wave = Math.sin(index / 4) * 0.28 + 0.86;
  const spike = index === 26 || index === 36 ? 1.9 : 1;
  const tokens = index === 41 ? 750_000 : Math.round((index % 6 === 0 ? 2_800_000 : 9_600_000 * wave) * spike);

  return {
    date: date.toISOString().slice(0, 10),
    tokens,
    cost: tokens * 0.00000083,
    inputTokens: Math.round(tokens * 0.72),
    outputTokens: Math.round(tokens * 0.11),
    cacheReadTokens: Math.round(tokens * 0.15),
    reasoningOutputTokens: Math.round(tokens * 0.02),
  };
});

const totalTokens = daily.reduce((sum, point) => sum + point.tokens, 0);
const sevenDayTokens = daily.slice(-7).reduce((sum, point) => sum + point.tokens, 0);
const todayTokens = daily.at(-1).tokens;
const allTimeTokens = 297_500_000;

const snapshot = {
  liveOneHourTokens: 5_000_000,
  todayTokens,
  sevenDayTokens,
  allTimeTokens,
  todayCost: 0.62,
  sevenDayCost: 51.04,
  topModel: "gpt-5.5",
  topTool: "Codex",
  burnRate: "steady",
  status: "ready",
  generatedAt: new Date("2026-07-09T19:47:18-07:00").toISOString(),
  providers: [
    {
      id: "codex",
      label: "Codex",
      status: "connected",
      detail: "synthetic local demo fixture",
      todayTokens,
      sevenDayTokens,
      allTimeTokens,
    },
    {
      id: "claude",
      label: "Claude Code",
      status: "idle",
      detail: "no local usage found",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
    {
      id: "cursor",
      label: "Cursor",
      status: "idle",
      detail: "local adapter planned",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
    {
      id: "ccusage",
      label: "ccusage",
      status: "connected",
      detail: "bundled npm dependency",
      todayTokens,
      sevenDayTokens,
      allTimeTokens: totalTokens,
    },
  ],
  analysis: {
    daily,
    models: [
      { model: "gpt-5.5", tokens: Math.round(totalTokens * 0.74), cost: 386.4, share: 0.74 },
      { model: "gpt-5-codex", tokens: Math.round(totalTokens * 0.18), cost: 96.2, share: 0.18 },
      { model: "gpt-4.1", tokens: Math.round(totalTokens * 0.08), cost: 42.7, share: 0.08 },
    ],
    sessions: [
      { id: "1", directory: "tokenpet-demo", lastActivity: "2026-07-09T19:20:00-07:00", tokens: 34_500_000, cost: 31.4, model: "gpt-5.5", share: 0.26 },
      { id: "2", directory: "agent-dashboard-demo", lastActivity: "2026-07-08T22:12:00-07:00", tokens: 25_800_000, cost: 24.1, model: "gpt-5.5", share: 0.19 },
      { id: "3", directory: "local-tools-demo", lastActivity: "2026-07-07T18:04:00-07:00", tokens: 18_200_000, cost: 14.8, model: "gpt-5-codex", share: 0.14 },
      { id: "4", directory: "docs-site-demo", lastActivity: "2026-07-06T13:18:00-07:00", tokens: 12_700_000, cost: 9.6, model: "gpt-5.5", share: 0.1 },
    ],
    costStructure: {
      inputTokens: Math.round(totalTokens * 0.72),
      outputTokens: Math.round(totalTokens * 0.11),
      cacheReadTokens: Math.round(totalTokens * 0.15),
      reasoningOutputTokens: Math.round(totalTokens * 0.02),
    },
    activeDays: 12,
    sessionCount: 48,
    cacheHitRate: 0.17,
    dailyAverageTokens: Math.round(totalTokens / 31),
    nextSevenDayForecast: 87_300_000,
    nextThirtyDayForecast: 284_000_000,
  },
};

const settings = {
  launchAtLogin: false,
  petVisible: true,
  alwaysOnTop: true,
  petTheme: "gold",
  petScale: 0.92,
  petOpacity: 1,
  petStory: {
    behaviorMode: "balanced",
    moodThresholds: { focused: 50_000, hot: 1_000_000, overdrive: 10_000_000 },
    moodSignalWindow: "live",
    moodThresholdProfiles: {
      live: { focused: 50_000, hot: 1_000_000, overdrive: 10_000_000 },
      today: { focused: 1_000_000, hot: 20_000_000, overdrive: 100_000_000 },
      last7Days: { focused: 10_000_000, hot: 100_000_000, overdrive: 500_000_000 },
    },
    moodPreviewValues: {
      live: 5_000_000,
      today: 50_000_000,
      last7Days: 250_000_000,
    },
    moodPresentation: {
      sleepy: { actorLoop: "sleep_loop", badgeVisible: true, badgeColor: "#2878e3" },
      focused: { actorLoop: "focus_loop", badgeVisible: true, badgeColor: "#18a33c" },
      hot: { actorLoop: "hot_loop", badgeVisible: true, badgeColor: "#ff5a1f" },
      overdrive: { actorLoop: "overdrive_loop", badgeVisible: true, badgeColor: "#f21f2d" },
    },
    moodControls: { badgeVisible: true, badgeStyle: "iconLabel", entryPulse: true },
    quietMode: false,
    followCursor: false,
    lockPosition: false,
    reduceMotion: false,
    soundEnabled: true,
    soundStyle: "soft",
    volume: 70,
    cueIds: ["wake", "purr", "drop", "snack", "milestone", "hot", "rest"],
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
    journey: {
      schemaVersion: 1,
      stage: "flowCompanion",
      milestoneIds: ["first-source", "first-token", "first-million", "seven-active-days", "fifty-million"],
      memories: [
        { id: "milestone:first-source", kind: "firstSource", title: "First source connected", message: "Your first local token source woke the companion.", createdAt: "2026-06-27T10:00:00.000Z", tokens: 1200 },
        { id: "milestone:first-million", kind: "milestone", title: "Desk Buddy", message: "One million local tokens grew a steady desk companion.", createdAt: "2026-07-01T10:00:00.000Z", tokens: 1_000_000 },
        { id: "milestone:seven-active-days", kind: "milestone", title: "A cozy week", message: "Seven active local days unlocked a cozier rhythm.", createdAt: "2026-07-06T10:00:00.000Z", tokens: 120_000_000 },
      ],
      firstSeenAt: "2026-06-27T10:00:00.000Z",
      lastSeenAt: "2026-07-09T19:47:18.000Z",
      lastUsageTokens: allTimeTokens,
      activeDays: 12,
      lastDigestDate: null,
    },
  },
};

module.exports = { settings, snapshot };
