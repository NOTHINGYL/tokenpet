export type ProviderId = "codex" | "claude" | "cursor" | "ccusage";
export type CcusageProviderId = "codex" | "claude";
export type ProviderStatus = "connected" | "idle" | "error";

export type ProviderSnapshot = {
  id: ProviderId;
  label: string;
  status: ProviderStatus;
  detail: string;
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
};

export type DailyUsagePoint = {
  date: string;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens: number;
};

export type ModelUsagePoint = {
  model: string;
  tokens: number;
  cost: number;
  share: number;
};

export type SessionUsagePoint = {
  id: string;
  directory: string;
  lastActivity: string;
  tokens: number;
  cost: number;
  model: string;
  share: number;
};

export type CostStructure = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens: number;
};

export type UsageAnalysis = {
  daily: DailyUsagePoint[];
  models: ModelUsagePoint[];
  sessions: SessionUsagePoint[];
  costStructure: CostStructure;
  activeDays: number;
  sessionCount: number;
  cacheHitRate: number;
  dailyAverageTokens: number;
  nextSevenDayForecast: number;
  nextThirtyDayForecast: number;
};

export type UsageSnapshot = {
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
  todayCost: number;
  sevenDayCost: number;
  topModel: string;
  topTool: string;
  burnRate: string;
  status: string;
  generatedAt: string;
  providers: ProviderSnapshot[];
  analysis: UsageAnalysis;
};

export type CatTypeId = "golden-british" | "ragdoll" | "silver-tabby" | "black-cat";
export type PetThemeId = "gold" | "mint" | "rose" | "sky" | "midnight" | "custom";
export type TokenBubbleId = "pill" | "compact" | "hidden" | "cost";
export type MoodLookId = "sleepy" | "focused" | "hot" | "overdrive";
export type AccessoryId = "collar" | "ribbon" | "focus-crown" | "tiny-scarf" | "halo" | "desk-mat";

export type MoodBadgeSettings = {
  showMood: boolean;
  colorByState: boolean;
  hideInFocusMode: boolean;
};

export type PetAppearanceSettings = {
  catTypeId: CatTypeId;
  themeId: PetThemeId;
  tokenBubbleId: TokenBubbleId;
  size: number;
  opacity: number;
  shadow: number;
  bubbleScale: number;
  moodId: MoodLookId;
  moodBadge: MoodBadgeSettings;
  accessoryIds: AccessoryId[];
};

export type AppSettings = {
  launchAtLogin: boolean;
  petVisible: boolean;
  alwaysOnTop: boolean;
  petTheme: PetThemeId;
  petScale: number;
  petOpacity: number;
  petAppearance: PetAppearanceSettings;
};

export type CcusageDailyRow = {
  date?: string;
  period?: string;
  totalTokens?: number;
  totalCost?: number;
  costUSD?: number;
  models?: Record<string, { totalTokens?: number }>;
  modelBreakdowns?: Array<{ modelName?: string; totalTokens?: number; inputTokens?: number; outputTokens?: number }>;
};

export type CcusageSessionRow = CcusageDailyRow & {
  directory?: string;
  lastActivity?: string;
  sessionFile?: string;
  sessionId?: string;
};

export type CcusageDailyReport = {
  daily?: CcusageDailyRow[];
  totals?: {
    totalTokens?: number;
    totalCost?: number;
    costUSD?: number;
  };
};

export type CcusageSessionReport = {
  sessions?: CcusageSessionRow[];
  totals?: CcusageDailyReport["totals"];
};

export type ProviderReport = ProviderSnapshot & {
  rows: CcusageDailyRow[];
  sessions: CcusageSessionRow[];
  topModels: Map<string, number>;
  allTimeCost: number;
  sevenDayCost: number;
  todayCost: number;
};
