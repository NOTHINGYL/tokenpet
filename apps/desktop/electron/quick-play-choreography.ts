/**
 * Pure Quick Play choreography primitives.
 *
 * This module deliberately has no Electron or filesystem dependencies. Native
 * window/overlay executors can inject their own clock, random source and work
 * area, while Node tests can exercise every calculation deterministically.
 */

export type QuickPlayPoint = { x: number; y: number };

export type QuickPlayBounds = QuickPlayPoint & { width: number; height: number };
export type DangleActorDirection =
  | "left" | "right" | "front" | "back"
  | "front-left" | "front-right" | "back-left" | "back-right";

export type QuickPlayAnimatedActionId =
  | "walk_round_trip"
  | "token_snack"
  | "play_cursor"
  | "drag_dangle"
  | "toss_yarn"
  | "nap_here"
  | "wake_up"
  | "summon_to_pointer";

export type PetQuickPlayConfig = {
  walkPace: number;
  roamDistance: "near" | "medium" | "far";
  destinationPause: number;
  lookAroundEffect: boolean;
};

export type FeedSnackQuickPlayConfig = {
  snackStyle: "paw" | "fish" | "token";
  walkPace: number;
  snackSize: number;
  startMeow: boolean;
  returnPace: "run" | "quick";
};

export type PlayCursorQuickPlayConfig = {
  attentionRadius: number;
  followSmoothing: number;
  maxHeadTurnAngle: number;
  earFollow: boolean;
};

export type DangleToyQuickPlayConfig = {
  fishToyStyle: "mint" | "blue" | "feather";
  swingResponse: number;
  pursuitPace: number;
  toyTrailEffect: boolean;
};

export type TossYarnQuickPlayConfig = {
  yarnColor: "orange" | "blue" | "violet";
  rollDistance: number;
  rollSpeed: number;
  returnPace: "run" | "quick";
};

export type NapHereQuickPlayConfig = {
  settlePose: "curl" | "paws" | "side";
  breathingIntensity: number;
  zEffect: boolean;
  sleepShadow: boolean;
};

export type WakeUpQuickPlayConfig = {
  meowVoice: "soft" | "cozy" | "playful";
  meowCue: boolean;
  stretchHold: number;
  wakeSparkle: boolean;
};

export type SummonQuickPlayConfig = {
  walkPace: number;
  arrivalOffset: "near" | "beside" | "below";
  routeCurve: "straight" | "gentle" | "curved";
  settleDelay: number;
};

export type QuickPlayActionConfigMap = {
  walk_round_trip: PetQuickPlayConfig;
  token_snack: FeedSnackQuickPlayConfig;
  play_cursor: PlayCursorQuickPlayConfig;
  drag_dangle: DangleToyQuickPlayConfig;
  toss_yarn: TossYarnQuickPlayConfig;
  nap_here: NapHereQuickPlayConfig;
  wake_up: WakeUpQuickPlayConfig;
  summon_to_pointer: SummonQuickPlayConfig;
};

