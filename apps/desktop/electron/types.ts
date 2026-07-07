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

export type CatTypeId =
  | "golden-british"
  | "ragdoll"
  | "silver-tabby"
  | "black-cat"
  | "calico"
  | "siamese"
  | "maine-coon"
  | "white-cat"
  | "orange-tabby"
  | "tuxedo"
  | "scottish-fold"
  | "bengal"
  | "persian"
  | "russian-blue"
  | "sphynx";
export type PetThemeId = "gold" | "mint" | "rose" | "sky" | "midnight" | "custom";
export type TokenBubbleId = "pill" | "compact" | "hidden" | "cost";
export type TokenFrameId = "embedded" | "pillow" | "compact" | "cost" | "floating" | "hidden";
export type MoodLookId = "sleepy" | "focused" | "hot" | "overdrive";
export type MotionModeId = "calm" | "balanced" | "playful" | "energetic";
export type MotionActionId =
  | "idle-breathe"
  | "tail-wag"
  | "blink"
  | "stretch"
  | "run-across"
  | "jump"
  | "desk-nap"
  | "celebrate"
  | "pounce-cursor"
  | "edge-peek";
export type AccessoryId =
  | "collar"
  | "ribbon"
  | "bow-tie"
  | "tiny-scarf"
  | "bandana"
  | "focus-crown"
  | "halo"
  | "study-glasses"
  | "sleep-cap"
  | "desk-mat"
  | "nap-pillow"
  | "cloud-cushion"
  | "token-stand"
  | "sparkle-aura"
  | "star-trail"
  | "leaf-drift"
  | "hot-sparks";
export type CatEyeColor = "gold" | "green" | "blue" | "slate";
export type AccessoryChoiceId = AccessoryId | "none";
export type AccessoryColorId = "cream" | "mint" | "sky" | "violet" | "rose" | "rainbow";
export type AccessoryPosition = "embedded" | "below" | "floating";

export type CatBreedDetails = {
  furLength: number;
  eyeColor: CatEyeColor;
  patternIntensity: number;
};

export type MoodBadgeSettings = {
  showMood: boolean;
  colorByState: boolean;
  hideInFocusMode: boolean;
};

export type AccessorySettings = {
  tokenFrameId: TokenFrameId;
  neckId: AccessoryChoiceId;
  headId: AccessoryChoiceId;
  baseId: AccessoryChoiceId;
  effectId: AccessoryChoiceId;
  colorId: AccessoryColorId;
  scale: number;
  position: AccessoryPosition;
  textOnlyFrame: boolean;
  moodVisibility: Record<MoodLookId, boolean>;
};

export type MotionSettings = {
  modeId: MotionModeId;
  actionId: MotionActionId;
  animationSpeed: number;
  motionEnergy: number;
  jumpHeight: number;
  roamingDistance: number;
  cursorSensitivity: number;
  desktopRoaming: {
    edgeRoaming: boolean;
    rememberPosition: boolean;
    avoidMenuBar: boolean;
    avoidFocusedWindow: boolean;
    multiScreenTravel: boolean;
    snapBackHome: boolean;
  };
  triggers: {
    tokenSpike: boolean;
    milestoneReached: boolean;
    idleBreak: boolean;
    workSessionStart: boolean;
    hotState: boolean;
    overdriveState: boolean;
  };
  safety: {
    reduceMotion: boolean;
    disableSuddenJumps: boolean;
    pauseDuringTyping: boolean;
    quietHoursMotion: boolean;
    screenSharingStillness: boolean;
  };
  quietHours: {
    start: string;
    end: string;
  };
};

export type PetAppearanceSettings = {
  catTypeId: CatTypeId;
  catDetails: CatBreedDetails;
  themeId: PetThemeId;
  tokenBubbleId: TokenBubbleId;
  size: number;
  opacity: number;
  shadow: number;
  bubbleScale: number;
  moodId: MoodLookId;
  moodBadge: MoodBadgeSettings;
  accessoryIds: AccessoryId[];
  accessorySettings: AccessorySettings;
  motionSettings: MotionSettings;
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
