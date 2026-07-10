import { useEffect, useState } from "react";
import { CostStructureBar, DonutChart, ModelUsageTable, SessionBreakdown, SparkBars, TokenActivityGrid } from "../components/charts";
import { AppearancePanel } from "../features/pet-appearance/AppearancePanel";
import { normalizePetAppearance } from "../features/pet-appearance/appearanceState";
import { PetAppearanceVisual } from "../features/pet-appearance/PetAppearanceVisual";
import { MetricCard, ProviderStatusRows, SettingToggle } from "../components/ui";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { AppSettings, ConsoleTab, UsageSnapshot } from "../types";
import { compactNumber, lastUpdated, money, percent } from "../utils/format";

function NavIcon(props: { tab: ConsoleTab }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  if (props.tab === "overview") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 10.5 12 4l8 6.5" />
        <path {...common} d="M6.5 9.5V20h11V9.5" />
        <path {...common} d="M10 20v-5h4v5" />
      </svg>
    );
  }

  if (props.tab === "breakdown") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 4a8 8 0 1 1-8 8" />
        <path {...common} d="M12 4v8h8" />
      </svg>
    );
  }

  if (props.tab === "cost") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M12 3v18" />
        <path {...common} d="M17 7.5c-1-1.2-2.7-2-5-2-2.6 0-4.2 1.1-4.2 2.8 0 4.6 9.4 1.8 9.4 6.8 0 1.9-1.8 3.4-5 3.4-2.4 0-4.2-.8-5.4-2.1" />
      </svg>
    );
  }

  if (props.tab === "pet") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="m7 9-2-4 4 2" />
        <path {...common} d="m17 9 2-4-4 2" />
        <path {...common} d="M5.5 12.5c0-4 3-6.5 6.5-6.5s6.5 2.5 6.5 6.5S15.8 19 12 19s-6.5-2.5-6.5-6.5Z" />
        <path {...common} d="M9 13h.01M15 13h.01M10 16c1.2 1 2.8 1 4 0" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path {...common} d="M19.5 12a7.8 7.8 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2-1.1L12.7 3h-4l-.3 2.7a7.5 7.5 0 0 0-2 1.1l-2.4-1-2 3.5 2 1.5a7.8 7.8 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2 1.1l.3 2.7h4l.3-2.7a7.5 7.5 0 0 0 2-1.1l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}

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
  const costMix = [
    { label: "Input", share: 0.642, color: "#72a7ff" },
    { label: "Output", share: 0.26, color: "#55c987" },
    { label: "Cache", share: 0.043, color: "#f3bd22" },
    { label: "Reasoning", share: 0.055, color: "#a970ff" },
  ];
  const costSegments = [
    ...costMix.map((item) => ({
      label: item.label,
      value: usage.sevenDayCost * item.share,
      color: item.color,
      detail: `${money(usage.sevenDayCost * item.share)} (${percent(item.share)})`,
    })),
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

      <TokenActivityGrid points={analysis.daily} />
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
  const { usage } = useUsage();
  const { settings, setSetting } = useAppSettings();
  const normalizedAppearance = normalizePetAppearance(settings);
  const sidebarAppearance = { ...normalizedAppearance, moodBadge: { ...normalizedAppearance.moodBadge, showMood: false } };
  const requestedTab = new URLSearchParams(window.location.search).get("section");
  const [activeTab, setActiveTab] = useState<ConsoleTab>(requestedTab === "pet" ? "pet" : "overview");
  useEffect(() => window.tokenpet?.onConsoleNavigation?.(setActiveTab), []);
  const tabs: Array<{ id: ConsoleTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "breakdown", label: "Breakdown" },
    { id: "cost", label: "Cost & Efficiency" },
    { id: "pet", label: "Pet" },
    { id: "settings", label: "Settings" },
  ];
  const subtitles: Record<ConsoleTab, string> = {
    overview: "Your local AI token activity at a glance.",
    breakdown: "Inspect token sources, sessions, and models.",
    cost: "Understand spend and efficiency signals.",
    pet: "Tune your token companion.",
    settings: "Manage TokenPet desktop behavior.",
  };

  return (
    <main className="console-shell">
      <aside className="console-sidebar">
        <strong className="sidebar-brand">TokenPet</strong>
        <nav className="console-tabs" aria-label="Console sections">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              type="button"
              data-console-tab={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>
                <NavIcon tab={tab.id} />
              </span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span className="provider-dot connected" />
          <strong>All systems good</strong>
          <small>Updated {lastUpdated(usage.generatedAt)}</small>
          <div className="sidebar-pet-actor" data-testid="sidebar-pet-actor">
            <PetAppearanceVisual appearance={sidebarAppearance} usage={usage} storyActionId="idle_breathe" reduceMotion surface="preview" />
          </div>
        </div>
      </aside>

      <section className="console-view">
        <header className="console-header">
          <div>
            <strong>{tabs.find((tab) => tab.id === activeTab)?.label ?? "Overview"}</strong>
            <span>{subtitles[activeTab]}</span>
          </div>
        </header>

        <div className="console-content">
          {activeTab === "overview" ? <OverviewTab usage={usage} /> : null}
          {activeTab === "breakdown" ? <BreakdownTab usage={usage} /> : null}
          {activeTab === "cost" ? <CostTab usage={usage} /> : null}
          {activeTab === "pet" ? (
            <AppearancePanel settings={settings} usage={usage} setSetting={(key, value) => void setSetting(key, value)} />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsTab settings={settings} setSetting={(key, value) => void setSetting(key, value)} />
          ) : null}
        </div>
      </section>
    </main>
  );
}