export const QUICK_PLAY_ACTION_DEFAULTS: Readonly<QuickPlayActionConfigMap> = {
  walk_round_trip: {
    walkPace: 90,
    roamDistance: "medium",
    destinationPause: 1.1,
    lookAroundEffect: true,
  },
  token_snack: {
    snackStyle: "paw",
    walkPace: 82,
    snackSize: 100,
    startMeow: true,
    returnPace: "run",
  },
  play_cursor: {
    attentionRadius: 160,
    followSmoothing: 74,
    maxHeadTurnAngle: 28,
    earFollow: true,
  },
  drag_dangle: {
    fishToyStyle: "mint",
    swingResponse: 66,
    pursuitPace: 108,
    toyTrailEffect: true,
  },
  toss_yarn: {
    yarnColor: "orange",
    rollDistance: 120,
    rollSpeed: 100,
    returnPace: "quick",
  },
  nap_here: {
    settlePose: "curl",
    breathingIntensity: 54,
    zEffect: true,
    sleepShadow: true,
  },
  wake_up: {
    meowVoice: "cozy",
    meowCue: true,
    stretchHold: 3,
    wakeSparkle: true,
  },
  summon_to_pointer: {
    walkPace: 92,
    arrivalOffset: "beside",
    routeCurve: "gentle",
    settleDelay: 0.7,
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function finiteNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  return clamp(typeof value === "number" && Number.isFinite(value) ? value : fallback, minimum, maximum);
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function enumValue<const T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

/** Normalize persisted Actions settings before a native executor consumes them. */
export function normalizeQuickPlayActionConfig<A extends QuickPlayAnimatedActionId>(
  action: A,
  source: Record<string, unknown> | null | undefined,
): QuickPlayActionConfigMap[A] {
  const raw = source ?? {};
  switch (action) {
    case "walk_round_trip": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.walk_round_trip;
      return {
        walkPace: finiteNumber(raw.walkPace, fallback.walkPace, 60, 140),
        roamDistance: enumValue(raw.roamDistance, ["near", "medium", "far"], fallback.roamDistance),
        destinationPause: finiteNumber(raw.destinationPause, fallback.destinationPause, 0.5, 2),
        lookAroundEffect: booleanValue(raw.lookAroundEffect, fallback.lookAroundEffect),
      } as QuickPlayActionConfigMap[A];
    }
    case "token_snack": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.token_snack;
      return {
        snackStyle: enumValue(raw.snackStyle, ["paw", "fish", "token"], fallback.snackStyle),
        walkPace: finiteNumber(raw.walkPace, fallback.walkPace, 60, 140),
        snackSize: finiteNumber(raw.snackSize, fallback.snackSize, 70, 130),
        startMeow: booleanValue(raw.startMeow, fallback.startMeow),
        returnPace: enumValue(raw.returnPace, ["run", "quick"], fallback.returnPace),
      } as QuickPlayActionConfigMap[A];
    }
    case "play_cursor": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.play_cursor;
      return {
        attentionRadius: finiteNumber(raw.attentionRadius, fallback.attentionRadius, 80, 240),
        followSmoothing: finiteNumber(raw.followSmoothing, fallback.followSmoothing, 20, 100),
        maxHeadTurnAngle: finiteNumber(raw.maxHeadTurnAngle, fallback.maxHeadTurnAngle, 10, 42),
        earFollow: booleanValue(raw.earFollow, fallback.earFollow),
      } as QuickPlayActionConfigMap[A];
    }
    case "drag_dangle": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.drag_dangle;
      return {
        fishToyStyle: enumValue(raw.fishToyStyle, ["mint", "blue", "feather"], fallback.fishToyStyle),
        swingResponse: finiteNumber(raw.swingResponse, fallback.swingResponse, 20, 100),
        pursuitPace: finiteNumber(raw.pursuitPace, fallback.pursuitPace, 70, 150),
        toyTrailEffect: booleanValue(raw.toyTrailEffect, fallback.toyTrailEffect),
      } as QuickPlayActionConfigMap[A];
    }
    case "toss_yarn": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.toss_yarn;
      return {
        yarnColor: enumValue(raw.yarnColor, ["orange", "blue", "violet"], fallback.yarnColor),
        rollDistance: finiteNumber(raw.rollDistance, fallback.rollDistance, 60, 180),
        rollSpeed: finiteNumber(raw.rollSpeed, fallback.rollSpeed, 60, 150),
        returnPace: enumValue(raw.returnPace, ["run", "quick"], fallback.returnPace),
      } as QuickPlayActionConfigMap[A];
    }
    case "nap_here": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.nap_here;
      return {
        settlePose: enumValue(raw.settlePose, ["curl", "paws", "side"], fallback.settlePose),
        breathingIntensity: finiteNumber(raw.breathingIntensity, fallback.breathingIntensity, 20, 100),
        zEffect: booleanValue(raw.zEffect, fallback.zEffect),
        sleepShadow: booleanValue(raw.sleepShadow, fallback.sleepShadow),
      } as QuickPlayActionConfigMap[A];
    }
    case "wake_up": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.wake_up;
      return {
        meowVoice: enumValue(raw.meowVoice, ["soft", "cozy", "playful"], fallback.meowVoice),
        meowCue: booleanValue(raw.meowCue, fallback.meowCue),
        stretchHold: finiteNumber(raw.stretchHold, fallback.stretchHold, 2.4, 3.6),
        wakeSparkle: booleanValue(raw.wakeSparkle, fallback.wakeSparkle),
      } as QuickPlayActionConfigMap[A];
    }
    case "summon_to_pointer": {
      const fallback = QUICK_PLAY_ACTION_DEFAULTS.summon_to_pointer;
      return {
        walkPace: finiteNumber(raw.walkPace, fallback.walkPace, 60, 140),
        arrivalOffset: enumValue(raw.arrivalOffset, ["near", "beside", "below"], fallback.arrivalOffset),
        routeCurve: enumValue(raw.routeCurve, ["straight", "gentle", "curved"], fallback.routeCurve),
        settleDelay: finiteNumber(raw.settleDelay, fallback.settleDelay, 0.2, 1.5),
      } as QuickPlayActionConfigMap[A];
    }
  }
}

export function clampQuickPlayBounds(bounds: QuickPlayBounds, workArea: QuickPlayBounds): QuickPlayBounds {
  return {
    ...bounds,
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - bounds.width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - bounds.height),
  };
}

/**
 * Resolve one of the eight authored Dangle camera sectors. Sector boundaries
 * sit at 22.5 degrees, so diagonal destinations use diagonal anatomy instead
 * of rotating a front/back cat or sliding a side cat across the screen.
 */
export function dangleActorDirection(from: QuickPlayBounds, to: QuickPlayBounds): DangleActorDirection {
  const deltaX = to.x + to.width / 2 - (from.x + from.width / 2);
  const deltaY = to.y + to.height / 2 - (from.y + from.height / 2);
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  const sectorBoundary = Math.SQRT2 - 1; // tan(22.5°)
  if (absoluteY <= absoluteX * sectorBoundary) return deltaX >= 0 ? "right" : "left";
  if (absoluteX <= absoluteY * sectorBoundary) return deltaY >= 0 ? "front" : "back";
  if (deltaY >= 0) return deltaX >= 0 ? "front-right" : "front-left";
  return deltaX >= 0 ? "back-right" : "back-left";
}

/**
 * Register a Feed interaction by the authored cat's nose, not by the center of
 * its transparent BrowserWindow. The source faces right; left approaches flip
 * the complete canvas and therefore mirror the nose anchor.
 */
