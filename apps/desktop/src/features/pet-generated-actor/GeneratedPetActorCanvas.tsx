import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import goldenBritishActorManifestJson from "../../../public/pet-actors/golden-british/actor.json";
import type {
  PetActorAnimation,
  PetActorFrameAsset,
  PetActorManifest,
  PetActorRect,
  PetActorTokenMode,
} from "../../../../../packages/pet-asset-schema/src";
import type { CursorTrackingVisual, MoodBadgeStyle, MoodLookId, MotionActionId, PetActionId, PetAppearanceSettings, UsageSnapshot } from "../../types";
import { getEffectiveTokenBubbleId, getMoodLabel, getTokenBubbleLabel, getTokenFrameOption, moodToneClass, shouldShowMoodBadge } from "../pet-appearance/appearanceView";
import type { PetActorProps, PetSurface } from "../pet-actor/actorTypes";
import { drawMoodSemanticIcon, moodHotIconAssetPath, resolveMoodBadgeTone } from "../pet-story/moodVisuals";
import { resolveActorMoodBadgeRect } from "./actorLayout";

type GeneratedActorImageMap = Map<string, HTMLImageElement>;

type GeneratedActorRenderPlan = {
  manifest: PetActorManifest;
  animation: PetActorAnimation;
  moodId: MoodLookId;
  surface: PetSurface;
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  tokenMode: PetActorTokenMode;
  tokenLabel: string | null;
  tokenRect: PetActorRect | null;
  moodBadgeRect: PetActorRect | null;
  moodBadgeColor: string | null;
  moodBadgeStyle: MoodBadgeStyle;
  moodBadgePulse: boolean;
  className: string;
  styleVars: Record<string, string>;
  reduceMotion: boolean;
  pointerOffset: { x: number; y: number } | null;
  cursorTracking: CursorTrackingVisual | null;
  facing: "left" | "right";
  visualNormalization: { scale: number; anchorX: number; anchorY: number };
};

const GENERATED_ACTOR_IDS = new Set(["golden-british"]);
const generatedActorManifests: Record<string, PetActorManifest> = {
  "golden-british": goldenBritishActorManifestJson as unknown as PetActorManifest,
};
const imageCache = new Map<string, Promise<HTMLImageElement>>();

const DEFAULT_VISUAL_NORMALIZATION = { scale: 1, anchorX: 512, anchorY: 818 } as const;

