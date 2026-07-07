import type { AccessoryId, PetAppearanceSettings } from "../../types";
import { getAccessory } from "../pet-appearance/appearanceView";
import type { CatSkin, WearableAttachment, WearableKit } from "./actorTypes";
import type { ResolvedOutfit } from "./outfitResolver";

function attachment(asset: string | undefined, options: Omit<WearableAttachment, "asset">): WearableAttachment {
  return { ...options, asset };
}

function slotForAccessory(accessoryId: AccessoryId, skin: CatSkin, outfit: ResolvedOutfit): WearableAttachment[] {
  const accessory = getAccessory(accessoryId);
  if (!accessory) return [];

  const bodyVariant = accessory.bodyTypeVariants?.[skin.bodyType];
  const override = accessory.perCatOverrides?.[skin.id];
  const anchor = override?.attachTo ?? bodyVariant?.attachTo ?? accessory.attachTo;
  const scale = (override?.scale ?? override?.defaultScale ?? bodyVariant?.defaultScale ?? accessory.defaultScale ?? 1) * 0.92;
  const offsetX = override?.offsetX ?? bodyVariant?.offsetX ?? accessory.offsetX ?? 0;
  const offsetY = override?.offsetY ?? bodyVariant?.offsetY ?? accessory.offsetY ?? 0;
  const rotation = override?.rotation ?? override?.defaultRotation ?? bodyVariant?.defaultRotation ?? accessory.defaultRotation ?? 0;

  if (accessory.category === "base") {
    const baseYOffset = skin.tokenFrameMode === "embedded" ? 0.115 : 0.055;
    return [
      attachment(accessory.image, {
        slot: "baseBack",
        anchor: "base",
        scale: scale * (skin.bodyType === "paw-frame" ? 0.82 : 0.95),
        offsetX,
        offsetY: offsetY + baseYOffset,
        rotation,
      }),
    ];
  }

  if (accessory.category === "effects") {
    const behind = outfit.effectBehindHead || accessory.id === "leaf-drift";
    return [
      attachment(accessory.image, {
        slot: behind ? "effectBack" : "effectFront",
        anchor: accessory.id === "hot-sparks" ? "base" : "head",
        scale: scale * (behind ? 0.52 : 0.72),
        offsetX: offsetX + (behind ? 0.28 : 0.12),
        offsetY: offsetY + (behind ? -0.13 : -0.04),
        rotation,
        opacity: behind ? 0.72 : 0.86,
        clip: "none",
      }),
    ];
  }

  if (accessory.category === "neck") {
    const asset = accessory.image;
    return [
      attachment(asset, {
        slot: "neckBack",
        anchor,
        scale: scale * 1.04,
        offsetX,
        offsetY,
        rotation,
        opacity: 0.88,
        clip: "upper",
      }),
      attachment(asset, {
        slot: "neckFront",
        anchor,
        scale,
        offsetX,
        offsetY: offsetY + 0.018,
        rotation,
        clip: "lower",
      }),
    ];
  }

  if (accessory.category === "head") {
    const headYOffset = accessory.id === "study-glasses" ? 0.02 : accessory.id === "halo" ? -0.32 : -0.22;
    const headScale = accessory.id === "study-glasses" ? scale * 0.96 : accessory.id === "focus-crown" ? scale * 1.08 : scale * 0.96;
    return [
      attachment(accessory.image, {
        slot: accessory.id === "halo" ? "headBack" : "headFront",
        anchor,
        scale: headScale,
        offsetX,
        offsetY: offsetY + headYOffset,
        rotation,
      }),
    ];
  }

  return [];
}

export function getWearableKits(appearance: PetAppearanceSettings, skin: CatSkin, outfit: ResolvedOutfit): WearableKit[] {
  return outfit.accessoryIds.flatMap((accessoryId) => {
    const accessory = getAccessory(accessoryId);
    if (!accessory || accessory.perCatOverrides?.[skin.id]?.hidden) return [];

    return [
      {
        id: accessory.id,
        category: accessory.category,
        label: accessory.label,
        priority: 10,
        compatibleBodyTypes: [skin.bodyType],
        conflictGroup: accessory.category,
        attachments: slotForAccessory(accessory.id, skin, outfit),
      },
    ];
  });
}