export function feedSnackTargetBounds(start: QuickPlayBounds, snack: QuickPlayPoint, workArea: QuickPlayBounds) {
  const startCenterX = start.x + start.width / 2;
  const facing: "left" | "right" = snack.x >= startCenterX ? "right" : "left";
  const noseOffsetX = start.width * .245 * (facing === "right" ? 1 : -1);
  return {
    facing,
    bounds: clampQuickPlayBounds({
      ...start,
      x: Math.round(snack.x - start.width / 2 - noseOffsetX),
      y: Math.round(snack.y - start.height * .68),
    }, workArea),
  };
}

export function interpolateQuickPlayBounds(
  from: QuickPlayBounds,
  to: QuickPlayBounds,
  progress: number,
): QuickPlayBounds {
  const amount = clamp(progress, 0, 1);
  if (amount === 0) return { ...from };
  if (amount === 1) return { ...to };
  return {
    x: Math.round(from.x + (to.x - from.x) * amount),
    y: Math.round(from.y + (to.y - from.y) * amount),
    width: Math.round(from.width + (to.width - from.width) * amount),
    height: Math.round(from.height + (to.height - from.height) * amount),
  };
}

/**
 * A natural four-beat walk advances one paw contact for every two authored
 * frames. Keeping the spatial footfall in the same plan as the frame cadence
 * prevents the actor from looking like an in-place loop sliding across the
 * desktop.
 */
export type DistanceLockedWalkPlan = {
  distancePx: number;
  stepCount: number;
  stepDistancePx: number;
  stepDurationMs: number;
  cycleDurationMs: number;
  durationMs: number;
  rootMotion: WalkRootMotionProfile;
};

export type WalkRootMotionProfile = {
  nominalStepDistancePx: number;
  footfallsPerCycle: number;
  rootStepKeyframes: number[];
};

export const DEFAULT_WALK_ROOT_MOTION: WalkRootMotionProfile = {
  nominalStepDistancePx: 18,
  footfallsPerCycle: 4,
  rootStepKeyframes: [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4],
};

/** Feed Snack owns a cautious, nose-led approach instead of borrowing Pet. */
export const FEED_SNACK_WALK_ROOT_MOTION: WalkRootMotionProfile = {
  nominalStepDistancePx: 16,
  footfallsPerCycle: 4,
  rootStepKeyframes: [0, .14, 1, 1.14, 2, 2.14, 3, 3.14, 4],
};

/** The satisfied trip home is a separate light run with longer strides. */
export const FEED_SNACK_RETURN_ROOT_MOTION: WalkRootMotionProfile = {
  nominalStepDistancePx: 24,
  footfallsPerCycle: 4,
  rootStepKeyframes: [0, .32, 1, 1.32, 2, 2.32, 3, 3.32, 4],
};

/** Dangle pursuit is a low, fast four-contact run authored around the fish. */
export const DANGLE_PURSUIT_ROOT_MOTION: WalkRootMotionProfile = {
  nominalStepDistancePx: 26,
  footfallsPerCycle: 4,
  rootStepKeyframes: [0, .36, 1, 1.36, 2, 2.36, 3, 3.36, 4],
};

/** Releasing the wand uses a calm dedicated walk back to the captured home. */
export const DANGLE_RETURN_ROOT_MOTION: WalkRootMotionProfile = {
  nominalStepDistancePx: 18,
  footfallsPerCycle: 4,
  rootStepKeyframes: [0, .18, 1, 1.18, 2, 2.18, 3, 3.18, 4],
};

const NATURAL_WALK_STEP_DURATION_MS = 220;

export function createDistanceLockedWalkPlan(distancePx: number, pacePercent = 100, actorScale = 1, rootMotion: WalkRootMotionProfile = DEFAULT_WALK_ROOT_MOTION): DistanceLockedWalkPlan {
  const distance = Math.max(0, Number.isFinite(distancePx) ? distancePx : 0);
  const pace = clamp(Number.isFinite(pacePercent) ? pacePercent : 100, 60, 140);
  const scaledStepDistance = rootMotion.nominalStepDistancePx * clamp(Number.isFinite(actorScale) ? actorScale : 1, 0.7, 1.4);
  const stepCount = Math.max(rootMotion.footfallsPerCycle, Math.round(distance / scaledStepDistance));
  const stepDurationMs = Math.round(NATURAL_WALK_STEP_DURATION_MS * 100 / pace);
  return {
    distancePx: distance,
    stepCount,
    stepDistancePx: distance / stepCount,
    stepDurationMs,
    cycleDurationMs: stepDurationMs * rootMotion.footfallsPerCycle,
    durationMs: stepDurationMs * stepCount,
    rootMotion: {
      nominalStepDistancePx: rootMotion.nominalStepDistancePx,
      footfallsPerCycle: rootMotion.footfallsPerCycle,
      rootStepKeyframes: [...rootMotion.rootStepKeyframes],
    },
  };
}

/** Convert authored time to wall-clock time while preserving every stride. */
export function scaleDistanceLockedWalkPlan(plan: DistanceLockedWalkPlan, timeScale = 1): DistanceLockedWalkPlan {
  const scale = clamp(Number.isFinite(timeScale) ? timeScale : 1, 0.01, 100);
  return {
    ...plan,
    stepDurationMs: plan.stepDurationMs / scale,
    cycleDurationMs: plan.cycleDurationMs / scale,
    durationMs: plan.durationMs / scale,
  };
}

