import { useState } from "react";
import {
  ActivityHeatmap,
  CostStructureBar,
  ForecastLine,
  ModelUsageTable,
  SessionBreakdown,
  SparkBars,
} from "../components/charts";
import { GoldCat } from "../components/GoldCat";
import { APP_VERSION } from "../constants";
import { HealthBadge, MetricCard, ProviderStatusRows, SettingToggle } from "../components/ui";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { AppSettings, ConsoleTab, UsageSnapshot } from "../types";
import { compactNumber, lastUpdated, money, percent } from "../utils/format";

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
            <span>
              Daily average <strong>{compactNumber(analysis.dailyAverageTokens)}</strong>
            </span>
            <span>
              Next 7 days <strong>{compactNumber(analysis.nextSevenDayForecast)}</strong>
            </span>
            <span>
              Next 30 days <strong>{compactNumber(analysis.nextThirtyDayForecast)}</strong>
            </span>
            <span>
              Top model now <strong>{usage.topModel}</strong>
            </span>
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
    <main className="console-view">
      <header className="console-header">
        <div>
          <strong>TokenPet Console</strong>
          <span>v{APP_VERSION} · local token dashboard · updated {lastUpdated(usage.generatedAt)}</span>
        </div>
        <div className="console-header-actions">
          <HealthBadge status={usage.status} loading={loading} error={error} />
          <button type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing" : "Refresh"}
          </button>
        </div>
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
