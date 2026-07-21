import type { QuickPlayPhase } from "../../types.js";

export type DancePhase = Extract<QuickPlayPhase,
  | "dance_rise"
  | "dance_reference_clip"
  | "dance_restore"
>;

export type DanceBeat = { id: DancePhase; durationMs: number };

export type DanceExecutorPorts = {
  phase: (phase: DancePhase) => void;
  delay: (durationMs: number) => Promise<boolean>;
  assertFixedBounds: () => void;
  sound: () => void;
  complete: () => Promise<void>;
};

/** Execute only the shared semantic beat map; Electron owns recovery/bounds. */
export async function executeDance(
  ports: DanceExecutorPorts,
  beats: readonly DanceBeat[],
  soundEnabled: boolean,
) {
  let referenceClipCount = 0;
  for (const beat of beats) {
    ports.assertFixedBounds();
    ports.phase(beat.id);
    if (beat.id === "dance_reference_clip" && soundEnabled) {
      referenceClipCount += 1;
      ports.sound();
    }
    if (!await ports.delay(beat.durationMs)) return false;
  }
  ports.assertFixedBounds();
  await ports.complete();
  return { referenceClipCount };
}
