export const PET_ACTOR_SCHEMA_VERSION = "pet-actor/v2" as const;
export const PET_ACTOR_SOURCE_SCHEMA_VERSION = "pet-actor-source/v2" as const;

export type PetActorSchemaVersion = typeof PET_ACTOR_SCHEMA_VERSION;
export type PetActorSourceSchemaVersion = typeof PET_ACTOR_SOURCE_SCHEMA_VERSION;

export const PET_ACTOR_MOODS = ["sleepy", "focused", "hot", "overdrive"] as const;
export type PetActorMood = (typeof PET_ACTOR_MOODS)[number];

export const PET_ACTOR_LIFE_STAGES = ["egg", "newKitten", "deskBuddy", "flowCompanion", "guardianCompanion"] as const;
export type PetActorLifeStage = (typeof PET_ACTOR_LIFE_STAGES)[number];

export const PET_ACTOR_ACTION_IDS = [
  "hatch",
  "idle_breathe",
  "blink",
  "sleep_loop",
  "focus_loop",
  "hot_loop",
  "overdrive_loop",
  "click_purr",
  "drag_dangle",
  "drop_bounce",
  "token_snack",
  "play_cursor",
  "run_across",
  "walk_round_trip",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_screen",
  "summon_to_pointer",
  "capture_moment",
  "milestone_celebrate",
  "level_up",
  "daily_digest",
  "settle_down",
  "focus_start",
  "cool_down",
] as const;
export type PetActorActionId = (typeof PET_ACTOR_ACTION_IDS)[number];

export const PET_ACTOR_QUICK_PLAY_ACTION_IDS = [
  "walk_round_trip",
  "token_snack",
  "play_cursor",
  "drag_dangle",
  "toss_yarn",
  "nap_here",
  "wake_up",
  "summon_to_pointer",
  "capture_moment",
] as const;
export type QuickPlayActionId = (typeof PET_ACTOR_QUICK_PLAY_ACTION_IDS)[number];

export type PetActorAnimationKind = "loop" | "oneShot" | "transition";
export type PetActorTokenMode = "embedded" | "below" | "floating" | "hidden";
export type PetActorFrameAssetKind = "png" | "webp" | "atlas";
export type PetActorCapabilityStatus = "ready" | "fallback" | "planned" | "unavailable";

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

export type PetActorDynamicSlot = PetActorRect & {
  align?: "left" | "center" | "right";
  maxTextLength?: number;
};

export type PetActorTokenSlot = PetActorDynamicSlot & {
  mode: PetActorTokenMode;
  color: string;
  maxFontSize: number;
  fontWeight: number;
};

export type PetActorMoodBadgeSlot = PetActorDynamicSlot & {
  maxFontSize: number;
};

export type PetActorSourceFrame = {
  src: string;
  kind: "approved-raster";
  expectedSha256: string;
  durationMs?: number;
  bodyTransform?: PetActorTransform;
};

export type PetActorSourceAction = {
  label: string;
  kind: PetActorAnimationKind;
  mood: PetActorMood;
  sourceFrames: PetActorSourceFrame[];
  fps: number;
  loop: boolean;
  priority: number;
  cooldownMs?: number;
  reducedMotionFallback?: PetActorActionId;
  bodyTransform?: PetActorTransform;
};

export type PetActorSourceLayer = {
  id: string;
  kind: "image" | "text" | "group";
  source?: string;
  rect: PetActorRect;
  opacity?: number;
  notes?: string;
};

export type PetActorCapability = {
  id: PetActorActionId;
  status: PetActorCapabilityStatus;
  fallbackId?: PetActorActionId;
  reason?: string;
  uiBehavior?: "show" | "disable" | "hide";
  runtimeBehavior?: "animation" | "reposition" | "capture" | "choreography";
};

export type PetActorCompatibility = {
  bakedAccessories: string[];
  runtimeAccessoryPolicy: "disabled" | "compatible-only";
  supportedCatTypes: string[];
  tokenFramePolicy: "embedded-only" | "manifest-declared";
};

