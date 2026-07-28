import { useEffect, useState } from "react";
import { CostStructureBar, DonutChart, ModelUsageTable, SessionBreakdown, SparkBars, TokenActivityGrid } from "../components/charts";
import { AppearancePanel } from "../features/pet-appearance/AppearancePanel";
import type { PetConsoleSection } from "../features/pet-appearance/catalog";
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
    strokeWidth: 1.85,
  };

  if (props.tab === "overview") {
    return (
      <svg className="console-nav-icon" data-nav-icon="overview" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="m3.5 10.7 8.5-7 8.5 7" />
        <path {...common} d="M5.8 9.8V20h12.4V9.8" />
        <path {...common} d="M9.6 20v-6.2h4.8V20" />
      </svg>
    );
  }

  if (props.tab === "breakdown") {
    return (
      <svg className="console-nav-icon" data-nav-icon="breakdown" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M10.5 3.2a8.8 8.8 0 1 0 10.3 10.3H10.5V3.2Z" />
        <path {...common} d="M14 3.6a7.7 7.7 0 0 1 6.4 6.4H14V3.6Z" />
      </svg>
    );
  }

  if (props.tab === "cost") {
    return (
      <svg className="console-nav-icon" data-nav-icon="cost" viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="12" cy="12" r="8.7" />
        <path {...common} d="M15.3 8.4c-.8-.7-1.9-1.1-3.2-1.1-1.8 0-3 .8-3 2.1 0 3.1 6 1.6 6 4.9 0 1.5-1.3 2.5-3.3 2.5-1.4 0-2.6-.5-3.4-1.3M12 5.6v12.8" />
      </svg>
    );
  }

  if (props.tab === "pet") {
    return (
      <svg className="console-nav-icon" data-nav-icon="pet" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="m5.6 9.3-.7-4.7 4.2 2A8.7 8.7 0 0 1 12 6c1 0 2 .2 2.9.6l4.2-2-.7 4.7a6.8 6.8 0 0 1 1.5 4.2c0 4.1-3.2 6.5-7.9 6.5s-7.9-2.4-7.9-6.5c0-1.6.5-3 1.5-4.2Z" />
        <path {...common} d="M9 13h.01M15 13h.01M10 16c1.2.8 2.8.8 4 0" />
      </svg>
    );
  }

  return (
    <svg className="console-nav-icon" data-nav-icon="settings" viewBox="0 0 24 24" aria-hidden="true">
      <path {...common} d="M4 6h8M16 6h4M12 3.8v4.4" />
      <path {...common} d="M4 12h3M11 12h9M7 9.8v4.4" />
      <path {...common} d="M4 18h10M18 18h2M14 15.8v4.4" />
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
  const sidebarAppearance = { ...normalizedAppearance, size: 1, moodBadge: { ...normalizedAppearance.moodBadge, showMood: false } };
  const requestedTab = new URLSearchParams(window.location.search).get("section");
  const [activeTab, setActiveTab] = useState<ConsoleTab>(requestedTab === "pet" ? "pet" : "overview");
  const [petSection, setPetSection] = useState<PetConsoleSection>("appearance");
  const [petNavigationEpoch, setPetNavigationEpoch] = useState(0);
  useEffect(() => window.tokenpet?.onConsoleNavigation?.((tab) => {
    if (tab === "pet") {
      setPetSection("appearance");
      setPetNavigationEpoch((epoch) => epoch + 1);
    }
    setActiveTab(tab);
  }), []);
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
            <PetAppearanceVisual
              appearance={sidebarAppearance}
              usage={usage}
              tokenValue={usage.allTimeTokens}
              storyActionId="idle_breathe"
              reduceMotion
              surface="preview"
            />
          </div>
        </div>
      </aside>

      <section className="console-view">
        <header className="console-header">
          <div>
            <strong>{tabs.find((tab) => tab.id === activeTab)?.label ?? "Overview"}</strong>
            <span>{activeTab === "pet" && petSection === "actions" ? "Preview and tune your companion’s actions." : subtitles[activeTab]}</span>
          </div>
        </header>

        <div className="console-content">
          {activeTab === "overview" ? <OverviewTab usage={usage} /> : null}
          {activeTab === "breakdown" ? <BreakdownTab usage={usage} /> : null}
          {activeTab === "cost" ? <CostTab usage={usage} /> : null}
          {activeTab === "pet" ? (
            <AppearancePanel key={`pet-navigation-${petNavigationEpoch}`} settings={settings} usage={usage} setSetting={(key, value) => void setSetting(key, value)} onSectionChange={setPetSection} />
          ) : null}
          {activeTab === "settings" ? (
            <SettingsTab settings={settings} setSetting={(key, value) => void setSetting(key, value)} />
          ) : null}
        </div>
      </section>
    </main>
  );
}
