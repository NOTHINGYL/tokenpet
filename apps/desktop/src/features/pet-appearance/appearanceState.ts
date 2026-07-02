import type {
  AccessoryId,
  AppSettings,
  CatTypeId,
  CatBreedDetails,
  MoodBadgeSettings,
  MoodLookId,
  PetAppearanceSettings,
  PetThemeId,
  TokenBubbleId,
} from "../../types";
import { catEyeColors, getDefaultCatDetails } from "./catalog";

export const catTypeIds: CatTypeId[] = [
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
export const petThemeIds: PetThemeId[] = ["gold", "mint", "rose", "sky", "midnight", "custom"];
export const tokenBubbleIds: TokenBubbleId[] = ["pill", "compact", "hidden", "cost"];
export const moodLookIds: MoodLookId[] = ["sleepy", "focused", "hot", "overdrive"];
export const accessoryIds: AccessoryId[] = ["collar", "ribbon", "focus-crown", "tiny-scarf", "halo", "desk-mat"];

export const defaultMoodBadgeSettings: MoodBadgeSettings = {
  showMood: true,
  colorByState: true,
  hideInFocusMode: false,
};

export const defaultPetAppearance: PetAppearanceSettings = {
  catTypeId: "golden-british",
  catDetails: getDefaultCatDetails("golden-british"),
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

export function clampNumber(value: unknown, min: number, max: number, fallback: number) {
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
  const defaults = getDefaultCatDetails(catTypeId);
  const source = (value && typeof value === "object" ? value : {}) as Partial<CatBreedDetails>;
  const eyeColorIds = catEyeColors.map((color) => color.id);

  return {
    furLength: clampNumber(source.furLength, 0, 100, defaults.furLength),
    eyeColor: pickKnown(source.eyeColor, eyeColorIds, defaults.eyeColor),
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

export function appearanceEquals(left: PetAppearanceSettings, right: PetAppearanceSettings) {
  return JSON.stringify(left) === JSON.stringify(right);
}
