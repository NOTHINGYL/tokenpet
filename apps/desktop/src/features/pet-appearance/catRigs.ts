import type { AccessoryId, CatTypeId } from "../../types";
import type { CatBodyType } from "./catalog";

export type Anchor = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
};

export type CatAnchorKey = "head" | "neck" | "face" | "chest" | "base" | "tokenFrame";
export type CatOcclusionKey = "headFront" | "earsFront" | "chinFront" | "pawsFront" | "bodyFront";

export type CatOcclusionMask = Anchor & {
  shape?: "ellipse" | "inset";
  opacity?: number;
};

export type CatRig = {
  id: CatTypeId;
  bodyType: CatBodyType;
  anchors: Partial<Record<CatAnchorKey, Anchor>>;
  tokenFrameMode?: "embedded" | "below" | "floating" | "hidden";
  accessoryScale?: number;
  builtInAccessoryIds?: AccessoryId[];
  occlusionMasks?: Partial<Record<CatOcclusionKey, CatOcclusionMask | CatOcclusionMask[]>>;
};

const generatedCatAnchors: CatRig["anchors"] = {
  head: { x: 0.5, y: 0.38, width: 0.32, height: 0.24 },
  face: { x: 0.5, y: 0.43, width: 0.27, height: 0.15 },
  neck: { x: 0.5, y: 0.59, width: 0.25, height: 0.12 },
  chest: { x: 0.5, y: 0.68, width: 0.44, height: 0.18 },
  base: { x: 0.5, y: 0.85, width: 0.64, height: 0.16 },
  tokenFrame: { x: 0.5, y: 0.88, width: 0.52, height: 0.18 },
};

const roundOcclusionMasks: CatRig["occlusionMasks"] = {
  chinFront: { x: 0.5, y: 0.55, width: 0.34, height: 0.08, opacity: 0.98 },
  bodyFront: { x: 0.5, y: 0.66, width: 0.54, height: 0.2, opacity: 0.94 },
  pawsFront: [
    { x: 0.39, y: 0.74, width: 0.24, height: 0.13, opacity: 0.98 },
    { x: 0.61, y: 0.74, width: 0.24, height: 0.13, opacity: 0.98 },
  ],
};

function rig(id: CatTypeId, overrides: Partial<Omit<CatRig, "id">> = {}): CatRig {
  return {
    id,
    bodyType: "round",
    tokenFrameMode: "below",
    accessoryScale: 1,
    occlusionMasks: roundOcclusionMasks,
    ...overrides,
    anchors: {
      ...generatedCatAnchors,
      ...(overrides.anchors ?? {}),
    },
  };
}

