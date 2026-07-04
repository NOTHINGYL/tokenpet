import type { PetAppearanceSettings, UsageSnapshot } from "../../types";
import type { AccessoryKitLayerId, AccessoryOption } from "./catalog";
import { getCatRig, type Anchor, type CatAnchorKey, type CatOcclusionMask } from "./catRigs";
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

  if (anchorKey === "chest") {
    return { x: 0.5, y: 0.68, width: 0.44, height: 0.18 };
  }

  if (anchorKey === "neck") {
    return { x: 0.5, y: 0.58, width: 0.24, height: 0.12 };
  }

  return { x: 0.5, y: 0.38, width: 0.32, height: 0.24 };
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
  if (tokenFrame.mode === "floating") return "floating";
  if (tokenFrame.mode === "embedded" && catRig.tokenFrameMode === "embedded" && appearance.accessorySettings.textOnlyFrame) return "embedded";
  return "below";
}

type AccessoryRenderSlot = "behindCat" | "back" | "underChin" | "frontCat" | "highlight" | "effect" | "shadow";

type CanvasAccessoryLayer = {
  accessory: AccessoryOption;
  asset?: string;
  image?: HTMLImageElement;
  slot: AccessoryRenderSlot;
  anchor: Anchor;
  width: number;
  height: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
  opacity?: number;
};

const kitLayerSlot: Record<AccessoryKitLayerId, AccessoryRenderSlot> = {
  back: "back",
  underChin: "underChin",
  front: "frontCat",
  highlight: "highlight",
  shadow: "shadow",
  effect: "effect",
};

function defaultSlotForAccessory(accessory: AccessoryOption): AccessoryRenderSlot {
  if (accessory.category === "base") return "behindCat";
  if (accessory.category === "effects") return "effect";
  if (accessory.category === "neck") return "underChin";
  return "frontCat";
}

function shouldGenerateContactShadow(accessory: AccessoryOption) {
  return accessory.category === "neck" || accessory.category === "head" || accessory.category === "base";
}

function resolveCanvasAccessoryLayers(appearance: PetAppearanceSettings) {
  if (!appearance.accessorySettings.moodVisibility[appearance.moodId]) return [];

  const catRig = getCatRig(appearance.catTypeId);
  const builtInAccessoryIds = new Set(catRig.builtInAccessoryIds ?? []);

  return appearance.accessoryIds.flatMap((accessoryId) => {
    const accessory = getAccessory(accessoryId);
    if (!accessory || accessory.locked || builtInAccessoryIds.has(accessory.id)) return [];

    const override = accessory.perCatOverrides?.[appearance.catTypeId];
    if (override?.hidden) return [];

    const bodyVariant = accessory.bodyTypeVariants?.[catRig.bodyType];
    const attachTo = override?.attachTo ?? bodyVariant?.attachTo ?? accessory.attachTo;
    const anchor = catRig.anchors[attachTo] ?? getFallbackAnchor(attachTo);
    const baseScale = override?.scale ?? override?.defaultScale ?? bodyVariant?.defaultScale ?? accessory.defaultScale ?? 1;
    const width = (anchor.width ?? 0.3) * baseScale * (catRig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const height = (anchor.height ?? anchor.width ?? 0.18) * baseScale * (catRig.accessoryScale ?? 1) * appearance.accessorySettings.scale;
    const rotation = (anchor.angle ?? 0) + (override?.rotation ?? override?.defaultRotation ?? bodyVariant?.defaultRotation ?? accessory.defaultRotation ?? 0);
    const offsetX = override?.offsetX ?? bodyVariant?.offsetX ?? accessory.offsetX ?? 0;
    const offsetY = override?.offsetY ?? bodyVariant?.offsetY ?? accessory.offsetY ?? 0;
    const hiddenLayers = new Set(override?.hiddenLayers ?? []);
    const layers = {
      ...(accessory.backAsset ? { back: accessory.backAsset } : {}),
      ...(accessory.layers ?? {}),
      ...(accessory.frontAsset ? { front: accessory.frontAsset } : {}),
      ...(bodyVariant?.layers ?? {}),
    };
    const resolvedLayers: CanvasAccessoryLayer[] = [];

    if (!Object.keys(layers).length) {
      resolvedLayers.push({
        accessory,
        asset: accessory.image,
        slot: defaultSlotForAccessory(accessory),
        anchor,
        width,
        height,
        rotation,
        offsetX,
        offsetY,
      });
    } else {
      (Object.entries(layers) as Array<[AccessoryKitLayerId, string | undefined]>).forEach(([layerId, asset]) => {
        if (!asset || hiddenLayers.has(layerId)) return;

        resolvedLayers.push({
          accessory,
          asset,
          slot: kitLayerSlot[layerId],
          anchor,
          width,
          height,
          rotation,
          offsetX,
          offsetY,
          opacity: layerId === "highlight" ? 0.22 : undefined,
        });
      });
    }

    if (shouldGenerateContactShadow(accessory) && !hiddenLayers.has("shadow")) {
      resolvedLayers.push({
        accessory,
        slot: "shadow",
        anchor,
        width: width * (accessory.category === "base" ? 1.08 : 0.74),
        height: height * (accessory.category === "head" ? 0.24 : 0.42),
        rotation,
        offsetX,
        offsetY: offsetY + (accessory.category === "head" ? 0.08 : 0.04),
        opacity: accessory.category === "base" ? 0.22 : 0.18,
      });
    }

    return resolvedLayers;
  });
}

async function loadCanvasAccessoryLayers(layers: CanvasAccessoryLayer[]) {
  return Promise.all(
    layers.map(async (layer) => ({
      ...layer,
      image: layer.asset ? await loadImage(layer.asset) : undefined,
    })),
  );
}

function flattenOcclusionMasks(masks: ReturnType<typeof getCatRig>["occlusionMasks"]) {
  if (!masks) return [];

  return Object.entries(masks).flatMap(([key, value]) => {
    if (key === "bodyFront") return [];
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).map((mask) => mask);
  });
}

