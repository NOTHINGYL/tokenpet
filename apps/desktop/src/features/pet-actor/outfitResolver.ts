import type { AccessoryId, PetAppearanceSettings } from "../../types";
import { getAccessory, getEffectiveTokenBubbleId, getTokenBubbleLabel, getTokenFrameOption, shouldShowMoodBadge } from "../pet-appearance/appearanceView";
import type { CatSkin, TokenFrameRenderMode } from "./actorTypes";

export type ResolvedOutfit = {
  accessoryIds: AccessoryId[];
  suppressedAccessoryIds: AccessoryId[];
  tokenMode: TokenFrameRenderMode;
  effectBehindHead: boolean;
  moodBadgeRaised: boolean;
};

function categoryPriority(accessoryId: AccessoryId) {
  const category = getAccessory(accessoryId)?.category;
  if (category === "head") return 40;
  if (category === "neck") return 30;
  if (category === "base") return 20;
  if (category === "effects") return 10;
  return 0;
}

export function resolveTokenMode(appearance: PetAppearanceSettings, skin: CatSkin): TokenFrameRenderMode {
  const frame = getTokenFrameOption(appearance);
  const bubble = getEffectiveTokenBubbleId(appearance);

  if (bubble === "hidden" || frame.mode === "hidden") return "hidden";
  if (frame.mode === "floating") return "floating";
  if (skin.tokenFrameMode === "embedded" && frame.mode === "embedded" && appearance.accessorySettings.textOnlyFrame) return "embedded";
  return "below";
}

export function resolveActorOutfit(appearance: PetAppearanceSettings, skin: CatSkin): ResolvedOutfit {
  const tokenMode = resolveTokenMode(appearance, skin);
  const builtIn = new Set(skin.builtInAccessoryIds ?? []);
  const suppressed = new Set<AccessoryId>();
  const categorySeen = new Map<string, AccessoryId>();
  const sorted = [...appearance.accessoryIds].sort((left, right) => categoryPriority(right) - categoryPriority(left));
  const resolved: AccessoryId[] = [];

  sorted.forEach((accessoryId) => {
    const accessory = getAccessory(accessoryId);
    if (!accessory || accessory.locked) return;

    if (skin.bodyType === "paw-frame" && accessory.category === "neck") {
      suppressed.add(accessoryId);
      return;
    }

    if (builtIn.has(accessoryId)) {
      suppressed.add(accessoryId);
      return;
    }

    if (categorySeen.has(accessory.category)) {
      suppressed.add(accessoryId);
      return;
    }

    categorySeen.set(accessory.category, accessoryId);
    resolved.push(accessoryId);
  });

  const headId = categorySeen.get("head");
  const effectId = categorySeen.get("effects");
  const baseId = categorySeen.get("base");

  return {
    accessoryIds: resolved,
    suppressedAccessoryIds: [...suppressed],
    tokenMode,
    effectBehindHead: Boolean(headId && effectId),
    moodBadgeRaised: Boolean(headId && shouldShowMoodBadge(appearance)),
  };
}

export function getActorTokenLabel(appearance: PetAppearanceSettings, usage: Parameters<typeof getTokenBubbleLabel>[1]) {
  return getTokenBubbleLabel(getEffectiveTokenBubbleId(appearance), usage);
}
