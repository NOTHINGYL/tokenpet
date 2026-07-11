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

export type PetTraversalPlan = {
  start: WindowRectangle;
  target: WindowRectangle;
  workArea: WindowRectangle;
  durationMs: number;
  gaitAmplitude: number;
  gaitCycles: number;
  reduceMotion: boolean;
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
  gap = 14,
) {
  const minX = workArea.x + margin;
  const maxX = workArea.x + workArea.width - popoverBounds.width - margin;
  const minY = workArea.y + margin;
  const maxY = workArea.y + workArea.height - popoverBounds.height - margin;
  const centeredX = clampValue(
    Math.round(petBounds.x + petBounds.width / 2 - popoverBounds.width / 2),
    minX,
    maxX,
  );
  const centeredY = clampValue(
    Math.round(petBounds.y + petBounds.height / 2 - popoverBounds.height / 2),
    minY,
    maxY,
  );

  const candidates = [
    {
      x: petBounds.x + petBounds.width + gap,
      y: centeredY,
      fits: petBounds.x + petBounds.width + gap >= minX && petBounds.x + petBounds.width + gap <= maxX,
    },
    {
      x: petBounds.x - popoverBounds.width - gap,
      y: centeredY,
      fits: petBounds.x - popoverBounds.width - gap >= minX && petBounds.x - popoverBounds.width - gap <= maxX,
    },
    {
      x: centeredX,
      y: petBounds.y + petBounds.height + gap,
      fits: petBounds.y + petBounds.height + gap >= minY && petBounds.y + petBounds.height + gap <= maxY,
    },
    {
      x: centeredX,
      y: petBounds.y - popoverBounds.height - gap,
      fits: petBounds.y - popoverBounds.height - gap >= minY && petBounds.y - popoverBounds.height - gap <= maxY,
    },
  ];
  const fittingCandidate = candidates.find((candidate) => candidate.fits);
  if (fittingCandidate) return { x: fittingCandidate.x, y: fittingCandidate.y };

  const petRight = petBounds.x + petBounds.width;
  const petBottom = petBounds.y + petBounds.height;
  const overlapArea = (candidate: { x: number; y: number }) => {
    const overlapWidth = Math.max(0, Math.min(candidate.x + popoverBounds.width, petRight) - Math.max(candidate.x, petBounds.x));
    const overlapHeight = Math.max(0, Math.min(candidate.y + popoverBounds.height, petBottom) - Math.max(candidate.y, petBounds.y));
    return overlapWidth * overlapHeight;
  };
  const clampedCandidates = candidates.map((candidate, index) => ({
    x: clampValue(candidate.x, minX, maxX),
    y: clampValue(candidate.y, minY, maxY),
    index,
  }));
  clampedCandidates.sort((left, right) => overlapArea(left) - overlapArea(right) || left.index - right.index);
  return { x: clampedCandidates[0].x, y: clampedCandidates[0].y };
}

type PetVisibleBoundsSample = WindowRectangle & { size: number };

// The desktop pet renderer intentionally uses a fixed 260px transparent window so
// animated poses never resize the native window. These samples are the measured
// alpha bounds of the complete desktop companion (cat, mood badge, token pill,
// and close control) at the three supported size anchors.
const petVisibleBoundsSamples: PetVisibleBoundsSample[] = [
  { size: 0.75, x: 73.5, y: 103.5, width: 142, height: 138.5 },
  { size: 1, x: 57, y: 80.5, width: 179.5, height: 152.5 },
  { size: 1.25, x: 36, y: 34, width: 221, height: 191.5 },
];

function interpolate(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

export function petVisibleBoundsForPopover(petBounds: WindowRectangle, petSize = 1): WindowRectangle {
  const normalizedSize = clampValue(petSize, 0.75, 1.25);
  const upperIndex = normalizedSize <= 1 ? 1 : 2;
  const lower = petVisibleBoundsSamples[upperIndex - 1];
  const upper = petVisibleBoundsSamples[upperIndex];
  const progress = (normalizedSize - lower.size) / (upper.size - lower.size);
  const scaleX = petBounds.width / 260;
  const scaleY = petBounds.height / 260;
  const left = interpolate(lower.x, upper.x, progress);
  const top = interpolate(lower.y, upper.y, progress);
  const right = interpolate(lower.x + lower.width, upper.x + upper.width, progress);
  const bottom = interpolate(lower.y + lower.height, upper.y + upper.height, progress);
  const padding = 2;
  const x = Math.floor(petBounds.x + (left - padding) * scaleX);
  const y = Math.floor(petBounds.y + (top - padding) * scaleY);
  const farX = Math.ceil(petBounds.x + (right + padding) * scaleX);
  const farY = Math.ceil(petBounds.y + (bottom + padding) * scaleY);

  return { x, y, width: farX - x, height: farY - y };
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

export function createPetTraversalPlan(
  bounds: WindowRectangle,
  workArea: WindowRectangle,
  reduceMotion = false,
  edgeMargin = 24,
): PetTraversalPlan {
  const start = clampBoundsToWorkArea(bounds, workArea);
  const leftX = clampValue(workArea.x + edgeMargin, workArea.x, workArea.x + workArea.width - start.width);
  const rightX = clampValue(
    workArea.x + workArea.width - start.width - edgeMargin,
    workArea.x,
    workArea.x + workArea.width - start.width,
  );
  const workAreaCenterX = workArea.x + workArea.width / 2;
  const petCenterX = start.x + start.width / 2;
  const oppositeEdgeX = petCenterX <= workAreaCenterX ? rightX : leftX;
  const pathScale = reduceMotion ? 0.32 : 1;
  const target = clampBoundsToWorkArea({
    ...start,
    x: Math.round(start.x + (oppositeEdgeX - start.x) * pathScale),
  }, workArea);

  return {
    start,
    target,
    workArea,
    durationMs: reduceMotion ? 900 : 2_400,
    gaitAmplitude: reduceMotion ? 1 : 3,
    gaitCycles: reduceMotion ? 2 : 6,
    reduceMotion,
  };
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

export function petTraversalBoundsAtProgress(plan: PetTraversalPlan, progress: number): WindowRectangle {
  const normalizedProgress = clampValue(progress, 0, 1);
  if (normalizedProgress === 1) return plan.target;
  const easedProgress = easeInOutCubic(normalizedProgress);
  const gaitOffset = Math.sin(normalizedProgress * Math.PI * 2 * plan.gaitCycles) * plan.gaitAmplitude;
  return clampBoundsToWorkArea({
    ...plan.start,
    x: Math.round(plan.start.x + (plan.target.x - plan.start.x) * easedProgress),
    y: Math.round(plan.start.y + (plan.target.y - plan.start.y) * easedProgress + gaitOffset),
  }, plan.workArea);
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export function hasPngSignature(bytes: Uint8Array) {
  return bytes.length > pngSignature.length
    && pngSignature.every((value, index) => bytes[index] === value);
}
