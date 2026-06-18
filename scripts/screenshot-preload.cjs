const { contextBridge } = require("electron");

const daily = Array.from({ length: 42 }, (_value, index) => {
  const date = new Date("2026-06-17T00:00:00");
  date.setDate(date.getDate() - (41 - index));
  const wave = Math.sin(index / 4) * 0.35 + 0.8;
  const spike = index === 26 || index === 36 ? 2.4 : 1;
  const tokens = Math.round((index % 6 === 0 ? 2800000 : 8400000 * wave) * spike);

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

const snapshot = {
  todayTokens,
  sevenDayTokens,
  allTimeTokens: totalTokens + 642_000_000,
  todayCost: 21.25,
  sevenDayCost: 79.26,
  topModel: "gpt-5.5",
  topTool: "Codex",
  burnRate: "warm",
  status: "ready",
  generatedAt: new Date("2026-06-17T20:39:39").toISOString(),
  providers: [
    {
      id: "codex",
      label: "Codex",
      status: "connected",
      detail: "local ccusage records",
      todayTokens,
      sevenDayTokens,
      allTimeTokens: totalTokens + 642_000_000,
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
      { id: "1", directory: "quotapet", lastActivity: "2026-06-17T20:20:00", tokens: 34_500_000, cost: 31.4, model: "gpt-5.5", share: 0.26 },
      { id: "2", directory: "agent-dashboard", lastActivity: "2026-06-16T22:12:00", tokens: 25_800_000, cost: 24.1, model: "gpt-5.5", share: 0.19 },
      { id: "3", directory: "local-tools", lastActivity: "2026-06-15T18:04:00", tokens: 18_200_000, cost: 14.8, model: "gpt-5-codex", share: 0.14 },
      { id: "4", directory: "docs-site", lastActivity: "2026-06-14T13:18:00", tokens: 12_700_000, cost: 9.6, model: "gpt-5.5", share: 0.1 },
    ],
    costStructure: {
      inputTokens: Math.round(totalTokens * 0.72),
      outputTokens: Math.round(totalTokens * 0.11),
      cacheReadTokens: Math.round(totalTokens * 0.15),
      reasoningOutputTokens: Math.round(totalTokens * 0.02),
    },
    activeDays: 31,
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
};

contextBridge.exposeInMainWorld("quotapet", {
  getUsageSnapshot: () => Promise.resolve(snapshot),
  refreshUsageSnapshot: () => Promise.resolve(snapshot),
  getAppSettings: () => Promise.resolve(settings),
  setAppSetting: (key, value) => {
    settings[key] = value;
    return Promise.resolve(settings);
  },
  openConsole: () => undefined,
  quit: () => undefined,
  togglePopover: () => undefined,
  startDrag: () => Promise.resolve({ started: true }),
  endDrag: () => Promise.resolve({ moved: false }),
  close: () => undefined,
});
