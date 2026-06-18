import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type UsageSnapshot = {
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
  todayCost: number;
  sevenDayCost: number;
  topModel: string;
  topTool: string;
  burnRate: string;
  status: string;
  generatedAt: string;
  providers: ProviderSnapshot[];
  analysis: UsageAnalysis;
};

type DailyUsagePoint = {
  date: string;
  tokens: number;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens: number;
};

type ModelUsagePoint = {
  model: string;
  tokens: number;
  cost: number;
  share: number;
};

type SessionUsagePoint = {
  id: string;
  directory: string;
  lastActivity: string;
  tokens: number;
  cost: number;
  model: string;
  share: number;
};

type CostStructure = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningOutputTokens: number;
};

type UsageAnalysis = {
  daily: DailyUsagePoint[];
  models: ModelUsagePoint[];
  sessions: SessionUsagePoint[];
  costStructure: CostStructure;
  activeDays: number;
  sessionCount: number;
  cacheHitRate: number;
  dailyAverageTokens: number;
  nextSevenDayForecast: number;
  nextThirtyDayForecast: number;
};

type ProviderSnapshot = {
  id: "codex" | "claude" | "cursor" | "ccusage";
  label: string;
  status: "connected" | "idle" | "error";
  detail: string;
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
};

type AppSettings = {
  launchAtLogin: boolean;
  petVisible: boolean;
  alwaysOnTop: boolean;
  petTheme: "gold" | "mint" | "rose" | "sky";
};

declare global {
  interface Window {
    quotapet: {
      getUsageSnapshot: () => Promise<UsageSnapshot>;
      refreshUsageSnapshot: () => Promise<UsageSnapshot>;
      getAppSettings: () => Promise<AppSettings>;
      setAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<AppSettings>;
      openConsole: () => void;
      quit: () => void;
      togglePopover: () => void;
      startDrag: () => Promise<{ started: boolean }>;
      endDrag: () => Promise<{ moved: boolean }>;
      close: () => void;
    };
  }
}

