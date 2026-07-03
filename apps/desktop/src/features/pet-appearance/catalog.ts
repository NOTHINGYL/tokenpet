import type {
  AccessoryChoiceId,
  AccessoryColorId,
  AccessoryId,
  AccessoryPosition,
  CatBreedDetails,
  CatEyeColor,
  CatTypeId,
  MoodLookId,
  PetThemeId,
  TokenBubbleId,
  TokenFrameId,
} from "../../types";

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
  visualScale?: number;
  classic?: boolean;
  rare?: boolean;
};

export type TokenBubbleLayoutMode = "embedded" | "external" | "floating";

export type TokenBubbleLayout = {
  mode: TokenBubbleLayoutMode;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  textOnly?: boolean;
};

const generatedCatVisualScale = 1.59;

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
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "silver-tabby",
    label: "Silver Tabby",
    image: appearanceAsset("cat-types/silver-tabby.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 74,
    visualScale: generatedCatVisualScale,
    classic: true,
  },
  {
    id: "black-cat",
    label: "Black Cat",
    image: appearanceAsset("cat-types/black-cat.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 22,
    visualScale: generatedCatVisualScale,
    classic: true,
  },
  {
    id: "calico",
    label: "Calico",
    image: appearanceAsset("cat-types/calico.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 80,
    visualScale: generatedCatVisualScale,
    classic: true,
  },
  {
    id: "siamese",
    label: "Siamese",
    image: appearanceAsset("cat-types/siamese.png"),
    hairLength: "short",
    eyeColor: "blue",
    patternIntensity: 42,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "maine-coon",
    label: "Maine Coon",
    image: appearanceAsset("cat-types/maine-coon.png"),
    hairLength: "long",
    eyeColor: "green",
    patternIntensity: 72,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "white-cat",
    label: "White Cat",
    image: appearanceAsset("cat-types/white-cat.png"),
    hairLength: "short",
    eyeColor: "blue",
    patternIntensity: 18,
    visualScale: generatedCatVisualScale,
  },
  {
    id: "orange-tabby",
    label: "Orange Tabby",
    image: appearanceAsset("cat-types/orange-tabby.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 70,
    visualScale: generatedCatVisualScale,
    classic: true,
  },
  {
    id: "tuxedo",
    label: "Tuxedo",
    image: appearanceAsset("cat-types/tuxedo.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 48,
    visualScale: generatedCatVisualScale,
    classic: true,
  },
  {
    id: "scottish-fold",
    label: "Scottish Fold",
    image: appearanceAsset("cat-types/scottish-fold.png"),
    hairLength: "short",
    eyeColor: "gold",
    patternIntensity: 62,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "bengal",
    label: "Bengal",
    image: appearanceAsset("cat-types/bengal.png"),
    hairLength: "short",
    eyeColor: "green",
    patternIntensity: 92,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "persian",
    label: "Persian",
    image: appearanceAsset("cat-types/persian.png"),
    hairLength: "long",
    eyeColor: "gold",
    patternIntensity: 28,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "russian-blue",
    label: "Russian Blue",
    image: appearanceAsset("cat-types/russian-blue.png"),
    hairLength: "short",
    eyeColor: "green",
    patternIntensity: 18,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
  {
    id: "sphynx",
    label: "Sphynx",
    image: appearanceAsset("cat-types/sphynx.png"),
    hairLength: "short",
    eyeColor: "blue",
    patternIntensity: 10,
    visualScale: generatedCatVisualScale,
    rare: true,
  },
];

export const featuredCatTypes = catTypes.slice(0, 4);

export const defaultExternalTokenBubbleLayout: TokenBubbleLayout = {
  mode: "external",
  anchorX: 0.5,
  anchorY: 0.84,
  width: 118,
  height: 48,
};

export const catTokenBubbleLayouts: Partial<Record<CatTypeId, TokenBubbleLayout>> = {
  "golden-british": {
    mode: "embedded",
    anchorX: 0.5,
    anchorY: 0.815,
    width: 118,
    height: 48,
    textOnly: true,
  },
  ragdoll: { ...defaultExternalTokenBubbleLayout, anchorY: 0.86, width: 124 },
  "silver-tabby": { ...defaultExternalTokenBubbleLayout, anchorY: 0.85 },
  "black-cat": { ...defaultExternalTokenBubbleLayout, anchorY: 0.85 },
  calico: { ...defaultExternalTokenBubbleLayout, anchorY: 0.85 },
  siamese: { ...defaultExternalTokenBubbleLayout, anchorY: 0.86 },
  "maine-coon": { ...defaultExternalTokenBubbleLayout, anchorY: 0.87, width: 126 },
  persian: { ...defaultExternalTokenBubbleLayout, anchorY: 0.87, width: 126 },
  sphynx: { ...defaultExternalTokenBubbleLayout, anchorY: 0.86, width: 108 },
};

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

export type AccessoryCategoryId = "neck" | "head" | "base" | "effects";

export type AccessoryOption = {
  id: AccessoryId;
  label: string;
  category: AccessoryCategoryId;
  image: string;
  badge: string;
  locked?: boolean;
};

export type AccessoryChoiceOption = {
  id: AccessoryChoiceId;
  label: string;
  image?: string;
  locked?: boolean;
};

export const accessoryCatalog: AccessoryOption[] = [
  {
    id: "collar" as AccessoryId,
    label: "Collar",
    category: "neck",
    image: appearanceAsset("accessories/collar.png"),
    badge: "Equipped",
  },
  {
    id: "ribbon" as AccessoryId,
    label: "Ribbon",
    category: "neck",
    image: appearanceAsset("accessories/ribbon.png"),
    badge: "Equipped",
  },
  {
    id: "bow-tie" as AccessoryId,
    label: "Bow tie",
    category: "neck",
    image: appearanceAsset("accessories/bow-tie.png"),
    badge: "Unlocked",
  },
  {
    id: "tiny-scarf" as AccessoryId,
    label: "Tiny scarf",
    category: "neck",
    image: appearanceAsset("accessories/tiny-scarf.png"),
    badge: "Unlocked",
  },
  {
    id: "bandana" as AccessoryId,
    label: "Bandana",
    category: "neck",
    image: appearanceAsset("accessories/bandana.png"),
    badge: "Unlocked",
  },
  {
    id: "focus-crown" as AccessoryId,
    label: "Focus crown",
    category: "head",
    image: appearanceAsset("accessories/focus-crown.png"),
    badge: "Unlocked",
  },
  {
    id: "halo" as AccessoryId,
    label: "Halo",
    category: "head",
    image: appearanceAsset("accessories/halo.png"),
    badge: "Unlocked",
  },
  {
    id: "study-glasses" as AccessoryId,
    label: "Study glasses",
    category: "head",
    image: appearanceAsset("accessories/study-glasses.png"),
    badge: "Unlocked",
  },
  {
    id: "sleep-cap" as AccessoryId,
    label: "Sleep cap",
    category: "head",
    image: appearanceAsset("accessories/sleep-cap.png"),
    badge: "Unlocked",
  },
  {
    id: "desk-mat" as AccessoryId,
    label: "Desk mat",
    category: "base",
    image: appearanceAsset("accessories/desk-mat.png"),
    badge: "Locked",
  },
  {
    id: "nap-pillow" as AccessoryId,
    label: "Nap pillow",
    category: "base",
    image: appearanceAsset("accessories/nap-pillow.png"),
    badge: "Unlocked",
  },
  {
    id: "cloud-cushion" as AccessoryId,
    label: "Cloud cushion",
    category: "base",
    image: appearanceAsset("accessories/cloud-cushion.png"),
    badge: "Unlocked",
  },
  {
    id: "token-stand" as AccessoryId,
    label: "Token stand",
    category: "base",
    image: appearanceAsset("accessories/token-stand.png"),
    badge: "Unlocked",
  },
  {
    id: "sparkle-aura" as AccessoryId,
    label: "Sparkle aura",
    category: "effects",
    image: appearanceAsset("accessories/sparkle-aura.png"),
    badge: "Unlocked",
  },
  {
    id: "star-trail" as AccessoryId,
    label: "Star trail",
    category: "effects",
    image: appearanceAsset("accessories/star-trail.png"),
    badge: "Unlocked",
  },
  {
    id: "leaf-drift" as AccessoryId,
    label: "Leaf drift",
    category: "effects",
    image: appearanceAsset("accessories/leaf-drift.png"),
    badge: "Unlocked",
  },
  {
    id: "hot-sparks" as AccessoryId,
    label: "Hot sparks",
    category: "effects",
    image: appearanceAsset("accessories/hot-sparks.png"),
    badge: "Unlocked",
  },
];

export const featuredAccessoryIds: AccessoryId[] = ["collar", "ribbon", "focus-crown", "tiny-scarf", "halo", "desk-mat"];
export const accessories = featuredAccessoryIds
  .map((accessoryId) => accessoryCatalog.find((accessory) => accessory.id === accessoryId))
  .filter((accessory): accessory is AccessoryOption => Boolean(accessory));

const noAccessoryOption: AccessoryChoiceOption = {
  id: "none",
  label: "None",
};

function accessoryChoice(accessoryId: AccessoryId): AccessoryChoiceOption {
  const accessory = accessoryCatalog.find((option) => option.id === accessoryId);
  if (!accessory) return { id: accessoryId, label: accessoryId };
  return {
    id: accessory.id,
    label: accessory.label,
    image: accessory.image,
    locked: accessory.locked,
  };
}

export const accessorySections: Array<{
  id: AccessoryCategoryId;
  label: string;
  detail: string;
  options: AccessoryChoiceOption[];
}> = [
  {
    id: "neck",
    label: "Neck",
    detail: "Pick one",
    options: [noAccessoryOption, accessoryChoice("collar"), accessoryChoice("bow-tie"), accessoryChoice("tiny-scarf"), accessoryChoice("bandana")],
  },
  {
    id: "head",
    label: "Head",
    detail: "Pick one",
    options: [noAccessoryOption, accessoryChoice("focus-crown"), accessoryChoice("halo"), accessoryChoice("study-glasses"), accessoryChoice("sleep-cap")],
  },
  {
    id: "base",
    label: "Base",
    detail: "Pick one",
    options: [noAccessoryOption, accessoryChoice("desk-mat"), accessoryChoice("nap-pillow"), accessoryChoice("cloud-cushion"), accessoryChoice("token-stand")],
  },
  {
    id: "effects",
    label: "Effects",
    detail: "Pick one",
    options: [noAccessoryOption, accessoryChoice("sparkle-aura"), accessoryChoice("star-trail"), accessoryChoice("leaf-drift"), accessoryChoice("hot-sparks")],
  },
];

export const accessoryColorOptions: Array<{
  id: AccessoryColorId;
  label: string;
  className: string;
}> = [
  { id: "cream", label: "Cream", className: "cream" },
  { id: "mint", label: "Mint", className: "mint" },
  { id: "sky", label: "Sky", className: "sky" },
  { id: "violet", label: "Violet", className: "violet" },
  { id: "rose", label: "Rose", className: "rose" },
  { id: "rainbow", label: "Rainbow", className: "rainbow" },
];

export const accessoryPositionOptions: Array<{
  id: AccessoryPosition;
  label: string;
}> = [
  { id: "embedded", label: "Embedded" },
  { id: "below", label: "Below" },
  { id: "floating", label: "Floating" },
];

export const tokenFrameOptions: Array<{
  id: TokenFrameId;
  label: string;
  detail: string;
  tokenBubbleId: TokenBubbleId;
}> = [
  {
    id: "embedded",
    label: "Embedded frame",
    detail: "Best for paw-frame cats",
    tokenBubbleId: "pill",
  },
  {
    id: "pillow",
    label: "Pillow pill",
    detail: "Soft base bubble",
    tokenBubbleId: "pill",
  },
  {
    id: "compact",
    label: "Compact chip",
    detail: "Smaller footprint",
    tokenBubbleId: "compact",
  },
  {
    id: "cost",
    label: "Cost + tokens",
    detail: "Cost and tokens",
    tokenBubbleId: "cost",
  },
  {
    id: "floating",
    label: "Floating badge",
    detail: "Side badge",
    tokenBubbleId: "pill",
  },
  {
    id: "hidden",
    label: "Hidden",
    detail: "No token frame",
    tokenBubbleId: "hidden",
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
