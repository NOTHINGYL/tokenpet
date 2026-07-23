export type NapHereExecutorPorts = {
  phase: (phase: "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  markResting: (durationMs: number) => void;
  complete: () => Promise<void>;
};

export const NAP_HERE_DURATION_MS = 5 * 60 * 1_000;

export async function executeNapHere(ports: NapHereExecutorPorts, settleDurationMs: number) {
  ports.phase("settle");
  if (!await ports.delay(settleDurationMs)) return false;
  ports.markResting(NAP_HERE_DURATION_MS);
  await ports.complete();
  return true;
}