/** Feed return pace drives the dedicated Feed return-run clip. */
export function feedSnackReturnPacePercent(returnPace: FeedSnackQuickPlayConfig["returnPace"]) {
  return returnPace === "run" ? 140 : 118;
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

/**
 * Resolve body travel from root-motion keyframes authored with the asset.
 * Contact frames carry only a small fraction of a footfall; the matching
 * support frame carries the body over the paw and lands on the next exact
 * integer step. The main process no longer guesses a generic movement curve.
 */
export function distanceLockedWalkProgressAtTime(plan: DistanceLockedWalkPlan, elapsedMs: number) {
  if (plan.distancePx <= 0 || plan.durationMs <= 0 || plan.stepDurationMs <= 0) return 1;
  const elapsed = clamp(elapsedMs, 0, plan.durationMs);
  if (elapsed >= plan.durationMs) return 1;
  const profile = plan.rootMotion;
  const framesPerCycle = profile.rootStepKeyframes.length - 1;
  const completedCycles = Math.floor(elapsed / plan.cycleDurationMs);
  const cycleElapsedMs = elapsed - completedCycles * plan.cycleDurationMs;
  const frameDurationMs = plan.cycleDurationMs / framesPerCycle;
  const frameIndex = Math.min(framesPerCycle - 1, Math.floor(cycleElapsedMs / frameDurationMs));
  const frameProgress = (cycleElapsedMs - frameIndex * frameDurationMs) / frameDurationMs;
  const rootStart = profile.rootStepKeyframes[frameIndex];
  const rootEnd = profile.rootStepKeyframes[frameIndex + 1];
  const rootSteps = completedCycles * profile.footfallsPerCycle + rootStart + (rootEnd - rootStart) * smoothStep(frameProgress);
  return clamp(rootSteps / plan.stepCount, 0, 1);
}

function distanceBetween(left: QuickPlayPoint, right: QuickPlayPoint) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

export type SafeRandomTargetOptions = {
  random?: () => number;
  edgeMargin?: number;
  minimumDistance?: number;
  /** Require a visibly different desktop row while still sampling the full safe Y range. */
  minimumVerticalDistance?: number;
  maximumAttempts?: number;
  roamDistance?: PetQuickPlayConfig["roamDistance"];
};

/** Pick a different, fully visible target. The random source is injectable for deterministic tests. */
export function sampleSafeRandomTarget(
  startBounds: QuickPlayBounds,
  workArea: QuickPlayBounds,
  options: SafeRandomTargetOptions = {},
): QuickPlayBounds {
  const random = options.random ?? Math.random;
  const edgeMargin = Math.max(0, options.edgeMargin ?? 24);
  const maximumAttempts = Math.max(1, Math.floor(options.maximumAttempts ?? 24));
  const safeStart = clampQuickPlayBounds(startBounds, workArea);
  const minX = Math.min(
    workArea.x + edgeMargin,
    workArea.x + workArea.width - safeStart.width,
  );
  const maxX = Math.max(minX, workArea.x + workArea.width - safeStart.width - edgeMargin);
  const minY = Math.min(
    workArea.y + edgeMargin,
    workArea.y + workArea.height - safeStart.height,
  );
  const maxY = Math.max(minY, workArea.y + workArea.height - safeStart.height - edgeMargin);
  const availableDiagonal = Math.hypot(maxX - minX, maxY - minY);
  const distanceScale = options.roamDistance === "near" ? 0.15 : options.roamDistance === "far" ? 0.42 : 0.27;
  const minimumDistance = Math.min(
    Math.max(1, options.minimumDistance ?? availableDiagonal * distanceScale),
    availableDiagonal,
  );
  const availableVertical = Math.max(Math.abs(safeStart.y - minY), Math.abs(maxY - safeStart.y));
  const minimumVerticalDistance = Math.min(
    Math.max(0, options.minimumVerticalDistance ?? 0),
    availableVertical,
  );

  let best = safeStart;
  let bestDistance = -1;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const candidate = {
      ...safeStart,
      x: Math.round(minX + finiteNumber(random(), 0.5, 0, 1) * (maxX - minX)),
      y: Math.round(minY + finiteNumber(random(), 0.5, 0, 1) * (maxY - minY)),
    };
    const distance = distanceBetween(safeStart, candidate);
    const verticalDistance = Math.abs(candidate.y - safeStart.y);
    if (distance > bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
    if (distance >= minimumDistance && verticalDistance >= minimumVerticalDistance) return candidate;
  }

  const corners = [
    { ...safeStart, x: minX, y: minY },
    { ...safeStart, x: maxX, y: minY },
    { ...safeStart, x: minX, y: maxY },
    { ...safeStart, x: maxX, y: maxY },
  ];
  const fallback = corners
    .filter((candidate) => Math.abs(candidate.y - safeStart.y) >= minimumVerticalDistance)
    .sort((left, right) => distanceBetween(safeStart, right) - distanceBetween(safeStart, left))[0];
  return fallback ?? (bestDistance > 0 ? best : safeStart);
}

export type QuickPlayRouteCurve = "straight" | "gentle" | "curved";

export type PointToPointPathPlan = {
  kind: "point-to-point";
  start: QuickPlayBounds;
  target: QuickPlayBounds;
  control: QuickPlayPoint;
  workArea: QuickPlayBounds;
  durationMs: number;
  routeCurve: QuickPlayRouteCurve;
};

export type PointToPointPathOptions = {
  durationMs?: number;
  pacePercent?: number;
  pixelsPerSecondAt100?: number;
  routeCurve?: QuickPlayRouteCurve;
};

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;
}

