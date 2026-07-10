import type { PetActorManifest, PetActorRect } from "../../../../../packages/pet-asset-schema/src";
import type { PetSurface } from "../pet-actor/actorTypes";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function resolveActorMoodBadgeRect(
  manifest: PetActorManifest,
  declaredRect: PetActorRect,
  surface: PetSurface,
): PetActorRect {
  if (surface !== "desktop") return declaredRect;

  const footLineY = manifest.footLineY ?? manifest.artboard.height * 0.82;
  const desiredBottom = footLineY - manifest.artboard.height * 0.37;
  const closeToActorY = Math.round(desiredBottom - declaredRect.height);
  return {
    ...declaredRect,
    y: clamp(Math.max(declaredRect.y, closeToActorY), 0, manifest.artboard.height - declaredRect.height),
  };
}
