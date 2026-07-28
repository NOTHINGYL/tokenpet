import type { MoodLookId } from "../../types";

export type MoodBadgeTone = {
  background: string;
  border: string;
  foreground: string;
};

export const defaultMoodBadgeColors: Record<MoodLookId, string> = {
  sleepy: "#3277e8",
  focused: "#239b58",
  hot: "#f26a21",
  overdrive: "#ef2b2d",
};

export const moodHotIconAssetPath = "assets/icons/mood-hot.svg";
const tintedHotIconCache = new Map<string, HTMLCanvasElement>();

function tintedHotIcon(image: HTMLImageElement, size: number, color: string) {
  const pixelSize = Math.max(24, Math.round(size * 2));
  const key = `${image.currentSrc || image.src}:${pixelSize}:${color}`;
  const cached = tintedHotIconCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image, 0, 0, pixelSize, pixelSize);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, pixelSize, pixelSize);
  tintedHotIconCache.set(key, canvas);
  return canvas;
}

export function resolveMoodBadgeTone(
  mood: MoodLookId,
  colorByState: boolean,
  configuredColor?: string,
): MoodBadgeTone {
  const foreground = configuredColor
    ?? (colorByState ? defaultMoodBadgeColors[mood] : defaultMoodBadgeColors.focused);
  return {
    background: "#ffffff",
    border: foreground,
    foreground,
  };
}

export function drawMoodSemanticIcon(
  context: CanvasRenderingContext2D,
  mood: MoodLookId,
  centerX: number,
  centerY: number,
  size: number,
  color: string,
  hotIconImage?: HTMLImageElement,
) {
  if (mood === "hot" && hotIconImage) {
    const icon = tintedHotIcon(hotIconImage, size, color);
    if (icon) {
      context.save();
      context.drawImage(icon, centerX - size / 2, centerY - size / 2, size, size);
      context.restore();
      return;
    }
  }
  const half = size / 2;
  context.save();
  context.beginPath();
  context.strokeStyle = color;
  context.fillStyle = "transparent";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(2, size * 0.09);

  if (mood === "sleepy") {
    context.moveTo(centerX + half * 0.48, centerY - half * 0.72);
    context.bezierCurveTo(
      centerX - half * 0.5,
      centerY - half * 0.62,
      centerX - half * 0.72,
      centerY + half * 0.5,
      centerX + half * 0.22,
      centerY + half * 0.72,
    );
    context.bezierCurveTo(
      centerX - half * 0.03,
      centerY + half * 0.2,
      centerX + half * 0.18,
      centerY - half * 0.34,
      centerX + half * 0.48,
      centerY - half * 0.72,
    );
  } else if (mood === "focused") {
    context.arc(centerX, centerY, half * 0.58, 0, Math.PI * 2);
    context.moveTo(centerX + half * 0.24, centerY);
    context.arc(centerX, centerY, half * 0.24, 0, Math.PI * 2);
    context.moveTo(centerX - half, centerY);
    context.lineTo(centerX - half * 0.7, centerY);
    context.moveTo(centerX + half * 0.7, centerY);
    context.lineTo(centerX + half, centerY);
    context.moveTo(centerX, centerY - half);
    context.lineTo(centerX, centerY - half * 0.7);
    context.moveTo(centerX, centerY + half * 0.7);
    context.lineTo(centerX, centerY + half);
  } else if (mood === "hot") {
    context.moveTo(centerX + half * 0.18, centerY - half * 0.9);
    context.bezierCurveTo(
      centerX + half * 0.28,
      centerY - half * 0.28,
      centerX - half * 0.18,
      centerY - half * 0.14,
      centerX + half * 0.1,
      centerY + half * 0.3,
    );
    context.bezierCurveTo(
      centerX + half * 0.32,
      centerY + half * 0.1,
      centerX + half * 0.34,
      centerY - half * 0.16,
      centerX + half * 0.22,
      centerY - half * 0.44,
    );
    context.bezierCurveTo(
      centerX + half * 0.82,
      centerY - half * 0.02,
      centerX + half * 0.72,
      centerY + half * 0.78,
      centerX,
      centerY + half * 0.86,
    );
    context.bezierCurveTo(
      centerX - half * 0.72,
      centerY + half * 0.78,
      centerX - half * 0.82,
      centerY + half * 0.02,
      centerX - half * 0.26,
      centerY - half * 0.56,
    );
    context.bezierCurveTo(
      centerX - half * 0.3,
      centerY - half * 0.18,
      centerX - half * 0.18,
      centerY + half * 0.12,
      centerX + half * 0.02,
      centerY + half * 0.3,
    );
    context.bezierCurveTo(
      centerX - half * 0.14,
      centerY - half * 0.24,
      centerX + half * 0.1,
      centerY - half * 0.42,
      centerX + half * 0.18,
      centerY - half * 0.9,
    );
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(centerX, centerY + half * 0.18);
    context.bezierCurveTo(
      centerX + half * 0.28,
      centerY + half * 0.42,
      centerX + half * 0.2,
      centerY + half * 0.68,
      centerX,
      centerY + half * 0.68,
    );
    context.bezierCurveTo(
      centerX - half * 0.24,
      centerY + half * 0.68,
      centerX - half * 0.28,
      centerY + half * 0.38,
      centerX,
      centerY + half * 0.18,
    );
  } else {
    context.moveTo(centerX + half * 0.15, centerY - half);
    context.lineTo(centerX - half * 0.58, centerY + half * 0.1);
    context.lineTo(centerX - half * 0.08, centerY + half * 0.1);
    context.lineTo(centerX - half * 0.2, centerY + half);
    context.lineTo(centerX + half * 0.62, centerY - half * 0.2);
    context.lineTo(centerX + half * 0.12, centerY - half * 0.2);
    context.closePath();
  }

  context.stroke();
  context.restore();
}
