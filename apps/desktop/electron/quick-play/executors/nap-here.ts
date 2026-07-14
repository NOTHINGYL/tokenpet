export type NapHereExecutorPorts = {
  phase: (phase: "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  markResting: () => void;
  complete: () => Promise<void>;
};

export async function executeNapHere(ports: NapHereExecutorPorts) {
  ports.phase("settle");
  if (!await ports.delay(1_800)) return false;
  ports.markResting();
  await ports.complete();
  return true;
}
