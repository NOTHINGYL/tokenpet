import type { PetAppearanceSettings, UsageSnapshot } from "../../types";
import { getAccessory, getCatVisual, getMoodLabel, getTokenBubbleLabel, shouldShowMoodBadge } from "./appearanceView";

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
  const catImage = await loadImage(cat.image);
  const accessoryImages = await Promise.all(
    appearance.accessoryIds.map(async (accessoryId) => {
      const accessory = getAccessory(accessoryId);
      if (!accessory || accessory.locked) return null;
      return { accessoryId, image: await loadImage(accessory.image) };
    }),
  );

  const catWidth = 300 * appearance.size;
  const catHeight = (catImage.height / catImage.width) * catWidth;
  const catX = 320 - catWidth / 2;
  const catY = 150 - catHeight / 2;

  context.save();
  context.globalAlpha = appearance.opacity;
  context.shadowColor = `rgba(30, 41, 59, ${0.08 + appearance.shadow * 0.24})`;
  context.shadowBlur = 28 * appearance.shadow;
  context.shadowOffsetY = 18 * appearance.shadow;
  context.drawImage(catImage, catX, catY, catWidth, catHeight);
  context.restore();

  accessoryImages.forEach((asset) => {
    if (!asset) return;

    const accessorySize = asset.accessoryId === "halo" ? 128 : asset.accessoryId === "desk-mat" ? 150 : 96;
    const positions: Record<string, [number, number]> = {
      collar: [320 - accessorySize / 2, catY + catHeight * 0.64],
      ribbon: [320 - accessorySize / 2, catY + catHeight * 0.5],
      "focus-crown": [320 - accessorySize / 2, catY + catHeight * 0.18],
      "tiny-scarf": [320 - accessorySize / 2, catY + catHeight * 0.62],
      halo: [320 - accessorySize / 2, catY + catHeight * 0.05],
      "desk-mat": [320 - accessorySize / 2, catY + catHeight * 0.78],
    };
    const [x, y] = positions[asset.accessoryId] ?? [320 - accessorySize / 2, catY + catHeight * 0.58];
    context.drawImage(asset.image, x, y, accessorySize, accessorySize);
  });

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

  const tokenLabel = getTokenBubbleLabel(appearance.tokenBubbleId, usage);
  if (tokenLabel) {
    context.font = `${appearance.tokenBubbleId === "compact" ? 700 : 800} ${
      appearance.tokenBubbleId === "compact" ? 24 : 34
    }px Inter, system-ui, sans-serif`;
    const textWidth = context.measureText(tokenLabel).width;
    const bubbleWidth = (textWidth + 48) * appearance.bubbleScale;
    const bubbleHeight = (appearance.tokenBubbleId === "compact" ? 42 : 58) * appearance.bubbleScale;
    const bubbleX = 320 - bubbleWidth / 2;
    const bubbleY = 374;
    roundRect(context, bubbleX, bubbleY, bubbleWidth, bubbleHeight, bubbleHeight / 2);
    context.fillStyle = "rgba(255, 253, 239, 0.96)";
    context.fill();
    context.strokeStyle = "rgba(217, 154, 33, 0.2)";
    context.stroke();
    context.fillStyle = "#0b4f7c";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(tokenLabel, 320, bubbleY + bubbleHeight / 2 + 1);
  }

  await downloadCanvas(canvas);
}