const fallbackUsage: UsageSnapshot = {
  todayTokens: 128420,
  sevenDayTokens: 8920000,
  allTimeTokens: 925000000,
  todayCost: 8.34,
  sevenDayCost: 716.7,
  topModel: "gpt-5.5",
  topTool: "Codex",
  burnRate: "steady",
  status: "loading",
  generatedAt: new Date(0).toISOString(),
  providers: [
    {
      id: "codex",
      label: "Codex",
      status: "idle",
      detail: "checking ccusage",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
    {
      id: "claude",
      label: "Claude Code",
      status: "idle",
      detail: "checking ccusage",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
    {
      id: "cursor",
      label: "Cursor",
      status: "idle",
      detail: "local adapter planned",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
    {
      id: "ccusage",
      label: "ccusage",
      status: "connected",
      detail: "bundled npm dependency",
      todayTokens: 0,
      sevenDayTokens: 0,
      allTimeTokens: 0,
    },
  ],
  analysis: {
    daily: [],
    models: [],
    sessions: [],
    costStructure: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      reasoningOutputTokens: 0,
    },
    activeDays: 0,
    sessionCount: 0,
    cacheHitRate: 0,
    dailyAverageTokens: 0,
    nextSevenDayForecast: 0,
    nextThirtyDayForecast: 0,
  },
};

const fallbackSettings: AppSettings = {
  launchAtLogin: false,
  petVisible: true,
  alwaysOnTop: true,
  petTheme: "gold",
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1000000 ? 1 : 0,
  }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function useUsage() {
  const [usage, setUsage] = useState<UsageSnapshot>(fallbackUsage);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const snapshot = await window.quotapet.refreshUsageSnapshot();
      setUsage(snapshot);
      return snapshot;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    function load() {
      window.quotapet?.getUsageSnapshot().then((snapshot) => {
        if (active) setUsage(snapshot);
      });
    }

    load();
    const timer = window.setInterval(load, 60_000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return { usage, refresh, loading };
}

function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(fallbackSettings);

  useEffect(() => {
    let active = true;

    window.quotapet?.getAppSettings().then((nextSettings) => {
      if (active) setSettings(nextSettings);
    });

    return () => {
      active = false;
    };
  }, []);

  const setSetting = useCallback(async (key: keyof AppSettings, enabled: boolean) => {
    const nextSettings = await window.quotapet.setAppSetting(key, enabled);
    setSettings(nextSettings);
  }, []);

  return { settings, setSetting };
}

function lastUpdated(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "not refreshed";

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function percent(value: number) {
  return new Intl.NumberFormat("en", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "2-digit", day: "2-digit" }).format(date);
}

function maxOf(values: number[]) {
  return Math.max(1, ...values);
}

function SparkBars(props: { points: DailyUsagePoint[] }) {
  const points = props.points.slice(-42);
  const maxTokens = maxOf(points.map((point) => point.tokens));

  return (
    <div className="spark-bars" aria-label="Daily token trend">
      {points.map((point) => (
        <div className="spark-bar" key={point.date}>
          <span style={{ height: `${Math.max(3, (point.tokens / maxTokens) * 100)}%` }} />
          <small>{shortDate(point.date)}</small>
        </div>
      ))}
    </div>
  );
}

function ForecastLine(props: { points: DailyUsagePoint[]; forecast: number }) {
  const history = props.points.slice(-14);
  const projected = Array.from({ length: 7 }, (_value, index) => props.forecast / 7 + index * (props.forecast / 70));
  const values = [...history.map((point) => point.tokens), ...projected];
  const maxValue = maxOf(values);
  const width = 360;
  const height = 150;
  const step = width / Math.max(values.length - 1, 1);
  const path = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / maxValue) * (height - 18) - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="forecast-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Token forecast line">
      <path className="chart-gridline" d={`M 0 ${height - 8} L ${width} ${height - 8}`} />
      <path className="chart-gridline" d={`M 0 ${height / 2} L ${width} ${height / 2}`} />
      <path className="forecast-path" d={path} />
    </svg>
  );
}

