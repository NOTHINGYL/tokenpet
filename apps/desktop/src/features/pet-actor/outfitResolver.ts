import type { AccessoryId, PetAppearanceSettings } from "../../types";
import { getAccessory, getEffectiveTokenBubbleId, getTokenBubbleLabel } from "../pet-appearance/appearanceView";
import type { CatSkin, TokenFrameRenderMode } from "./actorTypes";

export type ResolvedOutfit = {
  accessoryIds: AccessoryId[];
  suppressedAccessoryIds: AccessoryId[];
  tokenMode: TokenFrameRenderMode;
  effectBehindHead: boolean;
  moodBadgeRaised: boolean;
};

export const STATIC_FALLBACK_RUNTIME_ACCESSORIES = false;

export function resolveTokenMode(_appearance: PetAppearanceSettings, _skin: CatSkin): TokenFrameRenderMode {
  // PetActorCanvas is the approved still-image fallback. None of its source
  // images declares baked token-frame pixels plus a validated text slot, so it
  // must never manufacture a frame or float text over the cat. The generated
  // Golden British renderer owns the real embedded-frame path.
  return "hidden";
}

export function resolveActorOutfit(appearance: PetAppearanceSettings, skin: CatSkin): ResolvedOutfit {
  const tokenMode = resolveTokenMode(appearance, skin);
  const suppressed = appearance.accessoryIds.filter((accessoryId) => {
    const accessory = getAccessory(accessoryId);
    return Boolean(accessory && !accessory.locked);
  });

  return {
    // Approved still images are complete compositions. Until a manifest declares
    // compatible overlay slots, old stored wearables must never be guessed onto them.
    accessoryIds: STATIC_FALLBACK_RUNTIME_ACCESSORIES ? suppressed : [],
    suppressedAccessoryIds: suppressed,
    tokenMode,
    effectBehindHead: false,
    moodBadgeRaised: false,
  };
}

export function getActorTokenLabel(
  appearance: PetAppearanceSettings,
  usage: Parameters<typeof getTokenBubbleLabel>[1],
  tokenValue?: number,
) {
  return getTokenBubbleLabel(getEffectiveTokenBubbleId(appearance), usage, tokenValue);
}
