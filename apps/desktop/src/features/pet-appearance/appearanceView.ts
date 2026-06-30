import type { AccessoryId, MoodLookId, PetAppearanceSettings, TokenBubbleId, UsageSnapshot } from "../../types";
import { compactNumber } from "../../utils/format";
import { accessories, catTypes } from "./catalog";

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
  return accessories.find((accessory) => accessory.id === accessoryId);
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
