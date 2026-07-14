export type TossYarnExecutorPorts = {
  phase: (phase: "stand" | "outbound" | "interact" | "return" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  approach: () => Promise<boolean>;
  returnHome: () => Promise<boolean>;
  closePropOverlay: () => void;
  complete: () => Promise<void>;
};

export async function executeTossYarn(ports: TossYarnExecutorPorts) {
  ports.phase("stand");
  if (!await ports.delay(350)) return false;
  ports.phase("outbound");
  if (!await ports.approach()) return false;
  ports.phase("interact");
  if (!await ports.delay(850)) return false;
  ports.closePropOverlay();
  ports.phase("return");
  if (!await ports.returnHome()) return false;
  ports.phase("settle");
  if (!await ports.delay(260)) return false;
  await ports.complete();
  return true;
}
