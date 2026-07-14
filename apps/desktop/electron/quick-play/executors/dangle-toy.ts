export type DangleReleasePoint = { x: number; y: number; velocityX: number; velocityY: number };

export type DangleToyExecutorPorts = {
  phase: (phase: "stand" | "stalk" | "return" | "settle", point?: DangleReleasePoint) => void;
  delay: (durationMs: number) => Promise<boolean>;
  waitForRelease: () => Promise<DangleReleasePoint | null>;
  isInteractionActive: () => boolean;
  closePropOverlay: () => void;
  returnHome: () => Promise<boolean>;
  complete: () => Promise<void>;
};

export async function executeDangleToy(ports: DangleToyExecutorPorts) {
  const releasePromise = ports.waitForRelease();
  ports.phase("stand");
  if (!await ports.delay(650)) return false;
  if (!ports.isInteractionActive()) ports.phase("stalk");
  const releasedAt = await releasePromise;
  if (!releasedAt) throw new Error("Dangle toy canceled");
  ports.closePropOverlay();
  ports.phase("return", releasedAt);
  if (!await ports.returnHome()) return false;
  ports.phase("settle", releasedAt);
  if (!await ports.delay(260)) return false;
  await ports.complete();
  return true;
}
