import type { PetSurface } from "./petRigTypes";

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getAssetScaleForSurface(surface: PetSurface, catVisualScale: number | undefined) {
  if (surface === "desktop") return catVisualScale ?? 1;
  return catVisualScale ? 1.18 : 1;
}

export function getPetRenderScale(surface: PetSurface, userSize: number, catVisualScale: number | undefined) {
  const assetScale = getAssetScaleForSurface(surface, catVisualScale);
  const desiredScale = userSize * assetScale;

  if (surface === "desktop") return desiredScale;

  const maxPreviewFit = catVisualScale ? 1.32 : 1.16;
  return clamp(desiredScale, 0.68, maxPreviewFit);
}

export function getTokenRenderScale(surface: PetSurface, bubbleScale: number, petRenderScale: number, mode: "embedded" | "below" | "floating") {
  if (mode === "embedded") return bubbleScale;
  if (surface === "desktop") return bubbleScale * 0.68;
  return bubbleScale / Math.max(petRenderScale, 0.1);
}
