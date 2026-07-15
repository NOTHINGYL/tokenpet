export type DangleReleasePoint = { x: number; y: number; velocityX: number; velocityY: number };

type DangleSetupPhase = "alert" | "stalk" | "crouch";
type DangleFinishPhase = "release" | "return" | "settle";

export type DangleToyExecutorPorts = {
  phase: (phase: DangleSetupPhase | DangleFinishPhase, point?: DangleReleasePoint) => void;
  delay: (durationMs: number) => Promise<boolean>;
  waitForRelease: () => Promise<DangleReleasePoint | null>;
  closePropOverlay: () => void;
  stopPursuit: () => Promise<void>;
  returnHome: () => Promise<boolean>;
  complete: () => Promise<void>;
};

type PhaseWaitResult =
  | { type: "elapsed"; active: boolean }
  | { type: "released"; point: DangleReleasePoint | null };

async function waitPhaseOrRelease(
  releasePromise: Promise<DangleReleasePoint | null>,
  delay: (durationMs: number) => Promise<boolean>,
  durationMs: number,
): Promise<PhaseWaitResult> {
  return Promise.race([
    delay(durationMs).then((active) => ({ type: "elapsed", active }) as const),
    releasePromise.then((point) => ({ type: "released", point }) as const),
  ]);
}

export async function executeDangleToy(ports: DangleToyExecutorPorts) {
  // The release listener is armed before the first alert frame so any primary
  // click can immediately remove the wand and restore the ordinary pointer.
  const releasePromise = ports.waitForRelease();
  let releasedAt: DangleReleasePoint | null | undefined;

  for (const [phase, durationMs] of [
    ["alert", 360],
    ["stalk", 460],
    ["crouch", 520],
  ] as const satisfies readonly (readonly [DangleSetupPhase, number])[]) {
    ports.phase(phase);
    const result = await waitPhaseOrRelease(releasePromise, ports.delay, durationMs);
    if (result.type === "released") {
      releasedAt = result.point;
      break;
    }
    if (!result.active) return false;
  }

  if (releasedAt === undefined) releasedAt = await releasePromise;
  if (!releasedAt) throw new Error("Dangle toy canceled");

  // Main closes the overlay synchronously in the click IPC handler; this call
  // is intentionally idempotent for injected executor tests and failure paths.
  ports.closePropOverlay();
  ports.phase("release", releasedAt);
  await ports.stopPursuit();
  ports.phase("return", releasedAt);
  if (!await ports.returnHome()) return false;
  ports.phase("settle", releasedAt);
  if (!await ports.delay(280)) return false;
  await ports.complete();
  return true;
}