function actionVisualNormalization(animationId: string) {
  // Dangle and Yarn were authored substantially larger inside the same 1024px
  // artboard (767-860px median span versus 530-642px for Pet/Feed/Wake).
  // A 62% normalization matches their visible body footprint to Pet's
  // approximately 530x402px median bounds. Normalize around the shared planted-paw anchor instead of scaling the
  // BrowserWindow or rewriting hundreds of offline source frames.
  if (
    animationId === "action.drag_dangle"
    || animationId.startsWith("action.dangle_")
    || animationId === "action.toss_yarn"
    || animationId.startsWith("action.toss_yarn_")
  ) {
    return { scale: .62, anchorX: 512, anchorY: 818 } as const;
  }
  return DEFAULT_VISUAL_NORMALIZATION;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function hasGeneratedActor(catTypeId: string) {
  return GENERATED_ACTOR_IDS.has(catTypeId);
}

async function loadGeneratedActorManifest(actorId: string) {
  const manifest = generatedActorManifests[actorId];
  if (!manifest) throw new Error(`Unable to load generated pet actor manifest: ${actorId}`);
  return manifest;
}

function resolveFrameUrl(actorId: string, frame: PetActorFrameAsset) {
  return new URL(`pet-actors/${actorId}/${frame.src}`, window.location.href).toString();
}

function moodHotIconUrl() {
  return new URL(moodHotIconAssetPath, window.location.href).toString();
}

function loadImage(src: string) {
  const existing = imageCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load generated pet actor frame: ${src}`));
    image.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

async function loadGeneratedActorImages(manifest: PetActorManifest) {
  const frameSources = new Set<string>();
  frameSources.add(moodHotIconUrl());
  Object.values(manifest.animations).forEach((animation) => {
    animation.frames.forEach((frame) => frameSources.add(resolveFrameUrl(manifest.actorId, frame)));
    Object.values(animation.variants ?? {}).forEach((frames) => {
      frames.forEach((frame) => frameSources.add(resolveFrameUrl(manifest.actorId, frame)));
    });
  });

  const entries = await Promise.all([...frameSources].map(async (src) => [src, await loadImage(src)] as const));
  return new Map(entries);
}

function resolveAnimation(manifest: PetActorManifest, moodId: MoodLookId) {
  return manifest.animations[`action.${moodId}_loop`] ?? manifest.animations[`${moodId}.idle`] ?? manifest.animations[manifest.defaultAnimation] ?? Object.values(manifest.animations)[0];
}

const storyActionForLegacyMotion: Record<MotionActionId, PetActionId> = {
  "idle-breathe": "idle_breathe",
  "tail-wag": "hot_loop",
  blink: "blink",
  stretch: "drag_dangle",
  "run-across": "run_across",
  jump: "drop_bounce",
  "desk-nap": "sleep_loop",
  celebrate: "milestone_celebrate",
  "pounce-cursor": "play_cursor",
  "edge-peek": "idle_breathe",
};

const legacyAnimationForStoryAction: Partial<Record<PetActionId, MotionActionId>> = {
  idle_breathe: "idle-breathe",
  blink: "blink",
  sleep_loop: "desk-nap",
  focus_loop: "idle-breathe",
  hot_loop: "tail-wag",
  overdrive_loop: "jump",
  click_purr: "blink",
  drag_dangle: "stretch",
  drop_bounce: "jump",
  token_snack: "blink",
  play_cursor: "pounce-cursor",
  milestone_celebrate: "celebrate",
  level_up: "celebrate",
  daily_digest: "desk-nap",
};

function resolveActionAnimation(
  manifest: PetActorManifest,
  storyActionId: PetActionId | undefined,
  legacyMotionId: MotionActionId | undefined,
  moodId: MoodLookId,
) {
  const actionId = storyActionId ?? (legacyMotionId ? storyActionForLegacyMotion[legacyMotionId] : undefined);
  if (actionId) {
    const legacyId = legacyAnimationForStoryAction[actionId];
    const actionAnimation = manifest.animations[`action.${actionId}`] ?? (legacyId ? manifest.animations[`action.${legacyId}`] : undefined);
    if (actionAnimation) return actionAnimation;
  }

  return resolveAnimation(manifest, moodId);
}

function resolveAnimationVariant(animation: PetActorAnimation, variantId: string | undefined) {
  const frames = variantId ? animation.variants?.[variantId] : undefined;
  return frames?.length ? { ...animation, frames } : animation;
}

function resolveTokenMode(appearance: PetAppearanceSettings, manifest: PetActorManifest): PetActorTokenMode {
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  const frame = getTokenFrameOption(appearance);

  if (tokenBubbleId === "hidden" || frame.mode === "hidden") return "hidden";
  const tokenFramePolicy = (manifest.compatibility as PetActorManifest["compatibility"] & { tokenFramePolicy?: string }).tokenFramePolicy;
  if (tokenFramePolicy === "embedded-only") return "embedded";
  if (frame.mode === "floating") return "floating";
  if (manifest.defaultTokenMode === "embedded" && frame.mode === "embedded" && appearance.accessorySettings.textOnlyFrame) return "embedded";
  return "below";
}

function resolveRenderScale(surface: PetSurface, appearance: PetAppearanceSettings) {
  if (surface === "desktop") return appearance.size;
  return clamp(appearance.size, 0.72, 1.12);
}

function resolveTokenRect(manifest: PetActorManifest, tokenMode: PetActorTokenMode) {
  if (tokenMode === "hidden") return null;
  if (tokenMode === "embedded") return manifest.tokenSlot ?? manifest.dynamicSlots.tokenText;
  return manifest.dynamicSlots.externalToken ?? manifest.dynamicSlots.tokenText;
}

function createRenderPlan(manifest: PetActorManifest, props: PetActorProps): GeneratedActorRenderPlan | null {
  const moodId = props.moodId ?? props.appearance.moodId;
  const baseAnimation = resolveActionAnimation(
    manifest,
    props.storyActionId ?? props.actionId,
    props.motionActionId,
    moodId,
  );
  const animation = resolveAnimationVariant(baseAnimation, props.actorVariant);
  if (!animation?.frames.length) return null;
  const isChromeFreeStoryAction = animation.id === "action.walk_round_trip"
    || animation.id.startsWith("action.walk_round_trip_")
    || animation.id === "action.play_cursor"
    || animation.id.startsWith("action.feed_snack_")
    || animation.id.startsWith("action.dangle_")
    || animation.id.startsWith("action.toss_yarn_")
    || animation.id === "action.dance"
    || animation.id.startsWith("action.dance_")
    || animation.id === "action.wake_up"
    || animation.id.startsWith("action.wake_up_");
  const isSleepVisual = animation.id === "action.sleep_loop"
    || animation.id === "sleepy.idle"
    || animation.id === "action.nap_here";
  const tokenMode = isChromeFreeStoryAction || isSleepVisual ? "hidden" : resolveTokenMode(props.appearance, manifest);
  const tokenBubbleId = getEffectiveTokenBubbleId(props.appearance);
  const tokenLabel = tokenMode === "hidden" ? null : getTokenBubbleLabel(tokenBubbleId, props.usage, props.tokenValue);
  const tokenRect = tokenLabel ? resolveTokenRect(manifest, tokenMode) : null;
  const displayMoodBadge = props.moodBadgeVisible ?? shouldShowMoodBadge(props.appearance, moodId);
  const declaredMoodBadgeRect = !isChromeFreeStoryAction
    && displayMoodBadge
    ? (manifest.moodBadgeSlot ?? manifest.dynamicSlots.moodBadge)
    : null;
  const moodBadgeRect = declaredMoodBadgeRect ? resolveActorMoodBadgeRect(manifest, declaredMoodBadgeRect, props.surface) : null;
  const tokenCenterX = tokenRect ? tokenRect.x + tokenRect.width / 2 : 0;
  const tokenCenterY = tokenRect ? tokenRect.y + tokenRect.height / 2 : 0;

  return {
    manifest,
    animation,
    moodId,
    surface: props.surface,
    appearance: props.appearance,
    usage: props.usage,
    tokenMode,
    tokenLabel,
    tokenRect,
    moodBadgeRect,
    moodBadgeColor: props.moodBadgeColor ?? null,
    moodBadgeStyle: props.moodBadgeStyle ?? "iconLabel",
    moodBadgePulse: props.moodBadgePulse === true,
    className: `pet-appearance-visual pet-generated-actor-shell pet-appearance-visual-${props.surface} pet-theme-${props.appearance.themeId} pet-mood-${
      moodToneClass[moodId]
    } ${props.appearance.moodBadge.colorByState ? "pet-mood-color-state" : ""} pet-cat-${manifest.actorId} pet-token-${tokenMode} pet-bubble-${tokenBubbleId}`,
    styleVars: {
      "--pet-visual-scale": resolveRenderScale(props.surface, props.appearance).toString(),
      "--pet-visual-opacity": props.appearance.opacity.toString(),
      "--pet-visual-shadow": props.appearance.shadow.toString(),
      "--pet-actor-token-x": tokenRect ? `${(tokenCenterX / manifest.artboard.width) * 100}%` : "50%",
      "--pet-actor-token-y": tokenRect ? `${(tokenCenterY / manifest.artboard.height) * 100}%` : "78%",
      "--pet-actor-token-w": tokenRect ? `${(tokenRect.width / manifest.artboard.width) * 100}%` : "0%",
      "--pet-actor-token-h": tokenRect ? `${(tokenRect.height / manifest.artboard.height) * 100}%` : "0%",
    },
    reduceMotion: props.reduceMotion ?? props.appearance.motionSettings.safety.reduceMotion,
    pointerOffset: props.pointerOffset ?? null,
    cursorTracking: props.cursorTracking ?? null,
    facing: props.facing ?? "right",
    visualNormalization: actionVisualNormalization(animation.id),
  };
}

function drawRoundRect(context: CanvasRenderingContext2D, rect: PetActorRect, radius: number) {
  const nextRadius = Math.min(radius, rect.width / 2, rect.height / 2);
  context.beginPath();
  context.moveTo(rect.x + nextRadius, rect.y);
  context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, nextRadius);
  context.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, nextRadius);
  context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, nextRadius);
  context.arcTo(rect.x, rect.y, rect.x + nextRadius, rect.y, nextRadius);
  context.closePath();
}

function fitFontSize(context: CanvasRenderingContext2D, text: string, maxFontSize: number, maxWidth: number, weight: number) {
  let size = maxFontSize;
  while (size > 24) {
    context.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

function drawExternalTokenFrame(context: CanvasRenderingContext2D, rect: PetActorRect) {
  context.save();
  drawRoundRect(context, rect, rect.height / 2);
  const gradient = context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  gradient.addColorStop(0, "rgba(255, 254, 244, 0.98)");
  gradient.addColorStop(1, "rgba(255, 246, 218, 0.96)");
  context.fillStyle = gradient;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "rgba(224, 159, 39, 0.22)";
  context.stroke();
  context.restore();
}

function drawTokenText(context: CanvasRenderingContext2D, plan: GeneratedActorRenderPlan) {
  if (!plan.tokenLabel || !plan.tokenRect) return;

  const rect = plan.tokenRect;
  const tokenSlot = plan.manifest.tokenSlot ?? plan.manifest.dynamicSlots.tokenText;
  const maxFontSize = plan.tokenMode === "embedded" ? tokenSlot.maxFontSize : plan.manifest.dynamicSlots.externalToken?.maxFontSize ?? 68;
  const fontSize = fitFontSize(context, plan.tokenLabel, maxFontSize * plan.appearance.bubbleScale, rect.width * 0.82, tokenSlot.fontWeight);

  if (plan.tokenMode !== "embedded") {
    const scaled = {
      x: rect.x + rect.width * (1 - plan.appearance.bubbleScale) / 2,
      y: rect.y + rect.height * (1 - plan.appearance.bubbleScale) / 2,
      width: rect.width * plan.appearance.bubbleScale,
      height: rect.height * plan.appearance.bubbleScale,
    };
    drawExternalTokenFrame(context, scaled);
  }

  context.save();
  context.fillStyle = tokenSlot.color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${tokenSlot.fontWeight} ${fontSize}px Inter, system-ui, sans-serif`;
  context.shadowColor = "rgba(255, 255, 255, 0.86)";
  context.shadowBlur = 3;
  context.fillText(plan.tokenLabel, rect.x + rect.width / 2, rect.y + rect.height / 2 + 2);
  context.restore();
}

function drawMoodBadge(context: CanvasRenderingContext2D, plan: GeneratedActorRenderPlan, images: GeneratedActorImageMap, time: number) {
  if (!plan.moodBadgeRect) return;

  const sourceRect = { ...plan.moodBadgeRect, y: plan.moodBadgeRect.y + (plan.reduceMotion ? 0 : Math.sin(time * 2.1) * 4) };
  const rect = plan.moodBadgeStyle === "iconOnly"
    ? { ...sourceRect, x: sourceRect.x + (sourceRect.width - sourceRect.height) / 2, width: sourceRect.height }
    : sourceRect;
  const tone = resolveMoodBadgeTone(
    plan.moodId,
    plan.appearance.moodBadge.colorByState,
    plan.moodBadgeColor ?? undefined,
  );
  const label = getMoodLabel(plan.moodId);
  const fontSize = (plan.manifest.moodBadgeSlot ?? plan.manifest.dynamicSlots.moodBadge).maxFontSize;

  context.save();
  if (plan.moodBadgePulse) {
    const duration = plan.reduceMotion ? .12 : .4;
    const progress = Math.max(0, Math.min(1, time / duration));
    context.globalAlpha *= Math.min(1, .7 + progress * .55);
    if (!plan.reduceMotion && time < duration) {
      const scale = progress < .55
        ? .94 + (.12 * progress / .55)
        : 1.06 - (.06 * (progress - .55) / .45);
      context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
      context.scale(scale, scale);
      context.translate(-(rect.x + rect.width / 2), -(rect.y + rect.height / 2));
    }
  }
  drawRoundRect(context, rect, rect.height / 2);
  context.fillStyle = tone.background;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = tone.border;
  context.stroke();
  context.fillStyle = tone.foreground;
  context.textAlign = "left";
  context.textBaseline = "middle";
  let fittedFontSize = fontSize;
  context.font = `850 ${fittedFontSize}px Inter, system-ui, sans-serif`;
  let iconSize = fittedFontSize * 0.72;
  if (plan.moodBadgeStyle === "iconOnly") {
    drawMoodSemanticIcon(
      context,
      plan.moodId,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      Math.min(rect.width, rect.height) * .48,
      tone.foreground,
      images.get(moodHotIconUrl()),
    );
    context.restore();
    return;
  }
  let gap = fittedFontSize * 0.22;
  let textWidth = context.measureText(label).width;
  const availableWidth = Math.max(1, rect.width - 22);
  const naturalWidth = iconSize + gap + textWidth;
  if (naturalWidth > availableWidth) {
    fittedFontSize = Math.max(22, fittedFontSize * availableWidth / naturalWidth);
    context.font = `850 ${fittedFontSize}px Inter, system-ui, sans-serif`;
    iconSize = fittedFontSize * 0.72;
    gap = fittedFontSize * 0.22;
    textWidth = context.measureText(label).width;
  }
  const contentWidth = iconSize + gap + textWidth;
  const contentStart = rect.x + (rect.width - contentWidth) / 2;
  drawMoodSemanticIcon(
    context,
    plan.moodId,
    contentStart + iconSize / 2,
    rect.y + rect.height / 2,
    iconSize,
    tone.foreground,
    images.get(moodHotIconUrl()),
  );
  context.fillText(label, contentStart + iconSize + gap, rect.y + rect.height / 2 + 1);
  context.restore();
}

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function travelPhase(phase01: number) {
  if (phase01 < 0.5) return easeInOutSine(phase01 * 2);
  return easeInOutSine((1 - phase01) * 2);
}

function jumpPhase(phase01: number) {
  return Math.sin(Math.PI * phase01);
}

function applyGeneratedBodyMotion(
  context: CanvasRenderingContext2D,
  plan: GeneratedActorRenderPlan,
  frame: PetActorFrameAsset,
  time: number,
  hover: boolean,
) {
  const transform = frame.bodyTransform;
  const motionState = String(plan.animation.motionState);
  // Play Cursor is authored as registered whole-cat directional poses. The
  // renderer chooses a frame but never shifts or warps the body artboard.
  if (motionState === "play_cursor") return;
  if (plan.pointerOffset) {
    context.translate(plan.pointerOffset.x * 7, plan.pointerOffset.y * 3);
  }
  if (!transform) return;

  const speed = plan.reduceMotion ? 0.35 : plan.appearance.motionSettings.animationSpeed / 80;
  const energy = plan.reduceMotion ? 0.2 : 0.45 + plan.appearance.motionSettings.motionEnergy / 100;
  const durationSeconds = Math.max(0.4, frame.durationMs / 1000 / Math.max(speed, 0.2));
  const phase01 = (time % durationSeconds) / durationSeconds;
  const sine = Math.sin(phase01 * Math.PI * 2);
  const jump = jumpPhase(phase01);
  const travel = travelPhase(phase01);
  const origin = transform.origin;
  const jumpBoost = plan.appearance.motionSettings.jumpHeight / 70;
  const travelsHorizontally = motionState === "run_across";
  const liftsFromGround = ["drop_bounce", "hot_loop", "overdrive_loop", "milestone_celebrate", "run_across"].includes(motionState);
  const stretches = motionState === "drag_dangle" || motionState === "drop_bounce";
  const translateX =
    travelsHorizontally
      ? (transform.translateX ?? 0) * travel * energy
      : (transform.translateX ?? 0) * sine * energy;
  const translateY =
    liftsFromGround
      ? (transform.translateY ?? 0) * jump * jumpBoost * energy
      : (transform.translateY ?? 0) * sine * energy;
  const scaleX = 1 + (transform.scaleX ?? 0) * (stretches ? travel : sine) * energy;
  const scaleY = 1 + (transform.scaleY ?? 0) * (stretches ? travel : sine) * energy;
  const rotation = (transform.rotation ?? 0) * sine * energy;

  context.translate(origin.x, origin.y);
  context.translate(translateX, translateY + (hover ? -10 : 0));
  context.scale(scaleX, scaleY);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(-origin.x, -origin.y);
}

function frameAtTime(animation: PetActorAnimation, elapsedMs: number) {
  if (animation.frames.length === 1) return animation.frames[0];
  const totalDuration = animation.frames.reduce((sum, frame) => sum + Math.max(frame.durationMs, 1), 0);
  const boundedTime = animation.loop
    ? ((elapsedMs % totalDuration) + totalDuration) % totalDuration
    : Math.min(Math.max(elapsedMs, 0), totalDuration - 1);
  let cursor = 0;
  for (const frame of animation.frames) {
    cursor += Math.max(frame.durationMs, 1);
    if (boundedTime < cursor) return frame;
  }
  return animation.frames.at(-1)!;
}

type CursorDirection = "left" | "right" | "up" | "down";

function cursorDirection(offset: { x: number; y: number }): CursorDirection {
  if (Math.abs(offset.x) >= Math.abs(offset.y)) return offset.x < 0 ? "left" : "right";
  return offset.y < 0 ? "up" : "down";
}

function cursorFrame(animation: PetActorAnimation, role: "neutral" | "notice" | "blink" | "settle" | "eye" | "head" | "ear", direction?: CursorDirection) {
  const filename = direction ? `play_cursor_${role}_${direction}.png` : `play_cursor_${role}.png`;
  return animation.frames.find((frame) => frame.src.endsWith(filename));
}

function pointGap(first: { x: number; y: number }, second: { x: number; y: number }) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

/** Select approved whole frames in the authored eyes → head → ears order. */
function playCursorFrameAtTime(animation: PetActorAnimation, visual: CursorTrackingVisual | null, elapsedMs: number) {
  if (visual?.stage === "settle") return cursorFrame(animation, "settle") ?? animation.frames.at(-1)!;
  if (!visual && elapsedMs < 280) return cursorFrame(animation, "notice") ?? animation.frames[0];
  if (!visual?.withinAttention) {
    const idlePhase = elapsedMs % 3_800;
    return idlePhase >= 3_620 && idlePhase < 3_760
      ? cursorFrame(animation, "blink") ?? animation.frames[0]
      : cursorFrame(animation, "neutral") ?? animation.frames[0];
  }

  const direction = cursorDirection(visual.eyeOffset);
  const eyeHeadLag = pointGap(visual.eyeOffset, visual.headOffset);
  const headEarLag = pointGap(visual.headOffset, visual.earOffset);
  const role = eyeHeadLag > .16
    ? "eye"
    : visual.earFollow && headEarLag > .105
      ? "head"
      : visual.earFollow ? "ear" : "head";
  return cursorFrame(animation, role, direction)
    ?? cursorFrame(animation, "head", direction)
    ?? cursorFrame(animation, "eye", direction)
    ?? animation.frames[0];
}

function animationDurationMs(animation: PetActorAnimation) {
  return animation.frames.reduce((sum, frame) => sum + Math.max(frame.durationMs, 1), 0);
}

function animationSupportsAuthoredFacing(animationId: string) {
  return animationId === "action.walk_round_trip"
    || animationId === "action.walk_round_trip_look"
    || animationId.startsWith("action.feed_snack_")
    || animationId.startsWith("action.dangle_");
}

function renderGeneratedPetActorCanvas(
  context: CanvasRenderingContext2D,
  plan: GeneratedActorRenderPlan,
  images: GeneratedActorImageMap,
  timeMs: number,
  animationStartedAt = 0,
  interactiveState: { hover: boolean } = { hover: false },
) {
  const elapsedMs = Math.max(0, timeMs - animationStartedAt);
  const frame = plan.animation.id === "action.play_cursor"
    ? playCursorFrameAtTime(plan.animation, plan.cursorTracking, elapsedMs)
    : frameAtTime(plan.animation, elapsedMs);
  const frameImage = images.get(resolveFrameUrl(plan.manifest.actorId, frame));
  if (!frameImage) return null;

  const time = Math.max(0, timeMs - animationStartedAt) / 1000;
  context.clearRect(0, 0, plan.manifest.artboard.width, plan.manifest.artboard.height);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  applyGeneratedBodyMotion(context, plan, frame, time, interactiveState.hover);
  if (plan.visualNormalization.scale !== 1) {
    context.translate(plan.visualNormalization.anchorX, plan.visualNormalization.anchorY);
    context.scale(plan.visualNormalization.scale, plan.visualNormalization.scale);
    context.translate(-plan.visualNormalization.anchorX, -plan.visualNormalization.anchorY);
  }
  const supportsAuthoredFacing = animationSupportsAuthoredFacing(plan.animation.id);
  if (plan.facing === "left" && supportsAuthoredFacing) {
    context.translate(plan.manifest.artboard.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(frameImage, 0, 0, plan.manifest.artboard.width, plan.manifest.artboard.height);
  if (plan.tokenMode === "embedded") drawTokenText(context, plan);
  context.restore();

  if (plan.tokenMode !== "embedded") drawTokenText(context, plan);
  drawMoodBadge(context, plan, images, time);

  context.restore();

  return frame;
}

export async function exportGeneratedPetActorCanvas(props: PetActorProps) {
  const manifest = await loadGeneratedActorManifest(props.appearance.catTypeId);
  const plan = createRenderPlan(manifest, props);
  const canvas = document.createElement("canvas");
  canvas.width = manifest.artboard.width;
  canvas.height = manifest.artboard.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create generated pet actor canvas");
  const images = await loadGeneratedActorImages(manifest);
  if (!plan) throw new Error(`Generated actor ${manifest.actorId} has no renderable animation`);
  renderGeneratedPetActorCanvas(context, plan, images, 0, 0);
  return canvas;
}

export function GeneratedPetActorCanvas(props: PetActorProps & { fallback?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef(false);
  const animationIdentityRef = useRef<string | null>(null);
  const animationStartedAtRef = useRef(0);
  const [manifest, setManifest] = useState<PetActorManifest | null>(() => generatedActorManifests[props.appearance.catTypeId] ?? null);
  const [images, setImages] = useState<GeneratedActorImageMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImages(null);
    setFailed(false);

    async function prepare() {
      try {
        const nextManifest = await loadGeneratedActorManifest(props.appearance.catTypeId);
        if (!cancelled) setManifest(nextManifest);
        const nextImages = await loadGeneratedActorImages(nextManifest);
        if (cancelled) return;
        setImages(nextImages);
      } catch (error) {
        console.error(error);
        if (!cancelled) setFailed(true);
      }
    }

    void prepare();

    return () => {
      cancelled = true;
    };
  }, [props.appearance.catTypeId]);

  const plan = useMemo(() => (manifest ? createRenderPlan(manifest, props) : null), [manifest, props]);

  useEffect(() => {
    if (!plan || !images) return;

    if (typeof props.previewTimeMs === "number") {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const frame = renderGeneratedPetActorCanvas(context, plan, images, props.previewTimeMs, 0, { hover: false });
        if (frame) canvas.dataset.actorFrame = frame.id;
        canvas.dataset.actorTimelineMs = String(Math.round(props.previewTimeMs));
      }
      return;
    }

    let animationFrame = 0;
    const animationIdentity = `${plan.animation.id}:${props.animationNonce ?? "stable"}`;
    if (animationIdentityRef.current !== animationIdentity) {
      animationIdentityRef.current = animationIdentity;
      animationStartedAtRef.current = performance.now();
    }
    const animationStartedAt = animationStartedAtRef.current;
    const draw = (time: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        const usesNativeTimeline = typeof props.animationStartedAtMs === "number" && typeof props.animationCycleDurationMs === "number" && props.animationCycleDurationMs > 0;
        const timelineMs = usesNativeTimeline
          ? Math.max(0, Date.now() - props.animationStartedAtMs!) * animationDurationMs(plan.animation) / props.animationCycleDurationMs!
          : Math.max(0, time - animationStartedAt);
        const frame = renderGeneratedPetActorCanvas(context, plan, images, timelineMs, 0, { hover: hoverRef.current });
        if (frame) canvas.dataset.actorFrame = frame.id;
        canvas.dataset.actorTimelineMs = String(Math.round(timelineMs));
      }
      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [images, plan, props.animationCycleDurationMs, props.animationNonce, props.animationStartedAtMs, props.previewTimeMs]);

  if (failed && props.fallback) return <>{props.fallback}</>;
  if (!plan) return props.fallback ? <>{props.fallback}</> : null;

  return (
    <div
      className={plan.className}
      style={plan.styleVars as CSSProperties}
      data-pet-size={plan.appearance.size}
      data-actor-id={plan.manifest.actorId}
      data-actor-animation={plan.animation.id}
      data-sleep-token-frame-hidden={plan.animation.id === "action.sleep_loop" || plan.animation.id === "sleepy.idle" || plan.animation.id === "action.nap_here" ? "true" : "false"}
      data-actor-facing={plan.facing}
      data-actor-variant={props.actorVariant}
      data-actor-mirrored={plan.facing === "left" && animationSupportsAuthoredFacing(plan.animation.id) ? "true" : "false"}
      data-actor-cycle-duration-ms={props.animationCycleDurationMs}
      data-actor-started-at-ms={props.animationStartedAtMs}
      data-actor-visual-normalization-scale={plan.visualNormalization.scale}
      data-actor-visual-ground-anchor={`${plan.visualNormalization.anchorX},${plan.visualNormalization.anchorY}`}
      data-token-label={plan.tokenLabel ?? undefined}
      data-mood-badge-y={plan.moodBadgeRect?.y}
      data-mood-badge-height={plan.moodBadgeRect?.height}
      data-mood-badge-icon={plan.moodBadgeRect ? plan.moodId : undefined}
      data-mood-badge-color={plan.moodBadgeRect ? plan.moodBadgeColor ?? undefined : undefined}
      data-mood-badge-style={plan.moodBadgeRect ? plan.moodBadgeStyle : undefined}
      data-mood-badge-pulse={plan.moodBadgeRect && plan.moodBadgePulse ? "true" : "false"}
    >
      <span
        className={`pet-visual-cat-wrap pet-actor-canvas-root pet-generated-actor-canvas-root ${images ? "is-ready" : "is-loading"}`}
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
        }}
      >
        <canvas ref={canvasRef} className="pet-actor-canvas pet-generated-actor-canvas" width={plan.manifest.artboard.width} height={plan.manifest.artboard.height} aria-hidden="true" />
        {plan.tokenRect ? (
          <button className="pet-actor-token-hotspot" type="button" onClick={props.onBubbleClick} aria-label="Open TokenPet summary" />
        ) : null}
      </span>
    </div>
  );
}
