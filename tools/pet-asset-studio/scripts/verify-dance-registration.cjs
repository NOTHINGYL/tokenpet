const { spawn } = require("node:child_process");
const { join, resolve } = require("node:path");

const root = resolve(__dirname, "../../..");
const ffmpegPath = require("ffmpeg-static");
const videoPath = join(root, "assets/source/pet-actors/golden-british/story-actions/dance-video-v3/dance-golden-style.webm");
const width = 512;
const height = 512;
const frameBytes = width * height * 4;

function visibleBounds(frame) {
  let top = height;
  let bottom = -1;
  for (let offset = 3; offset < frame.length; offset += 4) {
    if (frame[offset] <= 8) continue;
    const y = Math.floor((offset >> 2) / width);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  if (bottom < top) throw new Error("Encoded Dance frame is transparent");
  return { top, bottom: bottom + 1, visibleHeight: bottom - top + 1 };
}

function premultipliedMae(first, last) {
  let difference = 0;
  let channels = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    const firstAlpha = first[offset + 3] / 255;
    const lastAlpha = last[offset + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      difference += Math.abs(first[offset + channel] * firstAlpha - last[offset + channel] * lastAlpha);
      channels += 1;
    }
  }
  return difference / channels;
}

function regionalPremultipliedMae(first, last, startY, endY) {
  let difference = 0;
  let channels = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const firstAlpha = first[offset + 3] / 255;
      const lastAlpha = last[offset + 3] / 255;
      for (let channel = 0; channel < 3; channel += 1) {
        difference += Math.abs(first[offset + channel] * firstAlpha - last[offset + channel] * lastAlpha);
        channels += 1;
      }
    }
  }
  return difference / channels;
}

function alphaCentroidX(frame, startY, endY) {
  let weightedX = 0;
  let alphaTotal = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = frame[(y * width + x) * 4 + 3];
      weightedX += x * alpha;
      alphaTotal += alpha;
    }
  }
  if (alphaTotal === 0) throw new Error("Dance measurement region is transparent");
  return weightedX / alphaTotal;
}

