/**
 * Feed Snack semantic executor.
 *
 * Electron window movement, clocks and overlay ownership are injected through
 * ports. This keeps the action's story isolated while the shared locomotion
 * runtime remains reusable by Pet, Feed and future authored actions.
 */

export type FeedSnackSemanticPhase = "stand" | "outbound" | "arrive" | "lick" | "bite" | "chew" | "swallow" | "return" | "settle";
export type FeedSnackLocomotionId = "feed_snack_walk_slow" | "feed_snack_return_run";
export type FeedSnackPropStage = "ground" | "bite" | "chew" | "swallow" | "consumed";

export type FeedSnackExecutorPorts = {
  phase: (phase: FeedSnackSemanticPhase) => void;
  delay: (durationMs: number) => Promise<boolean>;
  locomote: (phase: "outbound" | "return", locomotionId: FeedSnackLocomotionId, pacePercent: number) => Promise<boolean>;
  setPropStage: (stage: FeedSnackPropStage, durationMs: number) => void;
  closePropOverlay: () => void;
  complete: () => Promise<void>;
};

export type FeedSnackExecutorConfig = {
  walkPace: number;
  returnPacePercent: number;
};

export async function executeFeedSnack(
  ports: FeedSnackExecutorPorts,
  config: FeedSnackExecutorConfig,
) {
  ports.phase("stand");
  if (!await ports.delay(900)) return false;

  if (!await ports.locomote("outbound", "feed_snack_walk_slow", config.walkPace)) return false;

  ports.phase("arrive");
  if (!await ports.delay(520)) return false;

  ports.phase("lick");
  if (!await ports.delay(320)) return false;

  ports.setPropStage("bite", 380);
  ports.phase("bite");
  if (!await ports.delay(380)) return false;

  ports.setPropStage("chew", 440);
  ports.phase("chew");
  if (!await ports.delay(440)) return false;

  ports.setPropStage("swallow", 720);
  ports.phase("swallow");
  if (!await ports.delay(720)) return false;

  ports.setPropStage("consumed", 120);
  if (!await ports.delay(120)) return false;
  ports.closePropOverlay();

  if (!await ports.locomote("return", "feed_snack_return_run", config.returnPacePercent)) return false;

  ports.phase("settle");
  if (!await ports.delay(280)) return false;
  await ports.complete();
  return true;
}
