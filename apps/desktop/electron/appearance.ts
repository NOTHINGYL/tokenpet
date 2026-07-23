import type {
  AccessoryChoiceId,
  AccessoryColorId,
  AccessoryId,
  AccessoryPosition,
  AccessorySettings,
  AppSettings,
  CatBreedDetails,
  CatEyeColor,
  CatTypeId,
  MotionActionId,
  MotionModeId,
  MotionSettings,
  MoodBadgeSettings,
  MoodLookId,
  PetAppearanceSettings,
  PetThemeId,
  TokenBubbleId,
  TokenFrameId,
} from "./types.js";

const catTypeIds: CatTypeId[] = [
  "golden-british",
  "ragdoll",
  "silver-tabby",
  "black-cat",
  "calico",
  "siamese",
  "maine-coon",
  "white-cat",
  "orange-tabby",
  "tuxedo",
  "scottish-fold",
  "bengal",
  "persian",
  "russian-blue",
  "sphynx",
];
const petThemeIds: PetThemeId[] = ["gold", "mint", "rose", "sky", "midnight", "custom"];
const tokenBubbleIds: TokenBubbleId[] = ["pill", "compact", "hidden", "cost"];
const tokenFrameIds: TokenFrameId[] = ["embedded", "pillow", "compact", "cost", "floating", "hidden"];
const moodLookIds: MoodLookId[] = ["sleepy", "focused", "hot", "overdrive"];
const motionModeIds: MotionModeId[] = ["calm", "balanced", "playful", "energetic"];
const motionActionIds: MotionActionId[] = [
  "idle-breathe",
  "tail-wag",
  "blink",
  "stretch",
  "run-across",
  "jump",
  "desk-nap",
  "celebrate",
  "pounce-cursor",
  "edge-peek",
];
const accessoryIds: AccessoryId[] = [
  "collar",
  "ribbon",
  "bow-tie",
  "tiny-scarf",
  "bandana",
  "focus-crown",
  "halo",
  "study-glasses",
  "sleep-cap",
  "desk-mat",
  "round-rug",
  "star-blanket",
  "nap-pillow",
  "cloud-cushion",
  "token-stand",
  "sparkle-aura",
  "star-trail",
  "leaf-drift",
  "hot-sparks",
];
const accessoryChoiceIds: AccessoryChoiceId[] = ["none", ...accessoryIds];
const accessoryColorIds: AccessoryColorId[] = ["cream", "mint", "sky", "violet", "rose", "rainbow"];
const accessoryPositionIds: AccessoryPosition[] = ["embedded", "below", "floating"];
const catEyeColorIds: CatEyeColor[] = ["gold", "green", "blue", "slate"];
const MAX_PET_NAME_GRAPHEMES = 10;
const DEFAULT_PET_NAME = "Mochi";

function splitPetNameGraphemes(value: string) {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...segmenter.segment(value)].map((entry) => entry.segment);
  }
  return Array.from(value);
}

function truncatePetName(value: string) {
  return splitPetNameGraphemes(value).slice(0, MAX_PET_NAME_GRAPHEMES).join("");
}

const defaultCatDetailsByType: Record<CatTypeId, CatBreedDetails> = {
  "golden-british": { furLength: 28, eyeColor: "gold", patternIntensity: 64 },
  ragdoll: { furLength: 82, eyeColor: "blue", patternIntensity: 38 },
  "silver-tabby": { furLength: 28, eyeColor: "gold", patternIntensity: 74 },
  "black-cat": { furLength: 28, eyeColor: "gold", patternIntensity: 22 },
  calico: { furLength: 28, eyeColor: "gold", patternIntensity: 80 },
  siamese: { furLength: 28, eyeColor: "blue", patternIntensity: 42 },
  "maine-coon": { furLength: 82, eyeColor: "green", patternIntensity: 72 },
  "white-cat": { furLength: 28, eyeColor: "blue", patternIntensity: 18 },
  "orange-tabby": { furLength: 28, eyeColor: "gold", patternIntensity: 70 },
  tuxedo: { furLength: 28, eyeColor: "gold", patternIntensity: 48 },
  "scottish-fold": { furLength: 28, eyeColor: "gold", patternIntensity: 62 },
  bengal: { furLength: 28, eyeColor: "green", patternIntensity: 92 },
  persian: { furLength: 82, eyeColor: "gold", patternIntensity: 28 },
  "russian-blue": { furLength: 28, eyeColor: "green", patternIntensity: 18 },
  sphynx: { furLength: 28, eyeColor: "blue", patternIntensity: 10 },
};

