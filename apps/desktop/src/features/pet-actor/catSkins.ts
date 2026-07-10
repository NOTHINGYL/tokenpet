import type { CatTypeId } from "../../types";
import { getCatType, getCatVisual } from "../pet-appearance/appearanceView";
import { getCatRig } from "../pet-appearance/catRigs";
import type { CatSkin, Rect } from "./actorTypes";

type SkinBounds = CatSkin["bounds"] & Pick<CatSkin, "footLineY">;

const generatedSittingBounds: SkinBounds = {
  visible: { x: 0.12, y: 0.03, width: 0.76, height: 0.84 },
  body: { x: 0.18, y: 0.12, width: 0.64, height: 0.7 },
  head: { x: 0.31, y: 0.09, width: 0.38, height: 0.38 },
  footLineY: 0.83,
};

const skinBounds: Partial<Record<CatTypeId, SkinBounds>> = {
  "golden-british": {
    visible: { x: 0.02, y: 0.03, width: 0.94, height: 0.84 },
    body: { x: 0.05, y: 0.08, width: 0.88, height: 0.62 },
    head: { x: 0.2, y: 0.12, width: 0.48, height: 0.42 },
    tokenFrame: { x: 0.365, y: 0.685, width: 0.38, height: 0.13 },
    footLineY: 0.76,
  },
  ragdoll: {
    visible: { x: 0.1, y: 0.02, width: 0.8, height: 0.86 },
    body: { x: 0.15, y: 0.1, width: 0.7, height: 0.72 },
    head: { x: 0.28, y: 0.08, width: 0.44, height: 0.42 },
    footLineY: 0.84,
  },
  "silver-tabby": {
    visible: { x: 0.15, y: 0.04, width: 0.7, height: 0.82 },
    body: { x: 0.21, y: 0.12, width: 0.58, height: 0.68 },
    head: { x: 0.32, y: 0.09, width: 0.36, height: 0.38 },
    footLineY: 0.82,
  },
  "black-cat": {
    visible: { x: 0.15, y: 0.04, width: 0.7, height: 0.82 },
    body: { x: 0.2, y: 0.11, width: 0.6, height: 0.69 },
    head: { x: 0.31, y: 0.08, width: 0.38, height: 0.39 },
    footLineY: 0.82,
  },
  siamese: {
    visible: { x: 0.16, y: 0.04, width: 0.68, height: 0.83 },
    body: { x: 0.23, y: 0.12, width: 0.54, height: 0.7 },
    head: { x: 0.33, y: 0.08, width: 0.34, height: 0.36 },
    footLineY: 0.83,
  },
  sphynx: {
    visible: { x: 0.18, y: 0.04, width: 0.64, height: 0.82 },
    body: { x: 0.25, y: 0.12, width: 0.5, height: 0.69 },
    head: { x: 0.35, y: 0.08, width: 0.3, height: 0.36 },
    footLineY: 0.83,
  },
  "maine-coon": {
    visible: { x: 0.08, y: 0.02, width: 0.84, height: 0.86 },
    body: { x: 0.13, y: 0.09, width: 0.74, height: 0.74 },
    head: { x: 0.28, y: 0.07, width: 0.44, height: 0.42 },
    footLineY: 0.85,
  },
  persian: {
    visible: { x: 0.09, y: 0.02, width: 0.82, height: 0.86 },
    body: { x: 0.14, y: 0.09, width: 0.72, height: 0.74 },
    head: { x: 0.29, y: 0.07, width: 0.42, height: 0.42 },
    footLineY: 0.85,
  },
};

function normalizeRect(rect: Rect): Rect {
  return {
    x: Math.min(Math.max(rect.x, 0), 1),
    y: Math.min(Math.max(rect.y, 0), 1),
    width: Math.min(Math.max(rect.width, 0.01), 1),
    height: Math.min(Math.max(rect.height, 0.01), 1),
  };
}

export function getCatSkin(catTypeId: CatTypeId): CatSkin {
  const visual = getCatVisual(catTypeId);
  const cat = getCatType(catTypeId);
  const rig = getCatRig(catTypeId);
  const bounds = skinBounds[catTypeId] ?? generatedSittingBounds;
  const anchors = Object.fromEntries(
    Object.entries(rig.anchors).map(([key, anchor]) => [key, { ...anchor, width: anchor.width ?? 0.01, height: anchor.height ?? 0.01 }]),
  ) as CatSkin["anchors"];

  return {
    id: cat.id,
    label: cat.label,
    bodyType: rig.bodyType,
    sourceImage: visual.image,
    attachments: {
      fullBody: visual.image,
      builtInTokenFrame: catTypeId === "golden-british" ? visual.image : undefined,
    },
    bounds: {
      visible: normalizeRect(bounds.visible),
      body: normalizeRect(bounds.body),
      head: normalizeRect(bounds.head),
      tokenFrame: bounds.tokenFrame ? normalizeRect(bounds.tokenFrame) : undefined,
    },
    anchors,
    footLineY: bounds.footLineY,
    tokenFrameMode: rig.tokenFrameMode ?? "below",
    builtInAccessoryIds: rig.builtInAccessoryIds,
  };
}
