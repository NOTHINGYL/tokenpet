import type { MoodLookId, MotionActionId, PetActionId, PetLifeStage, UsageSnapshot } from "../../types";
import type { PetStorySettings } from "../../types";

export const defaultPetStory: PetStorySettings = { behaviorMode: "balanced", moodThresholds: { focused: 1000, hot: 10000, overdrive: 50000 }, quietMode: false, followCursor: false, lockPosition: false, reduceMotion: false, soundEnabled: false, soundStyle: "soft", volume: 45, cueIds: ["wake", "purr", "drop", "snack", "milestone"], pinnedStage: null, lastAction: null };

export type CapabilityStatus = "ready" | "fallback" | "planned" | "unavailable";
export type PetCapability = { id: PetActionId; status: CapabilityStatus; fallbackId?: PetActionId; reason?: string };

const ready: PetActionId[] = ["idle_breathe", "blink", "sleep_loop", "focus_loop", "hot_loop", "overdrive_loop", "click_purr", "drag_dangle", "drop_bounce", "play_cursor", "milestone_celebrate"];
const fallback: Partial<Record<PetActionId, PetActionId>> = { hatch: "milestone_celebrate", token_snack: "click_purr", toss_yarn: "play_cursor", nap_here: "sleep_loop", wake_up: "idle_breathe", summon_to_screen: "idle_breathe", capture_moment: "idle_breathe" };

export const actionIds: PetActionId[] = [...ready, "hatch", "token_snack", "toss_yarn", "nap_here", "wake_up", "summon_to_screen", "capture_moment"];

export function capabilityFor(actorId: string, id: PetActionId): PetCapability {
  if (actorId !== "golden-british") return { id, status: id === "idle_breathe" ? "fallback" : "planned", fallbackId: "idle_breathe", reason: "Static fallback image; richer actor states are planned." };
  if (ready.includes(id)) return { id, status: "ready" };
  if (fallback[id]) return { id, status: "fallback", fallbackId: fallback[id], reason: `Plays ${fallback[id]} until dedicated frames ship.` };
  return { id, status: "unavailable" };
}

export function resolveAction(actorId: string, requested: PetActionId, reduceMotion = false) {
  const capability = capabilityFor(actorId, requested);
  if (capability.status === "planned" || capability.status === "unavailable") return null;
  let id = capability.status === "fallback" ? capability.fallbackId! : requested;
  if (reduceMotion && ["overdrive_loop", "drag_dangle", "drop_bounce", "milestone_celebrate"].includes(id)) id = "idle_breathe";
  return { requested, resolved: id, status: capability.status };
}

export function moodFromUsage(usage: UsageSnapshot, thresholds: { focused: number; hot: number; overdrive: number }): MoodLookId {
  const rate = usage.todayTokens;
  if (rate >= thresholds.overdrive) return "overdrive";
  if (rate >= thresholds.hot) return "hot";
  if (rate >= thresholds.focused) return "focused";
  return "sleepy";
}

export function lifecycleFromUsage(usage: UsageSnapshot): PetLifeStage {
  const connected = usage.providers.some((provider) => provider.status === "connected" && provider.id !== "ccusage");
  if (!connected && usage.allTimeTokens === 0) return "egg";
  if (usage.allTimeTokens >= 500_000_000 || usage.analysis.activeDays >= 30) return "guardianCompanion";
  if (usage.allTimeTokens >= 50_000_000 || usage.analysis.activeDays >= 7) return "flowCompanion";
  if (usage.allTimeTokens >= 1_000_000) return "deskBuddy";
  return "newKitten";
}

export function rendererAction(id: PetActionId): MotionActionId {
  const map: Partial<Record<PetActionId, MotionActionId>> = { idle_breathe: "idle-breathe", blink: "blink", sleep_loop: "desk-nap", focus_loop: "idle-breathe", hot_loop: "tail-wag", overdrive_loop: "jump", click_purr: "blink", drag_dangle: "stretch", drop_bounce: "jump", token_snack: "blink", play_cursor: "pounce-cursor", milestone_celebrate: "celebrate" };
  return map[id] ?? "idle-breathe";
}
