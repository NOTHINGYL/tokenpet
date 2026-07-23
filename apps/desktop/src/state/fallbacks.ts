import type { AppSettings, UsageSnapshot } from "../types";
import { defaultPetAppearance } from "../features/pet-appearance/appearanceState";
import { defaultPetStory } from "../features/pet-story/PetDirector";

export const fallbackUsage: UsageSnapshot = {
  todayTokens: 0,
  sevenDayTokens: 0,
  allTimeTokens: 0,
  todayCost: 0,
  sevenDayCost: 0,
  topModel: "Checking local usage",
  topTool: "Local sources",
  burnRate: "quiet",
  status: "loading",
  generatedAt: new Date(0).toISOString(),
  providers: [
    {
      id: "codex",
      label: "Codex",
      status: "idle",
      detail: "checking ccusage",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
    {
      id: "claude",
      label: "Claude Code",
      status: "idle",
      detail: "checking ccusage",
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
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
  ],
  analysis: {
    daily: [],
    models: [],
    sessions: [],
    costStructure: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      reasoningOutputTokens: 0,
    },
    activeDays: 0,
    sessionCount: 0,
    cacheHitRate: 0,
    dailyAverageTokens: 0,
    nextSevenDayForecast: 0,
    nextThirtyDayForecast: 0,
  },
};

export const fallbackSettings: AppSettings = {
  launchAtLogin: false,
  petVisible: true,
  alwaysOnTop: true,
  petTheme: "gold",
  petScale: 1,
  petOpacity: 1,
  petAppearance: defaultPetAppearance,
  petStory: defaultPetStory,
};
