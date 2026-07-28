import { actorSlotOrder } from "./canonicalActor";
import type { ActorAnchor, ActorRenderAttachment, ActorSlotId, CatSkin, PetActorFrame, Point, Rect } from "./actorTypes";
import { drawMoodSemanticIcon, moodHotIconAssetPath, resolveMoodBadgeTone } from "../pet-story/moodVisuals";

type ActorImageMap = Map<string, HTMLImageElement>;

type SkinPlacement = {
  x: number;
  y: number;
  scale: number;
};

export function collectPetActorAssets(frame: PetActorFrame) {
  const assets = new Set<string>();
  assets.add(frame.skin.attachments.fullBody);
  assets.add(moodHotIconAssetPath);
  frame.attachments.forEach((attachment) => {
    if (attachment.asset) assets.add(attachment.asset);
  });
  return [...assets];
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadPetActorImage(src: string) {
  const existing = imageCache.get(src);
  if (existing) return existing;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load pet actor asset: ${src}`));
    image.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

export async function loadPetActorImages(frame: PetActorFrame) {
  const entries = await Promise.all(
    collectPetActorAssets(frame).map(async (src) => [src, await loadPetActorImage(src)] as const),
  );
  return new Map(entries);
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function sourceRectToPixels(rect: Rect, image: HTMLImageElement): Rect {
  return {
    x: rect.x * image.width,
    y: rect.y * image.height,
    width: rect.width * image.width,
    height: rect.height * image.height,
  };
}

function getSkinPlacement(frame: PetActorFrame, catImage: HTMLImageElement): SkinPlacement {
  const sourceBody = sourceRectToPixels(frame.skin.bounds.body, catImage);
  const bodyScaleBoost = frame.skin.bodyType === "paw-frame" ? 1 : frame.skin.bodyType === "fluffy-sitting" ? 1.12 : 1.08;
  const targetBody = {
    ...frame.model.bodyBounds,
    width: frame.model.bodyBounds.width * bodyScaleBoost,
    height: frame.model.bodyBounds.height * bodyScaleBoost,
  };
  const heightScale = targetBody.height / sourceBody.height;
  const widthScale = (targetBody.width * (frame.skin.bodyType === "paw-frame" ? 1.08 : 1.02)) / sourceBody.width;
  const scale = Math.min(heightScale, widthScale);
  const sourceBodyCenter = rectCenter(sourceBody);
  const x = rectCenter(targetBody).x - sourceBodyCenter.x * scale;
  const y = frame.model.footLineY - frame.skin.footLineY * catImage.height * scale;

  return { x, y, scale };
}

function mapSourceRect(rect: Rect, image: HTMLImageElement, placement: SkinPlacement): Rect {
  return {
    x: placement.x + rect.x * image.width * placement.scale,
    y: placement.y + rect.y * image.height * placement.scale,
    width: rect.width * image.width * placement.scale,
    height: rect.height * image.height * placement.scale,
  };
}

function mapAnchor(anchor: ActorAnchor, image: HTMLImageElement, placement: SkinPlacement): ActorAnchor {
  const width = anchor.width * image.width * placement.scale;
  const height = anchor.height * image.height * placement.scale;
  const centerX = placement.x + anchor.x * image.width * placement.scale;
  const centerY = placement.y + anchor.y * image.height * placement.scale;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    angle: anchor.angle,
  };
}

function fallbackAnchor(slot: ActorRenderAttachment["anchor"], frame: PetActorFrame): ActorAnchor {
  if (slot === "base") return { x: 0.5, y: 0.85, width: 0.64, height: 0.16 };
  if (slot === "tokenFrame") {
    const frameBounds = frame.skin.bounds.tokenFrame;
    return frameBounds
      ? { x: frameBounds.x + frameBounds.width / 2, y: frameBounds.y + frameBounds.height / 2, width: frameBounds.width, height: frameBounds.height }
      : { x: 0.5, y: 0.84, width: 0.36, height: 0.12 };
  }
  if (slot === "neck") return { x: 0.5, y: 0.58, width: 0.24, height: 0.12 };
  if (slot === "face") return { x: 0.5, y: 0.42, width: 0.28, height: 0.16 };
  if (slot === "paws") return { x: 0.5, y: 0.74, width: 0.48, height: 0.13 };
  if (slot === "shadow") return { x: 0.5, y: 0.88, width: 0.64, height: 0.12 };
  return { x: 0.5, y: 0.34, width: 0.4, height: 0.34 };
}

function getMappedAnchor(frame: PetActorFrame, image: HTMLImageElement, placement: SkinPlacement, key: ActorRenderAttachment["anchor"]) {
  const sourceAnchor = frame.skin.anchors[key] ?? fallbackAnchor(key, frame);
  return mapAnchor(sourceAnchor, image, placement);
}

function drawRoundRect(context: CanvasRenderingContext2D, rect: Rect, radius: number) {
  const nextRadius = Math.min(radius, rect.width / 2, rect.height / 2);
  context.beginPath();
  context.moveTo(rect.x + nextRadius, rect.y);
  context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height, nextRadius);
  context.arcTo(rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height, nextRadius);
  context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y, nextRadius);
  context.arcTo(rect.x, rect.y, rect.x + rect.width, rect.y, nextRadius);
  context.closePath();
}

function applyClip(context: CanvasRenderingContext2D, clip: ActorRenderAttachment["clip"], width: number, height: number) {
  if (!clip || clip === "none") return;

  context.beginPath();
  if (clip === "upper") context.rect(-width / 2, -height / 2, width, height * 0.52);
  if (clip === "lower") context.rect(-width / 2, -height * 0.1, width, height * 0.68);
  if (clip === "left") context.rect(-width / 2, -height / 2, width * 0.55, height);
  if (clip === "right") context.rect(-width * 0.05, -height / 2, width * 0.55, height);
  context.clip();
}

function drawImageBox(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  center: Point,
  width: number,
  height: number,
  options: { rotation?: number; opacity?: number; clip?: ActorRenderAttachment["clip"]; blendMode?: GlobalCompositeOperation } = {},
) {
  context.save();
  context.globalAlpha *= options.opacity ?? 1;
  if (options.blendMode) context.globalCompositeOperation = options.blendMode;
  context.translate(center.x, center.y);
  context.rotate(((options.rotation ?? 0) * Math.PI) / 180);
  applyClip(context, options.clip, width, height);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawContactShadow(context: CanvasRenderingContext2D, center: Point, width: number, height: number, opacity: number) {
  context.save();
  context.globalAlpha *= opacity;
  const gradient = context.createRadialGradient(center.x, center.y, 1, center.x, center.y, Math.max(width, height) / 2);
  gradient.addColorStop(0, "rgba(25, 42, 63, 0.2)");
  gradient.addColorStop(0.56, "rgba(25, 42, 63, 0.08)");
  gradient.addColorStop(1, "rgba(25, 42, 63, 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(center.x, center.y, width / 2, height / 2, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawMoodBadge(context: CanvasRenderingContext2D, frame: PetActorFrame, images: ActorImageMap, time: number) {
  const badge = frame.moodBadge;
  if (!badge) return;

  const rect = badge.style === "iconOnly"
    ? { ...badge.rect, x: badge.rect.x + (badge.rect.width - badge.rect.height) / 2, width: badge.rect.height }
    : { ...badge.rect };
  const tone = resolveMoodBadgeTone(
    badge.tone,
    frame.appearance.moodBadge.colorByState,
    badge.color,
  );

  context.save();
  if (badge.entryPulse && time < .4) {
    const progress = Math.max(0, Math.min(1, time / .4));
    const scale = progress < .55
      ? .94 + (.12 * progress / .55)
      : 1.06 - (.06 * (progress - .55) / .45);
    context.globalAlpha *= Math.min(1, .7 + progress * .55);
    context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
    context.scale(scale, scale);
    context.translate(-(rect.x + rect.width / 2), -(rect.y + rect.height / 2));
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
  let fontSize = 52;
  context.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  let iconSize = fontSize * 0.72;
  if (badge.style === "iconOnly") {
    drawMoodSemanticIcon(
      context,
      badge.tone,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      Math.min(rect.width, rect.height) * .48,
      tone.foreground,
      images.get(moodHotIconAssetPath),
    );
    context.restore();
    return;
  }
  let gap = fontSize * 0.22;
  let textWidth = context.measureText(badge.label).width;
  const availableWidth = Math.max(1, rect.width - 22);
  const naturalWidth = iconSize + gap + textWidth;
  if (naturalWidth > availableWidth) {
    fontSize = Math.max(22, fontSize * availableWidth / naturalWidth);
    context.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
    iconSize = fontSize * 0.72;
    gap = fontSize * 0.22;
    textWidth = context.measureText(badge.label).width;
  }
  const contentWidth = iconSize + gap + textWidth;
  const contentStart = rect.x + (rect.width - contentWidth) / 2;
  drawMoodSemanticIcon(
    context,
    badge.tone,
    contentStart + iconSize / 2,
    rect.y + rect.height / 2,
    iconSize,
    tone.foreground,
    images.get(moodHotIconAssetPath),
  );
  context.fillText(badge.label, contentStart + iconSize + gap, rect.y + rect.height / 2 + 1);
  context.restore();
}

function motionValues(frame: PetActorFrame, time: number, interactiveState: { hover: boolean }) {
  const breathAmp = frame.motionState === "sleepy" ? 0.006 : frame.motionState === "overdrive" ? 0.016 : 0.01;
  const breath = Math.sin(time * (frame.motionState === "sleepy" ? 1.4 : 2.2));
  const hoverLift = interactiveState.hover ? -10 : 0;
  return {
    breath,
    rootScaleX: 1 - breath * breathAmp * 0.45,
    rootScaleY: 1 + breath * breathAmp,
    rootY: breath * -3 + hoverLift,
    accessoryBob: breath * -4 + hoverLift * 0.35,
    effectDrift: Math.sin(time * 1.6) * 12,
  };
}

function slotAttachments(frame: PetActorFrame, slot: ActorSlotId) {
  return frame.attachments.filter((attachment) => attachment.slot === slot);
}

function drawAttachment(
  context: CanvasRenderingContext2D,
  frame: PetActorFrame,
  images: ActorImageMap,
  catImage: HTMLImageElement,
  placement: SkinPlacement,
  attachment: ActorRenderAttachment,
  time: number,
  interactiveState: { hover: boolean },
) {
  if (!attachment.asset) return;
  const asset = images.get(attachment.asset);
  if (!asset) return;

  const anchor = getMappedAnchor(frame, catImage, placement, attachment.anchor);
  const motion = motionValues(frame, time, interactiveState);
  const aspect = asset.height / asset.width;
  const width = anchor.width * attachment.scale;
  const height = width * aspect;
  const center = {
    x: anchor.x + anchor.width / 2 + anchor.width * (attachment.offsetX ?? 0),
    y: anchor.y + anchor.height / 2 + anchor.height * (attachment.offsetY ?? 0) + (attachment.category === "effects" ? motion.effectDrift * 0.2 : motion.accessoryBob * 0.25),
  };

  if (attachment.category !== "effects") {
    drawContactShadow(context, { x: center.x, y: center.y + height * 0.18 }, width * 0.62, height * 0.16, attachment.category === "base" ? 0.18 : 0.1);
  }

  drawImageBox(context, asset, center, width, height, {
    rotation: (anchor.angle ?? 0) + (attachment.rotation ?? 0),
    opacity: attachment.opacity,
    clip: attachment.clip,
    blendMode: attachment.blendMode,
  });
}

function drawSlot(
  context: CanvasRenderingContext2D,
  frame: PetActorFrame,
  images: ActorImageMap,
  catImage: HTMLImageElement,
  placement: SkinPlacement,
  slot: ActorSlotId,
  time: number,
  interactiveState: { hover: boolean },
) {
  slotAttachments(frame, slot).forEach((attachment) => {
    drawAttachment(context, frame, images, catImage, placement, attachment, time, interactiveState);
  });

  if (slot === "catBody") {
    // Approved static fallback images are complete compositions. Runtime only
    // maps them onto the common artboard; it does not deform or re-light them.
    context.drawImage(catImage, placement.x, placement.y, catImage.width * placement.scale, catImage.height * placement.scale);
  }

  if (slot === "moodBadge") {
    drawMoodBadge(context, frame, images, time);
  }
}

export function renderPetActorCanvas(
  context: CanvasRenderingContext2D,
  frame: PetActorFrame,
  images: ActorImageMap,
  timeMs: number,
  interactiveState: { hover: boolean } = { hover: false },
) {
  const catImage = images.get(frame.skin.attachments.fullBody);
  if (!catImage) return;

  const { width, height } = frame.model.canvas;
  const time = timeMs / 1000;
  const placement = getSkinPlacement(frame, catImage);

  context.clearRect(0, 0, width, height);
  context.save();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  actorSlotOrder.forEach((slot) => {
    drawSlot(context, frame, images, catImage, placement, slot, time, interactiveState);
  });

  context.restore();
}

export async function exportPetActorCanvas(frame: PetActorFrame) {
  const canvas = document.createElement("canvas");
  canvas.width = frame.model.canvas.width;
  canvas.height = frame.model.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create pet actor canvas");
  const images = await loadPetActorImages(frame);
  renderPetActorCanvas(context, frame, images, performance.now());
  return canvas;
}
