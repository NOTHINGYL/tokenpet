import type { PetAppearanceSettings, UsageSnapshot } from "../../types";
import type { AccessoryOption } from "./catalog";
import { getCatRig, type Anchor, type CatAnchorKey } from "./catRigs";
import {
  getAccessory,
  getCatVisual,
  getEffectiveTokenBubbleId,
  getMoodLabel,
  getTokenBubbleLabel,
  getTokenFrameOption,
  shouldShowMoodBadge,
} from "./appearanceView";

type LoadedImage = HTMLImageElement;

function loadImage(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load preview asset: ${src}`));
    image.src = src;
  });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + nextRadius, y);
  context.arcTo(x + width, y, x + width, y + height, nextRadius);
  context.arcTo(x + width, y + height, x, y + height, nextRadius);
  context.arcTo(x, y + height, x, y, nextRadius);
  context.arcTo(x, y, x + width, y, nextRadius);
  context.closePath();
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to export preview image"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function getFallbackAnchor(anchorKey: CatAnchorKey): Anchor {
  if (anchorKey === "base" || anchorKey === "tokenFrame") {
    return { x: 0.5, y: 0.86, width: 0.56, height: 0.16 };
  }

  if (anchorKey === "neck") {
    return { x: 0.5, y: 0.58, width: 0.24, height: 0.12 };
  }

  return { x: 0.5, y: 0.38, width: 0.32, height: 0.24 };
}

function drawCenteredImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  centerX: number,
  centerY: number,
  width: number,
  rotation = 0,
) {
  const height = width * (image.height / image.width);
  context.save();
  context.translate(centerX, centerY);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawTokenFrame(
  context: CanvasRenderingContext2D,
  tokenLabel: string,
  options: {
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    bubbleScale: number;
    textOnly: boolean;
  },
) {
  const width = options.width * options.bubbleScale;
  const height = options.height * options.bubbleScale;
  const x = options.x - width / 2;
  const y = options.y - height / 2;

  context.save();
  if (!options.textOnly) {
    roundRect(context, x, y, width, height, height / 2);
    context.fillStyle = "rgba(255, 253, 239, 0.96)";
    context.fill();
    context.strokeStyle = "rgba(217, 154, 33, 0.2)";
    context.stroke();
  }

  context.fillStyle = "#0b4f7c";
  context.font = `800 ${options.fontSize * options.bubbleScale}px Inter, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(tokenLabel, options.x, options.y + 1);
  context.restore();
}

function resolveTokenMode(appearance: PetAppearanceSettings) {
  const tokenFrame = getTokenFrameOption(appearance);
  const catRig = getCatRig(appearance.catTypeId);
  if (appearance.tokenBubbleId === "hidden" || tokenFrame.mode === "hidden") return "hidden";
  if (tokenFrame.mode === "floating" || appearance.accessorySettings.position === "floating") return "floating";
  if (tokenFrame.mode === "embedded" && catRig.tokenFrameMode === "embedded" && appearance.accessorySettings.textOnlyFrame) return "embedded";
  return "below";
}

type LoadedAccessory = {
  accessory: AccessoryOption;
  image: HTMLImageElement;
};

