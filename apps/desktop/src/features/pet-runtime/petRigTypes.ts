import type { SyntheticEvent } from "react";
import type { CatEyeColor, MoodLookId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import type { AccessoryCategoryId, CatBodyType } from "../pet-appearance/catalog";
import type { Anchor, CatOcclusionKey, CatOcclusionMask, CatRig } from "../pet-appearance/catRigs";

export type PetSurface = "preview" | "desktop";

export type PetActorProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  moodId?: MoodLookId;
  surface: PetSurface;
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export type PetSceneNodeKind = "cat" | "accessory" | "token" | "badge" | "shadow" | "effect" | "occlusion";

export type PetSceneMotionBinding = "root" | "body" | "head" | "neck" | "base" | "effect" | "badge" | "token" | "none";

export type PetSceneNodeTransform = {
  x: number;
  y: number;
  width: number;
  height?: number;
  scale: number;
  rotation: number;
  opacity: number;
  offsetX?: number;
  offsetY?: number;
};

export type PetSceneNode = {
  id: string;
  kind: PetSceneNodeKind;
  asset?: string;
  text?: string | null;
  label?: string;
  className?: string;
  layer: number;
  anchor?: Anchor;
  transform: PetSceneNodeTransform;
  motion?: PetSceneMotionBinding;
  mask?: CatOcclusionMask;
  maskKey?: CatOcclusionKey | "underChin" | "behindBody";
  accessoryCategory?: AccessoryCategoryId;
  interactive?: boolean;
};

export type PetTokenPlacement = {
  mode: "embedded" | "below" | "floating";
  textOnly: boolean;
  anchor: Anchor;
  width: number;
  height: number;
  fontSize: number;
};

export type PetScene = {
  id: string;
  surface: PetSurface;
  bodyType: CatBodyType;
  cat: {
    id: string;
    image: string;
    baseEyeColor: CatEyeColor;
    visualScale?: number;
  };
  rig: CatRig;
  moodId: MoodLookId;
  nodes: PetSceneNode[];
  tokenPlacement: PetTokenPlacement | null;
  tokenLabel: string | null;
  className: string;
  styleVars: Record<string, string>;
};

export const petSceneLayers = {
  groundShadow: 0,
  base: 10,
  backAccessory: 20,
  catBody: 40,
  embeddedToken: 47,
  contactShadow: 50,
  underChinAccessory: 52,
  occlusion: 58,
  frontAccessory: 64,
  belowToken: 68,
  moodBadge: 80,
  highlight: 88,
  effect: 96,
} as const;