export type PetActorSourceSpec = {
  schemaVersion: PetActorSourceSchemaVersion;
  actorId: string;
  displayName: string;
  breedId: string;
  sourceVersion: string;
  lifecycleStage: PetActorLifeStage;
  sourceImage: string;
  sourceImageSha256: string;
  artboard: PetActorSize;
  sourceImagePlacement: PetActorRect;
  footLineY?: number;
  tokenSlot: Omit<PetActorTokenSlot, "fontWeight"> & { fontWeight?: number };
  moodBadgeSlot: PetActorMoodBadgeSlot;
  actions: Partial<Record<PetActorActionId, PetActorSourceAction>>;
  capabilities: PetActorCapability[];
  sourceLayers: PetActorSourceLayer[];
  visualReferences: string[];
  fallbackStaticImage: string;
  compatibility: PetActorCompatibility;
  notes?: string;
};

export type PetActorFrameAsset = {
  id: string;
  mood: PetActorMood;
  src: string;
  kind: PetActorFrameAssetKind;
  rect: PetActorRect;
  durationMs: number;
  sha256: string;
  sourceAssetId: string;
  bodyTransform?: PetActorTransform;
};

export type PetActorAnimation = {
  id: string;
  kind: PetActorAnimationKind;
  mood: PetActorMood;
  motionState: PetActorActionId | "idle";
  fps: number;
  loop: boolean;
  priority?: number;
  moodTags?: PetActorMood[];
  stageTags?: PetActorLifeStage[];
  cooldownMs?: number;
  reducedMotionFallback?: PetActorActionId;
  frames: PetActorFrameAsset[];
};

export type PetActorDynamicSlots = {
  /** Compatibility mirror for runtime code while it migrates to `tokenSlot`. */
  tokenText: PetActorTokenSlot;
  /** Golden British intentionally omits this: its cream token frame is baked. */
  externalToken?: PetActorDynamicSlot & {
    mode: "below" | "floating";
    maxFontSize: number;
  };
  /** Compatibility mirror for runtime code while it migrates to `moodBadgeSlot`. */
  moodBadge: PetActorMoodBadgeSlot;
};

export type PetActorReproducibility = {
  generator: string;
  generatorVersion: string;
  sourceSpecSha256: string;
  inputSetSha256: string;
};

export type PetActorManifest = {
  schemaVersion: PetActorSchemaVersion;
  actorId: string;
  displayName: string;
  breedId: string;
  sourceVersion: string;
  lifecycleStage: PetActorLifeStage;
  generatedBy: string;
  generatedAt: string;
  contentHash: string;
  sourceAssetHash: string;
  artboard: PetActorSize;
  footLineY?: number;
  defaultAnimation: string;
  defaultTokenMode: PetActorTokenMode;
  tokenSlot: PetActorTokenSlot;
  moodBadgeSlot: PetActorMoodBadgeSlot;
  dynamicSlots: PetActorDynamicSlots;
  animations: Record<string, PetActorAnimation>;
  capabilities: PetActorCapability[];
  fallbackStaticImage: string;
  visualReferences: string[];
  compatibility: PetActorCompatibility;
  reproducibility: PetActorReproducibility;
};

export type PetActorValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type PetActorValidationResult<T> =
  | { success: true; data: T; issues: [] }
  | { success: false; issues: PetActorValidationIssue[] };

export class PetActorManifestValidationError extends Error {
  readonly issues: PetActorValidationIssue[];

  constructor(issues: PetActorValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "PetActorManifestValidationError";
    this.issues = issues;
  }
}

const actionIds = new Set<string>(PET_ACTOR_ACTION_IDS);
const quickPlayActionIds = new Set<string>(PET_ACTOR_QUICK_PLAY_ACTION_IDS);
const moods = new Set<string>(PET_ACTOR_MOODS);
const lifeStages = new Set<string>(PET_ACTOR_LIFE_STAGES);
const sha256Pattern = /^[a-f0-9]{64}$/;
const relativeAssetPattern = /^(?![a-z]+:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: PetActorValidationIssue[], code: string, path: string, message: string) {
  issues.push({ code, path, message });
}

function validateNonEmptyString(value: unknown, issues: PetActorValidationIssue[], path: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    pushIssue(issues, "string.required", path, "must be a non-empty string");
    return false;
  }
  return true;
}