export const defaultMoodBadgeSettings: MoodBadgeSettings = {
  showMood: true,
  colorByState: true,
  hideInFocusMode: false,
};

export const defaultAccessorySettings: AccessorySettings = {
  tokenFrameId: "embedded",
  neckId: "collar",
  headId: "none",
  baseId: "none",
  effectId: "none",
  colorId: "mint",
  scale: 1,
  position: "embedded",
  textOnlyFrame: true,
  moodVisibility: {
    sleepy: true,
    focused: true,
    hot: true,
    overdrive: true,
  },
};

export const defaultMotionSettings: MotionSettings = {
  modeId: "balanced",
  actionId: "idle-breathe",
  animationSpeed: 80,
  motionEnergy: 65,
  jumpHeight: 70,
  roamingDistance: 75,
  cursorSensitivity: 60,
  desktopRoaming: {
    edgeRoaming: true,
    rememberPosition: true,
    avoidMenuBar: true,
    avoidFocusedWindow: true,
    multiScreenTravel: true,
    snapBackHome: false,
  },
  triggers: {
    tokenSpike: true,
    milestoneReached: true,
    idleBreak: true,
    workSessionStart: true,
    hotState: true,
    overdriveState: true,
  },
  safety: {
    reduceMotion: false,
    disableSuddenJumps: true,
    pauseDuringTyping: true,
    quietHoursMotion: false,
    screenSharingStillness: true,
  },
  quietHours: {
    start: "22:00",
    end: "07:00",
  },
};

export const defaultPetAppearance: PetAppearanceSettings = {
  accessoryDefaultsVersion: 2,
  catTypeId: "golden-british",
  catDetails: defaultCatDetailsByType["golden-british"],
  themeId: "gold",
  tokenBubbleId: "pill",
  size: 1,
  opacity: 1,
  shadow: 0.6,
  bubbleScale: 1,
  moodId: "focused",
  moodBadge: defaultMoodBadgeSettings,
  identity: {
    name: DEFAULT_PET_NAME,
    showNameOnHover: true,
  },
  accessoryIds: ["collar"],
  accessorySettings: defaultAccessorySettings,
  motionSettings: defaultMotionSettings,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(Math.max(numberValue, min), max);
}

function pickKnown<T extends string>(value: unknown, knownValues: readonly T[], fallback: T) {
  return knownValues.includes(value as T) ? (value as T) : fallback;
}

function normalizeAccessories(value: unknown) {
  if (!Array.isArray(value)) return defaultPetAppearance.accessoryIds;
  return value.filter((id): id is AccessoryId => accessoryIds.includes(id as AccessoryId));
}

function normalizeAccessoryChoice(value: unknown, fallback: AccessoryChoiceId) {
  return pickKnown(value, accessoryChoiceIds, fallback);
}

function inferAccessorySettingsFromIds(ids: AccessoryId[]): Pick<AccessorySettings, "neckId" | "headId" | "baseId" | "effectId"> {
  const firstKnown = (known: AccessoryId[], fallback: AccessoryChoiceId = "none") => ids.find((id) => known.includes(id)) ?? fallback;

  return {
    neckId: firstKnown(["collar", "ribbon", "bow-tie", "tiny-scarf", "bandana"], defaultAccessorySettings.neckId),
    headId: firstKnown(["focus-crown", "halo", "study-glasses", "sleep-cap"]),
    baseId: firstKnown(["desk-mat", "round-rug", "star-blanket", "nap-pillow", "cloud-cushion", "token-stand"]),
    effectId: firstKnown(["sparkle-aura", "star-trail", "leaf-drift", "hot-sparks"]),
  };
}

function normalizeMoodVisibility(value: unknown): AccessorySettings["moodVisibility"] {
  const source = (value && typeof value === "object" ? value : {}) as Partial<AccessorySettings["moodVisibility"]>;

  return moodLookIds.reduce(
    (visibility, moodId) => ({
      ...visibility,
      [moodId]: typeof source[moodId] === "boolean" ? source[moodId] : defaultAccessorySettings.moodVisibility[moodId],
    }),
    {} as AccessorySettings["moodVisibility"],
  );
}