function ActivityHeatmap(props: { points: DailyUsagePoint[] }) {
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
  const points = props.points.slice(-84);
  const maxTokens = maxOf(points.map((point) => point.tokens));

  points.forEach((point, index) => {
    const date = new Date(`${point.date}T00:00:00`);
    const weekday = Number.isNaN(date.getTime()) ? index % 7 : date.getDay();
    const bucket = Math.floor(index / 7);
    if (bucket < 12) cells[weekday][bucket] += point.tokens;
  });

  return (
    <div className="activity-heatmap">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, rowIndex) => (
        <React.Fragment key={day}>
          <span className="heatmap-label">{day}</span>
          {cells[rowIndex].map((value, colIndex) => (
            <span
              className="heatmap-cell"
              data-level={Math.ceil((value / maxTokens) * 5)}
              key={`${day}-${colIndex}`}
            />
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

function ModelUsageTable(props: { models: ModelUsagePoint[] }) {
  return (
    <div className="model-table">
      {props.models.slice(0, 8).map((model, index) => (
        <div className="model-row" key={model.model}>
          <span>{index + 1}</span>
          <strong>{model.model}</strong>
          <div className="meter">
            <span style={{ width: `${Math.max(2, model.share * 100)}%` }} />
          </div>
          <small>{compactNumber(model.tokens)}</small>
          <small>{money(model.cost)}</small>
          <small>{percent(model.share)}</small>
        </div>
      ))}
    </div>
  );
}

function SessionBreakdown(props: { sessions: SessionUsagePoint[] }) {
  return (
    <div className="session-list">
      {props.sessions.slice(0, 12).map((session) => (
        <div className="session-row" key={session.id}>
          <div>
            <strong>{session.directory}</strong>
            <small>{session.model} · {lastUpdated(session.lastActivity)}</small>
          </div>
          <div className="meter">
            <span style={{ width: `${Math.max(2, session.share * 100)}%` }} />
          </div>
          <span>{compactNumber(session.tokens)}</span>
          <span>{money(session.cost)}</span>
        </div>
      ))}
    </div>
  );
}

function CostStructureBar(props: { structure: CostStructure }) {
  const parts = [
    { label: "Input", value: props.structure.inputTokens, className: "input" },
    { label: "Output", value: props.structure.outputTokens, className: "output" },
    { label: "Cache", value: props.structure.cacheReadTokens, className: "cache" },
    { label: "Reasoning", value: props.structure.reasoningOutputTokens, className: "reasoning" },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;

  return (
    <div className="cost-structure">
      <div className="stacked-bar">
        {parts.map((part) => (
          <span className={part.className} key={part.label} style={{ width: `${(part.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="cost-legend">
        {parts.map((part) => (
          <div key={part.label}>
            <span className={`legend-dot ${part.className}`} />
            <strong>{part.label}</strong>
            <small>{compactNumber(part.value)} · {percent(part.value / total)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoldCat() {
  return (
    <div className="cat" aria-hidden="true">
      <div className="cat-glow" />
      <div className="cat-tail" />
      <div className="cat-body">
        <div className="cat-ear cat-ear-left" />
        <div className="cat-ear cat-ear-right" />
        <div className="cat-face">
          <span className="cat-eye" />
          <span className="cat-eye" />
        </div>
        <div className="cat-muzzle">
          <span />
        </div>
      </div>
      <div className="cat-paw cat-paw-left" />
      <div className="cat-paw cat-paw-right" />
    </div>
  );
}

function PetApp() {
  const { usage } = useUsage();
  const { settings } = useAppSettings();
  const [dragging, setDragging] = useState(false);

  function close(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    window.quotapet.close();
  }

  async function startDrag(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    await window.quotapet.startDrag();
  }

  async function endDrag() {
    if (!dragging) return;

    setDragging(false);
    await window.quotapet.endDrag();
  }

  return (
    <main
      className={`pet-stage pet-theme-${settings.petTheme} ${dragging ? "is-dragging" : ""}`}
      onDoubleClick={() => window.quotapet.togglePopover()}
      onPointerDown={startDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="pet-drag-region" aria-label="Drag QuotaPet">
        <GoldCat />
      </div>
      <button
        className="token-pill"
        type="button"
        aria-label="Open QuotaPet summary"
        onClick={() => window.quotapet.togglePopover()}
      >
        {compactNumber(usage.todayTokens)}
      </button>
      <button
        className="pet-close"
        type="button"
        aria-label="Close QuotaPet"
        onPointerDown={close}
        onClick={close}
      >
        x
      </button>
    </main>
  );
}

function StatCard(props: { label: string; value: string; detail: string }) {
  return (
    <section className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </section>
  );
}

function PopoverApp() {
  const { usage } = useUsage();
  const providerRows = useMemo(() => usage.providers, [usage.providers]);

  return (
    <main className="popover">
      <header className="popover-header">
        <div>
          <strong>QuotaPet</strong>
          <span>v0.3 · {usage.status}</span>
        </div>
        <span className="status-dot" />
      </header>

      <div className="stats-grid">
        <StatCard label="Today" value={compactNumber(usage.todayTokens)} detail={money(usage.todayCost)} />
        <StatCard label="7 days" value={compactNumber(usage.sevenDayTokens)} detail={money(usage.sevenDayCost)} />
        <StatCard label="Local all time" value={compactNumber(usage.allTimeTokens)} detail="tracked locally" />
      </div>

      <section className="hero-stat">
        <div>
          <span>Top model</span>
          <strong>{usage.topModel}</strong>
        </div>
        <div>
          <span>Burn rate</span>
          <strong>{usage.burnRate}</strong>
        </div>
      </section>

      <section className="providers">
        {providerRows.map((row) => (
          <div className="provider-row" key={row.id}>
            <span className={`provider-dot ${row.status}`} />
            <strong>{row.label}</strong>
            <small>{compactNumber(row.todayTokens)} today · {row.detail}</small>
          </div>
        ))}
      </section>
    </main>
  );
}

function ProviderStatusRows(props: { providers: ProviderSnapshot[] }) {
  return (
    <section className="source-list">
      {props.providers.map((row) => (
        <div className="source-row" key={row.id}>
          <span className={`provider-dot ${row.status}`} />
          <div>
            <strong>{row.label}</strong>
            <small>{row.detail}</small>
          </div>
          <span className={`source-badge ${row.status}`}>{row.status}</span>
        </div>
      ))}
    </section>
  );
}

function SettingToggle(props: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{props.label}</strong>
        <small>{props.detail}</small>
      </span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function MenuBarApp() {
  const { usage, refresh, loading } = useUsage();
  const { settings, setSetting } = useAppSettings();

  return (
    <main className="menubar-panel">
      <header className="panel-header">
        <div>
          <strong>QuotaPet</strong>
          <span>v0.3 · {usage.status}</span>
        </div>
        <span className="panel-pill">{compactNumber(usage.todayTokens)} today</span>
      </header>

      <div className="panel-actions">
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing" : "Refresh"}
        </button>
        <button type="button" onClick={() => window.quotapet.openConsole()}>
          Console
        </button>
        <button type="button" onClick={() => window.quotapet.quit()}>
          Quit
        </button>
      </div>

      <div className="stats-grid panel-stats">
        <StatCard label="Today" value={compactNumber(usage.todayTokens)} detail={money(usage.todayCost)} />
        <StatCard label="7 days" value={compactNumber(usage.sevenDayTokens)} detail={money(usage.sevenDayCost)} />
        <StatCard label="Local all time" value={compactNumber(usage.allTimeTokens)} detail="tracked locally" />
      </div>

      <section className="panel-section">
        <div className="section-heading">
          <strong>Sources</strong>
          <span>Updated {lastUpdated(usage.generatedAt)}</span>
        </div>
        <ProviderStatusRows providers={usage.providers} />
      </section>

      <section className="panel-section">
        <div className="section-heading">
          <strong>Settings</strong>
          <span>Local app controls</span>
        </div>
        <div className="settings-list">
          <SettingToggle
            label="Launch at login"
            detail="Start QuotaPet with macOS"
            checked={settings.launchAtLogin}
            onChange={(checked) => void setSetting("launchAtLogin", checked)}
          />
          <SettingToggle
            label="Show pet"
            detail="Display the desktop companion"
            checked={settings.petVisible}
            onChange={(checked) => void setSetting("petVisible", checked)}
          />
          <SettingToggle
            label="Always on top"
            detail="Keep the pet above other windows"
            checked={settings.alwaysOnTop}
            onChange={(checked) => void setSetting("alwaysOnTop", checked)}
          />
        </div>
      </section>
    </main>
  );
}

type ConsoleTab = "overview" | "breakdown" | "cost" | "pet" | "settings";

function MetricCard(props: { label: string; value: string; detail: string; tag?: string }) {
  return (
    <section className="metric-card">
      <div>
        <span>{props.label}</span>
        {props.tag ? <em>{props.tag}</em> : null}
      </div>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </section>
  );
}

function OverviewTab(props: { usage: UsageSnapshot }) {
  const { usage } = props;
  const analysis = usage.analysis;

  return (
    <>
      <div className="analytics-grid">
        <MetricCard label="Estimated cost" value={money(usage.todayCost + usage.sevenDayCost)} detail="local ccusage estimate" />
        <MetricCard label="Total tokens" value={compactNumber(usage.allTimeTokens)} detail="tracked locally" />
        <MetricCard label="Input context" value={compactNumber(analysis.costStructure.inputTokens)} detail="raw input tokens" />
        <MetricCard label="Output tokens" value={compactNumber(analysis.costStructure.outputTokens)} detail="assistant output" />
        <MetricCard label="Active days" value={`${analysis.activeDays}`} detail="days with local usage" />
        <MetricCard label="Cache hit rate" value={percent(analysis.cacheHitRate)} detail="cache / input+cache" />
        <MetricCard label="Sessions" value={`${analysis.sessionCount}`} detail="local session records" />
        <MetricCard label="Daily average" value={compactNumber(analysis.dailyAverageTokens)} detail="observed active days" />
      </div>

      <section className="console-section chart-section">
        <div className="section-heading">
          <strong>Daily Trend</strong>
          <span>{analysis.daily.length} observed days</span>
        </div>
        <SparkBars points={analysis.daily} />
      </section>

      <div className="two-column">
        <section className="console-section">
          <div className="section-heading">
            <strong>Token Consumption Forecast</strong>
            <span>local baseline</span>
          </div>
          <ForecastLine points={analysis.daily} forecast={analysis.nextSevenDayForecast} />
          <div className="forecast-stats">
            <span>Daily average <strong>{compactNumber(analysis.dailyAverageTokens)}</strong></span>
            <span>Next 7 days <strong>{compactNumber(analysis.nextSevenDayForecast)}</strong></span>
            <span>Next 30 days <strong>{compactNumber(analysis.nextThirtyDayForecast)}</strong></span>
            <span>Top model now <strong>{usage.topModel}</strong></span>
          </div>
        </section>

        <section className="console-section">
          <div className="section-heading">
            <strong>Activity Heatmap</strong>
            <span>recent local days</span>
          </div>
          <ActivityHeatmap points={analysis.daily} />
        </section>
      </div>
    </>
  );
}

function BreakdownTab(props: { usage: UsageSnapshot }) {
  const { usage } = props;

  return (
    <>
      <div className="two-column">
        <section className="console-section">
          <div className="section-heading">
            <strong>Model Usage</strong>
            <span>{usage.analysis.models.length} models</span>
          </div>
          <ModelUsageTable models={usage.analysis.models} />
        </section>

        <section className="console-section">
          <div className="section-heading">
            <strong>Tool Breakdown</strong>
            <span>{usage.providers.length} sources</span>
          </div>
          <ProviderStatusRows providers={usage.providers} />
        </section>
      </div>

      <section className="console-section">
        <div className="section-heading">
          <strong>Session Breakdown</strong>
          <span>{usage.analysis.sessionCount} sessions</span>
        </div>
        <SessionBreakdown sessions={usage.analysis.sessions} />
      </section>
    </>
  );
}

function CostTab(props: { usage: UsageSnapshot }) {
  const { usage } = props;
  const structure = usage.analysis.costStructure;
  const totalTokens = structure.inputTokens + structure.outputTokens + structure.cacheReadTokens + structure.reasoningOutputTokens;
  const costPerMillion = usage.allTimeTokens > 0 ? (usage.sevenDayCost / Math.max(usage.sevenDayTokens, 1)) * 1_000_000 : 0;

  return (
    <>
      <section className="console-section">
        <div className="section-heading">
          <strong>Cost Structure</strong>
          <span>Cache hit {percent(usage.analysis.cacheHitRate)}</span>
        </div>
        <CostStructureBar structure={structure} />
      </section>

      <section className="console-section">
        <div className="section-heading">
          <strong>Efficiency</strong>
          <span>local estimates</span>
        </div>
        <div className="analytics-grid compact">
          <MetricCard label="Cost / 1M tokens" value={money(costPerMillion)} detail="7 day blended rate" />
          <MetricCard label="Reasoning share" value={percent(totalTokens > 0 ? structure.reasoningOutputTokens / totalTokens : 0)} detail="reasoning / token mix" />
          <MetricCard label="Cache savings signal" value={compactNumber(structure.cacheReadTokens)} detail="cache read tokens" />
          <MetricCard label="Output ratio" value={percent(totalTokens > 0 ? structure.outputTokens / totalTokens : 0)} detail="output / token mix" />
        </div>
      </section>

      <section className="console-section">
        <div className="section-heading">
          <strong>Waste Radar</strong>
          <span>largest local sessions</span>
        </div>
        <SessionBreakdown sessions={usage.analysis.sessions.slice(0, 6)} />
      </section>
    </>
  );
}

function PetTab(props: { settings: AppSettings; setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void }) {
  const themes: Array<{ id: AppSettings["petTheme"]; label: string }> = [
    { id: "gold", label: "Gold" },
    { id: "mint", label: "Mint" },
    { id: "rose", label: "Rose" },
    { id: "sky", label: "Sky" },
  ];

  return (
    <section className="console-section pet-config-section">
      <div className="section-heading">
        <strong>Pet</strong>
        <span>Basic appearance controls</span>
      </div>
      <div className="pet-config-grid">
        <div className={`pet-preview pet-theme-${props.settings.petTheme}`}>
          <GoldCat />
        </div>
        <div className="theme-options">
          {themes.map((theme) => (
            <button
              className={props.settings.petTheme === theme.id ? "selected" : ""}
              key={theme.id}
              type="button"
              onClick={() => props.setSetting("petTheme", theme.id)}
            >
              <span className={`theme-swatch pet-theme-${theme.id}`} />
              {theme.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SettingsTab(props: {
  settings: AppSettings;
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  return (
    <section className="console-section">
      <div className="section-heading">
        <strong>Settings</strong>
        <span>Applied immediately</span>
      </div>
      <div className="settings-list wide">
        <SettingToggle
          label="Launch at login"
          detail="Start QuotaPet with macOS"
          checked={props.settings.launchAtLogin}
          onChange={(checked) => props.setSetting("launchAtLogin", checked)}
        />
        <SettingToggle
          label="Show pet"
          detail="Display the desktop companion"
          checked={props.settings.petVisible}
          onChange={(checked) => props.setSetting("petVisible", checked)}
        />
        <SettingToggle
          label="Always on top"
          detail="Keep the pet above other windows"
          checked={props.settings.alwaysOnTop}
          onChange={(checked) => props.setSetting("alwaysOnTop", checked)}
        />
      </div>
    </section>
  );
}

function ConsoleApp() {
  const { usage, refresh, loading } = useUsage();
  const { settings, setSetting } = useAppSettings();
  const [activeTab, setActiveTab] = useState<ConsoleTab>("overview");
  const tabs: Array<{ id: ConsoleTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "breakdown", label: "Breakdown" },
    { id: "cost", label: "Cost & Efficiency" },
    { id: "pet", label: "Pet" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <main className="console-view">
      <header className="console-header">
        <div>
          <strong>QuotaPet Console</strong>
          <span>Local token dashboard · updated {lastUpdated(usage.generatedAt)}</span>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Refreshing" : "Refresh"}
        </button>
      </header>

      <nav className="console-tabs" aria-label="Console sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? <OverviewTab usage={usage} /> : null}
      {activeTab === "breakdown" ? <BreakdownTab usage={usage} /> : null}
      {activeTab === "cost" ? <CostTab usage={usage} /> : null}
      {activeTab === "pet" ? (
        <PetTab settings={settings} setSetting={(key, value) => void setSetting(key, value)} />
      ) : null}
      {activeTab === "settings" ? (
        <SettingsTab settings={settings} setSetting={(key, value) => void setSetting(key, value)} />
      ) : null}
    </main>
  );
}

function App() {
  const search = new URLSearchParams(window.location.search);
  const view = search.get("view");

  if (view === "popover") {
    return <PopoverApp />;
  }

  if (view === "menubar") {
    return <MenuBarApp />;
  }

  if (view === "console") {
    return <ConsoleApp />;
  }

  return <PetApp />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
