const DURATION_MS = 10_133;
const REFERENCE_SEGMENTS = [
  ["smug", 383], ["eye", 34], ["wide", 466], ["tonguePop", 167], ["tongue", 1_300], ["tongueRetract", 400],
  ["smug", 1_335], ["eye", 35], ["wide", 965], ["tonguePop", 165], ["tongue", 800], ["tongueRetract", 350],
  ["smug", 1_450], ["eye", 35], ["wide", 265], ["tonguePop", 270], ["tongue", 760], ["tongueRetract", 140],
  // Frame/audio autocorrelation finds the next identical loop boundary at
  // 10.133 seconds. End on the same planted, closed-mouth pose as frame zero.
  ["smug", 813],
];

const SOURCE_ANCHOR_X = 512;
const SOURCE_GROUND_Y = 818;
const TARGET_CENTER_X = 256;
const TARGET_GROUND_Y = 414;
const TARGET_VISIBLE_HEIGHT = 336;
const CLOSED_MOUTH_START_POSE = 39;
const CLOSED_MOUTH_BASE_POSE = 42;
const CLOSED_MOUTH_FORWARD_POSES = 4;
const CLOSED_MOUTH_ENTRY_MS = 320;
const CLOSED_MOUTH_SWAY_CYCLES_PER_LOOP = 38;
const CLOSED_MOUTH_SWAY_SHEAR = 0.088;
const CLOSED_MOUTH_SWAY_IMPACT = 1.9;
const TONGUE_SWAY_CYCLES_PER_SECOND = 1.55;
const COLLAR_ROW_MIN_PIXELS = 50;

const canvas = document.querySelector("#dance");
const context = canvas.getContext("2d", { alpha: true });
context.imageSmoothingEnabled = true;
context.imageSmoothingQuality = "high";

