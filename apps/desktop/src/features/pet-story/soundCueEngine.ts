import type { PetActionId, PetStorySettings } from "../../types";

export type PetSoundCueId = "wake" | "purr" | "drop" | "snack" | "milestone" | "hot" | "rest";

export const cueForPetAction: Partial<Record<PetActionId, PetSoundCueId>> = {
  hatch: "wake",
  wake_up: "wake",
  click_purr: "purr",
  drag_dangle: "drop",
  drop_bounce: "drop",
  token_snack: "snack",
  milestone_celebrate: "milestone",
  level_up: "milestone",
  sleep_loop: "rest",
  nap_here: "rest",
  hot_loop: "hot",
  overdrive_loop: "hot",
  dance: "hot",
};

const cueProfile: Record<PetSoundCueId, { start: number; end: number; duration: number; essential?: boolean }> = {
  wake: { start: 520, end: 720, duration: 0.24 },
  purr: { start: 118, end: 92, duration: 0.24 },
  drop: { start: 380, end: 190, duration: 0.16 },
  snack: { start: 610, end: 460, duration: 0.14 },
  milestone: { start: 660, end: 880, duration: 0.28 },
  hot: { start: 760, end: 580, duration: 0.2, essential: true },
  rest: { start: 260, end: 180, duration: 0.3 },
};

type WakeMeowVoice = "soft" | "cozy" | "playful";
const wakeMeowCache: Partial<Record<WakeMeowVoice, HTMLAudioElement>> = {};
let danceReferenceCache: HTMLAudioElement | null = null;
let danceReferencePlayGeneration = 0;
const DANCE_REFERENCE_DURATION_SECONDS = 10.133;
const DANCE_REFERENCE_READY_TIMEOUT_MS = 4_000;

function wakeMeow(voice: WakeMeowVoice) {
  if (typeof Audio === "undefined") return null;
  if (!wakeMeowCache[voice]) {
    const audio = new Audio(`./pet-audio/wake-meow-${voice}.wav`);
    audio.preload = "auto";
    audio.load();
    wakeMeowCache[voice] = audio;
  }
  return wakeMeowCache[voice] ?? null;
}

export function preloadWakeUpMeows() {
  for (const voice of ["soft", "cozy", "playful"] as const) wakeMeow(voice);
}

function danceReferenceAudio() {
  if (typeof Audio === "undefined") return null;
  if (!danceReferenceCache) {
    const audio = new Audio("./pet-audio/dance-video-reference.m4a");
    audio.preload = "auto";
    audio.load();
    danceReferenceCache = audio;
  }
  return danceReferenceCache;
}

export function preloadDanceReferenceSound() {
  danceReferenceAudio();
}

function waitForDanceReferenceReady(audio: HTMLAudioElement) {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("error", handleError);
      resolve(ready);
    };
    const handleReady = () => finish(true);
    const handleError = () => finish(false);
    const timeout = window.setTimeout(() => finish(false), DANCE_REFERENCE_READY_TIMEOUT_MS);
    audio.addEventListener("loadedmetadata", handleReady, { once: true });
    audio.addEventListener("canplay", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.load();
  });
}