function normalizeAccessorySettings(value: unknown, sourceAccessoryIds: AccessoryId[]): AccessorySettings {
  const source = (value && typeof value === "object" ? value : {}) as Partial<AccessorySettings>;
  const inferred = inferAccessorySettingsFromIds(sourceAccessoryIds);

  return {
    tokenFrameId: pickKnown(source.tokenFrameId, tokenFrameIds, defaultAccessorySettings.tokenFrameId),
    neckId: normalizeAccessoryChoice(source.neckId, inferred.neckId),
    headId: normalizeAccessoryChoice(source.headId, inferred.headId),
    baseId: normalizeAccessoryChoice(source.baseId, inferred.baseId),
    effectId: normalizeAccessoryChoice(source.effectId, inferred.effectId),
    colorId: pickKnown(source.colorId, accessoryColorIds, defaultAccessorySettings.colorId),
    scale: clampNumber(source.scale, 0.7, 1.35, defaultAccessorySettings.scale),
    position: pickKnown(source.position, accessoryPositionIds, defaultAccessorySettings.position),
    textOnlyFrame: typeof source.textOnlyFrame === "boolean" ? source.textOnlyFrame : defaultAccessorySettings.textOnlyFrame,
    moodVisibility: normalizeMoodVisibility(source.moodVisibility),
  };
}

function normalizeCatDetails(value: unknown, catTypeId: CatTypeId): CatBreedDetails {
  const defaults = defaultCatDetailsByType[catTypeId];
  const source = (value && typeof value === "object" ? value : {}) as Partial<CatBreedDetails>;

  return {
    furLength: clampNumber(source.furLength, 0, 100, defaults.furLength),
    eyeColor: pickKnown(source.eyeColor, catEyeColorIds, defaults.eyeColor),
    patternIntensity: clampNumber(source.patternIntensity, 0, 100, defaults.patternIntensity),
  };
}

function normalizeMotionToggles<T extends Record<string, boolean>>(value: unknown, defaults: T): T {
  const source = (value && typeof value === "object" ? value : {}) as Partial<T>;

  return Object.entries(defaults).reduce(
    (toggles, [key, defaultValue]) => ({
      ...toggles,
      [key]: typeof source[key as keyof T] === "boolean" ? source[key as keyof T] : defaultValue,
    }),
    {} as T,
  );
}

function normalizeMotionSettings(value: unknown): MotionSettings {
  const source = (value && typeof value === "object" ? value : {}) as Partial<MotionSettings>;
  const quietHours = (source.quietHours && typeof source.quietHours === "object" ? source.quietHours : {}) as Partial<MotionSettings["quietHours"]>;

  return {
    modeId: pickKnown(source.modeId, motionModeIds, defaultMotionSettings.modeId),
    actionId: pickKnown(source.actionId, motionActionIds, defaultMotionSettings.actionId),
    animationSpeed: clampNumber(source.animationSpeed, 20, 140, defaultMotionSettings.animationSpeed),
    motionEnergy: clampNumber(source.motionEnergy, 0, 100, defaultMotionSettings.motionEnergy),
    jumpHeight: clampNumber(source.jumpHeight, 0, 120, defaultMotionSettings.jumpHeight),
    roamingDistance: clampNumber(source.roamingDistance, 0, 100, defaultMotionSettings.roamingDistance),
    cursorSensitivity: clampNumber(source.cursorSensitivity, 0, 100, defaultMotionSettings.cursorSensitivity),
    desktopRoaming: normalizeMotionToggles(source.desktopRoaming, defaultMotionSettings.desktopRoaming),
    triggers: normalizeMotionToggles(source.triggers, defaultMotionSettings.triggers),
    safety: normalizeMotionToggles(source.safety, defaultMotionSettings.safety),
    quietHours: {
      start: typeof quietHours.start === "string" ? quietHours.start : defaultMotionSettings.quietHours.start,
      end: typeof quietHours.end === "string" ? quietHours.end : defaultMotionSettings.quietHours.end,
    },
  };
}

