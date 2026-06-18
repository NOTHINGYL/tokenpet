import { app } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  CcusageDailyReport,
  CcusageDailyRow,
  CcusageProviderId,
  CcusageSessionReport,
  CostStructure,
  DailyUsagePoint,
  ProviderId,
  ProviderReport,
  ProviderStatus,
  SessionUsagePoint,
  UsageAnalysis,
  UsageSnapshot,
} from "./types.js";

const execFileAsync = promisify(execFile);

let usageCache: { expiresAt: number; snapshot: UsageSnapshot } | null = null;

function ccusageBinPath() {
  const binName = process.platform === "win32" ? "ccusage.cmd" : "ccusage";
  return join(app.getAppPath(), "node_modules", ".bin", binName);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function recentDateKeys(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return new Set(
    Array.from({ length: days }, (_value, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - index);
      return dateKey(date);
    }),
  );
}

function rowDate(row: CcusageDailyRow) {
  return row.date ?? row.period ?? "";
}

function rowTokens(row: CcusageDailyRow) {
  return Number(row.totalTokens ?? 0);
}

function rowCost(row: CcusageDailyRow) {
  return Number(row.costUSD ?? row.totalCost ?? 0);
}

function rowInputTokens(row: CcusageDailyRow) {
  return Number((row as { inputTokens?: number }).inputTokens ?? 0);
}

function rowOutputTokens(row: CcusageDailyRow) {
  return Number((row as { outputTokens?: number }).outputTokens ?? 0);
}

function rowCacheReadTokens(row: CcusageDailyRow) {
  return Number((row as { cacheReadTokens?: number }).cacheReadTokens ?? 0);
}

function rowReasoningOutputTokens(row: CcusageDailyRow) {
  return Number((row as { reasoningOutputTokens?: number }).reasoningOutputTokens ?? 0);
}

function rowModelTokens(row: CcusageDailyRow) {
  const models = new Map<string, number>();

  for (const [model, usage] of Object.entries(row.models ?? {})) {
    models.set(model, (models.get(model) ?? 0) + Number(usage.totalTokens ?? 0));
  }

  for (const breakdown of row.modelBreakdowns ?? []) {
    const model = breakdown.modelName;
    if (!model) continue;

    const tokens = Number(
      breakdown.totalTokens ?? Number(breakdown.inputTokens ?? 0) + Number(breakdown.outputTokens ?? 0),
    );
    models.set(model, (models.get(model) ?? 0) + tokens);
  }

  return models;
}

