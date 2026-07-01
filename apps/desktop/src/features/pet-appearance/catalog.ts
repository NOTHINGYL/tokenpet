import type { AccessoryId, CatBreedDetails, CatEyeColor, CatTypeId, MoodLookId, PetThemeId, TokenBubbleId } from "../../types";

const appearanceAsset = (path: string) => `assets/pets/appearance/${path}`;

export type PetConsoleSection = "appearance" | "motion" | "mood" | "sound" | "rewards";

export const petConsoleSections: Array<{
  id: PetConsoleSection;
  label: string;
}> = [
  { id: "appearance", label: "Appearance" },
  { id: "motion", label: "Motion" },
  { id: "mood", label: "Mood & Reactions" },
  { id: "sound", label: "Sound" },
  { id: "rewards", label: "Rewards" },
];

export type CatHairLength = "short" | "medium" | "long";
export type CatTypeFilter = "all" | "short" | "long" | "classic" | "rare";

export type CatTypeOption = {
  id: CatTypeId;
  label: string;
  image: string;
  hairLength: CatHairLength;
  eyeColor: CatEyeColor;
  patternIntensity: number;
  classic?: boolean;
  rare?: boolean;
};

export const catEyeColors: Array<{
  id: CatEyeColor;
  label: string;
  className: string;
}> = [
  { id: "gold", label: "Gold", className: "gold" },
  { id: "green", label: "Green", className: "green" },
  { id: "blue", label: "Blue", className: "blue" },
  { id: "slate", label: "Slate", className: "slate" },
];

export const catTypeFilters: Array<{
  id: CatTypeFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "short", label: "Short hair" },
  { id: "long", label: "Long hair" },
  { id: "classic", label: "Classic" },
  { id: "rare", label: "Rare" },
];

