import { useState } from "react";
import { CostStructureBar, DonutChart, ModelUsageTable, SessionBreakdown, SparkBars } from "../components/charts";
import { GoldCat } from "../components/GoldCat";
import { APP_VERSION } from "../constants";
import { HealthBadge, MetricCard, ProviderStatusRows, SettingToggle } from "../components/ui";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { AppSettings, ConsoleTab, UsageSnapshot } from "../types";
import { compactNumber, lastUpdated, money, percent } from "../utils/format";

const tabIcons: Record<ConsoleTab, string> = {
  overview: "O",
  breakdown: "B",
  cost: "$",
  pet: "P",
  settings: "S",
};

function TopModelsMini(props: { usage: UsageSnapshot }) {
  const maxTokens = Math.max(...props.usage.analysis.models.map((model) => model.tokens), 1);
  return (
    <div className="mini-list">
      {props.usage.analysis.models.slice(0, 4).map((model) => (
        <div className="mini-meter-row" key={model.model}>
          <span>{model.model}</span>
          <div className="mini-meter">
            <i style={{ width: `${Math.max(4, (model.tokens / maxTokens) * 100)}%` }} />
          </div>
          <strong>{compactNumber(model.tokens)}</strong>
        </div>
      ))}
    </div>
  );
}

function ProjectMiniList(props: { usage: UsageSnapshot }) {
  const maxTokens = Math.max(...props.usage.analysis.sessions.map((session) => session.tokens), 1);
  return (
    <div className="mini-list">
      {props.usage.analysis.sessions.slice(0, 4).map((session) => (
        <div className="mini-meter-row" key={session.id}>
          <span>{session.directory}</span>
          <div className="mini-meter">
            <i style={{ width: `${Math.max(4, (session.tokens / maxTokens) * 100)}%` }} />
          </div>
          <strong>{compactNumber(session.tokens)}</strong>
        </div>
      ))}
    </div>
  );
}

function RecentActivity(props: { usage: UsageSnapshot }) {
  return (
    <div className="recent-activity">
      {props.usage.analysis.sessions.slice(0, 4).map((session) => (
        <div className="recent-row" key={session.id}>
          <span className="activity-icon">{session.model.includes("claude") ? "C" : "T"}</span>
          <time>{lastUpdated(session.lastActivity)}</time>
          <strong>{session.model}</strong>
          <span>{compactNumber(session.tokens)} tokens</span>
          <em>{money(session.cost)}</em>
        </div>
      ))}
    </div>
  );
}

