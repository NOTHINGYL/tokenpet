export type TossYarnExecutorPorts = {
  phase: (phase: "stand" | "outbound" | "pickup" | "carry" | "drop" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  approach: () => Promise<boolean>;
  carryHome: () => Promise<boolean>;
  closePropOverlay: () => void;
  complete: () => Promise<void>;
};

export async function executeTossYarn(ports: TossYarnExecutorPorts) {
  ports.phase("stand");
  if (!await ports.delay(350)) return false;
  ports.phase("outbound");
  if (!await ports.approach()) return false;
  // The loose overlay prop and the yarn baked into the pickup frames represent
  // the same object. Hand it off before the first pickup frame can render so
  // the desktop never contains two balls.
  ports.closePropOverlay();
  ports.phase("pickup");
  if (!await ports.delay(670)) return false;
  ports.phase("carry");
  if (!await ports.carryHome()) return false;
  ports.phase("drop");
  if (!await ports.delay(1_000)) return false;
  ports.phase("settle");
  if (!await ports.delay(280)) return false;
  await ports.complete();
  return true;
}
