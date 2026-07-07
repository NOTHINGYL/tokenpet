import { actorSlotOrder } from "./canonicalActor";
import type { ActorAnchor, ActorRenderAttachment, ActorSlotId, CatSkin, PetActorFrame, Point, Rect } from "./actorTypes";

type ActorImageMap = Map<string, HTMLImageElement>;

type SkinPlacement = {
  x: number;
  y: number;
  scale: number;
};

export function collectPetActorAssets(frame: PetActorFrame) {
  const assets = new Set<string>();
  assets.add(frame.skin.attachments.fullBody);
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

function drawTokenFrame(context: CanvasRenderingContext2D, frame: PetActorFrame, time: number) {
  const token = frame.tokenFrame;
  if (!token || !token.label) return;

  const pulse = 1 + Math.sin(time * 3.2) * 0.01;
  const rect = {
    x: token.rect.x + token.rect.width * (1 - pulse) / 2,
    y: token.rect.y + token.rect.height * (1 - pulse) / 2,
    width: token.rect.width * pulse * frame.appearance.bubbleScale,
    height: token.rect.height * pulse * frame.appearance.bubbleScale,
  };
  rect.x = token.rect.x + (token.rect.width - rect.width) / 2;
  rect.y = token.rect.y + (token.rect.height - rect.height) / 2;

  context.save();

  if (!token.textOnly) {
    drawRoundRect(context, rect, rect.height / 2);
    const gradient = context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
    gradient.addColorStop(0, "rgba(255, 254, 244, 0.98)");
    gradient.addColorStop(1, "rgba(255, 246, 218, 0.95)");
    context.fillStyle = gradient;
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = "rgba(224, 159, 39, 0.22)";
    context.stroke();
    drawContactShadow(context, { x: rect.x + rect.width / 2, y: rect.y + rect.height * 0.62 }, rect.width * 0.86, rect.height * 0.34, 0.18);
  }

  context.fillStyle = "#0b4f7c";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${token.fontSize * frame.appearance.bubbleScale}px Inter, system-ui, sans-serif`;
  context.shadowColor = "rgba(255, 255, 255, 0.84)";
  context.shadowBlur = 2;
  context.fillText(token.label, token.rect.x + token.rect.width / 2, token.rect.y + token.rect.height / 2 + 2);
  context.restore();
}

function drawMoodBadge(context: CanvasRenderingContext2D, frame: PetActorFrame, time: number) {
  const badge = frame.moodBadge;
  if (!badge) return;

  const bob = Math.sin(time * 2.1) * 4;
  const rect = { ...badge.rect, y: badge.rect.y + bob };
  const palette: Record<string, { bg: string; stroke: string; text: string }> = {
    sleepy: { bg: "rgba(239, 246, 255, 0.96)", stroke: "rgba(49, 84, 120, 0.18)", text: "#315478" },
    focused: { bg: "rgba(225, 246, 232, 0.96)", stroke: "rgba(47, 148, 97, 0.18)", text: "#176c3a" },
    hot: { bg: "rgba(255, 237, 213, 0.96)", stroke: "rgba(179, 90, 2, 0.18)", text: "#a34308" },
    overdrive: { bg: "rgba(255, 228, 230, 0.96)", stroke: "rgba(200, 48, 48, 0.2)", text: "#b42318" },
  };
  const tone = palette[badge.tone] ?? palette.focused;

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
  context.font = "800 52px Inter, system-ui, sans-serif";
  context.fillText(badge.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
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
  if (slot === "baseBack") {
    drawContactShadow(context, { x: 512, y: frame.model.footLineY + 42 }, 560, 90, 0.22 + frame.appearance.shadow * 0.12);
  }

  slotAttachments(frame, slot).forEach((attachment) => {
    drawAttachment(context, frame, images, catImage, placement, attachment, time, interactiveState);
  });

  if (slot === "catBody") {
    const motion = motionValues(frame, time, interactiveState);
    context.save();
    context.translate(512, frame.model.footLineY);
    context.scale(motion.rootScaleX, motion.rootScaleY);
    context.translate(-512, -frame.model.footLineY + motion.rootY);
    context.filter = `drop-shadow(0 ${18 * frame.appearance.shadow}px ${26 * frame.appearance.shadow}px rgba(30, 41, 59, 0.18))`;
    context.drawImage(catImage, placement.x, placement.y, catImage.width * placement.scale, catImage.height * placement.scale);
    context.restore();
  }

  if (slot === "tokenFrame" && frame.tokenFrame?.mode !== "embedded") {
    drawTokenFrame(context, frame, time);
  }

  if (slot === "tokenText" && frame.tokenFrame?.mode === "embedded") {
    drawTokenFrame(context, frame, time);
  }

  if (slot === "moodBadge") {
    drawMoodBadge(context, frame, time);
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
