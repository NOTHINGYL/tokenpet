export type PlayCursorExecutorPorts = {
  phase: (phase: "tracking" | "settle") => void;
  delay: (durationMs: number) => Promise<boolean>;
  complete: () => Promise<void>;
};

export async function executePlayCursor(ports: PlayCursorExecutorPorts) {
  ports.phase("tracking");
  if (!await ports.delay(30_000)) return false;
  ports.phase("settle");
  if (!await ports.delay(120)) return false;
  await ports.complete();
  return true;
}