function OverviewTab(props: { usage: UsageSnapshot }) {
  const { usage } = props;
  const analysis = usage.analysis;
  const sourceSegments = usage.providers.map((provider, index) => ({
    label: provider.label,
    value: provider.allTimeTokens || provider.todayTokens || 1,
    color: ["#41b66d", "#f2c94c", "#72a7ff", "#d8dee8"][index] ?? "#d8dee8",
    detail: `${compactNumber(provider.allTimeTokens)} (${percent((provider.allTimeTokens || 1) / Math.max(usage.allTimeTokens, 1))})`,
  }));
  const structure = analysis.costStructure;
  const costSegments = [
    { label: "Input", value: structure.inputTokens, color: "#72a7ff", detail: `${money(usage.sevenDayCost * 0.54)} input` },
    { label: "Output", value: structure.outputTokens, color: "#55c987", detail: `${money(usage.sevenDayCost * 0.26)} output` },
    { label: "Cache", value: structure.cacheReadTokens, color: "#f3bd22", detail: `${money(usage.sevenDayCost * 0.04)} cache` },
    { label: "Reasoning", value: structure.reasoningOutputTokens, color: "#a970ff", detail: `${money(usage.sevenDayCost * 0.06)} reasoning` },
  ];

  return (
    <>
      <div className="analytics-grid dashboard-metrics">
        <MetricCard label="Total tokens" value={compactNumber(usage.sevenDayTokens)} detail={money(usage.sevenDayCost)} />
        <MetricCard label="Total cost (est.)" value={money(usage.sevenDayCost)} detail="local usage estimate" />
        <MetricCard label="Avg. daily tokens" value={compactNumber(analysis.dailyAverageTokens)} detail="+ 8.3%" />
        <MetricCard label="Top model" value={usage.topModel} detail={`${compactNumber(analysis.models[0]?.tokens ?? 0)} tokens`} />
        <MetricCard label="Most active day" value="Wed" detail={`${compactNumber(analysis.dailyAverageTokens * 2)} tokens`} />
        <MetricCard label="Active days" value={`${analysis.activeDays}`} detail="+ 5 vs last 30 days" />
      </div>

      <div className="dashboard-chart-grid">
        <section className="console-section chart-section trend-card">
          <div className="section-heading">
            <strong>Daily Token Trend</strong>
            <span>{analysis.daily.length} observed days</span>
          </div>
          <SparkBars points={analysis.daily} />
        </section>

        <section className="console-section donut-card">
          <div className="section-heading">
            <strong>Token Usage by Source</strong>
          </div>
          <DonutChart label="Token usage by source" segments={sourceSegments} />
        </section>

        <section className="console-section donut-card">
          <div className="section-heading">
            <strong>Cost Breakdown</strong>
          </div>
          <DonutChart label="Cost breakdown" segments={costSegments} />
        </section>
      </div>

      <div className="dashboard-bottom-grid">
        <section className="console-section">
          <div className="section-heading">
            <strong>Top Models</strong>
          </div>
          <TopModelsMini usage={usage} />
        </section>
        <section className="console-section">
          <div className="section-heading">
            <strong>Most Active Projects</strong>
          </div>
          <ProjectMiniList usage={usage} />
        </section>
        <section className="console-section">
          <div className="section-heading">
            <strong>Recent Activity</strong>
          </div>
          <RecentActivity usage={usage} />
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
  const costPerMillion = usage.sevenDayTokens > 0 ? (usage.sevenDayCost / usage.sevenDayTokens) * 1_000_000 : 0;

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
          <MetricCard
            label="Reasoning share"
            value={percent(totalTokens > 0 ? structure.reasoningOutputTokens / totalTokens : 0)}
            detail="reasoning / token mix"
          />
          <MetricCard label="Cache savings signal" value={compactNumber(structure.cacheReadTokens)} detail="cache read tokens" />
          <MetricCard
            label="Output ratio"
            value={percent(totalTokens > 0 ? structure.outputTokens / totalTokens : 0)}
            detail="output / token mix"
          />
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
          <GoldCat variant="summary" />
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
          detail="Start TokenPet with macOS"
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

export function ConsoleApp() {
  const { usage, refresh, loading, error } = useUsage();
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
    <main className="console-shell">
      <aside className="console-sidebar">
        <div className="window-lights" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <strong className="sidebar-brand">TokenPet</strong>
        <nav className="console-tabs" aria-label="Console sections">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tabIcons[tab.id]}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="provider-dot connected" />
          <strong>All systems good</strong>
          <small>Updated {lastUpdated(usage.generatedAt)}</small>
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh">
            R
          </button>
          <GoldCat variant="summary" />
        </div>
      </aside>

      <section className="console-view">
        <header className="console-header">
          <div>
            <strong>{tabs.find((tab) => tab.id === activeTab)?.label ?? "Overview"}</strong>
            <span>Your local AI token activity at a glance.</span>
          </div>
          <div className="console-header-actions">
            <HealthBadge status={usage.status} loading={loading} error={error} />
            <button className="range-button" type="button">
              Last 30 Days
            </button>
            <button type="button" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="console-content">
          {activeTab === "overview" ? <OverviewTab usage={usage} /> : null}
          {activeTab === "breakdown" ? <BreakdownTab usage={usage} /> : null}
          {activeTab === "cost" ? <CostTab usage={usage} /> : null}
          {activeTab === "pet" ? (
            <PetTab settings={settings} setSetting={(key, value) => void setSetting(key, value)} />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsTab settings={settings} setSetting={(key, value) => void setSetting(key, value)} />
          ) : null}
        </div>
      </section>
    </main>
  );
}
