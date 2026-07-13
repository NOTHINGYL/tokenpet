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
  petStory: PetStorySettings;
};

export type PetActionId =
  | "idle_breathe" | "blink" | "sleep_loop" | "focus_loop" | "hot_loop" | "overdrive_loop"
  | "hatch" | "click_purr" | "drag_dangle" | "drop_bounce" | "token_snack" | "play_cursor"
  | "run_across" | "milestone_celebrate" | "level_up" | "daily_digest" | "toss_yarn" | "nap_here" | "wake_up"
  | "settle_down" | "focus_start" | "cool_down" | "walk_round_trip" | "summon_to_screen" | "summon_to_pointer" | "capture_moment";
export type PetLifeStage = "egg" | "newKitten" | "deskBuddy" | "flowCompanion" | "guardianCompanion";
export type PetBehaviorMode = "gentle" | "balanced" | "playful" | "focusFriendly";
export type PetMemoryKind = "firstSource" | "milestone" | "stage" | "dailyDigest";
export type PetMemory = {
  id: string;
  kind: PetMemoryKind;
  title: string;
  message: string;
  createdAt: string;
  tokens?: number;
  stage?: PetLifeStage;
};
export type PetJourneyState = {
  schemaVersion: 1;
  stage: PetLifeStage;
  milestoneIds: string[];
  memories: PetMemory[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastUsageTokens: number;
  activeDays: number;
  lastDigestDate: string | null;
};
export type PetActionTuningValue = string | number | boolean;
export type PetActionSettingsStore = {
  schemaVersion: 1;
  byAction: Partial<Record<Exclude<QuickPlayActionId, "capture_moment">, Record<string, PetActionTuningValue>>>;
};
export type PetStorySettings = {
  behaviorMode: PetBehaviorMode;
  moodThresholds: { focused: number; hot: number; overdrive: number };
  quietMode: boolean;
  followCursor: boolean;
  lockPosition: boolean;
  reduceMotion: boolean;
  soundEnabled: boolean;
  soundStyle: "soft" | "cozy" | "playful";
  volume: number;
  cueIds: string[];
  cueVolumes: Record<"wake" | "purr" | "drop" | "snack" | "milestone" | "hot" | "rest", number>;
  interactionRules: { click: boolean; drag: boolean; drop: boolean; feed: boolean; cursor: boolean };
  safety: {
    batteryLowPause: boolean;
    muteDuringFocus: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    screenSharingStillness: boolean;
    respectSystemVolume: boolean;
  };
  reactionRules: { oneShotOnThreshold: boolean; coolDownAfterOverdrive: boolean };
  companionSettings: { keepTinyMenuForm: boolean; showMemoryCards: boolean; celebrateMilestones: boolean };
  actionSettings: PetActionSettingsStore;
  pinnedStage: PetLifeStage | null;
  lastAction: { id: PetActionId; nonce: number } | null;
  journey: PetJourneyState;
};

export type PetBurnRate = "quiet" | "steady" | "hot" | "overdrive";
export type QuickPlayActionId =
  | "walk_round_trip"
  | "token_snack"
  | "play_cursor"
  | "drag_dangle"
  | "toss_yarn"
  | "nap_here"
  | "wake_up"
  | "summon_to_pointer"
  | "capture_moment";
export type QuickPlayPhase = "idle" | "awaiting-placement" | "stand" | "outbound" | "pause" | "tracking" | "stalk" | "interact" | "return" | "settle" | "complete" | "failed";
export type QuickPlaySession = {
  activeAction: Exclude<QuickPlayActionId, "capture_moment"> | null;
  startedAt: number | null;
  phase: QuickPlayPhase;
  phaseStartedAt: number | null;
  startBounds: { x: number; y: number; width: number; height: number } | null;
  startDirectorState: PetActionId | null;
  targetPoint: { x: number; y: number } | null;
  pointerMode: "none" | "snack" | "dangle" | "yarn";
  resting: boolean;
  failure: string | null;
};
export type PetDirectorEvent =
  | { type: "actor.actionRequested"; action: PetActionId }
  | { type: "ambient.blink" }
  | { type: "ambient.rest"; reason: "inactivity" | "night" }
  | { type: "ambient.wake"; reason: "startup" | "day" | "activity" }
  | { type: "mood.thresholdCrossed"; previous: MoodLookId; mood: MoodLookId }
  | { type: "pointer.click" }
  | { type: "pointer.dragStart" }
  | { type: "pointer.drop" }
  | { type: "quickPlay.action"; action: QuickPlayActionId }
  | { type: "token.delta"; tokens: number; burnRate: PetBurnRate }
  | { type: "milestone.reached"; milestone: string }
  | { type: "lifecycle.stageChanged"; stage: PetLifeStage }
  | { type: "day.digestReady" };

export type ConsoleTab = "overview" | "breakdown" | "cost" | "pet" | "settings";

export type TokenPetBridge = {
  getUsageSnapshot: () => Promise<UsageSnapshot>;
  refreshUsageSnapshot: () => Promise<UsageSnapshot>;
  getAppSettings: () => Promise<AppSettings>;
  setAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<AppSettings>;
  onAppSettingsChanged: (callback: (settings: AppSettings) => void) => () => void;
  openConsole: (tab?: ConsoleTab) => void;
  onConsoleNavigation: (callback: (tab: ConsoleTab) => void) => () => void;
  quit: () => void;
  togglePopover: () => void;
  dispatchPetAction: (action: QuickPlayActionId | PetActionId) => Promise<{ accepted: boolean; reason?: "active" | "locked" | "invalid" | "already-resting" }>;
  getQuickPlaySession: () => Promise<QuickPlaySession>;
  onQuickPlaySessionChanged: (callback: (session: QuickPlaySession) => void) => () => void;
  reportPetDirectorState: (state: { action: PetActionId; resting: boolean }) => void;
  quickPlayOverlayInput: (input: { type: "click" | "cancel" | "reopen"; screenX: number; screenY: number; timestamp: number; velocityX?: number; velocityY?: number }) => void;
  onQuickPlayOverlayState: (callback: (state: { mode?: "snack" | "dangle" | "yarn"; phase?: "placing" | "playing" | "rolling" | "finishing"; enabled?: boolean; hint?: string; targetScreenX?: number; targetScreenY?: number; pointerScreenX?: number; pointerScreenY?: number; durationMs?: number }) => void) => () => void;
  onPetDirectorEvent: (callback: (event: PetDirectorEvent) => void) => () => void;
  summonPet: () => Promise<{ moved: boolean }>;
  traversePet: () => Promise<{ moved: boolean; canceled?: boolean }>;
  capturePetMoment: () => Promise<{ saved: boolean; filePath?: string }>;
  onCursorPosition: (callback: (position: { x: number; y: number }) => void) => () => void;
  startDrag: () => Promise<{ started: boolean }>;
  endDrag: () => Promise<{ moved: boolean }>;
  closePopover: () => void;
  close: () => void;
};
