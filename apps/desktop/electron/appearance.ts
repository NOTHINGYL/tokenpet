import type {
  AccessoryId,
  AppSettings,
  CatBreedDetails,
  CatEyeColor,
  CatTypeId,
  MoodBadgeSettings,
  MoodLookId,
  PetAppearanceSettings,
  PetThemeId,
  TokenBubbleId,
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
const moodLookIds: MoodLookId[] = ["sleepy", "focused", "hot", "overdrive"];
const accessoryIds: AccessoryId[] = ["collar", "ribbon", "focus-crown", "tiny-scarf", "halo", "desk-mat"];
const catEyeColorIds: CatEyeColor[] = ["gold", "green", "blue", "slate"];

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

export const defaultPetAppearance: PetAppearanceSettings = {
  catTypeId: "golden-british",
  catDetails: defaultCatDetailsByType["golden-british"],
  themeId: "gold",
  tokenBubbleId: "pill",
  size: 1,
  opacity: 0.92,
  shadow: 0.6,
  bubbleScale: 1,
  moodId: "focused",
  moodBadge: defaultMoodBadgeSettings,
  accessoryIds: ["collar", "ribbon"],
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

function normalizeCatDetails(value: unknown, catTypeId: CatTypeId): CatBreedDetails {
  const defaults = defaultCatDetailsByType[catTypeId];
  const source = (value && typeof value === "object" ? value : {}) as Partial<CatBreedDetails>;

  return {
    furLength: clampNumber(source.furLength, 0, 100, defaults.furLength),
    eyeColor: pickKnown(source.eyeColor, catEyeColorIds, defaults.eyeColor),
    patternIntensity: clampNumber(source.patternIntensity, 0, 100, defaults.patternIntensity),
  };
}

export function normalizePetAppearance(settings: Partial<AppSettings>): PetAppearanceSettings {
  const source = settings.petAppearance ?? ({} as Partial<PetAppearanceSettings>);
  const catTypeId = pickKnown(source.catTypeId, catTypeIds, defaultPetAppearance.catTypeId);

  return {
    catTypeId,
    catDetails: normalizeCatDetails(source.catDetails, catTypeId),
    themeId: pickKnown(source.themeId ?? settings.petTheme, petThemeIds, defaultPetAppearance.themeId),
    tokenBubbleId: pickKnown(source.tokenBubbleId, tokenBubbleIds, defaultPetAppearance.tokenBubbleId),
    size: clampNumber(source.size ?? settings.petScale, 0.75, 1.25, defaultPetAppearance.size),
    opacity: clampNumber(source.opacity ?? settings.petOpacity, 0.45, 1, defaultPetAppearance.opacity),
    shadow: clampNumber(source.shadow, 0, 1, defaultPetAppearance.shadow),
    bubbleScale: clampNumber(source.bubbleScale, 0.7, 1.25, defaultPetAppearance.bubbleScale),
    moodId: pickKnown(source.moodId, moodLookIds, defaultPetAppearance.moodId),
    moodBadge: {
      ...defaultMoodBadgeSettings,
      ...(source.moodBadge ?? {}),
    },
    accessoryIds: normalizeAccessories(source.accessoryIds),
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