function validateSha256(value: unknown, issues: PetActorValidationIssue[], path: string) {
  if (typeof value !== "string" || !sha256Pattern.test(value)) {
    pushIssue(issues, "hash.sha256", path, "must be a lowercase 64-character SHA-256 hex digest");
    return false;
  }
  return true;
}

function validateRelativePath(value: unknown, issues: PetActorValidationIssue[], path: string) {
  if (!validateNonEmptyString(value, issues, path)) return false;
  if (!relativeAssetPattern.test(value as string)) {
    pushIssue(issues, "path.relative", path, "must be a safe relative asset path without URL schemes or parent traversal");
    return false;
  }
  return true;
}

function validateSize(value: unknown, issues: PetActorValidationIssue[], path: string): value is PetActorSize {
  if (!isRecord(value)) {
    pushIssue(issues, "size.required", path, "must be an object with positive width and height");
    return false;
  }
  let valid = true;
  for (const key of ["width", "height"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0) {
      pushIssue(issues, "size.positive", `${path}.${key}`, "must be a positive finite number");
      valid = false;
    }
  }
  return valid;
}

function validateRect(value: unknown, artboard: PetActorSize | null, issues: PetActorValidationIssue[], path: string): value is PetActorRect {
  if (!isRecord(value)) {
    pushIssue(issues, "rect.required", path, "must be an object with x, y, width, and height");
    return false;
  }

  let valid = validateSize(value, issues, path);
  for (const key of ["x", "y"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0) {
      pushIssue(issues, "rect.nonnegative", `${path}.${key}`, "must be a non-negative finite number");
      valid = false;
    }
  }

  if (valid && artboard) {
    const rect = value as PetActorRect;
    if (rect.x + rect.width > artboard.width || rect.y + rect.height > artboard.height) {
      pushIssue(issues, "rect.bounds", path, "must fit completely inside the actor artboard");
      valid = false;
    }
  }
  return valid;
}

function validateTransform(value: unknown, issues: PetActorValidationIssue[], path: string) {
  if (!isRecord(value) || !isRecord(value.origin)) {
    pushIssue(issues, "transform.origin", path, "must include an origin point");
    return;
  }
  for (const key of ["x", "y"] as const) {
    if (typeof value.origin[key] !== "number" || !Number.isFinite(value.origin[key])) {
      pushIssue(issues, "transform.number", `${path}.origin.${key}`, "must be a finite number");
    }
  }
  for (const key of ["translateX", "translateY", "scaleX", "scaleY", "rotation"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      pushIssue(issues, "transform.number", `${path}.${key}`, "must be a finite number when provided");
    }
  }
}

function validateTokenSlot(value: unknown, artboard: PetActorSize | null, issues: PetActorValidationIssue[], path: string) {
  if (!validateRect(value, artboard, issues, path) || !isRecord(value)) return;
  const slot = value as Record<string, unknown>;
  if (!["embedded", "below", "floating", "hidden"].includes(String(slot.mode))) {
    pushIssue(issues, "slot.token.mode", `${path}.mode`, "must be embedded, below, floating, or hidden");
  }
  if (typeof slot.maxFontSize !== "number" || slot.maxFontSize <= 0 || slot.maxFontSize > value.height) {
    pushIssue(issues, "slot.fontSize", `${path}.maxFontSize`, "must be positive and no larger than the slot height");
  }
  if (slot.fontWeight !== undefined && (typeof slot.fontWeight !== "number" || slot.fontWeight < 100 || slot.fontWeight > 1000)) {
    pushIssue(issues, "slot.fontWeight", `${path}.fontWeight`, "must be between 100 and 1000");
  }
  validateNonEmptyString(slot.color, issues, `${path}.color`);
}

function validateMoodBadgeSlot(value: unknown, artboard: PetActorSize | null, issues: PetActorValidationIssue[], path: string) {
  if (!validateRect(value, artboard, issues, path) || !isRecord(value)) return;
  const slot = value as Record<string, unknown>;
  if (typeof slot.maxFontSize !== "number" || slot.maxFontSize <= 0 || slot.maxFontSize > value.height) {
    pushIssue(issues, "slot.fontSize", `${path}.maxFontSize`, "must be positive and no larger than the slot height");
  }
}

