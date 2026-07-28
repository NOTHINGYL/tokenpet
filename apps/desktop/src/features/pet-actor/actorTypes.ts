import type { SyntheticEvent } from "react";
import type { AccessoryId, CatTypeId, CursorTrackingVisual, MoodBadgeStyle, MoodLookId, MotionActionId, PetActionId, PetAppearanceSettings, TokenBubbleId, UsageSnapshot } from "../../types";
import type { AccessoryCategoryId, CatBodyType } from "../pet-appearance/catalog";

export type PetSurface = "preview" | "desktop";

export type PetActorProps = {
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  /** Explicit token total owned by the surface displaying this actor. */
  tokenValue?: number;
  moodId?: MoodLookId;
  moodBadgeVisible?: boolean;
  /** Per-mood presentation color configured by Mood & Reactions. */
  moodBadgeColor?: string;
  /** Shared Mood & Reactions badge presentation. */
  moodBadgeStyle?: MoodBadgeStyle;
  /** True only during the confirmed mood-entry pulse window. */
  moodBadgePulse?: boolean;
  /** Stable story/director action id. Prefer this over the legacy motionActionId. */
  actionId?: PetActionId;
  storyActionId?: PetActionId;
  motionActionId?: MotionActionId;
  reduceMotion?: boolean;
  pointerOffset?: { x: number; y: number };
  /** Approved whole-frame eye/head/ear selection for Play Cursor. */
  cursorTracking?: CursorTrackingVisual;
  /** Direction for authored side-profile locomotion frames. */
  facing?: "left" | "right";
  /** Selects an approved manifest raster variant (for example yarn colour). */
  actorVariant?: string;
  /** Explicitly restart a same-id authored animation, for example each snack lick cycle. */
  animationNonce?: number;
  /** Controlled sandbox clock. When present, the actor renders exactly this timeline position and does not start its own RAF clock. */
  previewTimeMs?: number;
  /** Epoch clock shared with native locomotion so authored frames and real window travel start together. */
  animationStartedAtMs?: number;
  /** Wall-clock duration of one authored loop; used to keep gait cadence locked to stride distance. */
  animationCycleDurationMs?: number;
  surface: PetSurface;
  onBubbleClick?: (event: SyntheticEvent) => void;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type BoneId = "root" | "body" | "head" | "leftEar" | "rightEar" | "leftPaw" | "rightPaw" | "tail" | "tokenFrame";

export type ActorSlotId =
  | "baseBack"
  | "bodyBack"
  | "neckBack"
  | "catBody"
  | "headBack"
  | "earBack"
  | "headFront"
  | "neckFront"
  | "pawFront"
  | "tokenFrame"
  | "tokenText"
  | "moodBadge"
  | "effectBack"
  | "effectFront";

export type PetMotionState =
  | "idle"
  | "blink"
  | "lookAround"
  | "hover"
  | "clickReact"
  | "dragging"
  | "dropBounce"
  | "sleepy"
  | "focused"
  | "hot"
  | "overdrive"
  | "tokenPulse";

export type ActorAnchorKey = "head" | "face" | "neck" | "chest" | "paws" | "base" | "tokenFrame" | "shadow";

export type ActorAnchor = Rect & {
  angle?: number;
};

export type PetActorModel = {
  canvas: { width: number; height: number };
  bodyBounds: Rect;
  headBounds: Rect;
  footLineY: number;
  tokenFrameBounds?: Rect;
  bones: BoneId[];
  slots: ActorSlotId[];
};

export type CatSkin = {
  id: CatTypeId;
  label: string;
  bodyType: CatBodyType;
  sourceImage: string;
  attachments: {
    fullBody: string;
    body?: string;
    head?: string;
    leftEar?: string;
    rightEar?: string;
    leftPaw?: string;
    rightPaw?: string;
    tail?: string;
    builtInTokenFrame?: string;
  };
  bounds: {
    visible: Rect;
    body: Rect;
    head: Rect;
    tokenFrame?: Rect;
  };
  anchors: Partial<Record<ActorAnchorKey, ActorAnchor>>;
  footLineY: number;
  tokenFrameMode: "embedded" | "below" | "floating" | "hidden";
  builtInAccessoryIds?: AccessoryId[];
};

export type WearableAttachment = {
  slot: ActorSlotId;
  asset?: string;
  anchor: ActorAnchorKey;
  scale: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  opacity?: number;
  clip?: "upper" | "lower" | "left" | "right" | "none";
  blendMode?: GlobalCompositeOperation;
};

export type WearableKit = {
  id: AccessoryId;
  category: AccessoryCategoryId;
  label: string;
  priority: number;
  compatibleBodyTypes: CatBodyType[];
  attachments: WearableAttachment[];
  conflictGroup?: string;
};

export type TokenFrameRenderMode = "embedded" | "below" | "floating" | "hidden";

export type ActorTokenFrame = {
  mode: TokenFrameRenderMode;
  tokenBubbleId: TokenBubbleId;
  label: string | null;
  rect: Rect;
  textOnly: boolean;
  fontSize: number;
};

export type ActorMoodBadge = {
  label: string;
  rect: Rect;
  tone: MoodLookId;
  color?: string;
  style: MoodBadgeStyle;
  entryPulse: boolean;
};

export type ActorRenderAttachment = WearableAttachment & {
  id: string;
  accessoryId?: AccessoryId;
  category?: AccessoryCategoryId;
};

export type PetActorFrame = {
  model: PetActorModel;
  skin: CatSkin;
  surface: PetSurface;
  moodId: MoodLookId;
  motionState: PetMotionState;
  appearance: PetAppearanceSettings;
  className: string;
  styleVars: Record<string, string>;
  renderScale: number;
  tokenFrame: ActorTokenFrame | null;
  moodBadge: ActorMoodBadge | null;
  attachments: ActorRenderAttachment[];
  hitAreas: {
    token?: Rect;
  };
};
