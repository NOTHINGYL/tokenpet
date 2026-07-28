export const LIVE_MOOD_WINDOW_MS = 60 * 60_000;

export type LiveUsageSamplerState = {
  baselineTokens: number | null;
  samples: Array<{ at: number; tokens: number }>;
};

export function createLiveUsageSamplerState(): LiveUsageSamplerState {
  return { baselineTokens: null, samples: [] };
}

/**
 * Pure rolling-window collector. Only positive lifetime-total deltas observed
 * while TokenPet is running become Live Tokens; the cumulative baseline itself
 * is never exposed as a bounded-window signal.
 */
export function sampleLiveOneHourTokens(
  previous: LiveUsageSamplerState,
  totalTokens: number,
  now = Date.now(),
): { state: LiveUsageSamplerState; tokens: number } {
  const safeTotal = Number.isFinite(totalTokens) ? Math.max(0, totalTokens) : previous.baselineTokens ?? 0;
  const cutoff = now - LIVE_MOOD_WINDOW_MS;
  const samples = previous.samples.filter((sample) => sample.at > cutoff && sample.at <= now);
  if (previous.baselineTokens !== null && safeTotal > previous.baselineTokens) {
    samples.push({ at: now, tokens: safeTotal - previous.baselineTokens });
  }
  // A provider disappearing or failing may temporarily lower the aggregate.
  // Preserve the monotonic high-water baseline so recovery cannot masquerade
  // as a giant burst of newly generated live Tokens.
  const baselineTokens = previous.baselineTokens === null
    ? safeTotal
    : Math.max(previous.baselineTokens, safeTotal);
  return {
    state: { baselineTokens, samples },
    tokens: samples.reduce((sum, sample) => sum + sample.tokens, 0),
  };
}

/** @deprecated Use sampleLiveOneHourTokens. */
export const sampleLiveFiveMinuteTokens = sampleLiveOneHourTokens;