async function playWakeUpMeow(story: PetStorySettings) {
  if (!canPlayPetSoundCue("wake", story)) return false;
  const voice: WakeMeowVoice = ["soft", "cozy", "playful"].includes(story.soundStyle) ? story.soundStyle : "cozy";
  const audio = wakeMeow(voice);
  if (!audio) return false;
  try {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = Math.min(1, Math.max(0, story.volume / 100 * story.cueVolumes.wake / 100));
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function minutesSinceMidnight(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null;
}

function isQuietHours(story: PetStorySettings, now = new Date()) {
  if (!story.safety.quietHoursEnabled) return false;
  const start = minutesSinceMidnight(story.safety.quietHoursStart);
  const end = minutesSinceMidnight(story.safety.quietHoursEnd);
  if (start === null || end === null || start === end) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function canPlayDanceReference(story: PetStorySettings, preview = false, userInitiated = false) {
  // Dance owns an explicit Reference sound setting. It is intentionally not
  // gated by the generic synthesized-cue master or the unrelated `hot` cue;
  // otherwise the visible ON setting is silent for every default install.
  if (story.volume <= 0) return false;
  if (preview) return true;
  if (story.quietMode) return false;
  // Quick Play Dance is an explicit request made in a separate renderer. A
  // scheduled quiet-hours/focus policy must not silently discard that click;
  // the visible Mute pet sounds toggle, Dance Reference sound setting and
  // master volume remain authoritative. Ambient/non-interactive callers still
  // honor the scheduled safety policy.
  if (userInitiated) return true;
  return !(story.safety.muteDuringFocus && story.behaviorMode === "focusFriendly")
    && !isQuietHours(story);
}

export async function playDanceReferenceSound(
  story: PetStorySettings,
  options: { offsetSeconds?: number; preview?: boolean; userInitiated?: boolean } = {},
) {
  if (!canPlayDanceReference(story, options.preview, options.userInitiated)) return false;
  const audio = danceReferenceAudio();
  if (!audio) return false;
  const playGeneration = ++danceReferencePlayGeneration;
  try {
    if (!await waitForDanceReferenceReady(audio) || playGeneration !== danceReferencePlayGeneration) {
      return false;
    }
    audio.pause();
    audio.currentTime = Math.min(
      Math.max(0, options.offsetSeconds ?? 0),
      Math.max(0, DANCE_REFERENCE_DURATION_SECONDS - .02),
    );
    // Dance owns a real reference track, not the synthesized `hot` cue. Its
    // visible Reference sound switch and the global volume are the only volume
    // controls; a muted/disabled Hot cue must never make Dance silently fail.
    audio.volume = Math.min(1, Math.max(0, story.volume / 100));
    await audio.play();
    return playGeneration === danceReferencePlayGeneration && !audio.paused;
  } catch {
    return false;
  }
}

export function stopDanceReferenceSound() {
  danceReferencePlayGeneration += 1;
  if (!danceReferenceCache) return;
  danceReferenceCache.pause();
  danceReferenceCache.currentTime = 0;
}

export function syncDanceReferenceSound(offsetSeconds: number, toleranceSeconds = .055) {
  if (!danceReferenceCache || danceReferenceCache.paused) return false;
  const target = Math.min(
    Math.max(0, offsetSeconds),
    Math.max(0, DANCE_REFERENCE_DURATION_SECONDS - .02),
  );
  if (Math.abs(danceReferenceCache.currentTime - target) > toleranceSeconds) {
    danceReferenceCache.currentTime = target;
  }
  return true;
}

export function canPlayPetSoundCue(
  cue: PetSoundCueId,
  story: PetStorySettings,
  options: { preview?: boolean; screenSharing?: boolean; now?: Date } = {},
) {
  if (!story.soundEnabled || story.volume <= 0 || (!options.preview && !story.cueIds.includes(cue))) return false;
  if (options.preview) return true;
  if (options.screenSharing && story.safety.screenSharingStillness) return false;
  const safetySuppressed = story.quietMode
    || (story.safety.muteDuringFocus && story.behaviorMode === "focusFriendly")
    || isQuietHours(story, options.now);
  return !safetySuppressed || Boolean(cueProfile[cue].essential);
}

export async function playPetSoundCue(
  cue: PetSoundCueId,
  story: PetStorySettings,
  options: { preview?: boolean; screenSharing?: boolean; now?: Date } = {},
) {
  if (!canPlayPetSoundCue(cue, story, options)) return false;

  try {
    const context = new AudioContext();
    if (context.state === "suspended") await context.resume();
    const profile = cueProfile[cue];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = story.soundStyle === "playful" ? "triangle" : story.soundStyle === "cozy" ? "sine" : "sine";
    oscillator.frequency.setValueAtTime(profile.start, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(profile.end, context.currentTime + profile.duration);
    const cueVolume = story.cueVolumes[cue] / 100;
    const peak = Math.min(0.09, Math.max(0.001, (story.volume / 100) * cueVolume * 0.08));
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(peak, context.currentTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + profile.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + profile.duration + 0.01);
    oscillator.addEventListener("ended", () => void context.close(), { once: true });
    return true;
  } catch {
    // Sound is optional and local. Visual playback must continue if audio is unavailable.
    return false;
  }
}

export function playPetActionSound(action: PetActionId, story: PetStorySettings) {
  if (action === "wake_up") return playWakeUpMeow(story);
  const cue = cueForPetAction[action];
  return cue ? playPetSoundCue(cue, story) : Promise.resolve(false);
}