function validateCapabilityList(
  value: unknown,
  animations: Record<string, unknown> | null,
  sourceActions: Record<string, unknown> | null,
  issues: PetActorValidationIssue[],
  path: string,
) {
  if (!Array.isArray(value)) {
    pushIssue(issues, "capability.required", path, "must be an array");
    return;
  }

  const capabilities = new Map<string, Record<string, unknown>>();
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      pushIssue(issues, "capability.object", entryPath, "must be an object");
      return;
    }
    if (typeof entry.id !== "string" || !actionIds.has(entry.id)) {
      pushIssue(issues, "capability.id", `${entryPath}.id`, "must use a stable action id from the story contract");
      return;
    }
    if (capabilities.has(entry.id)) {
      pushIssue(issues, "capability.duplicate", `${entryPath}.id`, `duplicates capability ${entry.id}`);
    }
    capabilities.set(entry.id, entry);

    if (!["ready", "fallback", "planned", "unavailable"].includes(String(entry.status))) {
      pushIssue(issues, "capability.status", `${entryPath}.status`, "must be ready, fallback, planned, or unavailable");
      return;
    }

    if (entry.status === "ready") {
      if (entry.fallbackId !== undefined) {
        pushIssue(issues, "capability.readyFallback", `${entryPath}.fallbackId`, "ready capabilities must not declare a fallback");
      }
      const animationKey = `action.${entry.id}`;
      if (animations && !animations[animationKey]) {
        pushIssue(issues, "capability.readyAnimation", entryPath, `ready capability must have a same-id ${animationKey} animation`);
      }
      if (sourceActions && !sourceActions[entry.id]) {
        pushIssue(issues, "capability.readySource", entryPath, `ready capability must have a same-id source action ${entry.id}`);
      }
    } else if (entry.status === "fallback") {
      if (typeof entry.fallbackId !== "string" || !actionIds.has(entry.fallbackId)) {
        pushIssue(issues, "capability.fallbackId", `${entryPath}.fallbackId`, "fallback capabilities must name a stable fallback action id");
      } else if (entry.fallbackId === entry.id) {
        pushIssue(issues, "capability.fallbackSelf", `${entryPath}.fallbackId`, "must not fall back to itself");
      }
    } else if (entry.fallbackId !== undefined) {
      pushIssue(issues, "capability.nonPlaybackFallback", `${entryPath}.fallbackId`, `${entry.status} capabilities must not declare fallbackId`);
    }
  });

  for (const quickActionId of quickPlayActionIds) {
    if (!capabilities.has(quickActionId)) {
      pushIssue(issues, "capability.quickPlayCoverage", path, `must represent Quick Play action ${quickActionId}`);
    }
  }

  for (const [capabilityId, capability] of capabilities) {
    if (capability.status !== "fallback" || typeof capability.fallbackId !== "string") continue;
    const chain = new Set<string>([capabilityId]);
    let currentId = capability.fallbackId;
    while (true) {
      if (chain.has(currentId)) {
        pushIssue(issues, "capability.fallbackCycle", path, `fallback chain for ${capabilityId} contains a cycle at ${currentId}`);
        break;
      }
      chain.add(currentId);
      const target = capabilities.get(currentId);
      if (!target) {
        pushIssue(issues, "capability.fallbackMissing", path, `fallback target ${currentId} for ${capabilityId} is not declared`);
        break;
      }
      if (target.status === "ready") break;
      if (target.status !== "fallback" || typeof target.fallbackId !== "string") {
        pushIssue(issues, "capability.fallbackTerminal", path, `fallback chain for ${capabilityId} must end at a ready capability`);
        break;
      }
      currentId = target.fallbackId;
    }
  }
}