async function verify() {
  const child = spawn(ffmpegPath, [
    "-v", "error",
    "-c:v", "libvpx-vp9",
    "-i", videoPath,
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "pipe:1",
  ], { stdio: ["ignore", "pipe", "inherit"] });

  let frame = Buffer.allocUnsafe(frameBytes);
  let frameOffset = 0;
  let frameCount = 0;
  let firstFrame = null;
  let lastFrame = null;
  let previousFrame = null;
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = 0;
  let minimumGround = Number.POSITIVE_INFINITY;
  let maximumGround = 0;
  const sampleFrames = new Map();
  const mouthCloseTransitionMae = [];
  const sampleFrameIndices = new Set([
    63, 73, 92, 111, 131,
    194, 204,
    315, 325, 344,
    505, 515, 534,
  ]);

  child.stdout.on("data", (chunk) => {
    let chunkOffset = 0;
    while (chunkOffset < chunk.length) {
      const length = Math.min(frameBytes - frameOffset, chunk.length - chunkOffset);
      chunk.copy(frame, frameOffset, chunkOffset, chunkOffset + length);
      frameOffset += length;
      chunkOffset += length;
      if (frameOffset !== frameBytes) continue;

      let bounds;
      try {
        bounds = visibleBounds(frame);
      } catch (error) {
        throw new Error(`Encoded Dance frame ${frameCount} is transparent`, { cause: error });
      }
      minimumHeight = Math.min(minimumHeight, bounds.visibleHeight);
      maximumHeight = Math.max(maximumHeight, bounds.visibleHeight);
      minimumGround = Math.min(minimumGround, bounds.bottom);
      maximumGround = Math.max(maximumGround, bounds.bottom);
      if (!firstFrame) firstFrame = Buffer.from(frame);
      lastFrame = Buffer.from(frame);
      if (previousFrame && frameCount >= 142 && frameCount <= 185) {
        mouthCloseTransitionMae.push({
          fromFrame: frameCount - 1,
          toFrame: frameCount,
          premultipliedRgbMae: premultipliedMae(previousFrame, frame),
        });
      }
      previousFrame = Buffer.from(frame);
      if (sampleFrameIndices.has(frameCount)) {
        sampleFrames.set(frameCount, Buffer.from(frame));
      }
      frameCount += 1;
      frame = Buffer.allocUnsafe(frameBytes);
      frameOffset = 0;
    }
  });

  const exitCode = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", resolvePromise);
  });
  if (exitCode !== 0) throw new Error(`Dance registration decoder exited with ${exitCode}`);
  if (frameOffset !== 0) throw new Error(`Partial Dance frame: ${frameOffset} bytes`);
  if (frameCount !== 608) throw new Error(`Expected 608 encoded frames, found ${frameCount}`);
  if (maximumHeight - minimumHeight > 3) throw new Error(`Dance visible-height drift exceeds 3px: ${minimumHeight}..${maximumHeight}`);
  if (maximumGround - minimumGround > 3) throw new Error(`Dance ground-line drift exceeds 3px: ${minimumGround}..${maximumGround}`);
  if (!firstFrame || !lastFrame) throw new Error("Dance video contains no frames");
  const swayLeft = sampleFrames.get(194);
  const swayRight = sampleFrames.get(204);
  if (!swayLeft || !swayRight) throw new Error("Dance video is missing closed-mouth sway samples");
  const headMotionMae = regionalPremultipliedMae(swayLeft, swayRight, 60, 285);
  const lowerBodyMotionMae = regionalPremultipliedMae(swayLeft, swayRight, 340, 430);
  const headCentroidDeltaX = Math.abs(
    alphaCentroidX(swayLeft, 60, 285) - alphaCentroidX(swayRight, 60, 285),
  );
  const lowerBodyCentroidDeltaX = Math.abs(
    alphaCentroidX(swayLeft, 340, 430) - alphaCentroidX(swayRight, 340, 430),
  );
  if (headMotionMae < lowerBodyMotionMae * 4) {
    throw new Error(`Closed-mouth head must move independently of the planted body: ${headMotionMae.toFixed(3)} vs ${lowerBodyMotionMae.toFixed(3)}`);
  }
  if (headCentroidDeltaX < 16) {
    throw new Error(`Closed-mouth impact shake is too weak: ${headCentroidDeltaX.toFixed(3)}px`);
  }
  if (lowerBodyCentroidDeltaX > 1) {
    throw new Error(`Closed-mouth lower body drifted during head sway: ${lowerBodyCentroidDeltaX.toFixed(3)}px`);
  }
  const tongueCenter = sampleFrames.get(63);
  const tongueAccentIndices = [73, 92, 111, 131];
  const tongueAccentFrames = tongueAccentIndices.map((index) => sampleFrames.get(index));
  if (!tongueCenter || tongueAccentFrames.some((accent) => !accent)) {
    throw new Error("Dance video is missing tongue-groove counter-motion samples");
  }
  const tongueCenterHeadX = alphaCentroidX(tongueCenter, 60, 275);
  const tongueCenterBodyX = alphaCentroidX(tongueCenter, 320, 430);
  const tongueAccents = tongueAccentFrames.map((accent, index) => ({
    timeSeconds: tongueAccentIndices[index] / 60,
    headDeltaX: alphaCentroidX(accent, 60, 275) - tongueCenterHeadX,
    haunchDeltaX: alphaCentroidX(accent, 320, 430) - tongueCenterBodyX,
  }));
  if (tongueAccents.some((accent) => accent.headDeltaX * accent.haunchDeltaX >= 0)) {
    throw new Error(`Tongue-out head and haunches must move in opposite directions: ${JSON.stringify(tongueAccents)}`);
  }
  if (tongueAccents.some((accent) => Math.abs(accent.headDeltaX) < 2 || Math.abs(accent.haunchDeltaX) < 0.5)) {
    throw new Error(`Tongue-out counter-motion is too small: ${JSON.stringify(tongueAccents)}`);
  }
  for (let index = 1; index < tongueAccents.length; index += 1) {
    if (tongueAccents[index - 1].headDeltaX * tongueAccents[index].headDeltaX >= 0) {
      throw new Error(`Tongue-out groove does not alternate across four accents: ${JSON.stringify(tongueAccents)}`);
    }
  }
  const repriseCadence = [
    { centerIndex: 315, accentIndices: [325, 344] },
    { centerIndex: 505, accentIndices: [515, 534] },
  ].map(({ centerIndex, accentIndices }) => {
    const center = sampleFrames.get(centerIndex);
    const accents = accentIndices.map((index) => sampleFrames.get(index));
    if (!center || accents.some((accent) => !accent)) {
      throw new Error("Dance video is missing fixed-cadence tongue reprise samples");
    }
    const centerHeadX = alphaCentroidX(center, 60, 275);
    const centerBodyX = alphaCentroidX(center, 320, 430);
    const motion = accents.map((accent, index) => ({
      frameIndex: accentIndices[index],
      headDeltaX: alphaCentroidX(accent, 60, 275) - centerHeadX,
      haunchDeltaX: alphaCentroidX(accent, 320, 430) - centerBodyX,
    }));
    if (motion.some((accent) => accent.headDeltaX * accent.haunchDeltaX >= 0)) {
      throw new Error(`Tongue reprise lost counter-motion: ${JSON.stringify(motion)}`);
    }
    const intervalFrames = accentIndices[1] - accentIndices[0];
    if (intervalFrames < 18 || intervalFrames > 21) {
      throw new Error(`Tongue reprise cadence drifted from the fixed tempo: ${intervalFrames} frames`);
    }
    return { centerIndex, accentIndices, intervalFrames };
  });
  const seamMae = premultipliedMae(firstFrame, lastFrame);
  const mouthCloseTransitionMaximum = mouthCloseTransitionMae.reduce(
    (maximum, sample) => sample.premultipliedRgbMae > maximum.premultipliedRgbMae ? sample : maximum,
    mouthCloseTransitionMae[0],
  );
  if (mouthCloseTransitionMaximum.premultipliedRgbMae > 8) {
    throw new Error(
      `Mouth-close transition contains a visible adjacent-frame hitch: ${mouthCloseTransitionMaximum.premultipliedRgbMae.toFixed(3)}`,
    );
  }
  // Lossy VP9 may encode one source pose differently at opposite GOP edges;
  // premultiplied MAE below eight remains visually seam-free.
  if (seamMae > 8) throw new Error(`Dance loop seam is not visually closed: RGB MAE ${seamMae.toFixed(3)}`);

  process.stdout.write(`${JSON.stringify({
    frames: frameCount,
    visibleHeightPx: { minimum: minimumHeight, maximum: maximumHeight },
    groundLineY: { minimum: minimumGround, maximum: maximumGround },
    closedMouthSway: {
      sampleTimesSeconds: [194 / 60, 204 / 60],
      headPremultipliedRgbMae: Number(headMotionMae.toFixed(4)),
      lowerBodyPremultipliedRgbMae: Number(lowerBodyMotionMae.toFixed(4)),
      headCentroidDeltaX: Number(headCentroidDeltaX.toFixed(4)),
      lowerBodyCentroidDeltaX: Number(lowerBodyCentroidDeltaX.toFixed(4)),
    },
    tongueOutCounterMotion: {
      accentCount: tongueAccents.length,
      fixedCadenceHz: 1.55,
      firstPhraseAccentIntervalsFrames: tongueAccentIndices.slice(1).map(
        (index, position) => index - tongueAccentIndices[position],
      ),
      reprises: repriseCadence,
      accents: tongueAccents.map((accent) => ({
        timeSeconds: accent.timeSeconds,
        headDeltaX: Number(accent.headDeltaX.toFixed(4)),
        haunchDeltaX: Number(accent.haunchDeltaX.toFixed(4)),
      })),
    },
    mouthCloseTransition: {
      sampleCount: mouthCloseTransitionMae.length,
      maximumAdjacentFrameMae: Number(mouthCloseTransitionMaximum.premultipliedRgbMae.toFixed(4)),
      maximumFromFrame: mouthCloseTransitionMaximum.fromFrame,
      maximumToFrame: mouthCloseTransitionMaximum.toFrame,
      boundaryFrameMae: Number(
        (mouthCloseTransitionMae.find((sample) => sample.toFrame === 165)?.premultipliedRgbMae ?? 0).toFixed(4),
      ),
    },
    firstLastPremultipliedRgbMae: Number(seamMae.toFixed(4)),
  }, null, 2)}\n`);
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
