import { ProviderStatusRows, SettingToggle, StatCard } from "../components/ui";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import { compactNumber, lastUpdated, money } from "../utils/format";

export function MenuBarApp() {
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