export function normalizePetAppearance(settings: Partial<AppSettings>): PetAppearanceSettings {
  const source = settings.petAppearance ?? ({} as Partial<PetAppearanceSettings>);
  const catTypeId = pickKnown(source.catTypeId, catTypeIds, defaultPetAppearance.catTypeId);
  const normalizedAccessoryIds = normalizeAccessories(source.accessoryIds);
  const storedAccessorySettings = normalizeAccessorySettings(source.accessorySettings, normalizedAccessoryIds);
  const migratePreviousAmbientDefaults = Number(source.accessoryDefaultsVersion ?? 1) < 2
    && storedAccessorySettings.neckId === "collar"
    && storedAccessorySettings.headId === "focus-crown"
    && storedAccessorySettings.baseId === "desk-mat"
    && storedAccessorySettings.effectId === "sparkle-aura";
  const normalizedAccessorySettings = migratePreviousAmbientDefaults
    ? { ...storedAccessorySettings, headId: "none" as const, baseId: "none" as const, effectId: "none" as const }
    : storedAccessorySettings;
  const actorReady = catTypeId === "golden-british";
  const hideGoldenValue = normalizedAccessorySettings.tokenFrameId === "hidden" || source.tokenBubbleId === "hidden";
  const readyGroundIds: AccessoryChoiceId[] = ["none", "desk-mat", "round-rug", "star-blanket"];
  const readyEffectIds: AccessoryChoiceId[] = ["none", "sparkle-aura", "leaf-drift", "hot-sparks"];
  const readyHeadIds: AccessoryChoiceId[] = actorReady ? ["none", "halo", "focus-crown"] : ["none", "halo"];
  const capabilitySafeAccessorySettings: AccessorySettings = {
    ...normalizedAccessorySettings,
    tokenFrameId: actorReady ? (hideGoldenValue ? "hidden" : "embedded") : "hidden",
    neckId: actorReady && ["collar", "none"].includes(normalizedAccessorySettings.neckId)
      ? normalizedAccessorySettings.neckId
      : actorReady ? defaultAccessorySettings.neckId : "none",
    headId: readyHeadIds.includes(normalizedAccessorySettings.headId)
      ? normalizedAccessorySettings.headId
      : actorReady ? defaultAccessorySettings.headId : "none",
    baseId: readyGroundIds.includes(normalizedAccessorySettings.baseId)
      ? normalizedAccessorySettings.baseId
      : defaultAccessorySettings.baseId,
    effectId: readyEffectIds.includes(normalizedAccessorySettings.effectId)
      ? normalizedAccessorySettings.effectId
      : defaultAccessorySettings.effectId,
  };

  return {
    accessoryDefaultsVersion: 2,
    catTypeId,
    catDetails: normalizeCatDetails(source.catDetails, catTypeId),
    themeId: pickKnown(source.themeId ?? settings.petTheme, petThemeIds, defaultPetAppearance.themeId),
    tokenBubbleId: actorReady ? (hideGoldenValue ? "hidden" : "pill") : "hidden",
    size: clampNumber(source.size ?? settings.petScale, 0.75, 1.25, defaultPetAppearance.size),
    opacity: clampNumber(source.opacity ?? settings.petOpacity, 0.45, 1, defaultPetAppearance.opacity),
    shadow: clampNumber(source.shadow, 0, 1, defaultPetAppearance.shadow),
    bubbleScale: clampNumber(source.bubbleScale, 0.7, 1.25, defaultPetAppearance.bubbleScale),
    moodId: pickKnown(source.moodId, moodLookIds, defaultPetAppearance.moodId),
    moodBadge: {
      ...defaultMoodBadgeSettings,
      ...(source.moodBadge ?? {}),
    },
    identity: {
      name: typeof source.identity?.name === "string" ? truncatePetName(source.identity.name) : DEFAULT_PET_NAME,
      showNameOnHover: typeof source.identity?.showNameOnHover === "boolean" ? source.identity.showNameOnHover : true,
    },
    accessoryIds: actorReady
      ? ([capabilitySafeAccessorySettings.neckId, capabilitySafeAccessorySettings.headId, capabilitySafeAccessorySettings.baseId, capabilitySafeAccessorySettings.effectId]
          .filter((id): id is AccessoryId => id !== "none"))
      : ([capabilitySafeAccessorySettings.headId, capabilitySafeAccessorySettings.baseId, capabilitySafeAccessorySettings.effectId]
          .filter((id): id is AccessoryId => id !== "none")),
    accessorySettings: capabilitySafeAccessorySettings,
    motionSettings: normalizeMotionSettings(source.motionSettings),
  };
}

export function syncLegacyAppearanceFields<T extends Partial<AppSettings>>(settings: T, appearance: PetAppearanceSettings) {
  return {
    ...settings,
    petTheme: appearance.themeId,
    petScale: appearance.size,
    petOpacity: appearance.opacity,
    petAppearance: appearance,
  };
}