export function createPointToPointPath(
  startBounds: QuickPlayBounds,
  targetBounds: QuickPlayBounds,
  workArea: QuickPlayBounds,
  options: PointToPointPathOptions = {},
): PointToPointPathPlan {
  const start = clampQuickPlayBounds(startBounds, workArea);
  const target = clampQuickPlayBounds({ ...targetBounds, width: start.width, height: start.height }, workArea);
  const distance = distanceBetween(start, target);
  const pace = finiteNumber(options.pacePercent, 100, 20, 300) / 100;
  const pixelsPerSecond = Math.max(1, options.pixelsPerSecondAt100 ?? 230) * pace;
  const durationMs = Math.max(1, options.durationMs ?? Math.round(distance / pixelsPerSecond * 1_000));
  const routeCurve = options.routeCurve ?? "straight";
  const midpoint = { x: (start.x + target.x) / 2, y: (start.y + target.y) / 2 };
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const magnitude = Math.max(Math.hypot(dx, dy), 1);
  const curveScale = routeCurve === "curved" ? 0.18 : routeCurve === "gentle" ? 0.08 : 0;
  const curveDistance = Math.min(distance * curveScale, 96);
  const rawControl = {
    x: midpoint.x - dy / magnitude * curveDistance,
    y: midpoint.y + dx / magnitude * curveDistance,
  };
  const safeControlBounds = clampQuickPlayBounds({ ...start, x: rawControl.x, y: rawControl.y }, workArea);

  return {
    kind: "point-to-point",
    start,
    target,
    control: { x: safeControlBounds.x, y: safeControlBounds.y },
    workArea,
    durationMs,
    routeCurve,
  };
}

export type PathSample = {
  bounds: QuickPlayBounds;
  progress: number;
  complete: boolean;
};

export function boundsAtPointToPointTime(plan: PointToPointPathPlan, elapsedMs: number): PathSample {
  const progress = clamp(elapsedMs / plan.durationMs, 0, 1);
  if (progress === 0) return { bounds: { ...plan.start }, progress, complete: false };
  if (progress === 1) return { bounds: { ...plan.target }, progress, complete: true };
  const amount = easeInOutCubic(progress);
  const inverse = 1 - amount;
  const x = inverse ** 2 * plan.start.x + 2 * inverse * amount * plan.control.x + amount ** 2 * plan.target.x;
  const y = inverse ** 2 * plan.start.y + 2 * inverse * amount * plan.control.y + amount ** 2 * plan.target.y;
  return {
    bounds: clampQuickPlayBounds({ ...plan.start, x: Math.round(x), y: Math.round(y) }, plan.workArea),
    progress,
    complete: false,
  };
}

export type RoundTripPathPlan = {
  kind: "round-trip";
  start: QuickPlayBounds;
  destination: QuickPlayBounds;
  outbound: PointToPointPathPlan;
  return: PointToPointPathPlan;
  pauseMs: number;
  durationMs: number;
};

export function createRoundTripPath(
  startBounds: QuickPlayBounds,
  destinationBounds: QuickPlayBounds,
  workArea: QuickPlayBounds,
  options: PointToPointPathOptions & { returnPacePercent?: number; pauseMs?: number } = {},
): RoundTripPathPlan {
  const outbound = createPointToPointPath(startBounds, destinationBounds, workArea, options);
  const generatedReturn = createPointToPointPath(outbound.target, outbound.start, workArea, {
    ...options,
    durationMs: options.durationMs,
    pacePercent: options.returnPacePercent ?? options.pacePercent,
    routeCurve: options.routeCurve,
  });
  // The same quadratic control point traversed in reverse produces the exact
  // outbound route backwards and still terminates at the byte-exact start.
  const returnPath = { ...generatedReturn, control: { ...outbound.control } };
  const pauseMs = Math.max(0, options.pauseMs ?? 800);
  return {
    kind: "round-trip",
    start: { ...outbound.start },
    destination: { ...outbound.target },
    outbound,
    return: returnPath,
    pauseMs,
    durationMs: outbound.durationMs + pauseMs + returnPath.durationMs,
  };
}

export type RoundTripPathSample = PathSample & { phase: "outbound" | "pause" | "return" | "complete" };

export function boundsAtRoundTripTime(plan: RoundTripPathPlan, elapsedMs: number): RoundTripPathSample {
  if (elapsedMs <= 0) return { bounds: { ...plan.start }, progress: 0, complete: false, phase: "outbound" };
  if (elapsedMs < plan.outbound.durationMs) {
    return { ...boundsAtPointToPointTime(plan.outbound, elapsedMs), phase: "outbound" };
  }
  const afterOutbound = elapsedMs - plan.outbound.durationMs;
  if (afterOutbound < plan.pauseMs) {
    return {
      bounds: { ...plan.destination },
      progress: plan.pauseMs > 0 ? afterOutbound / plan.pauseMs : 1,
      complete: false,
      phase: "pause",
    };
  }
  const returnElapsed = afterOutbound - plan.pauseMs;
  if (returnElapsed < plan.return.durationMs) {
    return { ...boundsAtPointToPointTime(plan.return, returnElapsed), phase: "return" };
  }
  return { bounds: { ...plan.start }, progress: 1, complete: true, phase: "complete" };
}

export type QuickPlayPhaseDefinition<Id extends string = string> = { id: Id; durationMs: number };

export type QuickPlayTimelinePhase<Id extends string = string> = QuickPlayPhaseDefinition<Id> & {
  index: number;
  startMs: number;
  endMs: number;
};

