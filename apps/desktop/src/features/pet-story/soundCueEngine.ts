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
