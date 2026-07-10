export type PetActorSchemaVersion = "pet-actor/v1";
export type PetActorSourceSchemaVersion = "pet-actor-source/v1";

export type PetActorMood = "sleepy" | "focused" | "hot" | "overdrive";
export type PetActorMotionState =
  | "idle"
  | "idle-breathe"
  | "tail-wag"
  | "blink"
  | "stretch"
  | "run-across"
  | "jump"
  | "desk-nap"
  | "celebrate"
  | "pounce-cursor"
  | "edge-peek"
  | "hover"
  | "click"
  | "drag"
  | "drop";
export type PetActorTokenMode = "embedded" | "below" | "floating" | "hidden";
export type PetActorFrameAssetKind = "svg" | "png" | "webp" | "atlas";
export type PetActorSourcePose =
  | "source"
  | "sitting"
  | "tail-wag"
  | "blink"
  | "stretch"
  | "run"
  | "jump"
  | "nap"
  | "celebrate"
  | "pounce"
  | "edge-peek";

export type PetActorSize = {
  width: number;
  height: number;
};

export type PetActorRect = PetActorSize & {
  x: number;
  y: number;
};

export type PetActorPoint = {
  x: number;
  y: number;
};

export type PetActorTransform = {
  origin: PetActorPoint;
  translateX?: number;
  translateY?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
};

export type PetActorSourceAction = {
  label: string;
  mood: PetActorMood;
  pose?: PetActorSourcePose;
  effect: string;
  durationMs: number;
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export type PetActorSourceLayer = {
  id: string;
  kind: "image" | "vector" | "text" | "group";
  source?: string;
  rect: PetActorRect;
  opacity?: number;
  notes?: string;
};

export type PetActorSourceSpec = {
  schemaVersion: PetActorSourceSchemaVersion;
  actorId: string;
  displayName: string;
  breedId: string;
  sourceVersion: string;
  sourceImage: string;
  artboard: PetActorSize;
  sourceImagePlacement: PetActorRect;
  dynamicSlots: {
    tokenText: PetActorRect & {
      mode: PetActorTokenMode;
      maxFontSize: number;
      color: string;
    };
    moodBadge: PetActorRect & {
      maxFontSize: number;
    };
  };
  motion: {
    idle: {
      fps: number;
      breathAmplitude: number;
      bobAmplitude: number;
      durationMs: number;
    };
  };
  actions: Record<string, PetActorSourceAction>;
  moods: Record<
    PetActorMood,
    {
      label: string;
      accent: string;
      frameEffect: "none" | "sleep" | "warm-glow" | "spark";
    }
  >;
  sourceLayers: PetActorSourceLayer[];
  notes?: string;
};

export type PetActorFrameAsset = {
  id: string;
  mood: PetActorMood;
  src: string;
  kind: PetActorFrameAssetKind;
  rect: PetActorRect;
  durationMs: number;
  bodyTransform?: PetActorTransform;
};

export type PetActorAnimation = {
  id: string;
  mood: PetActorMood;
  motionState: PetActorMotionState;
  fps: number;
  loop: boolean;
  frames: PetActorFrameAsset[];
};

export type PetActorCapabilityStatus = "ready" | "fallback" | "planned" | "unavailable";
export type PetActorCapability = { id: string; status: PetActorCapabilityStatus; fallbackId?: string; reason?: string; uiBehavior?: "show" | "disable" | "hide" };

export type PetActorDynamicSlots = {
  tokenText: PetActorRect & {
    mode: PetActorTokenMode;
    color: string;
    maxFontSize: number;
    fontWeight: number;
  };
  externalToken?: PetActorRect & {
    mode: Exclude<PetActorTokenMode, "embedded" | "hidden">;
    maxFontSize: number;
  };
  moodBadge: PetActorRect & {
    maxFontSize: number;
  };
};

export type PetActorManifest = {
  schemaVersion: PetActorSchemaVersion;
  actorId: string;
  displayName: string;
  breedId: string;
  sourceVersion: string;
  generatedBy: string;
  generatedAt: string;
  contentHash: string;
  artboard: PetActorSize;
  defaultAnimation: string;
  defaultTokenMode: PetActorTokenMode;
  dynamicSlots: PetActorDynamicSlots;
  animations: Record<string, PetActorAnimation>;
  capabilities: PetActorCapability[];
  fallbackStaticImage?: string;
  visualReferences?: string[];
  sourceAssetHash?: string;
  compatibility: {
    bakedAccessories: string[];
    runtimeAccessoryPolicy: "disabled" | "compatible-only" | "freeform";
    supportedCatTypes: string[];
  };
};