export type QuickPlayPhaseTimeline<Id extends string = string> = {
  phases: QuickPlayTimelinePhase<Id>[];
  durationMs: number;
};

export function createPhaseTimeline<Id extends string>(
  definitions: readonly QuickPlayPhaseDefinition<Id>[],
): QuickPlayPhaseTimeline<Id> {
  if (definitions.length === 0) throw new Error("A Quick Play timeline needs at least one phase");
  let cursor = 0;
  const phases = definitions.map((definition, index) => {
    if (!Number.isFinite(definition.durationMs) || definition.durationMs <= 0) {
      throw new Error(`Quick Play phase ${definition.id} needs a positive finite duration`);
    }
    const startMs = cursor;
    cursor += definition.durationMs;
    return { ...definition, index, startMs, endMs: cursor };
  });
  return { phases, durationMs: cursor };
}

export type QuickPlayPhaseSample<Id extends string = string> = {
  phase: QuickPlayTimelinePhase<Id>;
  phaseProgress: number;
  timelineProgress: number;
  complete: boolean;
};

export function phaseAtTimelineTime<Id extends string>(
  timeline: QuickPlayPhaseTimeline<Id>,
  elapsedMs: number,
): QuickPlayPhaseSample<Id> {
  const bounded = clamp(elapsedMs, 0, timeline.durationMs);
  const complete = bounded >= timeline.durationMs;
  const phase = complete
    ? timeline.phases[timeline.phases.length - 1]
    : timeline.phases.find((candidate) => bounded < candidate.endMs) ?? timeline.phases[timeline.phases.length - 1];
  return {
    phase,
    phaseProgress: complete ? 1 : clamp((bounded - phase.startMs) / phase.durationMs, 0, 1),
    timelineProgress: timeline.durationMs > 0 ? bounded / timeline.durationMs : 1,
    complete,
  };
}

function travelDuration(distancePx: number, pacePercent: number, basePixelsPerSecond = 220) {
  return clamp(Math.round(distancePx / (basePixelsPerSecond * pacePercent / 100) * 1_000), 450, 4_000);
}

/**
 * Authored semantic phase timing for the native executor. Pointer-placement
 * waiting happens before these post-accept/post-placement timelines begin.
 */
export function createQuickPlayActionTimeline<A extends QuickPlayAnimatedActionId>(
  action: A,
  config: QuickPlayActionConfigMap[A],
  travelDistancePx = 320,
): QuickPlayPhaseTimeline {
  switch (action) {
    case "walk_round_trip": {
      const options = config as PetQuickPlayConfig;
      const walkMs = createDistanceLockedWalkPlan(travelDistancePx, options.walkPace).durationMs;
      return createPhaseTimeline([
        { id: "stand", durationMs: 450 },
        { id: "walk_out", durationMs: walkMs },
        { id: options.lookAroundEffect ? "look_around" : "destination_pause", durationMs: options.destinationPause * 1_000 },
        { id: "walk_return", durationMs: walkMs },
        { id: "restore", durationMs: 300 },
      ]);
    }
    case "token_snack": {
      const options = config as FeedSnackQuickPlayConfig;
      const outwardMs = createDistanceLockedWalkPlan(travelDistancePx, options.walkPace, 1, FEED_SNACK_WALK_ROOT_MOTION).durationMs;
      const returnPercent = feedSnackReturnPacePercent(options.returnPace);
      const returnMs = createDistanceLockedWalkPlan(travelDistancePx, returnPercent, 1, FEED_SNACK_RETURN_ROOT_MOTION).durationMs;
      return createPhaseTimeline([
        { id: "snack_stretch", durationMs: 900 },
        { id: "walk_slow", durationMs: outwardMs },
        { id: "arrive_and_lower", durationMs: 520 },
        { id: "snack_lick_1", durationMs: 360 },
        { id: "snack_lick_2", durationMs: 360 },
        { id: "snack_lick_3", durationMs: 360 },
        { id: "snack_eat", durationMs: 720 },
        { id: "run_return", durationMs: returnMs },
        { id: "restore", durationMs: 280 },
      ]);
    }
    case "play_cursor":
      // The deadline begins when main accepts the action. All phases, including
      // notice and restore, fit inside the strict 10,000 ms contract.
      return createPhaseTimeline([
        { id: "notice", durationMs: 350 },
        { id: "eyes_follow", durationMs: 450 },
        { id: "ears_follow", durationMs: 550 },
        { id: "track", durationMs: 8_300 },
        { id: "restore", durationMs: 350 },
      ]);
    case "drag_dangle": {
      const options = config as DangleToyQuickPlayConfig;
      return createPhaseTimeline([
        { id: "alert", durationMs: 650 },
        { id: "stalk", durationMs: 1_350 },
        // The native executor additionally gates this phase with
        // accumulateDangleMovement; elapsed time alone can never substitute for
        // meaningful continuous pointer movement.
        { id: "swing_until_armed", durationMs: 1_001 },
        { id: "pounce", durationMs: 620 },
        { id: "play_and_pursue", durationMs: clamp(2_200 * 100 / options.pursuitPace, 1_200, 3_200) },
        { id: "walk_return", durationMs: travelDuration(travelDistancePx, options.pursuitPace) },
        { id: "restore", durationMs: 280 },
      ]);
    }
    case "toss_yarn": {
      const options = config as TossYarnQuickPlayConfig;
      const returnPercent = options.returnPace === "run" ? 145 : 118;
      return createPhaseTimeline([
        { id: "roll", durationMs: clamp(1_050 * 100 / options.rollSpeed, 500, 1_600) },
        { id: "run_to_yarn", durationMs: travelDuration(travelDistancePx, 132) },
        { id: "pick_up_yarn", durationMs: 420 },
        { id: "carry_yarn", durationMs: travelDuration(travelDistancePx, returnPercent, 180) },
        { id: "drop_yarn", durationMs: 360 },
        { id: "restore", durationMs: 280 },
      ]);
    }
    case "nap_here":
      return createPhaseTimeline([
        { id: "nap_settle", durationMs: 650 },
        { id: "curl", durationMs: 500 },
        { id: "enter_sleep_loop", durationMs: 650 },
      ]);
    case "wake_up": {
      const options = config as WakeUpQuickPlayConfig;
      const stretchMs = options.stretchHold * 1_000;
      const remainder = 5_000 - stretchMs;
      const blinkMs = Math.round(remainder * 0.27);
      const rollMs = Math.round(remainder * 0.33);
      const gatherMs = 5_000 - stretchMs - blinkMs - rollMs;
      return createPhaseTimeline([
        { id: "wake_blink", durationMs: blinkMs },
        { id: "side_roll", durationMs: rollMs },
        { id: "long_full_body_stretch", durationMs: stretchMs },
        { id: "gather_restore", durationMs: gatherMs },
      ]);
    }
    case "summon_to_pointer": {
      const options = config as SummonQuickPlayConfig;
      return createPhaseTimeline([
        { id: "stand", durationMs: 500 },
        { id: "route", durationMs: 220 },
        { id: "walk", durationMs: travelDuration(travelDistancePx, options.walkPace) },
        { id: "arrive", durationMs: 260 },
        { id: "settle", durationMs: options.settleDelay * 1_000 },
      ]);
    }
  }
}

