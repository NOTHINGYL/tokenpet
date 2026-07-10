export type WindowRectangle = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export function clampValue(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function clampBoundsToWorkArea(bounds: WindowRectangle, workArea: WindowRectangle): WindowRectangle {
  return {
    x: clampValue(bounds.x, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clampValue(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height),
    width: bounds.width,
    height: bounds.height,
  };
}

export function popoverPositionForBounds(
  petBounds: WindowRectangle,
  popoverBounds: Pick<WindowRectangle, "width" | "height">,
  workArea: WindowRectangle,
  margin = 12,
  gap = 8,
) {
  const centeredX = petBounds.x + petBounds.width / 2 - popoverBounds.width / 2;
  const x = clampValue(
    Math.round(centeredX),
    workArea.x + margin,
    workArea.x + workArea.width - popoverBounds.width - margin,
  );

  const belowY = petBounds.y + petBounds.height + gap;
  const aboveY = petBounds.y - popoverBounds.height - gap;
  const maxY = workArea.y + workArea.height - popoverBounds.height - margin;
  const minY = workArea.y + margin;
  const preferredY = belowY <= maxY ? belowY : aboveY;
  const y = clampValue(Math.round(preferredY), minY, maxY);

  return { x, y };
}

export function summonBoundsForCursor(
  bounds: WindowRectangle,
  cursor: ScreenPoint,
  workArea: WindowRectangle,
  gap = 28,
): WindowRectangle {
  const preferredX = cursor.x + gap + bounds.width <= workArea.x + workArea.width
    ? cursor.x + gap
    : cursor.x - bounds.width - gap;
  const preferredY = cursor.y + gap + bounds.height <= workArea.y + workArea.height
    ? cursor.y + gap
    : cursor.y - bounds.height - gap;

  return clampBoundsToWorkArea({ ...bounds, x: preferredX, y: preferredY }, workArea);
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function hasPngSignature(bytes: Uint8Array) {
  return bytes.length > pngSignature.length
    && pngSignature.every((value, index) => bytes[index] === value);
}
