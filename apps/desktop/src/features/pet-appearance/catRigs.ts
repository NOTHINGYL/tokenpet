import type { AccessoryId, CatTypeId } from "../../types";

export type Anchor = {
  x: number;
  y: number;
  width?: number;
  height?: number;
  angle?: number;
};

export type CatAnchorKey = "head" | "neck" | "face" | "base" | "tokenFrame";

export type CatRig = {
  id: CatTypeId;
  anchors: Partial<Record<CatAnchorKey, Anchor>>;
  tokenFrameMode?: "embedded" | "below" | "floating" | "hidden";
  accessoryScale?: number;
  builtInAccessoryIds?: AccessoryId[];
  occlusionMasks?: {
    chin?: string;
    frontPaws?: string;
    bodyFront?: string;
  };
};

const generatedCatAnchors: CatRig["anchors"] = {
  head: { x: 0.5, y: 0.38, width: 0.32, height: 0.24 },
  face: { x: 0.5, y: 0.43, width: 0.27, height: 0.15 },
  neck: { x: 0.5, y: 0.59, width: 0.25, height: 0.12 },
  base: { x: 0.5, y: 0.85, width: 0.64, height: 0.16 },
  tokenFrame: { x: 0.5, y: 0.88, width: 0.52, height: 0.18 },
};

function rig(id: CatTypeId, overrides: Partial<Omit<CatRig, "id">> = {}): CatRig {
  return {
    id,
    tokenFrameMode: "below",
    accessoryScale: 1,
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
    accessoryScale: 0.94,
    builtInAccessoryIds: ["collar"],
    anchors: {
      head: { x: 0.5, y: 0.38, width: 0.42, height: 0.28 },
      face: { x: 0.5, y: 0.47, width: 0.3, height: 0.15 },
      neck: { x: 0.5, y: 0.6, width: 0.25, height: 0.12 },
      base: { x: 0.5, y: 0.78, width: 0.7, height: 0.2 },
      tokenFrame: { x: 0.5, y: 0.815, width: 0.45, height: 0.18 },
    },
  }),
  ragdoll: rig("ragdoll", {
    accessoryScale: 0.96,
    anchors: {
      head: { x: 0.49, y: 0.38, width: 0.33, height: 0.25 },
      face: { x: 0.5, y: 0.43, width: 0.27, height: 0.16 },
      neck: { x: 0.5, y: 0.6, width: 0.23, height: 0.12 },
      base: { x: 0.5, y: 0.87, width: 0.68, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.88, width: 0.56, height: 0.18 },
    },
  }),
  "silver-tabby": rig("silver-tabby", {
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.42, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.24, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  "black-cat": rig("black-cat", {
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.33, height: 0.24 },
      face: { x: 0.5, y: 0.41, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.24, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  calico: rig("calico", {
    anchors: {
      head: { x: 0.5, y: 0.38, width: 0.32, height: 0.24 },
      face: { x: 0.5, y: 0.43, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.59, width: 0.25, height: 0.12 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  siamese: rig("siamese", {
    accessoryScale: 0.95,
    anchors: {
      head: { x: 0.5, y: 0.35, width: 0.29, height: 0.22 },
      face: { x: 0.5, y: 0.4, width: 0.24, height: 0.14 },
      neck: { x: 0.5, y: 0.57, width: 0.22, height: 0.1 },
      base: { x: 0.5, y: 0.86, width: 0.6, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.88, width: 0.5, height: 0.18 },
    },
  }),
  "maine-coon": rig("maine-coon", {
    accessoryScale: 1.03,
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.36, height: 0.27 },
      face: { x: 0.5, y: 0.42, width: 0.3, height: 0.17 },
      neck: { x: 0.5, y: 0.62, width: 0.25, height: 0.12 },
      base: { x: 0.5, y: 0.88, width: 0.72, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.89, width: 0.58, height: 0.18 },
    },
  }),
  "white-cat": rig("white-cat", {
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.41, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.57, width: 0.23, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  "orange-tabby": rig("orange-tabby", {
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.32, height: 0.24 },
      face: { x: 0.5, y: 0.42, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.59, width: 0.24, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  tuxedo: rig("tuxedo", {
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.32, height: 0.24 },
      face: { x: 0.5, y: 0.42, width: 0.27, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.24, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.52, height: 0.18 },
    },
  }),
  "scottish-fold": rig("scottish-fold", {
    accessoryScale: 0.98,
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.31, height: 0.22 },
      face: { x: 0.5, y: 0.41, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.23, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  bengal: rig("bengal", {
    anchors: {
      head: { x: 0.5, y: 0.35, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.4, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.23, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  persian: rig("persian", {
    accessoryScale: 1.02,
    anchors: {
      head: { x: 0.5, y: 0.37, width: 0.36, height: 0.28 },
      face: { x: 0.5, y: 0.43, width: 0.28, height: 0.16 },
      neck: { x: 0.5, y: 0.62, width: 0.24, height: 0.11 },
      base: { x: 0.5, y: 0.88, width: 0.72, height: 0.16 },
      tokenFrame: { x: 0.5, y: 0.89, width: 0.58, height: 0.18 },
    },
  }),
  "russian-blue": rig("russian-blue", {
    anchors: {
      head: { x: 0.5, y: 0.36, width: 0.31, height: 0.23 },
      face: { x: 0.5, y: 0.41, width: 0.26, height: 0.15 },
      neck: { x: 0.5, y: 0.58, width: 0.23, height: 0.11 },
      tokenFrame: { x: 0.5, y: 0.87, width: 0.5, height: 0.18 },
    },
  }),
  sphynx: rig("sphynx", {
    accessoryScale: 0.88,
    anchors: {
      head: { x: 0.5, y: 0.34, width: 0.29, height: 0.24 },
      face: { x: 0.5, y: 0.4, width: 0.24, height: 0.15 },
      neck: { x: 0.5, y: 0.59, width: 0.19, height: 0.1 },
      base: { x: 0.5, y: 0.86, width: 0.52, height: 0.15 },
      tokenFrame: { x: 0.5, y: 0.88, width: 0.45, height: 0.17 },
    },
  }),
};

export function getCatRig(catTypeId: CatTypeId): CatRig {
  return catRigs[catTypeId] ?? catRigs["golden-british"];
}