export type DangleMovementState = {
  lastPoint: QuickPlayPoint | null;
  lastTimestampMs: number | null;
  meaningfulDurationMs: number;
  meaningfulDistancePx: number;
  armed: boolean;
};

export type DangleMovementOptions = {
  requiredDurationMs?: number;
  minimumSampleDistancePx?: number;
  minimumVelocityPxPerSecond?: number;
  maximumSampleGapMs?: number;
};

export function createDangleMovementState(): DangleMovementState {
  return {
    lastPoint: null,
    lastTimestampMs: null,
    meaningfulDurationMs: 0,
    meaningfulDistancePx: 0,
    armed: false,
  };
}

/** Accumulate only continuous intentional motion; stationary jitter resets the arming clock. */
export function accumulateDangleMovement(
  previous: DangleMovementState,
  point: QuickPlayPoint,
  timestampMs: number,
  options: DangleMovementOptions = {},
): DangleMovementState & { meaningfulSample: boolean } {
  const requiredDurationMs = Math.max(1_000, options.requiredDurationMs ?? 1_000);
  const minimumSampleDistancePx = Math.max(0.5, options.minimumSampleDistancePx ?? 1.5);
  const minimumVelocityPxPerSecond = Math.max(1, options.minimumVelocityPxPerSecond ?? 28);
  const maximumSampleGapMs = Math.max(16, options.maximumSampleGapMs ?? 180);
  if (previous.lastPoint === null || previous.lastTimestampMs === null || timestampMs <= previous.lastTimestampMs) {
    return {
      ...previous,
      lastPoint: { ...point },
      lastTimestampMs: timestampMs,
      meaningfulSample: false,
    };
  }

  const elapsedMs = timestampMs - previous.lastTimestampMs;
  const distancePx = distanceBetween(previous.lastPoint, point);
  const velocity = distancePx / elapsedMs * 1_000;
  const meaningfulSample = elapsedMs <= maximumSampleGapMs
    && distancePx >= minimumSampleDistancePx
    && velocity >= minimumVelocityPxPerSecond;
  const meaningfulDurationMs = meaningfulSample ? previous.meaningfulDurationMs + elapsedMs : 0;
  const meaningfulDistancePx = meaningfulSample ? previous.meaningfulDistancePx + distancePx : 0;
  return {
    lastPoint: { ...point },
    lastTimestampMs: timestampMs,
    meaningfulDurationMs,
    meaningfulDistancePx,
    // Strictly greater than one second, as required by the design contract.
    armed: previous.armed || meaningfulDurationMs > requiredDurationMs,
    meaningfulSample,
  };
}

export type CursorTrackingState = {
  headOffset: QuickPlayPoint;
  earOffset: QuickPlayPoint;
  headAngleDegrees: number;
  lastTimestampMs: number | null;
};

export type CursorTrackingSample = CursorTrackingState & {
  eyeOffset: QuickPlayPoint;
  withinAttention: boolean;
};

export type CursorTrackingOptions = {
  deadZonePx?: number;
  maxAngularSpeedDegreesPerSecond?: number;
};

export function createCursorTrackingState(): CursorTrackingState {
  return {
    headOffset: { x: 0, y: 0 },
    earOffset: { x: 0, y: 0 },
    headAngleDegrees: 0,
    lastTimestampMs: null,
  };
}

function smoothPoint(current: QuickPlayPoint, target: QuickPlayPoint, alpha: number): QuickPlayPoint {
  return {
    x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha,
  };
}

