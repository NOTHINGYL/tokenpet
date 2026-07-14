export type WakeUpPhaseDurations = {
  blinkMs: number;
  rollMs: number;
  stretchMs: number;
  gatherMs: number;
};

export type WakeUpExecutorPorts = {
  phase: (phase: "stand" | "outbound" | "interact" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  markAwake: () => void;
  complete: () => Promise<void>;
};

export async function executeWakeUp(ports: WakeUpExecutorPorts, durations: WakeUpPhaseDurations) {
  ports.phase("stand");
  if (!await ports.delay(durations.blinkMs)) return false;
  ports.phase("outbound");
  if (!await ports.delay(durations.rollMs)) return false;
  ports.phase("interact");
  if (!await ports.delay(durations.stretchMs)) return false;
  ports.phase("settle");
  if (!await ports.delay(durations.gatherMs)) return false;
  ports.markAwake();
  await ports.complete();
  return true;
}
