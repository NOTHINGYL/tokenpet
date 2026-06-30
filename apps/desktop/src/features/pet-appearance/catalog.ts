import type { AccessoryId, CatTypeId, MoodLookId, PetThemeId, TokenBubbleId } from "../../types";

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

export const catTypes = [
  {
    id: "golden-british" as CatTypeId,
    label: "Golden British",
    image: appearanceAsset("cat-types/golden-british.png"),
    badge: "Ready",
  },
  {
    id: "ragdoll" as CatTypeId,
    label: "Ragdoll",
    image: appearanceAsset("cat-types/ragdoll.png"),
    badge: "New",
  },
  {
    id: "silver-tabby" as CatTypeId,
    label: "Silver Tabby",
    image: appearanceAsset("cat-types/silver-tabby.png"),
    badge: "New",
  },
  {
    id: "black-cat" as CatTypeId,
    label: "Black Cat",
    image: appearanceAsset("cat-types/black-cat.png"),
    badge: "New",
  },
];

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