/** Eyes lead, head follows smoothly, and ears trail without moving the native pet bounds. */
export function updateCursorTracking(
  previous: CursorTrackingState,
  cursor: QuickPlayPoint,
  anchor: QuickPlayPoint,
  timestampMs: number,
  config: PlayCursorQuickPlayConfig,
  options: CursorTrackingOptions = {},
): CursorTrackingSample {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  const distancePx = Math.hypot(dx, dy);
  const deadZonePx = Math.max(0, options.deadZonePx ?? 6);
  // Play Cursor is a ten-second full-desktop attention mode. Distance may
  // saturate the authored directional response, but it must never gate it off.
  const withinAttention = true;
  const active = distancePx > deadZonePx;
  const magnitude = Math.max(distancePx, 1);
  const attentionProgress = active ? clamp((distancePx - deadZonePx) / Math.max(config.attentionRadius - deadZonePx, 1), 0, 1) : 0;
  const eyeOffset = active
    ? { x: dx / magnitude * attentionProgress, y: dy / magnitude * attentionProgress }
    : { x: 0, y: 0 };
  const elapsedSeconds = previous.lastTimestampMs === null
    ? 1 / 60
    : clamp((timestampMs - previous.lastTimestampMs) / 1_000, 1 / 240, 0.2);
  const responseRate = 2.5 + config.followSmoothing / 100 * 11.5;
  const headAlpha = 1 - Math.exp(-responseRate * elapsedSeconds);
  const earAlpha = config.earFollow ? 1 - Math.exp(-responseRate * 0.56 * elapsedSeconds) : 1;
  const headOffset = smoothPoint(previous.headOffset, eyeOffset, headAlpha);
  const earTarget = config.earFollow ? headOffset : { x: 0, y: 0 };
  const earOffset = smoothPoint(previous.earOffset, earTarget, earAlpha);
  const requestedAngle = clamp(headOffset.x * config.maxHeadTurnAngle, -config.maxHeadTurnAngle, config.maxHeadTurnAngle);
  const angularCap = Math.max(1, options.maxAngularSpeedDegreesPerSecond ?? 120) * elapsedSeconds;
  const angleDelta = clamp(requestedAngle - previous.headAngleDegrees, -angularCap, angularCap);
  return {
    eyeOffset,
    headOffset,
    earOffset,
    headAngleDegrees: previous.headAngleDegrees + angleDelta,
    lastTimestampMs: timestampMs,
    withinAttention,
  };
}

export type YarnRollPlan = {
  start: QuickPlayPoint;
  target: QuickPlayPoint;
  initialVelocity: QuickPlayPoint;
  durationMs: number;
  distancePx: number;
  spinTurns: number;
  workArea: QuickPlayBounds;
  ballRadius: number;
};

export type YarnRollSample = {
  point: QuickPlayPoint;
  progress: number;
  rotationDegrees: number;
  complete: boolean;
};

export function createYarnRollPlan(
  releasePoint: QuickPlayPoint,
  pointerVelocity: QuickPlayPoint,
  workArea: QuickPlayBounds,
  config: TossYarnQuickPlayConfig,
  ballRadius = 18,
): YarnRollPlan {
  const radius = Math.max(1, ballRadius);
  const start = {
    x: clamp(releasePoint.x, workArea.x + radius, workArea.x + workArea.width - radius),
    y: clamp(releasePoint.y, workArea.y + radius, workArea.y + workArea.height - radius),
  };
  const speed = Math.hypot(pointerVelocity.x, pointerVelocity.y);
  const fallbackDirection = {
    x: workArea.x + workArea.width / 2 - start.x,
    y: workArea.y + workArea.height / 2 - start.y,
  };
  const fallbackMagnitude = Math.max(Math.hypot(fallbackDirection.x, fallbackDirection.y), 1);
  const direction = speed >= 24
    ? { x: pointerVelocity.x / speed, y: pointerVelocity.y / speed }
    : { x: fallbackDirection.x / fallbackMagnitude, y: fallbackDirection.y / fallbackMagnitude };
  const requestedTarget = {
    x: start.x + direction.x * config.rollDistance,
    // Keep the trajectory floor-like: vertical pointer velocity influences the
    // roll, but cannot turn the yarn path into a large airborne arc.
    y: start.y + direction.y * Math.min(config.rollDistance, 72),
  };
  const target = {
    x: clamp(requestedTarget.x, workArea.x + radius, workArea.x + workArea.width - radius),
    y: clamp(requestedTarget.y, workArea.y + radius, workArea.y + workArea.height - radius),
  };
  const distancePx = distanceBetween(start, target);
  const pixelsPerSecond = 190 * config.rollSpeed / 100;
  const durationMs = clamp(Math.round(distancePx / Math.max(pixelsPerSecond, 1) * 1_000), 280, 1_800);
  return {
    start,
    target,
    initialVelocity: { ...pointerVelocity },
    durationMs,
    distancePx,
    spinTurns: distancePx / Math.max(2 * Math.PI * radius, 1),
    workArea,
    ballRadius: radius,
  };
}

export function yarnRollAtTime(plan: YarnRollPlan, elapsedMs: number): YarnRollSample {
  const progress = clamp(elapsedMs / plan.durationMs, 0, 1);
  const eased = 1 - (1 - progress) ** 3;
  return {
    point: {
      x: plan.start.x + (plan.target.x - plan.start.x) * eased,
      y: plan.start.y + (plan.target.y - plan.start.y) * eased,
    },
    progress,
    rotationDegrees: plan.spinTurns * 360 * eased,
    complete: progress >= 1,
  };
}
