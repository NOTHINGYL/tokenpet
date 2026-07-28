import { closeSync, fstatSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";

const HOUR_MS = 60 * 60_000;
const REVERSE_READ_CHUNK_BYTES = 256 * 1024;
const MAX_USAGE_RECORD_BYTES = 2 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;
type UsageAccumulator = {
  codexTokens: number;
  claudeMessages: Map<string, number>;
};

function objectValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function finiteTokenCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function timestampMs(value: unknown) {
  const parsed = typeof value === "string" || typeof value === "number" ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function usageTotal(usageValue: unknown) {
  const usage = objectValue(usageValue);
  if (!usage) return 0;
  const declaredTotal = finiteTokenCount(usage.total_tokens ?? usage.totalTokens);
  if (declaredTotal > 0) return declaredTotal;
  return finiteTokenCount(usage.input_tokens ?? usage.inputTokens)
    + finiteTokenCount(usage.output_tokens ?? usage.outputTokens)
    + finiteTokenCount(usage.cache_creation_input_tokens ?? usage.cacheCreationTokens)
    + finiteTokenCount(usage.cache_read_input_tokens ?? usage.cacheReadTokens);
}

function createAccumulator(): UsageAccumulator {
  return { codexTokens: 0, claudeMessages: new Map<string, number>() };
}

function accumulateRecord(
  record: JsonRecord,
  sourceId: string,
  recordId: string | number,
  cutoff: number,
  now: number,
  accumulator: UsageAccumulator,
) {
  const at = timestampMs(record.timestamp ?? record.created_at);
  if (at === null) return "undated" as const;
  if (at < cutoff) return "before" as const;
  if (at > now) return "after" as const;

  const payload = objectValue(record.payload);
  if (record.type === "event_msg" && payload?.type === "token_count") {
    const info = objectValue(payload.info);
    const lastUsage = objectValue(info?.last_token_usage);
    accumulator.codexTokens += usageTotal(lastUsage);
    return "accepted" as const;
  }

  if (record.type === "assistant") {
    const message = objectValue(record.message);
    const tokens = usageTotal(message?.usage);
    if (tokens <= 0) return "dated" as const;
    const messageId = String(message?.id ?? record.uuid ?? `${sourceId}:${recordId}`);
    accumulator.claudeMessages.set(
      messageId,
      Math.max(tokens, accumulator.claudeMessages.get(messageId) ?? 0),
    );
    return "accepted" as const;
  }

  return "dated" as const;
}

function accumulatorTotal(accumulator: UsageAccumulator) {
  return Math.round(
    accumulator.codexTokens
      + [...accumulator.claudeMessages.values()].reduce((sum, tokens) => sum + tokens, 0),
  );
}

/**
 * Parses only numeric usage records from Codex/Claude JSONL. Prompt, response,
 * reasoning, and tool payloads are never retained or returned.
 */
export function trailingHourTokensFromJsonl(
  sources: Array<{ id: string; text: string }>,
  now = Date.now(),
) {
  const cutoff = now - HOUR_MS;
  const accumulator = createAccumulator();

  for (const source of sources) {
    const lines = source.text.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index]) continue;
      let record: JsonRecord;
      try {
        record = JSON.parse(lines[index]) as JsonRecord;
      } catch {
        continue;
      }
      accumulateRecord(record, source.id, index, cutoff, now, accumulator);
    }
  }

  return accumulatorTotal(accumulator);
}

function recentJsonlFiles(root: string, cutoff: number, result: string[]) {
  let entries: Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      recentJsonlFiles(path, cutoff, result);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    try {
      if (statSync(path).mtimeMs >= cutoff) result.push(path);
    } catch {
      // A log may rotate between directory enumeration and stat; skip it.
    }
  }
}

/**
 * Session JSONL can grow beyond a gigabyte because it also contains prompts,
 * tool output, and media. Read newest records backwards and stop as soon as a
 * timestamp precedes the trailing-hour cutoff. Oversized non-usage records are
 * discarded without ever materializing the complete line.
 */
function accumulateRecentFile(
  path: string,
  cutoff: number,
  now: number,
  accumulator: UsageAccumulator,
) {
  let descriptor: number | null = null;
  try {
    descriptor = openSync(path, "r");
    let position = fstatSync(descriptor).size;
    let pending = "";
    let discardingOversizedLine = false;
    let recordId = 0;
    let reachedCutoff = false;

    while (position > 0 && !reachedCutoff) {
      const start = Math.max(0, position - REVERSE_READ_CHUNK_BYTES);
      const buffer = Buffer.allocUnsafe(position - start);
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, start);
      position = start;
      if (bytesRead <= 0) break;
      let chunk = buffer.subarray(0, bytesRead).toString("utf8");

      if (discardingOversizedLine) {
        const lineStart = chunk.lastIndexOf("\n");
        if (lineStart < 0) continue;
        chunk = chunk.slice(0, lineStart + 1);
        discardingOversizedLine = false;
      }

      const combined = chunk + pending;
      const lines = combined.split("\n");
      pending = lines.shift() ?? "";
      if (pending.length > MAX_USAGE_RECORD_BYTES) {
        pending = "";
        discardingOversizedLine = true;
      }

      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line || line.length > MAX_USAGE_RECORD_BYTES) continue;
        let record: JsonRecord;
        try {
          record = JSON.parse(line) as JsonRecord;
        } catch {
          continue;
        }
        recordId += 1;
        if (accumulateRecord(record, path, recordId, cutoff, now, accumulator) === "before") {
          reachedCutoff = true;
          break;
        }
      }
    }

    if (!reachedCutoff && !discardingOversizedLine && pending && pending.length <= MAX_USAGE_RECORD_BYTES) {
      try {
        accumulateRecord(JSON.parse(pending) as JsonRecord, path, recordId + 1, cutoff, now, accumulator);
      } catch {
        // A file may be appended while scanned; ignore its incomplete first line.
      }
    }
  } catch {
    // A usage log may rotate between enumeration and reading.
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // The descriptor is already unavailable.
      }
    }
  }
}

export function readTrailingHourTokens(homeDirectory: string, now = Date.now()) {
  const cutoff = now - HOUR_MS;
  const paths: string[] = [];
  recentJsonlFiles(join(homeDirectory, ".codex", "sessions"), cutoff, paths);
  recentJsonlFiles(join(homeDirectory, ".claude", "projects"), cutoff, paths);
  const accumulator = createAccumulator();
  paths.forEach((path) => accumulateRecentFile(path, cutoff, now, accumulator));
  return accumulatorTotal(accumulator);
}