function validateCompatibility(value: unknown, issues: PetActorValidationIssue[], path: string) {
  if (!isRecord(value)) {
    pushIssue(issues, "compatibility.required", path, "must be an object");
    return;
  }
  if (!Array.isArray(value.bakedAccessories) || value.bakedAccessories.some((item) => typeof item !== "string")) {
    pushIssue(issues, "compatibility.accessories", `${path}.bakedAccessories`, "must be a string array");
  }
  if (!["disabled", "compatible-only"].includes(String(value.runtimeAccessoryPolicy))) {
    pushIssue(issues, "compatibility.runtimeAccessoryPolicy", `${path}.runtimeAccessoryPolicy`, "must be disabled or compatible-only; freeform overlays cannot ship");
  }
  if (!Array.isArray(value.supportedCatTypes) || value.supportedCatTypes.length === 0 || value.supportedCatTypes.some((item) => typeof item !== "string")) {
    pushIssue(issues, "compatibility.catTypes", `${path}.supportedCatTypes`, "must be a non-empty string array");
  }
  if (!["embedded-only", "manifest-declared"].includes(String(value.tokenFramePolicy))) {
    pushIssue(issues, "compatibility.tokenFramePolicy", `${path}.tokenFramePolicy`, "must be embedded-only or manifest-declared");
  }
}

function slotsMatch(left: unknown, right: unknown) {
  if (!isRecord(left) || !isRecord(right)) return false;
  return ["x", "y", "width", "height", "maxFontSize"].every((key) => left[key] === right[key]);
}

