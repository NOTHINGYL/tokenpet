import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import goldenBritishActorManifestJson from "../../../public/pet-actors/golden-british/actor.json";
import type {
  PetActorAnimation,
  PetActorFrameAsset,
  PetActorManifest,
  PetActorMood,
  PetActorRect,
  PetActorTokenMode,
} from "../../../../../packages/pet-asset-schema/src";
import type { MoodLookId, PetAppearanceSettings, TokenBubbleId, UsageSnapshot } from "../../types";
import { getEffectiveTokenBubbleId, getMoodLabel, getTokenBubbleLabel, getTokenFrameOption, moodToneClass, shouldShowMoodBadge } from "../pet-appearance/appearanceView";
import type { PetActorProps, PetSurface } from "../pet-actor/actorTypes";

type GeneratedActorImageMap = Map<string, HTMLImageElement>;

type GeneratedActorRenderPlan = {
  manifest: PetActorManifest;
  animation: PetActorAnimation;
  frame: PetActorFrameAsset;
  moodId: MoodLookId;
  surface: PetSurface;
  appearance: PetAppearanceSettings;
  usage: UsageSnapshot;
  tokenMode: PetActorTokenMode;
  tokenLabel: string | null;
  tokenRect: PetActorRect | null;
  moodBadgeRect: PetActorRect | null;
  className: string;
  styleVars: Record<string, string>;
};

const GENERATED_ACTOR_IDS = new Set(["golden-british"]);
const generatedActorManifests: Record<string, PetActorManifest> = {
  "golden-british": goldenBritishActorManifestJson as PetActorManifest,
};
const imageCache = new Map<string, Promise<HTMLImageElement>>();

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
  Object.values(manifest.animations).forEach((animation) => {
    animation.frames.forEach((frame) => frameSources.add(resolveFrameUrl(manifest.actorId, frame)));
  });

  const entries = await Promise.all([...frameSources].map(async (src) => [src, await loadImage(src)] as const));
  return new Map(entries);
}

function resolveAnimation(manifest: PetActorManifest, moodId: MoodLookId) {
  return manifest.animations[`${moodId}.idle`] ?? manifest.animations[manifest.defaultAnimation] ?? Object.values(manifest.animations)[0];
}

function resolveActionAnimation(manifest: PetActorManifest, actionId: string | undefined, moodId: MoodLookId) {
  if (actionId) {
    const actionAnimation = manifest.animations[`action.${actionId}`];
    if (actionAnimation) return actionAnimation;
  }

  const defaultAction = manifest.animations[manifest.defaultAnimation];
  if (defaultAction) return defaultAction;
  return resolveAnimation(manifest, moodId);
}

function resolveTokenMode(appearance: PetAppearanceSettings, manifest: PetActorManifest): PetActorTokenMode {
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  const frame = getTokenFrameOption(appearance);

  if (tokenBubbleId === "hidden" || frame.mode === "hidden") return "hidden";
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
  if (tokenMode === "embedded") return manifest.dynamicSlots.tokenText;
  return manifest.dynamicSlots.externalToken ?? manifest.dynamicSlots.tokenText;
}

