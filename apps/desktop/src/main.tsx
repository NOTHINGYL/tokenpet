import React, { useEffect, useMemo, useState } from "react";
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
  id: "codex" | "claude";
  label: string;
  status: "connected" | "idle" | "error";
  detail: string;
  todayTokens: number;
  sevenDayTokens: number;
  allTimeTokens: number;
};

declare global {
  interface Window {
    quotapet: {
      getUsageSnapshot: () => Promise<UsageSnapshot>;
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
  ],
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

  useEffect(() => {
    let active = true;

    window.quotapet?.getUsageSnapshot().then((snapshot) => {
      if (active) setUsage(snapshot);
    });

    return () => {
      active = false;
    };
  }, []);

  return usage;
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
  const usage = useUsage();
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
  const usage = useUsage();
  const providerRows = useMemo(() => usage.providers, [usage.providers]);

  return (
    <main className="popover">
      <header className="popover-header">
        <div>
          <strong>QuotaPet</strong>
          <span>v0.2 · {usage.status}</span>
        </div>
        <span className="status-dot" />
      </header>

      <div className="stats-grid">
        <StatCard label="Today" value={compactNumber(usage.todayTokens)} detail={money(usage.todayCost)} />
        <StatCard label="7 days" value={compactNumber(usage.sevenDayTokens)} detail={money(usage.sevenDayCost)} />
        <StatCard label="All time" value={compactNumber(usage.allTimeTokens)} detail="tracked locally" />
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

function App() {
  const search = new URLSearchParams(window.location.search);
  const view = search.get("view");

  if (view === "popover") {
    return <PopoverApp />;
  }

  return <PetApp />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