export function validatePetActorManifest(value: unknown): PetActorValidationResult<PetActorManifest> {
  const issues: PetActorValidationIssue[] = [];
  if (!isRecord(value)) {
    return { success: false, issues: [{ code: "manifest.object", path: "$", message: "manifest must be an object" }] };
  }

  if (value.schemaVersion !== PET_ACTOR_SCHEMA_VERSION) {
    pushIssue(issues, "manifest.schemaVersion", "$.schemaVersion", `must be ${PET_ACTOR_SCHEMA_VERSION}`);
  }
  for (const key of ["actorId", "displayName", "breedId", "sourceVersion", "generatedBy", "generatedAt", "fallbackStaticImage"] as const) {
    validateNonEmptyString(value[key], issues, `$.${key}`);
  }
  validateSha256(value.contentHash, issues, "$.contentHash");
  validateSha256(value.sourceAssetHash, issues, "$.sourceAssetHash");
  if (!lifeStages.has(String(value.lifecycleStage))) {
    pushIssue(issues, "manifest.lifecycleStage", "$.lifecycleStage", "must be a lifecycle stage from the story contract");
  }

  const artboard = validateSize(value.artboard, issues, "$.artboard") ? value.artboard : null;
  validateTokenSlot(value.tokenSlot, artboard, issues, "$.tokenSlot");
  validateMoodBadgeSlot(value.moodBadgeSlot, artboard, issues, "$.moodBadgeSlot");

  if (!isRecord(value.dynamicSlots)) {
    pushIssue(issues, "slot.dynamicSlots", "$.dynamicSlots", "must include compatibility slot mirrors");
  } else {
    validateTokenSlot(value.dynamicSlots.tokenText, artboard, issues, "$.dynamicSlots.tokenText");
    validateMoodBadgeSlot(value.dynamicSlots.moodBadge, artboard, issues, "$.dynamicSlots.moodBadge");
    if (!slotsMatch(value.tokenSlot, value.dynamicSlots.tokenText)) {
      pushIssue(issues, "slot.tokenMirror", "$.dynamicSlots.tokenText", "must match the top-level tokenSlot geometry");
    }
    if (!slotsMatch(value.moodBadgeSlot, value.dynamicSlots.moodBadge)) {
      pushIssue(issues, "slot.moodMirror", "$.dynamicSlots.moodBadge", "must match the top-level moodBadgeSlot geometry");
    }
  }

  const animations = isRecord(value.animations) ? value.animations : null;
  if (!animations || Object.keys(animations).length === 0) {
    pushIssue(issues, "animation.required", "$.animations", "must contain at least one manifest animation");
  } else {
    for (const [animationKey, animation] of Object.entries(animations)) {
      const animationPath = `$.animations.${animationKey}`;
      if (!isRecord(animation)) {
        pushIssue(issues, "animation.object", animationPath, "must be an object");
        continue;
      }
      if (animation.id !== animationKey) {
        pushIssue(issues, "animation.idKey", `${animationPath}.id`, "must exactly match its animations record key");
      }
      if (!["loop", "oneShot", "transition"].includes(String(animation.kind))) {
        pushIssue(issues, "animation.kind", `${animationPath}.kind`, "must be loop, oneShot, or transition");
      }
      if (!moods.has(String(animation.mood))) {
        pushIssue(issues, "animation.mood", `${animationPath}.mood`, "must be a supported actor mood");
      }
      if (typeof animation.motionState !== "string" || (animation.motionState !== "idle" && !actionIds.has(animation.motionState))) {
        pushIssue(issues, "animation.motionState", `${animationPath}.motionState`, "must use a stable story action id or idle");
      }
      if (typeof animation.fps !== "number" || !Number.isFinite(animation.fps) || animation.fps <= 0 || animation.fps > 120) {
        pushIssue(issues, "animation.fps", `${animationPath}.fps`, "must be between 0 and 120");
      }
      if (typeof animation.loop !== "boolean") {
        pushIssue(issues, "animation.loop", `${animationPath}.loop`, "must be boolean");
      }
      if (!Array.isArray(animation.frames) || animation.frames.length === 0) {
        pushIssue(issues, "animation.frames", `${animationPath}.frames`, "must contain at least one approved raster frame");
        continue;
      }
      animation.frames.forEach((frame, frameIndex) => {
        const framePath = `${animationPath}.frames[${frameIndex}]`;
        if (!isRecord(frame)) {
          pushIssue(issues, "frame.object", framePath, "must be an object");
          return;
        }
        validateNonEmptyString(frame.id, issues, `${framePath}.id`);
        validateRelativePath(frame.src, issues, `${framePath}.src`);
        if (!["png", "webp", "atlas"].includes(String(frame.kind))) {
          pushIssue(issues, "frame.productionKind", `${framePath}.kind`, "production frames must be PNG, WebP, or atlas entries; SVG geometry is forbidden");
        }
        if (frame.kind === "png" && typeof frame.src === "string" && !frame.src.endsWith(".png")) {
          pushIssue(issues, "frame.extension", `${framePath}.src`, "PNG frames must use a .png source");
        }
        if (frame.kind === "webp" && typeof frame.src === "string" && !frame.src.endsWith(".webp")) {
          pushIssue(issues, "frame.extension", `${framePath}.src`, "WebP frames must use a .webp source");
        }
        validateRect(frame.rect, artboard, issues, `${framePath}.rect`);
        validateSha256(frame.sha256, issues, `${framePath}.sha256`);
        validateNonEmptyString(frame.sourceAssetId, issues, `${framePath}.sourceAssetId`);
        if (typeof frame.durationMs !== "number" || !Number.isFinite(frame.durationMs) || frame.durationMs <= 0) {
          pushIssue(issues, "frame.duration", `${framePath}.durationMs`, "must be a positive duration");
        }
        if (frame.bodyTransform !== undefined) validateTransform(frame.bodyTransform, issues, `${framePath}.bodyTransform`);
      });
    }
  }

  if (typeof value.defaultAnimation !== "string" || !animations?.[value.defaultAnimation]) {
    pushIssue(issues, "animation.default", "$.defaultAnimation", "must reference an animation declared in the manifest");
  }

  validateCapabilityList(value.capabilities, animations, null, issues, "$.capabilities");

  if (!Array.isArray(value.visualReferences) || value.visualReferences.length === 0) {
    pushIssue(issues, "manifest.visualReferences", "$.visualReferences", "must record at least one approved visual reference");
  } else {
    value.visualReferences.forEach((reference, index) => validateRelativePath(reference, issues, `$.visualReferences[${index}]`));
  }

  validateCompatibility(value.compatibility, issues, "$.compatibility");
  if (isRecord(value.compatibility) && value.compatibility.tokenFramePolicy === "embedded-only") {
    if (!isRecord(value.tokenSlot) || value.tokenSlot.mode !== "embedded") {
      pushIssue(issues, "slot.embeddedPolicy", "$.tokenSlot.mode", "embedded-only actors must use an embedded tokenSlot");
    }
    if (isRecord(value.dynamicSlots) && value.dynamicSlots.externalToken !== undefined) {
      pushIssue(issues, "slot.duplicateTokenFrame", "$.dynamicSlots.externalToken", "embedded-only actors must not declare a second external token frame");
    }
  }

  if (!isRecord(value.reproducibility)) {
    pushIssue(issues, "manifest.reproducibility", "$.reproducibility", "must record reproducible input metadata");
  } else {
    validateNonEmptyString(value.reproducibility.generator, issues, "$.reproducibility.generator");
    validateNonEmptyString(value.reproducibility.generatorVersion, issues, "$.reproducibility.generatorVersion");
    validateSha256(value.reproducibility.sourceSpecSha256, issues, "$.reproducibility.sourceSpecSha256");
    validateSha256(value.reproducibility.inputSetSha256, issues, "$.reproducibility.inputSetSha256");
  }

  return issues.length === 0 ? { success: true, data: value as PetActorManifest, issues: [] } : { success: false, issues };
}