const root = "../../../assets/source/pet-actors/golden-british";
const sources = Array.from(
  { length: 48 },
  (_, index) => `${root}/frames/dance_video_${String(index + 1).padStart(2, "0")}.png`,
);

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Unable to load ${source}`)), { once: true });
    image.src = source;
  });
}

function visibleBounds(image) {
  const scratch = document.createElement("canvas");
  scratch.width = image.naturalWidth;
  scratch.height = image.naturalHeight;
  const scratchContext = scratch.getContext("2d", { alpha: true, willReadFrequently: true });
  scratchContext.drawImage(image, 0, 0);
  const { data, width, height } = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw new Error("Dance pose has no visible pixels");
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

function isCollarPixel(red, green, blue, alpha) {
  return alpha > 20 && green > red * 1.05 && green > blue * 1.2 && green > 55;
}

function semanticLayers(image) {
  const scratch = document.createElement("canvas");
  scratch.width = image.naturalWidth;
  scratch.height = image.naturalHeight;
  const scratchContext = scratch.getContext("2d", { alpha: true, willReadFrequently: true });
  scratchContext.drawImage(image, 0, 0);
  const source = scratchContext.getImageData(0, 0, scratch.width, scratch.height);
  const collarRows = new Uint16Array(scratch.height);
  for (let y = 0; y < scratch.height; y += 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      const offset = (y * scratch.width + x) * 4;
      if (isCollarPixel(source.data[offset], source.data[offset + 1], source.data[offset + 2], source.data[offset + 3])) {
        collarRows[y] += 1;
      }
    }
  }
  const collarY = [];
  for (let y = 0; y < collarRows.length; y += 1) {
    if (collarRows[y] >= COLLAR_ROW_MIN_PIXELS) collarY.push(y);
  }
  if (collarY.length === 0) throw new Error("Dance pose is missing a detectable green collar seam");
  const collarTop = collarY[0];
  const collarBottom = collarY[collarY.length - 1];
  const headPixels = new Uint8ClampedArray(source.data);
  const bodyPixels = new Uint8ClampedArray(source.data);
  // The moving head extends behind the collar. The fixed collar/body layer is
  // painted last and acts as an opaque occluder, avoiding both a white neck
  // gap and the double-exposed pixels produced by a crossfade.
  const headFadeStart = collarBottom + 2;
  const headFadeEnd = collarBottom + 10;
  for (let y = 0; y < scratch.height; y += 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      const offset = (y * scratch.width + x) * 4;
      if (y >= headFadeEnd) {
        headPixels[offset + 3] = 0;
      } else if (y > headFadeStart) {
        headPixels[offset + 3] = Math.round(
          headPixels[offset + 3] * (headFadeEnd - y) / (headFadeEnd - headFadeStart),
        );
      }
      // Preserve the complete fixed torso from the top edge of the collar
      // downward. It becomes a solid foreground socket for the moving head,
      // so no shoulder or neck pixels can travel away from the body.
      if (y < collarTop - 2) {
        bodyPixels[offset + 3] = 0;
      }
    }
  }
  const headLayer = document.createElement("canvas");
  const bodyLayer = document.createElement("canvas");
  headLayer.width = bodyLayer.width = scratch.width;
  headLayer.height = bodyLayer.height = scratch.height;
  headLayer.getContext("2d", { alpha: true }).putImageData(
    new ImageData(headPixels, scratch.width, scratch.height),
    0,
    0,
  );
  bodyLayer.getContext("2d", { alpha: true }).putImageData(
    new ImageData(bodyPixels, scratch.width, scratch.height),
    0,
    0,
  );
  return { headLayer, bodyLayer, collarTop, collarBottom };
}

const poses = (await Promise.all(sources.map(loadImage))).map((image, index) => {
  const needsSemanticLayers = (index >= 16 && index < 32) || (index >= 40 && index < 44);
  return {
    image,
    bounds: visibleBounds(image),
    ...(needsSemanticLayers ? semanticLayers(image) : {}),
  };
});

function ease(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function phaseAt(milliseconds) {
  let cursor = 0;
  for (const [id, duration] of REFERENCE_SEGMENTS) {
    if (milliseconds < cursor + duration) return { id, progress: (milliseconds - cursor) / duration, start: cursor, duration };
    cursor += duration;
  }
  return { id: "smug", progress: 1, start: DURATION_MS - 813, duration: 813 };
}

function poseGeometry(index) {
  const pose = poses[Math.max(0, Math.min(poses.length - 1, index))];
  const visibleHeight = pose.bounds.bottom - pose.bounds.top;
  const scale = TARGET_VISIBLE_HEIGHT / visibleHeight;
  return {
    pose,
    scale,
    x: TARGET_CENTER_X - SOURCE_ANCHOR_X * scale,
    y: TARGET_GROUND_Y - SOURCE_GROUND_Y * scale,
  };
}

function drawPose(index) {
  const geometry = poseGeometry(index);
  // Every source frame was authored around the same 512/818 body anchor.
  // Scaling around that anchor preserves genuine head/haunch motion while the
  // feet, overall height, canvas position, and desktop window stay invariant.
  context.drawImage(
    geometry.pose.image,
    geometry.x,
    geometry.y,
    geometry.pose.image.naturalWidth * geometry.scale,
    geometry.pose.image.naturalHeight * geometry.scale,
  );
}

function drawPoseBlend(firstIndex, secondIndex, progress) {
  const bounded = Math.min(1, Math.max(0, progress));
  if (firstIndex === secondIndex || bounded <= 0) {
    drawPose(firstIndex);
    return;
  }
  if (bounded >= 1) {
    drawPose(secondIndex);
    return;
  }
  context.save();
  context.globalAlpha = 1 - bounded;
  drawPose(firstIndex);
  context.globalAlpha = bounded;
  drawPose(secondIndex);
  context.restore();
}

function drawClosedMouthBody() {
  const geometry = poseGeometry(CLOSED_MOUTH_BASE_POSE);
  if (!geometry.pose.bodyLayer) throw new Error("Closed-mouth body layer is unavailable");
  context.drawImage(
    geometry.pose.bodyLayer,
    geometry.x,
    geometry.y,
    geometry.pose.image.naturalWidth * geometry.scale,
    geometry.pose.image.naturalHeight * geometry.scale,
  );
}

function drawClosedMouthHead(index, swayShear) {
  const geometry = poseGeometry(index);
  const { image } = geometry.pose;
  if (!geometry.pose.headLayer) throw new Error("Closed-mouth head layer is unavailable");
  const pivotX = TARGET_CENTER_X;
  // Apply a collar-pivoted horizontal lean. Pixels at the neck socket do not
  // move, while displacement increases smoothly toward the ears. This keeps
  // the head connected and preserves every frame's vertical silhouette.
  const pivotY = geometry.y
    + ((geometry.pose.collarTop + geometry.pose.collarBottom) / 2) * geometry.scale;
  context.save();
  context.translate(pivotX, pivotY);
  context.transform(1, 0, swayShear, 1, 0, 0);
  context.translate(-pivotX, -pivotY);
  context.drawImage(
    geometry.pose.headLayer,
    geometry.x,
    geometry.y,
    image.naturalWidth * geometry.scale,
    image.naturalHeight * geometry.scale,
  );
  context.restore();
}

function drawClosedMouthPhrase(milliseconds, phase) {
  // The source pushes forward once, then rapidly shakes the head while the
  // paws, chest, haunches, body scale, and desktop anchor remain planted. The
  // first segment is the tail of the phrase that begins before the detected
  // loop boundary, so it starts fully projected and joins the final segment.
  const elapsed = milliseconds - phase.start;
  const entryDuration = Math.min(CLOSED_MOUTH_ENTRY_MS, phase.duration * 0.42);
  const depth = phase.start === 0 ? 1 : ease(elapsed / entryDuration);
  const forwardPosition = depth * (CLOSED_MOUTH_FORWARD_POSES - 1);
  const lowerForwardPose = Math.min(CLOSED_MOUTH_FORWARD_POSES - 1, Math.floor(forwardPosition));
  const upperForwardPose = Math.min(CLOSED_MOUTH_FORWARD_POSES - 1, lowerForwardPose + 1);
  const forwardBlend = ease(forwardPosition - lowerForwardPose);
  const headIndex = CLOSED_MOUTH_START_POSE + upperForwardPose;
  // Use complete registered poses while the eyes close and the head projects.
  // The old compositor replaced the torso with its final pose on the first
  // closed-mouth frame, which created the visible image hitch. Once the full
  // pose reaches its final registered endpoint, the connected head layer takes
  // over with identical pixels and no boundary jump.
  if (phase.start !== 0 && elapsed < entryDuration) {
    drawPoseBlend(
      CLOSED_MOUTH_START_POSE + lowerForwardPose,
      CLOSED_MOUTH_START_POSE + upperForwardPose,
      forwardBlend,
    );
    return;
  }
  const swayEnvelope = phase.start === 0
    ? 1
    : ease(Math.min(1, Math.max(0, elapsed - entryDuration) / 90));
  // Thirty-eight complete cycles close exactly at the 10.133-second seam. The
  // saturated wave reaches each side decisively and crosses the centre fast,
  // giving the forward head shake a forceful snap instead of a weak pendulum
  // drift. The collar-centred lean keeps the neck socket planted.
  const swayPhase = (milliseconds / DURATION_MS) * Math.PI * 2 * CLOSED_MOUTH_SWAY_CYCLES_PER_LOOP;
  const sway = (
    Math.tanh(Math.sin(swayPhase) * CLOSED_MOUTH_SWAY_IMPACT)
    / Math.tanh(CLOSED_MOUTH_SWAY_IMPACT)
  ) * swayEnvelope;
  drawClosedMouthHead(
    headIndex,
    sway * CLOSED_MOUTH_SWAY_SHEAR,
  );
  drawClosedMouthBody();
}

function sequenceIndex(start, count, progress) {
  return start + Math.min(count - 1, Math.floor(ease(progress) * count));
}

function drawCompositePose(headIndex, bodyIndex) {
  const headGeometry = poseGeometry(headIndex);
  const bodyGeometry = poseGeometry(bodyIndex);
  if (!headGeometry.pose.headLayer || !bodyGeometry.pose.bodyLayer) {
    throw new Error("Dance composite layers are unavailable");
  }
  context.drawImage(
    headGeometry.pose.headLayer,
    headGeometry.x,
    headGeometry.y,
    headGeometry.pose.image.naturalWidth * headGeometry.scale,
    headGeometry.pose.image.naturalHeight * headGeometry.scale,
  );
  context.drawImage(
    bodyGeometry.pose.bodyLayer,
    bodyGeometry.x,
    bodyGeometry.y,
    bodyGeometry.pose.image.naturalWidth * bodyGeometry.scale,
    bodyGeometry.pose.image.naturalHeight * bodyGeometry.scale,
  );
}

function groovePose(progress, durationMs) {
  // Keep one physical tempo across all tongue phrases. The previous normalized
  // eight-leg clock forced the same four accents into the shorter reprises and
  // made them visibly race. The long first phrase still contains four strong
  // alternating accents; shorter reprises naturally contain fewer at the same
  // cadence, matching the source performance.
  const bounded = Math.min(1, Math.max(0, progress));
  const elapsedSeconds = bounded * durationMs / 1_000;
  const wave = Math.sin(elapsedSeconds * Math.PI * 2 * TONGUE_SWAY_CYCLES_PER_SECOND);
  const attack = ease(Math.min(1, bounded / 0.08));
  const release = ease(Math.min(1, (1 - bounded) / 0.12));
  const signedWeight = wave * Math.min(attack, release);
  const bankStart = signedWeight >= 0 ? 16 : 24;
  const offset = Math.min(7, Math.round(Math.abs(signedWeight) * 7));
  return { headIndex: bankStart + offset, bodyIndex: bankStart + offset };
}

function render(milliseconds) {
  const bounded = Math.min(DURATION_MS - 0.001, Math.max(0, Number(milliseconds) || 0));
  const phase = phaseAt(bounded);
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (phase.id === "smug") {
    drawClosedMouthPhrase(bounded, phase);
  } else if (phase.id === "eye") {
    drawPose(sequenceIndex(0, 6, phase.progress));
  } else if (phase.id === "wide") {
    drawPose(5);
  } else if (phase.id === "tonguePop") {
    drawPose(sequenceIndex(6, 10, phase.progress));
  } else if (phase.id === "tongue") {
    const groove = groovePose(phase.progress, phase.duration);
    drawCompositePose(groove.headIndex, groove.bodyIndex);
  } else {
    drawPose(sequenceIndex(32, 8, phase.progress));
  }
  return {
    milliseconds: bounded,
    phase: phase.id,
    anchor: { centerX: TARGET_CENTER_X, groundY: TARGET_GROUND_Y, visibleHeight: TARGET_VISIBLE_HEIGHT },
    renderer: "tokenpet-loop-detected-registered-golden-british-video-v9",
  };
}

window.renderDanceFrame = render;
render(0);
window.dispatchEvent(new CustomEvent("dance-style:ready"));