function createRenderPlan(manifest: PetActorManifest, props: PetActorProps): GeneratedActorRenderPlan {
  const moodId = props.moodId ?? props.appearance.moodId;
  const animation = resolveActionAnimation(manifest, props.motionActionId ?? props.appearance.motionSettings.actionId, moodId);
  const frame = animation.frames[0];
  const tokenMode = resolveTokenMode(props.appearance, manifest);
  const tokenBubbleId = getEffectiveTokenBubbleId(props.appearance);
  const tokenLabel = tokenMode === "hidden" ? null : getTokenBubbleLabel(tokenBubbleId, props.usage);
  const tokenRect = tokenLabel ? resolveTokenRect(manifest, tokenMode) : null;
  const moodBadgeRect = shouldShowMoodBadge(props.appearance, moodId) ? manifest.dynamicSlots.moodBadge : null;
  const tokenCenterX = tokenRect ? tokenRect.x + tokenRect.width / 2 : 0;
  const tokenCenterY = tokenRect ? tokenRect.y + tokenRect.height / 2 : 0;

  return {
    manifest,
    animation,
    frame,
    moodId,
    surface: props.surface,
    appearance: props.appearance,
    usage: props.usage,
    tokenMode,
    tokenLabel,
    tokenRect,
    moodBadgeRect,
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
  const maxFontSize = plan.tokenMode === "embedded" ? plan.manifest.dynamicSlots.tokenText.maxFontSize : plan.manifest.dynamicSlots.externalToken?.maxFontSize ?? 68;
  const fontSize = fitFontSize(context, plan.tokenLabel, maxFontSize * plan.appearance.bubbleScale, rect.width * 0.82, plan.manifest.dynamicSlots.tokenText.fontWeight);

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
  context.fillStyle = plan.manifest.dynamicSlots.tokenText.color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${plan.manifest.dynamicSlots.tokenText.fontWeight} ${fontSize}px Inter, system-ui, sans-serif`;
  context.shadowColor = "rgba(255, 255, 255, 0.86)";
  context.shadowBlur = 3;
  context.fillText(plan.tokenLabel, rect.x + rect.width / 2, rect.y + rect.height / 2 + 2);
  context.restore();
}

function drawMoodBadge(context: CanvasRenderingContext2D, plan: GeneratedActorRenderPlan, time: number) {
  if (!plan.moodBadgeRect) return;

  const rect = { ...plan.moodBadgeRect, y: plan.moodBadgeRect.y + Math.sin(time * 2.1) * 4 };
  const palette: Record<MoodLookId, { bg: string; stroke: string; text: string }> = {
    sleepy: { bg: "rgba(239, 246, 255, 0.96)", stroke: "rgba(49, 84, 120, 0.18)", text: "#315478" },
    focused: { bg: "rgba(225, 246, 232, 0.96)", stroke: "rgba(47, 148, 97, 0.18)", text: "#176c3a" },
    hot: { bg: "rgba(255, 237, 213, 0.96)", stroke: "rgba(179, 90, 2, 0.18)", text: "#a34308" },
    overdrive: { bg: "rgba(255, 228, 230, 0.96)", stroke: "rgba(200, 48, 48, 0.2)", text: "#b42318" },
  };
  const tone = palette[plan.moodId];
  const label = getMoodLabel(plan.moodId);

  context.save();
  drawRoundRect(context, rect, rect.height / 2);
  context.fillStyle = tone.bg;
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = tone.stroke;
  context.stroke();
  context.fillStyle = tone.text;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `850 ${plan.manifest.dynamicSlots.moodBadge.maxFontSize}px Inter, system-ui, sans-serif`;
  context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
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

function applyGeneratedBodyMotion(context: CanvasRenderingContext2D, plan: GeneratedActorRenderPlan, time: number, hover: boolean) {
  const frame = plan.frame;
  const transform = frame.bodyTransform;
  if (!transform) return;

  const speed = plan.appearance.motionSettings.safety.reduceMotion ? 0.35 : plan.appearance.motionSettings.animationSpeed / 80;
  const energy = plan.appearance.motionSettings.safety.reduceMotion ? 0.28 : 0.45 + plan.appearance.motionSettings.motionEnergy / 100;
  const durationSeconds = Math.max(0.4, frame.durationMs / 1000 / Math.max(speed, 0.2));
  const phase01 = (time % durationSeconds) / durationSeconds;
  const sine = Math.sin(phase01 * Math.PI * 2);
  const jump = jumpPhase(phase01);
  const travel = travelPhase(phase01);
  const origin = transform.origin;
  const motionState = plan.animation.motionState;
  const jumpBoost = plan.appearance.motionSettings.jumpHeight / 70;
  const translateX =
    motionState === "run-across" || motionState === "edge-peek" || motionState === "pounce-cursor"
      ? (transform.translateX ?? 0) * travel * energy
      : (transform.translateX ?? 0) * sine * energy;
  const translateY =
    motionState === "jump" || motionState === "celebrate" || motionState === "pounce-cursor"
      ? (transform.translateY ?? 0) * jump * jumpBoost * energy
      : (transform.translateY ?? 0) * sine * energy;
  const scaleX = 1 + (transform.scaleX ?? 0) * (motionState === "stretch" ? travel : sine) * energy;
  const scaleY = 1 + (transform.scaleY ?? 0) * (motionState === "stretch" ? travel : sine) * energy;
  const rotation = (transform.rotation ?? 0) * sine * energy;

  context.translate(origin.x, origin.y);
  context.translate(translateX, translateY + (hover ? -10 : 0));
  context.scale(scaleX, scaleY);
  context.rotate((rotation * Math.PI) / 180);
  context.translate(-origin.x, -origin.y);
}

function renderGeneratedPetActorCanvas(
  context: CanvasRenderingContext2D,
  plan: GeneratedActorRenderPlan,
  images: GeneratedActorImageMap,
  timeMs: number,
  interactiveState: { hover: boolean } = { hover: false },
) {
  const frameImage = images.get(resolveFrameUrl(plan.manifest.actorId, plan.frame));
  if (!frameImage) return;

  const time = timeMs / 1000;
  context.clearRect(0, 0, plan.manifest.artboard.width, plan.manifest.artboard.height);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.save();
  applyGeneratedBodyMotion(context, plan, time, interactiveState.hover);
  context.drawImage(frameImage, 0, 0, plan.manifest.artboard.width, plan.manifest.artboard.height);
  if (plan.tokenMode === "embedded") drawTokenText(context, plan);
  context.restore();

  if (plan.tokenMode !== "embedded") drawTokenText(context, plan);
  drawMoodBadge(context, plan, time);

  context.restore();
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
  renderGeneratedPetActorCanvas(context, plan, images, performance.now());
  return canvas;
}

export function GeneratedPetActorCanvas(props: PetActorProps & { fallback?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef(false);
  const [manifest, setManifest] = useState<PetActorManifest | null>(null);
  const [images, setImages] = useState<GeneratedActorImageMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setImages(null);
    setFailed(false);

    async function prepare() {
      try {
        const nextManifest = await loadGeneratedActorManifest(props.appearance.catTypeId);
        const nextImages = await loadGeneratedActorImages(nextManifest);
        if (cancelled) return;
        setManifest(nextManifest);
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

    let animationFrame = 0;
    const draw = (time: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) renderGeneratedPetActorCanvas(context, plan, images, time, { hover: hoverRef.current });
      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [images, plan]);

  if (failed && props.fallback) return <>{props.fallback}</>;
  if (!plan) return props.fallback ? <>{props.fallback}</> : null;

  return (
    <div className={plan.className} style={plan.styleVars as CSSProperties}>
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