export function assertValidPetActorManifest(value: unknown): asserts value is PetActorManifest {
  const result = validatePetActorManifest(value);
  if (!result.success) throw new PetActorManifestValidationError(result.issues);
}

export function validatePetActorSourceSpec(value: unknown): PetActorValidationResult<PetActorSourceSpec> {
  const issues: PetActorValidationIssue[] = [];
  if (!isRecord(value)) {
    return { success: false, issues: [{ code: "source.object", path: "$", message: "source spec must be an object" }] };
  }
  if (value.schemaVersion !== PET_ACTOR_SOURCE_SCHEMA_VERSION) {
    pushIssue(issues, "source.schemaVersion", "$.schemaVersion", `must be ${PET_ACTOR_SOURCE_SCHEMA_VERSION}`);
  }
  for (const key of ["actorId", "displayName", "breedId", "sourceVersion", "sourceImage", "fallbackStaticImage"] as const) {
    validateNonEmptyString(value[key], issues, `$.${key}`);
  }
  validateSha256(value.sourceImageSha256, issues, "$.sourceImageSha256");
  if (!lifeStages.has(String(value.lifecycleStage))) {
    pushIssue(issues, "source.lifecycleStage", "$.lifecycleStage", "must be a lifecycle stage from the story contract");
  }
  const artboard = validateSize(value.artboard, issues, "$.artboard") ? value.artboard : null;
  validateRect(value.sourceImagePlacement, artboard, issues, "$.sourceImagePlacement");
  validateTokenSlot(value.tokenSlot, artboard, issues, "$.tokenSlot");
  validateMoodBadgeSlot(value.moodBadgeSlot, artboard, issues, "$.moodBadgeSlot");

  const actions = isRecord(value.actions) ? value.actions : null;
  if (!actions) {
    pushIssue(issues, "source.actions", "$.actions", "must be an object keyed by stable story action ids");
  } else {
    for (const [actionId, action] of Object.entries(actions)) {
      const actionPath = `$.actions.${actionId}`;
      if (!actionIds.has(actionId)) {
        pushIssue(issues, "source.actionId", actionPath, "must use a stable underscore action id from the story contract");
        continue;
      }
      if (!isRecord(action)) {
        pushIssue(issues, "source.action", actionPath, "must be an object");
        continue;
      }
      validateNonEmptyString(action.label, issues, `${actionPath}.label`);
      if (!["loop", "oneShot", "transition"].includes(String(action.kind))) {
        pushIssue(issues, "source.actionKind", `${actionPath}.kind`, "must be loop, oneShot, or transition");
      }
      if (!moods.has(String(action.mood))) {
        pushIssue(issues, "source.actionMood", `${actionPath}.mood`, "must be a supported mood");
      }
      if (!Array.isArray(action.sourceFrames) || action.sourceFrames.length === 0) {
        pushIssue(issues, "source.frames", `${actionPath}.sourceFrames`, "must contain at least one approved raster source");
      } else {
        action.sourceFrames.forEach((frame, index) => {
          const framePath = `${actionPath}.sourceFrames[${index}]`;
          if (!isRecord(frame)) {
            pushIssue(issues, "source.frame", framePath, "must be an object");
            return;
          }
          validateRelativePath(frame.src, issues, `${framePath}.src`);
          if (frame.kind !== "approved-raster") {
            pushIssue(issues, "source.frameKind", `${framePath}.kind`, "must be approved-raster; vector or geometric cat sources cannot ship");
          }
          validateSha256(frame.expectedSha256, issues, `${framePath}.expectedSha256`);
          if (frame.durationMs !== undefined && (typeof frame.durationMs !== "number" || !Number.isFinite(frame.durationMs) || frame.durationMs <= 0)) {
            pushIssue(issues, "source.frameDuration", `${framePath}.durationMs`, "must be a positive duration when provided");
          }
          if (frame.bodyTransform !== undefined) validateTransform(frame.bodyTransform, issues, `${framePath}.bodyTransform`);
        });
      }
      if (typeof action.fps !== "number" || !Number.isFinite(action.fps) || action.fps <= 0 || action.fps > 120) {
        pushIssue(issues, "source.fps", `${actionPath}.fps`, "must be between 0 and 120");
      }
      if (typeof action.loop !== "boolean") pushIssue(issues, "source.loop", `${actionPath}.loop`, "must be boolean");
      if (typeof action.priority !== "number" || !Number.isFinite(action.priority)) {
        pushIssue(issues, "source.priority", `${actionPath}.priority`, "must be a finite number");
      }
      if (action.bodyTransform !== undefined) validateTransform(action.bodyTransform, issues, `${actionPath}.bodyTransform`);
    }
  }

  validateCapabilityList(value.capabilities, null, actions, issues, "$.capabilities");
  if (!Array.isArray(value.visualReferences) || value.visualReferences.length === 0) {
    pushIssue(issues, "source.visualReferences", "$.visualReferences", "must record approved references");
  } else {
    value.visualReferences.forEach((reference, index) => validateRelativePath(reference, issues, `$.visualReferences[${index}]`));
  }
  if (!Array.isArray(value.sourceLayers) || value.sourceLayers.length === 0) {
    pushIssue(issues, "source.layers", "$.sourceLayers", "must declare source layers and dynamic text ownership");
  }
  validateCompatibility(value.compatibility, issues, "$.compatibility");
  if (isRecord(value.compatibility) && value.compatibility.tokenFramePolicy === "embedded-only" && (!isRecord(value.tokenSlot) || value.tokenSlot.mode !== "embedded")) {
    pushIssue(issues, "source.embeddedPolicy", "$.tokenSlot.mode", "embedded-only actors must use an embedded token slot");
  }
  return issues.length === 0 ? { success: true, data: value as PetActorSourceSpec, issues: [] } : { success: false, issues };
}

