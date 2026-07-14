export type PlayCursorExecutorPorts = {
  phase: (phase: "tracking" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  complete: () => Promise<void>;
};

export const PLAY_CURSOR_DURATION_MS = 10_000;
export const PLAY_CURSOR_SETTLE_MS = 350;

export async function executePlayCursor(ports: PlayCursorExecutorPorts, durationMs = PLAY_CURSOR_DURATION_MS) {
  const settleMs = Math.min(PLAY_CURSOR_SETTLE_MS, Math.max(0, durationMs));
  ports.phase("tracking");
  if (!await ports.delay(Math.max(0, durationMs - settleMs))) return false;
  ports.phase("settle");
  if (!await ports.delay(settleMs)) return false;
  await ports.complete();
  return true;
}