async function runCcusageDaily(provider: CcusageProviderId): Promise<CcusageDailyReport> {
  const { stdout } = await execFileAsync(ccusageBinPath(), [provider, "daily", "--json", "--offline"], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as CcusageDailyReport;
}

async function runCcusageSession(provider: CcusageProviderId): Promise<CcusageSessionReport> {
  const { stdout } = await execFileAsync(ccusageBinPath(), [provider, "session", "--json", "--offline"], {
    maxBuffer: 20 * 1024 * 1024,
  });

  return JSON.parse(stdout) as CcusageSessionReport;
}

function providerLabel(provider: CcusageProviderId) {
  return provider === "codex" ? "Codex" : "Claude Code";
}

async function loadProvider(provider: CcusageProviderId): Promise<ProviderReport> {
  const label = providerLabel(provider);

  try {
    const [report, sessionReport] = await Promise.all([runCcusageDaily(provider), runCcusageSession(provider)]);
    const rows = report.daily ?? [];
    const sessions = sessionReport.sessions ?? [];
    const today = dateKey(new Date());
    const sevenDays = recentDateKeys(7);

    let todayTokens = 0;
    let sevenDayTokens = 0;
    let allTimeTokens = Number(report.totals?.totalTokens ?? 0);
    let todayCost = 0;
    let sevenDayCost = 0;
    let allTimeCost = Number(report.totals?.costUSD ?? report.totals?.totalCost ?? 0);
    const topModels = new Map<string, number>();

    for (const row of rows) {
      const tokens = rowTokens(row);
      const cost = rowCost(row);
      const date = rowDate(row);

      if (date === today) {
        todayTokens += tokens;
        todayCost += cost;
      }

      if (sevenDays.has(date)) {
        sevenDayTokens += tokens;
        sevenDayCost += cost;
      }

      for (const [model, modelTokens] of rowModelTokens(row)) {
        topModels.set(model, (topModels.get(model) ?? 0) + modelTokens);
      }
    }

    if (allTimeTokens === 0) {
      allTimeTokens = rows.reduce((total, row) => total + rowTokens(row), 0);
    }
    if (allTimeCost === 0) {
      allTimeCost = rows.reduce((total, row) => total + rowCost(row), 0);
    }

    return {
      id: provider,
      label,
      status: allTimeTokens > 0 ? "connected" : "idle",
      detail: allTimeTokens > 0 ? `${allTimeTokens.toLocaleString()} local all time` : "no local usage found",
      todayTokens,
      sevenDayTokens,
      allTimeTokens,
      rows,
      sessions,
      topModels,
      todayCost,
      sevenDayCost,
      allTimeCost,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "ccusage failed";

    return {
      id: provider,
      label,
      status: "error",
      detail,
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
      rows: [],
      sessions: [],
      topModels: new Map(),
      todayCost: 0,
      sevenDayCost: 0,
      allTimeCost: 0,
    };
  }
}

function emptyProvider(provider: ProviderId, label: string, status: ProviderStatus, detail: string): ProviderReport {
  return {
    id: provider,
    label,
    status,
    detail,
    todayTokens: 0,
    sevenDayTokens: 0,
    allTimeTokens: 0,
    rows: [],
    sessions: [],
    topModels: new Map(),
    todayCost: 0,
    sevenDayCost: 0,
    allTimeCost: 0,
  };
}

function loadCursorProvider(): ProviderReport {
  return emptyProvider("cursor", "Cursor", "idle", "local adapter planned");
}

function loadCcusageProvider(): ProviderReport {
  if (!existsSync(ccusageBinPath())) {
    return emptyProvider("ccusage", "ccusage", "error", "bundled binary missing");
  }

  return emptyProvider("ccusage", "ccusage", "connected", "bundled npm dependency");
}

function topModelFromProviders(providers: ProviderReport[]) {
  const totals = new Map<string, number>();

  for (const provider of providers) {
    for (const [model, tokens] of provider.topModels) {
      totals.set(model, (totals.get(model) ?? 0) + tokens);
    }
  }

  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none";
}

function burnRate(todayTokens: number) {
  if (todayTokens === 0) return "quiet";
  if (todayTokens >= 5_000_000) return "hot";
  if (todayTokens >= 500_000) return "steady";
  return "light";
}

function topModelForRow(row: CcusageDailyRow) {
  return [...rowModelTokens(row).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

function buildUsageAnalysis(providerReports: ProviderReport[]): UsageAnalysis {
  const dailyByDate = new Map<string, DailyUsagePoint>();
  const modelTotals = new Map<string, { tokens: number; cost: number }>();
  const sessions: SessionUsagePoint[] = [];
  const costStructure: CostStructure = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    reasoningOutputTokens: 0,
  };

  for (const provider of providerReports) {
    for (const row of provider.rows) {
      const date = rowDate(row);
      if (!date) continue;

      const current = dailyByDate.get(date) ?? {
        date,
        tokens: 0,
        cost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        reasoningOutputTokens: 0,
      };

      const tokens = rowTokens(row);
      const cost = rowCost(row);
      current.tokens += tokens;
      current.cost += cost;
      current.inputTokens += rowInputTokens(row);
      current.outputTokens += rowOutputTokens(row);
      current.cacheReadTokens += rowCacheReadTokens(row);
      current.reasoningOutputTokens += rowReasoningOutputTokens(row);
      dailyByDate.set(date, current);

      costStructure.inputTokens += rowInputTokens(row);
      costStructure.outputTokens += rowOutputTokens(row);
      costStructure.cacheReadTokens += rowCacheReadTokens(row);
      costStructure.reasoningOutputTokens += rowReasoningOutputTokens(row);

      for (const [model, modelTokens] of rowModelTokens(row)) {
        const modelUsage = modelTotals.get(model) ?? { tokens: 0, cost: 0 };
        modelUsage.tokens += modelTokens;
        modelUsage.cost += tokens > 0 ? cost * (modelTokens / tokens) : 0;
        modelTotals.set(model, modelUsage);
      }
    }

    for (const session of provider.sessions) {
      sessions.push({
        id: session.sessionId ?? session.sessionFile ?? "session",
        directory: session.directory ?? "local",
        lastActivity: session.lastActivity ?? rowDate(session),
        tokens: rowTokens(session),
        cost: rowCost(session),
        model: topModelForRow(session),
        share: 0,
      });
    }
  }

  const daily = [...dailyByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const totalTokens = daily.reduce((total, point) => total + point.tokens, 0);
  const activeDays = daily.filter((point) => point.tokens > 0).length;
  const observedDays = Math.max(activeDays, 1);
  const dailyAverageTokens = Math.round(totalTokens / observedDays);
  const inputAndCache = costStructure.inputTokens + costStructure.cacheReadTokens;
  const cacheHitRate = inputAndCache > 0 ? costStructure.cacheReadTokens / inputAndCache : 0;

  const models = [...modelTotals.entries()]
    .map(([model, usage]) => ({
      model,
      tokens: usage.tokens,
      cost: usage.cost,
      share: totalTokens > 0 ? usage.tokens / totalTokens : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const sessionTotal = sessions.reduce((total, session) => total + session.tokens, 0);
  const rankedSessions = sessions
    .map((session) => ({
      ...session,
      share: sessionTotal > 0 ? session.tokens / sessionTotal : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    daily,
    models,
    sessions: rankedSessions,
    costStructure,
    activeDays,
    sessionCount: sessions.length,
    cacheHitRate,
    dailyAverageTokens,
    nextSevenDayForecast: dailyAverageTokens * 7,
    nextThirtyDayForecast: dailyAverageTokens * 30,
  };
}

export async function loadUsageSnapshot(options: { force?: boolean } = {}): Promise<UsageSnapshot> {
  const now = Date.now();
  if (!options.force && usageCache && usageCache.expiresAt > now) {
    return usageCache.snapshot;
  }

  const providerReports = await Promise.all([loadProvider("codex"), loadProvider("claude")]);
  const sourceReports = [...providerReports, loadCursorProvider(), loadCcusageProvider()];
  const todayTokens = providerReports.reduce((total, provider) => total + provider.todayTokens, 0);
  const sevenDayTokens = providerReports.reduce((total, provider) => total + provider.sevenDayTokens, 0);
  const allTimeTokens = providerReports.reduce((total, provider) => total + provider.allTimeTokens, 0);
  const todayCost = providerReports.reduce((total, provider) => total + provider.todayCost, 0);
  const sevenDayCost = providerReports.reduce((total, provider) => total + provider.sevenDayCost, 0);
  const connected = providerReports.filter((provider) => provider.status === "connected");
  const analysis = buildUsageAnalysis(providerReports);

  const snapshot: UsageSnapshot = {
    todayTokens,
    sevenDayTokens,
    allTimeTokens,
    todayCost,
    sevenDayCost,
    topModel: topModelFromProviders(providerReports),
    topTool: connected.sort((a, b) => b.sevenDayTokens - a.sevenDayTokens)[0]?.label ?? "none",
    burnRate: burnRate(todayTokens),
    status: connected.length > 0 ? "ccusage live" : "no usage found",
    generatedAt: new Date().toISOString(),
    providers: sourceReports.map(({ rows: _rows, sessions: _sessions, topModels: _topModels, ...provider }) => provider),
    analysis,
  };

  usageCache = {
    expiresAt: now + 15_000,
    snapshot,
  };

  return snapshot;
}
