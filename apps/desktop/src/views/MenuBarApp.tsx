import type { ReactNode } from "react";
import { APP_VERSION } from "../constants";
import { HealthBadge, SettingToggle, StatCard } from "../components/ui";
import { normalizePetAppearance } from "../features/pet-appearance/appearanceState";
import { PetAppearanceVisual } from "../features/pet-appearance/PetAppearanceVisual";
import { useAppSettings } from "../hooks/useAppSettings";
import { useUsage } from "../hooks/useUsage";
import type { ProviderSnapshot } from "../types";
import { compactNumber, lastUpdated, money } from "../utils/format";

function IconButton(props: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="icon-button" type="button" aria-label={props.label} title={props.label} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12A8 8 0 0 1 17.7 6.4M18 3v4h-4M6 21v-4h4" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z" />
      <path d="m18.4 14.4.7 2.1-2 2-2.1-.8a7.7 7.7 0 0 1-1.5.6l-.9 2h-2.8l-.9-2a7.7 7.7 0 0 1-1.5-.6l-2.1.8-2-2 .7-2.1a7.6 7.6 0 0 1-.6-1.5l-2-.9V9.2l2-.9c.2-.5.4-1 .6-1.5l-.7-2.1 2-2 2.1.8c.5-.3 1-.5 1.5-.6l.9-2h2.8l.9 2c.5.2 1 .4 1.5.6l2.1-.8 2 2-.7 2.1c.3.5.5 1 .6 1.5l2 .9V12l-2 .9c-.2.5-.4 1-.6 1.5Z" />
    </svg>
  );
}

function SourceRows(props: { providers: ProviderSnapshot[] }) {
  return (
    <div className="menubar-source-list">
      {props.providers.map((provider) => (
        <div className="menubar-source-row" key={provider.id}>
          <span className={`provider-dot ${provider.status}`} />
          <strong>{provider.label}</strong>
          <small>{provider.id === "codex" ? `${compactNumber(provider.todayTokens)} today · ${compactNumber(provider.allTimeTokens)} all time` : provider.detail}</small>
          <em className={provider.status}>{provider.status}</em>
        </div>
      ))}
    </div>
  );
}

export function MenuBarApp() {
  const { usage, refresh, loading, error } = useUsage();
  const { settings, setSetting } = useAppSettings();
  const appearance = normalizePetAppearance(settings);
  const tinyAppearance = {
    ...appearance,
    moodBadge: { ...appearance.moodBadge, showMood: false },
  };

  return (
    <main className="menubar-panel">
      <header className="panel-header">
        <div className="panel-title">
          <strong>TokenPet</strong>
          <span className="panel-version">v{APP_VERSION}</span>
          <HealthBadge status={usage.status} loading={loading} error={error} />
          {settings.petStory.companionSettings.keepTinyMenuForm ? (
            <div className="menubar-tiny-pet" data-testid="menubar-tiny-pet" aria-label="Tiny TokenPet companion">
              <PetAppearanceVisual
                appearance={tinyAppearance}
                usage={usage}
                storyActionId="idle_breathe"
                reduceMotion
                surface="preview"
              />
            </div>
          ) : null}
        </div>
        <div className="panel-header-actions">
          <IconButton label="Refresh now" onClick={() => void refresh()} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <IconButton label="Open settings" onClick={() => window.tokenpet.openConsole()}>
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <div className="stats-grid panel-stats">
        <StatCard label="Today" value={compactNumber(usage.todayTokens)} detail={money(usage.todayCost)} accent />
        <StatCard label="7 days" value={compactNumber(usage.sevenDayTokens)} detail={money(usage.sevenDayCost)} />
        <StatCard label="Local all time" value={compactNumber(usage.allTimeTokens)} detail="tracked locally" />
      </div>

      <div className="menubar-columns">
        <section className="menubar-card menubar-sources">
          <div className="section-heading">
            <strong>Sources</strong>
          </div>
          <SourceRows providers={usage.providers} />
        </section>

        <section className="menubar-card menubar-quick-actions">
          <div className="section-heading">
            <strong>Quick Actions</strong>
          </div>
          <div className="settings-list compact">
            <SettingToggle
              label="Launch at login"
              detail="Start with macOS"
              checked={settings.launchAtLogin}
              onChange={(checked) => void setSetting("launchAtLogin", checked)}
            />
            <SettingToggle
              label="Show pet"
              detail="Desktop companion"
              checked={settings.petVisible}
              onChange={(checked) => void setSetting("petVisible", checked)}
            />
            <SettingToggle
              label="Always on top"
              detail="Float above windows"
              checked={settings.alwaysOnTop}
              onChange={(checked) => void setSetting("alwaysOnTop", checked)}
            />
          </div>
        </section>
      </div>

      <footer className="menubar-footer">
        <span>
          <span className="provider-dot connected" />
          Last updated {lastUpdated(usage.generatedAt)}
        </span>
        <button type="button" onClick={() => window.tokenpet.openConsole()}>
          Open Console →
        </button>
      </footer>
    </main>
  );
}
