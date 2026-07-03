import type { AccessoryId, MoodLookId, PetAppearanceSettings, TokenBubbleId, UsageSnapshot } from "../../types";
import { compactNumber } from "../../utils/format";
import { accessoryCatalog, catTokenBubbleLayouts, catTypes, defaultExternalTokenBubbleLayout, tokenFrameOptions } from "./catalog";

const moodLabels: Record<MoodLookId, string> = {
  sleepy: "sleepy",
  focused: "focused",
  hot: "hot",
  overdrive: "overdrive",
};

export const moodToneClass: Record<MoodLookId, string> = {
  sleepy: "sleepy",
  focused: "focused",
  hot: "hot",
  overdrive: "overdrive",
};

export function getCatType(catTypeId: PetAppearanceSettings["catTypeId"]) {
  return catTypes.find((cat) => cat.id === catTypeId) ?? catTypes[0];
}

export function getCatVisual(catTypeId: PetAppearanceSettings["catTypeId"]) {
  const cat = getCatType(catTypeId);
  if (cat.id !== "golden-british") return cat;

  return {
    ...cat,
    image: "assets/pets/cat-desktop.png",
  };
}

export function getAccessory(accessoryId: AccessoryId) {
  return accessoryCatalog.find((accessory) => accessory.id === accessoryId);
}

export function getTokenFrameOption(appearance: PetAppearanceSettings) {
  return tokenFrameOptions.find((option) => option.id === appearance.accessorySettings.tokenFrameId) ?? tokenFrameOptions[0];
}

export function getEffectiveTokenBubbleId(appearance: PetAppearanceSettings): TokenBubbleId {
  if (appearance.tokenBubbleId !== "pill") return appearance.tokenBubbleId;
  return getTokenFrameOption(appearance).tokenBubbleId ?? appearance.tokenBubbleId;
}

export function getResolvedTokenBubbleLayout(appearance: PetAppearanceSettings) {
  const frame = getTokenFrameOption(appearance);
  if (appearance.tokenBubbleId === "hidden" || frame.id === "hidden") return null;

  const catLayout = catTokenBubbleLayouts[appearance.catTypeId] ?? defaultExternalTokenBubbleLayout;
  if (frame.id === "floating") {
    return {
      ...defaultExternalTokenBubbleLayout,
      mode: "floating" as const,
      anchorX: 0.92,
      anchorY: 0.56,
      width: appearance.tokenBubbleId === "cost" ? 138 : 112,
      height: 42,
    };
  }

  if (appearance.catTypeId === "golden-british" && frame.id === "embedded" && appearance.accessorySettings.textOnlyFrame) {
    return catLayout;
  }

  return {
    ...defaultExternalTokenBubbleLayout,
    ...catLayout,
    mode: "external" as const,
    textOnly: false,
  };
}

export function getMoodLabel(moodId: MoodLookId) {
  return moodLabels[moodId];
}

export function shouldShowMoodBadge(appearance: PetAppearanceSettings, moodId = appearance.moodId) {
  if (!appearance.moodBadge.showMood) return false;
  if (appearance.moodBadge.hideInFocusMode && moodId === "focused") return false;
  return true;
}

export function getTokenBubbleLabel(
  tokenBubbleId: TokenBubbleId,
  usage: UsageSnapshot,
  tokenValue = usage.sevenDayTokens || usage.todayTokens,
) {
  if (tokenBubbleId === "hidden") return null;

  const tokenLabel = compactNumber(tokenValue);
  if (tokenBubbleId !== "cost") return tokenLabel;

  const cost = usage.sevenDayCost || usage.todayCost;
  return `$${cost.toFixed(cost >= 100 ? 0 : 2)} • ${tokenLabel}`;
}
