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
};

declare global {
  interface Window {
    quotapet: {
      getUsageSnapshot: () => Promise<UsageSnapshot>;
      refreshUsageSnapshot: () => Promise<UsageSnapshot>;
      getAppSettings: () => Promise<AppSettings>;
      setAppSetting: (key: keyof AppSettings, enabled: boolean) => Promise<AppSettings>;
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
};

const fallbackSettings: AppSettings = {
  launchAtLogin: false,
  petVisible: true,
  alwaysOnTop: true,
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
      className={`pet-stage ${dragging ? "is-dragging" : ""}`}
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

function ConsoleApp() {
  const { usage, refresh, loading } = useUsage();
  const { settings, setSetting } = useAppSettings();

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

      <div className="console-grid">
        <StatCard label="Today" value={compactNumber(usage.todayTokens)} detail={money(usage.todayCost)} />
        <StatCard label="7 days" value={compactNumber(usage.sevenDayTokens)} detail={money(usage.sevenDayCost)} />
        <StatCard label="Local all time" value={compactNumber(usage.allTimeTokens)} detail="tracked locally" />
        <StatCard label="Top model" value={usage.topModel} detail={`top tool ${usage.topTool}`} />
      </div>

      <section className="console-section">
        <div className="section-heading">
          <strong>Source Status</strong>
          <span>Codex, Claude Code, Cursor, and ccusage</span>
        </div>
        <ProviderStatusRows providers={usage.providers} />
      </section>

      <section className="console-section">
        <div className="section-heading">
          <strong>Pet Settings</strong>
          <span>Applied immediately</span>
        </div>
        <div className="settings-list wide">
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
