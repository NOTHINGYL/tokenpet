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

export type ProviderSnapshot = {
  id: "codex" | "claude" | "cursor" | "ccusage";
  label: string;
  status: "connected" | "idle" | "error";
  detail: string;
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
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

export type ConsoleTab = "overview" | "breakdown" | "cost" | "pet" | "settings";

export type TokenPetBridge = {
  getUsageSnapshot: () => Promise<UsageSnapshot>;
  refreshUsageSnapshot: () => Promise<UsageSnapshot>;
  getAppSettings: () => Promise<AppSettings>;
  setAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<AppSettings>;
  onAppSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
  openConsole: () => void;
  quit: () => void;
  togglePopover: () => void;
  startDrag: () => Promise<{ started: boolean }>;
  endDrag: () => Promise<{ moved: boolean }>;
  close: () => void;
};
