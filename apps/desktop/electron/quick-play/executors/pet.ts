export type PetExecutorPorts = {
  phase: (phase: "stand" | "pause" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  locomote: (phase: "outbound" | "return") => Promise<boolean>;
  complete: () => Promise<void>;
};

export async function executePet(ports: PetExecutorPorts, destinationPauseSeconds: number) {
  ports.phase("stand");
  if (!await ports.delay(320)) return false;
  if (!await ports.locomote("outbound")) return false;
  ports.phase("pause");
  if (!await ports.delay(destinationPauseSeconds * 1_000)) return false;
  if (!await ports.locomote("return")) return false;
  ports.phase("settle");
  if (!await ports.delay(260)) return false;
  await ports.complete();
  return true;
}
