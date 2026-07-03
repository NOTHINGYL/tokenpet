import type { AccessoryId, AccessorySettings, CatTypeId, PetAppearanceSettings, TokenBubbleId, TokenFrameId } from "../../types";
import { tokenFrameOptions } from "./catalog";

const selectionKeys = ["neckId", "headId", "baseId", "effectId"] as const;

export type AccessorySettingsPatch = Omit<Partial<AccessorySettings>, "moodVisibility"> & {
  moodVisibility?: Partial<AccessorySettings["moodVisibility"]>;
};

export function getAccessoryIdsFromSettings(settings: AccessorySettings): AccessoryId[] {
  const ids = selectionKeys
    .map((key) => settings[key])
    .filter((id): id is AccessoryId => id !== "none");

  return Array.from(new Set(ids));
}

export function getTokenFrameForBubble(tokenBubbleId: TokenBubbleId, catTypeId: CatTypeId): TokenFrameId {
  if (tokenBubbleId === "hidden") return "hidden";
  if (tokenBubbleId === "compact") return "compact";
  if (tokenBubbleId === "cost") return "cost";
  return catTypeId === "golden-british" ? "embedded" : "pillow";
}

export function getTokenBubbleForFrame(tokenFrameId: TokenFrameId): TokenBubbleId {
  return tokenFrameOptions.find((option) => option.id === tokenFrameId)?.tokenBubbleId ?? "pill";
}

export function patchAccessorySettings(
  appearance: PetAppearanceSettings,
  patch: AccessorySettingsPatch,
): Pick<PetAppearanceSettings, "accessoryIds" | "accessorySettings" | "tokenBubbleId"> {
  const nextAccessorySettings: AccessorySettings = {
    ...appearance.accessorySettings,
    ...patch,
    moodVisibility: {
      ...appearance.accessorySettings.moodVisibility,
      ...(patch.moodVisibility ?? {}),
    },
  };

  return {
    accessoryIds: getAccessoryIdsFromSettings(nextAccessorySettings),
    accessorySettings: nextAccessorySettings,
    tokenBubbleId: getTokenBubbleForFrame(nextAccessorySettings.tokenFrameId),
  };
}
