export type SummonExecutorPorts = {
  phase: (phase: "stand" | "outbound" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  walkToTarget: () => Promise<boolean>;
  persistTarget: () => void;
  complete: () => Promise<void>;
};

export async function executeSummon(ports: SummonExecutorPorts, settleDelaySeconds: number) {
  ports.phase("stand");
  if (!await ports.delay(380)) return false;
  ports.phase("outbound");
  if (!await ports.walkToTarget()) return false;
  ports.phase("settle");
  if (!await ports.delay(settleDelaySeconds * 1_000)) return false;
  ports.persistTarget();
  await ports.complete();
  return true;
}