export const catRigs: Record<CatTypeId, CatRig> = {
  "golden-british": rig("golden-british", {
    tokenFrameMode: "embedded",
    bodyType: "round",
    accessoryScale: 0.94,
    builtInAccessoryIds: ["collar"],
    occlusionMasks: {
      chinFront: { x: 0.5, y: 0.55, width: 0.44, height: 0.08, opacity: 0.98 },
      bodyFront: { x: 0.5, y: 0.66, width: 0.66, height: 0.22, opacity: 0.95 },
      pawsFront: [
        { x: 0.34, y: 0.73, width: 0.23, height: 0.13, opacity: 0.98 },
        { x: 0.5, y: 0.72, width: 0.24, height: 0.13, opacity: 0.98 },
      ],
    },
    anchors: {
      head: { x: 0.5, y: 0.38, width: 0.42, height: 0.28 },
      face: { x: 0.5, y: 0.47, width: 0.3, height: 0.15 },
      neck: { x: 0.5, y: 0.6, width: 0.25, height: 0.12 },
      chest: { x: 0.5, y: 0.68, width: 0.55, height: 0.2 },
      base: { x: 0.5, y: 0.78, width: 0.7, height: 0.2 },
      tokenFrame: { x: 0.5, y: 0.815, width: 0.45, height: 0.18 },
    },
  }),
  ragdoll: rig("ragdoll", {
    bodyType: "fluffy",
    accessoryScale: 0.96,
    occlusionMasks: {
      chinFront: { x: 0.5, y: 0.56, width: 0.38, height: 0.08, opacity: 0.98 },
      bodyFront: { x: 0.5, y: 0.68, width: 0.6, height: 0.22, opacity: 0.95 },
      pawsFront: { x: 0.5, y: 0.77, width: 0.52, height: 0.14, opacity: 0.98 },
    },
    anchors: {
      head: { x: 0.49, y: 0.38, width: 0.33, height: 0.25 },
      face: { x: 0.5, y: 0.43, width: 0.27, height: 0.16 },
      neck: { x: 0.5, y: 0.6, width: 0.23, height: 0.12 },
      chest: { x: 0.5, y: 0.69, width: 0.48, height: 0.2 },
      base: { x: 0.5, y: 0.87, width: 0.68, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.88, width: 0.56, height: 0.18 },
    },
  }),
  "silver-tabby": rig("silver-tabby", {
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.42, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.24, height: 0.11 },
      chest: { x: 0.5, y: 0.67, width: 0.43, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  "black-cat": rig("black-cat", {
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.33, height: 0.24 },
      face: { x: 0.5, y: 0.41, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.24, height: 0.11 },
      chest: { x: 0.5, y: 0.67, width: 0.44, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  calico: rig("calico", {
    anchors: {
      head: { x: 0.5, y: 0.38, width: 0.32, height: 0.24 },
      face: { x: 0.5, y: 0.43, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.59, width: 0.25, height: 0.12 },
      chest: { x: 0.5, y: 0.68, width: 0.45, height: 0.18 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  siamese: rig("siamese", {
    bodyType: "slim",
    accessoryScale: 0.95,
    occlusionMasks: {
      chinFront: { x: 0.5, y: 0.53, width: 0.28, height: 0.07, opacity: 0.98 },
      bodyFront: { x: 0.5, y: 0.66, width: 0.42, height: 0.17, opacity: 0.94 },
      pawsFront: { x: 0.5, y: 0.75, width: 0.42, height: 0.12, opacity: 0.98 },
    },
    anchors: {
      head: { x: 0.5, y: 0.35, width: 0.29, height: 0.22 },
      face: { x: 0.5, y: 0.4, width: 0.24, height: 0.14 },
      neck: { x: 0.5, y: 0.57, width: 0.22, height: 0.1 },
      chest: { x: 0.5, y: 0.66, width: 0.38, height: 0.16 },
      base: { x: 0.5, y: 0.86, width: 0.6, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.88, width: 0.5, height: 0.18 },
    },
  }),
  "maine-coon": rig("maine-coon", {
    bodyType: "fluffy",
    accessoryScale: 1.03,
    occlusionMasks: {
      chinFront: { x: 0.5, y: 0.57, width: 0.42, height: 0.09, opacity: 0.98 },
      bodyFront: { x: 0.5, y: 0.7, width: 0.64, height: 0.24, opacity: 0.95 },
      pawsFront: { x: 0.5, y: 0.78, width: 0.56, height: 0.14, opacity: 0.98 },
    },
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.36, height: 0.27 },
      face: { x: 0.5, y: 0.42, width: 0.3, height: 0.17 },
      neck: { x: 0.5, y: 0.62, width: 0.25, height: 0.12 },
      chest: { x: 0.5, y: 0.71, width: 0.54, height: 0.21 },
      base: { x: 0.5, y: 0.88, width: 0.72, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.89, width: 0.58, height: 0.18 },
    },
  }),
  "white-cat": rig("white-cat", {
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.41, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.57, width: 0.23, height: 0.11 },
      chest: { x: 0.5, y: 0.66, width: 0.42, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  "orange-tabby": rig("orange-tabby", {
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.32, height: 0.24 },
      face: { x: 0.5, y: 0.42, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.59, width: 0.24, height: 0.11 },
      chest: { x: 0.5, y: 0.68, width: 0.44, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  tuxedo: rig("tuxedo", {
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.32, height: 0.24 },
      face: { x: 0.5, y: 0.42, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.24, height: 0.11 },
      chest: { x: 0.5, y: 0.67, width: 0.44, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  "scottish-fold": rig("scottish-fold", {
    accessoryScale: 0.98,
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.31, height: 0.22 },
      face: { x: 0.5, y: 0.41, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.23, height: 0.11 },
      chest: { x: 0.5, y: 0.67, width: 0.42, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  bengal: rig("bengal", {
    anchors: {
      head: { x: 0.5, y: 0.35, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.4, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.23, height: 0.11 },
      chest: { x: 0.5, y: 0.67, width: 0.42, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  persian: rig("persian", {
    bodyType: "fluffy",
    accessoryScale: 1.02,
    occlusionMasks: {
      chinFront: { x: 0.5, y: 0.58, width: 0.44, height: 0.09, opacity: 0.98 },
      bodyFront: { x: 0.5, y: 0.7, width: 0.64, height: 0.23, opacity: 0.96 },
      pawsFront: { x: 0.5, y: 0.78, width: 0.56, height: 0.14, opacity: 0.98 },
    },
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.36, height: 0.28 },
      face: { x: 0.5, y: 0.43, width: 0.28, height: 0.16 },
      neck: { x: 0.5, y: 0.62, width: 0.24, height: 0.11 },
      chest: { x: 0.5, y: 0.71, width: 0.54, height: 0.21 },
      base: { x: 0.5, y: 0.88, width: 0.72, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.89, width: 0.58, height: 0.18 },
    },
  }),
  "russian-blue": rig("russian-blue", {
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.41, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.23, height: 0.11 },
      chest: { x: 0.5, y: 0.67, width: 0.42, height: 0.17 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  sphynx: rig("sphynx", {
    bodyType: "slim",
    accessoryScale: 0.88,
    occlusionMasks: {
      chinFront: { x: 0.5, y: 0.54, width: 0.26, height: 0.07, opacity: 0.98 },
      bodyFront: { x: 0.5, y: 0.67, width: 0.34, height: 0.16, opacity: 0.94 },
      pawsFront: { x: 0.5, y: 0.76, width: 0.36, height: 0.12, opacity: 0.98 },
    },
    anchors: {
      head: { x: 0.5, y: 0.34, width: 0.29, height: 0.24 },
      face: { x: 0.5, y: 0.4, width: 0.24, height: 0.15 },
      neck: { x: 0.5, y: 0.59, width: 0.19, height: 0.1 },
      chest: { x: 0.5, y: 0.67, width: 0.34, height: 0.16 },
      base: { x: 0.5, y: 0.86, width: 0.52, height: 0.15 },
      tokenFrame: { x: 0.5, y: 0.88, width: 0.45, height: 0.17 },
    },
  }),
};

export function getCatRig(catTypeId: CatTypeId): CatRig {
  return catRigs[catTypeId] ?? catRigs["golden-british"];
}