export function assertValidPetActorSourceSpec(value: unknown): asserts value is PetActorSourceSpec {
  const result = validatePetActorSourceSpec(value);
  if (!result.success) throw new PetActorManifestValidationError(result.issues);
}

export type ResolvedActorCapability = {
  requestedId: PetActorActionId;
  status: PetActorCapabilityStatus;
  resolvedId?: PetActorActionId;
  animationId?: string;
  chain: PetActorActionId[];
  uiBehavior: "show" | "disable" | "hide";
  reason?: string;
};

export function resolveActorCapability(manifest: PetActorManifest, requestedId: PetActorActionId): ResolvedActorCapability {
  const byId = new Map(manifest.capabilities.map((capability) => [capability.id, capability]));
  const requested = byId.get(requestedId);
  if (!requested) {
    return { requestedId, status: "unavailable", chain: [requestedId], uiBehavior: "hide", reason: "Actor does not declare this capability." };
  }

  if (requested.status === "planned" || requested.status === "unavailable") {
    return {
      requestedId,
      status: requested.status,
      chain: [requestedId],
      uiBehavior: requested.uiBehavior ?? (requested.status === "planned" ? "disable" : "hide"),
      reason: requested.reason,
    };
  }

  const chain: PetActorActionId[] = [requestedId];
  let current = requested;
  while (current.status === "fallback" && current.fallbackId) {
    chain.push(current.fallbackId);
    const target = byId.get(current.fallbackId);
    if (!target || chain.slice(0, -1).includes(current.fallbackId)) {
      return { requestedId, status: "unavailable", chain, uiBehavior: "hide", reason: "Invalid fallback chain." };
    }
    current = target;
  }

  if (current.status !== "ready") {
    return { requestedId, status: current.status, chain, uiBehavior: current.uiBehavior ?? "disable", reason: current.reason };
  }

  return {
    requestedId,
    status: requested.status,
    resolvedId: current.id,
    animationId: `action.${current.id}`,
    chain,
    uiBehavior: requested.uiBehavior ?? "show",
    reason: requested.reason,
  };
}
