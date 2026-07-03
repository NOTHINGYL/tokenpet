import type {
  AccessoryChoiceId,
  AccessoryColorId,
  AccessoryId,
  AccessoryPosition,
  AccessorySettings,
  AppSettings,
  CatTypeId,
  CatBreedDetails,
  MoodBadgeSettings,
  MoodLookId,
  PetAppearanceSettings,
  PetThemeId,
  TokenBubbleId,
  TokenFrameId,
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
export const tokenFrameIds: TokenFrameId[] = ["embedded", "pillow", "compact", "cost", "floating", "hidden"];
export const moodLookIds: MoodLookId[] = ["sleepy", "focused", "hot", "overdrive"];
export const accessoryIds: AccessoryId[] = [
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
  "nap-pillow",
  "cloud-cushion",
  "token-stand",
  "sparkle-aura",
  "star-trail",
  "leaf-drift",
  "hot-sparks",
];
export const accessoryChoiceIds: AccessoryChoiceId[] = ["none", ...accessoryIds];
export const accessoryColorIds: AccessoryColorId[] = ["cream", "mint", "sky", "violet", "rose", "rainbow"];
export const accessoryPositionIds: AccessoryPosition[] = ["embedded", "below", "floating"];

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
  accessoryIds: ["collar"],
  accessorySettings: defaultAccessorySettings,
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

function normalizeAccessoryChoice(value: unknown, fallback: AccessoryChoiceId) {
  return pickKnown(value, accessoryChoiceIds, fallback);
}

function inferAccessorySettingsFromIds(ids: AccessoryId[]): Pick<AccessorySettings, "neckId" | "headId" | "baseId" | "effectId"> {
  const firstKnown = (known: AccessoryId[], fallback: AccessoryChoiceId = "none") => ids.find((id) => known.includes(id)) ?? fallback;

  return {
    neckId: firstKnown(["collar", "ribbon", "bow-tie", "tiny-scarf", "bandana"], defaultAccessorySettings.neckId),
    headId: firstKnown(["focus-crown", "halo", "study-glasses", "sleep-cap"]),
    baseId: firstKnown(["desk-mat", "nap-pillow", "cloud-cushion", "token-stand"]),
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
  const normalizedAccessoryIds = normalizeAccessories(source.accessoryIds);

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
    accessoryIds: normalizedAccessoryIds,
    accessorySettings: normalizeAccessorySettings(source.accessorySettings, normalizedAccessoryIds),
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