function drawAccessoryLayer(
  context: CanvasRenderingContext2D,
  layer: CanvasAccessoryLayer,
  catBounds: { x: number; y: number; width: number; height: number },
) {
  const centerX = catBounds.x + catBounds.width * (layer.anchor.x + layer.offsetX);
  const centerY = catBounds.y + catBounds.height * (layer.anchor.y + layer.offsetY);
  const width = catBounds.width * layer.width;
  const height = catBounds.height * layer.height;

  context.save();
  context.globalAlpha = layer.opacity ?? 1;
  context.translate(centerX, centerY);
  context.rotate((layer.rotation * Math.PI) / 180);

  if (layer.slot === "shadow" || !layer.image) {
    const gradient = context.createRadialGradient(0, 0, 1, 0, 0, Math.max(width, height) / 2);
    gradient.addColorStop(0, "rgba(30, 41, 59, 0.22)");
    gradient.addColorStop(0.52, "rgba(30, 41, 59, 0.1)");
    gradient.addColorStop(1, "rgba(30, 41, 59, 0)");
    context.scale(1, Math.max(0.22, height / Math.max(width, 1)));
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, width / 2, width / 2, 0, 0, Math.PI * 2);
    context.fill();
  } else {
    const imageHeight = width * (layer.image.height / layer.image.width);
    context.shadowColor = "rgba(30, 41, 59, 0.1)";
    context.shadowBlur = layer.slot === "effect" ? 0 : 5;
    context.shadowOffsetY = layer.slot === "effect" ? 0 : 2;
    context.drawImage(layer.image, -width / 2, -imageHeight / 2, width, imageHeight);
  }

  context.restore();
}

function drawOcclusionMask(
  context: CanvasRenderingContext2D,
  catImage: HTMLImageElement,
  mask: CatOcclusionMask,
  catBounds: { x: number; y: number; width: number; height: number },
) {
  const centerX = catBounds.x + catBounds.width * mask.x;
  const centerY = catBounds.y + catBounds.height * mask.y;
  const radiusX = catBounds.width * (mask.width ?? 0.3);
  const radiusY = catBounds.height * (mask.height ?? 0.12);

  context.save();
  context.globalAlpha = mask.opacity ?? 1;
  context.beginPath();
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.clip();
  context.drawImage(catImage, catBounds.x, catBounds.y, catBounds.width, catBounds.height);
  context.restore();
}

function getExportCatScale(appearance: PetAppearanceSettings, catVisualScale: number | undefined) {
  const rawScale = appearance.size * (catVisualScale ?? 1);
  const previewMax = catVisualScale ? 1.28 : 0.92;
  return Math.min(rawScale, previewMax);
}

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
  const accessoryLayers = await loadCanvasAccessoryLayers(resolveCanvasAccessoryLayers(appearance));
  const occlusionMasks = flattenOcclusionMasks(catRig.occlusionMasks);

  const catWidth = 300 * getExportCatScale(appearance, cat.visualScale);
  const catHeight = (catImage.height / catImage.width) * catWidth;
  const catX = 320 - catWidth / 2;
  const catY = 150 - catHeight / 2;
  const catBounds = { x: catX, y: catY, width: catWidth, height: catHeight };

  accessoryLayers
    .filter((layer) => layer.slot === "behindCat" || layer.slot === "back")
    .forEach((layer) => drawAccessoryLayer(context, layer, catBounds));

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

  accessoryLayers
    .filter((layer) => layer.slot === "shadow" || layer.slot === "underChin")
    .forEach((layer) => drawAccessoryLayer(context, layer, catBounds));

  occlusionMasks.forEach((mask) => drawOcclusionMask(context, catImage, mask, catBounds));

  accessoryLayers
    .filter((layer) => layer.slot === "frontCat")
    .forEach((layer) => drawAccessoryLayer(context, layer, catBounds));

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

  if (tokenLabel && tokenMode !== "embedded") {
    const floating = tokenMode === "floating";
    drawTokenFrame(context, tokenLabel, {
      x: catX + catWidth * (floating ? Math.min(tokenAnchor.x + 0.32, 0.88) : tokenAnchor.x),
      y: catY + catHeight * (floating ? Math.max(tokenAnchor.y - 0.2, 0.34) : tokenAnchor.y),
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

  accessoryLayers
    .filter((layer) => layer.slot === "highlight" || layer.slot === "effect")
    .forEach((layer) => drawAccessoryLayer(context, layer, catBounds));

  await downloadCanvas(canvas);
}