export const catTypes: CatTypeOption[] = [
  {
    id: "golden-british",
    label: "Golden British",
    image: appearanceAsset("cat-types/golden-british.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 64,
    classic: true,
  },
  {
    id: "ragdoll",
    label: "Ragdoll",
    image: appearanceAsset("cat-types/ragdoll.png"),
    hairLength: "long",
    eyeColor: "blue",
    patternIntensity: 38,
    rare: true,
  },
  {
    id: "silver-tabby",
    label: "Silver Tabby",
    image: appearanceAsset("cat-types/silver-tabby.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 74,
    classic: true,
  },
  {
    id: "black-cat",
    label: "Black Cat",
    image: appearanceAsset("cat-types/black-cat.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 22,
    classic: true,
  },
  {
    id: "calico",
    label: "Calico",
    image: appearanceAsset("cat-types/calico.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 80,
    classic: true,
  },
  {
    id: "siamese",
    label: "Siamese",
    image: appearanceAsset("cat-types/siamese.png"),
    hairLength: "short",
    eyeColor: "blue",
    patternIntensity: 42,
    rare: true,
  },
  {
    id: "maine-coon",
    label: "Maine Coon",
    image: appearanceAsset("cat-types/maine-coon.png"),
    hairLength: "long",
    eyeColor: "green",
    patternIntensity: 72,
    rare: true,
  },
  {
    id: "white-cat",
    label: "White Cat",
    image: appearanceAsset("cat-types/white-cat.png"),
    hairLength: "short",
    eyeColor: "blue",
    patternIntensity: 18,
  },
  {
    id: "orange-tabby",
    label: "Orange Tabby",
    image: appearanceAsset("cat-types/orange-tabby.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 70,
    classic: true,
  },
  {
    id: "tuxedo",
    label: "Tuxedo",
    image: appearanceAsset("cat-types/tuxedo.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 48,
    classic: true,
  },
  {
    id: "scottish-fold",
    label: "Scottish Fold",
    image: appearanceAsset("cat-types/scottish-fold.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 62,
    rare: true,
  },
  {
    id: "bengal",
    label: "Bengal",
    image: appearanceAsset("cat-types/bengal.png"),
    hairLength: "short",
    eyeColor: "green",
    patternIntensity: 92,
    rare: true,
  },
  {
    id: "persian",
    label: "Persian",
    image: appearanceAsset("cat-types/persian.png"),
    hairLength: "long",
    eyeColor: "gold",
    patternIntensity: 28,
    rare: true,
  },
  {
    id: "russian-blue",
    label: "Russian Blue",
    image: appearanceAsset("cat-types/russian-blue.png"),
    hairLength: "short",
    eyeColor: "green",
    patternIntensity: 18,
    rare: true,
  },
  {
    id: "sphynx",
    label: "Sphynx",
    image: appearanceAsset("cat-types/sphynx.png"),
    hairLength: "short",
    eyeColor: "blue",
    patternIntensity: 10,
    rare: true,
  },
];

export const featuredCatTypes = catTypes.slice(0, 4);

export function getCatTypeOption(catTypeId: CatTypeId) {
  return catTypes.find((cat) => cat.id === catTypeId) ?? catTypes[0];
}

export function getDefaultCatDetails(catTypeId: CatTypeId): CatBreedDetails {
  const cat = getCatTypeOption(catTypeId);
  return {
    furLength: cat.hairLength === "long" ? 82 : cat.hairLength === "medium" ? 55 : 28,
    eyeColor: cat.eyeColor,
    patternIntensity: cat.patternIntensity,
  };
}

export const skinThemes: Array<{
  id: PetThemeId;
  label: string;
  className: string;
}> = [
  { id: "gold", label: "Gold", className: "gold" },
  { id: "mint", label: "Mint", className: "mint" },
  { id: "rose", label: "Rose", className: "rose" },
  { id: "sky", label: "Sky", className: "sky" },
  { id: "midnight", label: "Midnight", className: "midnight" },
  { id: "custom", label: "Custom", className: "custom" },
];

export const moodLooks = [
  {
    id: "sleepy" as MoodLookId,
    label: "Sleepy",
    image: appearanceAsset("mood-looks/sleepy.png"),
    dotClassName: "blue",
    badge: "sleepy",
  },
  {
    id: "focused" as MoodLookId,
    label: "Focused",
    image: appearanceAsset("mood-looks/focused.png"),
    dotClassName: "green",
    badge: "focused",
  },
  {
    id: "hot" as MoodLookId,
    label: "Hot",
    image: appearanceAsset("mood-looks/hot.png"),
    dotClassName: "gold",
    badge: "hot",
  },
  {
    id: "overdrive" as MoodLookId,
    label: "Overdrive",
    image: appearanceAsset("mood-looks/overdrive.png"),
    dotClassName: "red",
    badge: "overdrive",
  },
];

export const accessories = [
  {
    id: "collar" as AccessoryId,
    label: "Collar",
    image: appearanceAsset("accessories/collar.png"),
    badge: "Equipped",
  },
  {
    id: "ribbon" as AccessoryId,
    label: "Ribbon",
    image: appearanceAsset("accessories/ribbon.png"),
    badge: "Equipped",
  },
  {
    id: "focus-crown" as AccessoryId,
    label: "Focus crown",
    image: appearanceAsset("accessories/focus-crown.png"),
    badge: "Unlocked",
  },
  {
    id: "tiny-scarf" as AccessoryId,
    label: "Tiny scarf",
    image: appearanceAsset("accessories/tiny-scarf.png"),
    badge: "Unlocked",
  },
  {
    id: "halo" as AccessoryId,
    label: "Halo",
    image: appearanceAsset("accessories/halo.png"),
    badge: "Unlocked",
  },
  {
    id: "desk-mat" as AccessoryId,
    label: "Desk mat",
    image: appearanceAsset("accessories/desk-mat.png"),
    badge: "Locked",
    locked: true,
  },
];

export const tokenBubbleOptions = [
  {
    id: "pill" as TokenBubbleId,
    label: "Pill",
    detail: "Large and friendly",
    icon: "pill",
  },
  {
    id: "compact" as TokenBubbleId,
    label: "Compact",
    detail: "Smaller footprint",
    icon: "compact",
  },
  {
    id: "hidden" as TokenBubbleId,
    label: "Hidden",
    detail: "Hide token info",
    icon: "hidden",
  },
  {
    id: "cost" as TokenBubbleId,
    label: "Cost + Tokens",
    detail: "Show cost and tokens",
    icon: "cost",
  },
] as const;

export const moodBadgeOptions = [
  {
    id: "show-mood",
    label: "Show mood",
    detail: "Display mood above pet",
    enabled: true,
  },
  {
    id: "color-state",
    label: "Color by state",
    detail: "Tint badge by mood",
    enabled: true,
  },
  {
    id: "focus-mode",
    label: "Hide in focus mode",
    detail: "Hide when you're focused",
    enabled: false,
  },
];