async function downloadCanvas(canvas: HTMLCanvasElement) {
  const blob = await canvasToBlob(canvas);
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `tokenpet-preview-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
  link.href = objectUrl;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export async function exportPetPreview(appearance: PetAppearanceSettings, usage: UsageSnapshot) {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = 640 * scale;
  canvas.height = 520 * scale;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.scale(scale, scale);
  context.clearRect(0, 0, 640, 520);

  const cat = getCatVisual(appearance.catTypeId);
  const catRig = getCatRig(appearance.catTypeId);
  const catImage = await loadImage(cat.image);
  const accessoryImages = (
    await Promise.all(
      appearance.accessoryIds.map(async (accessoryId) => {
        const accessory = getAccessory(accessoryId);
        if (!accessory || accessory.locked || catRig.builtInAccessoryIds?.includes(accessory.id)) return null;
        const override = accessory.perCatOverrides?.[appearance.catTypeId];
        if (override?.hidden) return null;
        return { accessory, image: await loadImage(accessory.image) };
      }),
    )
  ).filter((asset): asset is LoadedAccessory => Boolean(asset));

  const catWidth = 300 * appearance.size * (cat.visualScale ?? 1);
  const catHeight = (catImage.height / catImage.width) * catWidth;
  const catX = 320 - catWidth / 2;
  const catY = 150 - catHeight / 2;

  function drawAccessory(asset: LoadedAccessory) {
    const override = asset.accessory.perCatOverrides?.[appearance.catTypeId];
    const attachTo = override?.attachTo ?? asset.accessory.attachTo;
    const anchor = catRig.anchors[attachTo] ?? getFallbackAnchor(attachTo);
    const defaultScale = override?.defaultScale ?? asset.accessory.defaultScale ?? 1;
    const width = catWidth * (anchor.width ?? 0.3) * defaultScale * (catRig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const x = catX + catWidth * (anchor.x + (override?.offsetX ?? asset.accessory.offsetX ?? 0));
    const y = catY + catHeight * (anchor.y + (override?.offsetY ?? asset.accessory.offsetY ?? 0));
    const rotation = (anchor.angle ?? 0) + (override?.defaultRotation ?? asset.accessory.defaultRotation ?? 0);
    drawCenteredImage(context, asset.image, x, y, width, rotation);
  }

  accessoryImages
    .filter((asset) => (asset.accessory.perCatOverrides?.[appearance.catTypeId]?.layer ?? asset.accessory.layer) === "behindCat")
    .forEach(drawAccessory);

  context.save();
  context.globalAlpha = appearance.opacity;
  context.shadowColor = `rgba(30, 41, 59, ${0.08 + appearance.shadow * 0.24})`;
  context.shadowBlur = 28 * appearance.shadow;
  context.shadowOffsetY = 18 * appearance.shadow;
  context.drawImage(catImage, catX, catY, catWidth, catHeight);
  context.restore();

  const tokenMode = resolveTokenMode(appearance);
  const tokenBubbleId = getEffectiveTokenBubbleId(appearance);
  const tokenLabel = tokenMode !== "hidden" ? getTokenBubbleLabel(tokenBubbleId, usage) : null;
  const tokenAnchor = catRig.anchors.tokenFrame ?? getFallbackAnchor("tokenFrame");

  if (tokenLabel && tokenMode === "embedded") {
    drawTokenFrame(context, tokenLabel, {
      x: catX + catWidth * tokenAnchor.x,
      y: catY + catHeight * tokenAnchor.y,
      width: catWidth * (tokenAnchor.width ?? 0.45),
      height: catHeight * (tokenAnchor.height ?? 0.18),
      fontSize: tokenBubbleId === "compact" ? 24 : 34,
      bubbleScale: appearance.bubbleScale,
      textOnly: true,
    });
  }

  accessoryImages
    .filter((asset) => (asset.accessory.perCatOverrides?.[appearance.catTypeId]?.layer ?? asset.accessory.layer) === "frontCat")
    .forEach(drawAccessory);

  if (tokenLabel && tokenMode !== "embedded") {
    const floating = tokenMode === "floating";
    drawTokenFrame(context, tokenLabel, {
      x: catX + catWidth * (floating ? Math.min(tokenAnchor.x + 0.36, 0.92) : tokenAnchor.x),
      y: catY + catHeight * (floating ? Math.max(tokenAnchor.y - 0.31, 0.22) : tokenAnchor.y),
      width: tokenBubbleId === "cost" ? 138 : tokenBubbleId === "compact" ? 92 : 118,
      height: tokenBubbleId === "compact" ? 40 : floating ? 42 : 48,
      fontSize: tokenBubbleId === "cost" ? 14 : tokenBubbleId === "compact" ? 17 : 24,
      bubbleScale: appearance.bubbleScale,
      textOnly: false,
    });
  }

  const showMood = shouldShowMoodBadge(appearance);
  if (showMood) {
    const moodLabel = getMoodLabel(appearance.moodId);
    context.font = "700 22px Inter, system-ui, sans-serif";
    const textWidth = context.measureText(moodLabel).width;
    const chipWidth = textWidth + 34;
    const chipX = 320 - chipWidth / 2;
    const chipY = 56;
    roundRect(context, chipX, chipY, chipWidth, 38, 19);
    context.fillStyle = "rgba(225, 246, 232, 0.96)";
    context.fill();
    context.strokeStyle = "rgba(47, 148, 97, 0.18)";
    context.stroke();
    context.fillStyle = "#176c3a";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(moodLabel, 320, chipY + 20);
  }

  accessoryImages
    .filter((asset) => (asset.accessory.perCatOverrides?.[appearance.catTypeId]?.layer ?? asset.accessory.layer) === "effect")
    .forEach(drawAccessory);

  await downloadCanvas(canvas);
}
