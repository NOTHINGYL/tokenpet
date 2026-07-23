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
  // Keep the desktop badge above the real focused-ear alpha. The compact v31
  // actor starts higher than the legacy frame, so the old 37% foot-line
  // offset let the badge overlap both ears during idle/hot transitions.
  const desiredBottom = footLineY - manifest.artboard.height * 0.42;
  const closeToActorY = Math.round(desiredBottom - declaredRect.height);
  return {
    ...declaredRect,
    y: clamp(Math.max(declaredRect.y, closeToActorY), 0, manifest.artboard.height - declaredRect.height),
  };
}
