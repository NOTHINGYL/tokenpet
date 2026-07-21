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
  petStory: PetStorySettings;
};

export type TossYarnActorDirectionId = "right" | "left" | "front" | "back" | "front_right" | "front_left" | "back_right" | "back_left";
export type TossYarnActorPhaseId = "chase" | "pickup" | "carry" | "drop";
export type TossYarnDirectionalActionId = `toss_yarn_${TossYarnActorPhaseId}_${TossYarnActorDirectionId}`;
export type FeedSnackActorDirectionId = TossYarnActorDirectionId;
export type FeedSnackDirectionalPhaseId = "walk_slow" | "return_run" | "arrive" | "lick" | "bite" | "chew" | "swallow";
export type FeedSnackDirectionalActionId = `feed_snack_${FeedSnackDirectionalPhaseId}_${FeedSnackActorDirectionId}`;
export type PetWalkDirectionalPhaseId = "walk" | "look";
export type PetWalkDirectionalActionId = `walk_round_trip_${PetWalkDirectionalPhaseId}_${TossYarnActorDirectionId}`;
export type WakeUpPhaseActionId = "wake_up_blink" | "wake_up_roll" | "wake_up_stretch" | "wake_up_gather";
export type DancePhaseActionId = "dance_rise" | "dance_reference_clip" | "dance_eye_snap" | "dance_tongue_pop" | "dance_tongue_hold" | "dance_tongue_sway" | "dance_tongue_retract" | "dance_smug_hold" | "dance_smug_sway_left" | "dance_smug_sway_right" | "dance_eyes_reset" | "dance_restore";
export type PetActionId = "idle_breathe" | "blink" | "sleep_loop" | "focus_loop" | "hot_loop" | "overdrive_loop" | "hatch" | "click_purr" | "drag_dangle" | "dangle_alert" | "dangle_stalk" | "dangle_crouch" | "dangle_pounce" | "dangle_pounce_front" | "dangle_pounce_back" | "dangle_pounce_front_left" | "dangle_pounce_front_right" | "dangle_pounce_back_left" | "dangle_pounce_back_right" | "dangle_play" | "dangle_play_front" | "dangle_play_back" | "dangle_play_front_left" | "dangle_play_front_right" | "dangle_play_back_left" | "dangle_play_back_right" | "dangle_pursuit_run" | "dangle_pursuit_run_front" | "dangle_pursuit_run_back" | "dangle_pursuit_run_front_left" | "dangle_pursuit_run_front_right" | "dangle_pursuit_run_back_left" | "dangle_pursuit_run_back_right" | "dangle_return_walk" | "dangle_return_walk_front" | "dangle_return_walk_back" | "dangle_return_walk_front_left" | "dangle_return_walk_front_right" | "dangle_return_walk_back_left" | "dangle_return_walk_back_right" | "dangle_settle" | "drop_bounce" | "token_snack" | "feed_snack_stretch" | "feed_snack_walk_slow" | "feed_snack_arrive" | "feed_snack_lick" | "feed_snack_eat" | "feed_snack_return_run" | "feed_snack_settle" | FeedSnackDirectionalActionId | "play_cursor" | "run_across" | "walk_round_trip" | "walk_round_trip_look" | PetWalkDirectionalActionId | "milestone_celebrate" | "level_up" | "daily_digest" | "toss_yarn" | TossYarnDirectionalActionId | "nap_here" | "wake_up" | WakeUpPhaseActionId | "dance" | DancePhaseActionId | "settle_down" | "focus_start" | "cool_down" | "summon_to_screen" | "capture_moment";
export type PetLifeStage = "egg" | "newKitten" | "deskBuddy" | "flowCompanion" | "guardianCompanion";
export type PetMemory = { id: string; kind: "firstSource" | "milestone" | "stage" | "dailyDigest"; title: string; message: string; createdAt: string; tokens?: number; stage?: PetLifeStage };
export type PetJourneyState = { schemaVersion: 1; stage: PetLifeStage; milestoneIds: string[]; memories: PetMemory[]; firstSeenAt: string | null; lastSeenAt: string | null; lastUsageTokens: number; activeDays: number; lastDigestDate: string | null };
export type PetActionTuningValue = string | number | boolean;
export type PetActionSettingsStore = { schemaVersion: 1; byAction: Partial<Record<Exclude<QuickPlayActionId, "capture_moment">, Record<string, PetActionTuningValue>>> };
export type PetStorySettings = { behaviorMode: "gentle" | "balanced" | "playful" | "focusFriendly"; moodThresholds: { focused: number; hot: number; overdrive: number }; quietMode: boolean; followCursor: boolean; lockPosition: boolean; reduceMotion: boolean; soundEnabled: boolean; soundStyle: "soft" | "cozy" | "playful"; volume: number; cueIds: string[]; cueVolumes: Record<"wake" | "purr" | "drop" | "snack" | "milestone" | "hot" | "rest", number>; interactionRules: { click: boolean; drag: boolean; drop: boolean; feed: boolean; cursor: boolean }; safety: { batteryLowPause: boolean; muteDuringFocus: boolean; quietHoursEnabled: boolean; quietHoursStart: string; quietHoursEnd: string; screenSharingStillness: boolean; respectSystemVolume: boolean }; reactionRules: { oneShotOnThreshold: boolean; coolDownAfterOverdrive: boolean }; companionSettings: { keepTinyMenuForm: boolean; showMemoryCards: boolean; celebrateMilestones: boolean }; actionSettings: PetActionSettingsStore; pinnedStage: PetLifeStage | null; lastAction: { id: PetActionId; nonce: number } | null; journey: PetJourneyState };
export type QuickPlayActionId = "walk_round_trip" | "token_snack" | "play_cursor" | "drag_dangle" | "toss_yarn" | "nap_here" | "wake_up" | "dance" | "capture_moment";
export type QuickPlayPhase = "idle" | "awaiting-placement" | "rolling" | "stand" | "outbound" | "arrive" | "lick" | "bite" | "chew" | "swallow" | "eat" | "pause" | "tracking" | "alert" | "stalk" | "crouch" | "pounce" | "play" | "pursuit" | "release" | "interact" | "pickup" | "carry" | "drop" | "return" | "settle" | "dance_rise" | "dance_reference_clip" | "dance_restore" | "complete" | "failed";
export type QuickPlayWalkMotion = { startedAt: number; durationMs: number; stepDurationMs: number; cycleDurationMs: number; stepCount: number; stepDistancePx: number; footfallsPerCycle: number; rootStepKeyframes: number[] };
export type QuickPlayActorDirection = "left" | "right" | "front" | "back" | "front-left" | "front-right" | "back-left" | "back-right";
export type QuickPlaySession = { activeAction: Exclude<QuickPlayActionId, "capture_moment"> | null; startedAt: number | null; phase: QuickPlayPhase; phaseStartedAt: number | null; startBounds: { x: number; y: number; width: number; height: number } | null; currentBounds?: { x: number; y: number; width: number; height: number } | null; startDirectorState: PetActionId | null; targetPoint: { x: number; y: number } | null; walkMotion: QuickPlayWalkMotion | null; actorDirection: QuickPlayActorDirection | null; actorVariant: "orange" | "blue" | "violet" | null; pointerMode: "none" | "snack" | "dangle" | "yarn"; resting: boolean; failure: string | null };
export type PetDirectorEvent = { type: "actor.actionRequested"; action: PetActionId } | { type: "ambient.blink" } | { type: "ambient.rest"; reason: "inactivity" | "night" } | { type: "ambient.wake"; reason: "startup" | "day" | "activity" } | { type: "mood.thresholdCrossed"; previous: MoodLookId; mood: MoodLookId } | { type: "pointer.click" } | { type: "pointer.dragStart" } | { type: "pointer.drop" } | { type: "quickPlay.action"; action: QuickPlayActionId } | { type: "token.delta"; tokens: number; burnRate: "quiet" | "steady" | "hot" | "overdrive" } | { type: "milestone.reached"; milestone: string } | { type: "lifecycle.stageChanged"; stage: PetLifeStage } | { type: "day.digestReady" };

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
