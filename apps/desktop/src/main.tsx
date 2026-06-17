import React, { useEffect, useMemo, useRef, useState } from "react";
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
};

declare global {
  interface Window {
    quotapet: {
      getUsageSnapshot: () => Promise<UsageSnapshot>;
      togglePopover: () => void;
      startDrag: (pointer: { x: number; y: number }) => void;
      moveDrag: (pointer: { x: number; y: number }) => void;
      endDrag: () => void;
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
  status: "mock data",
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
  const [moved, setMoved] = useState(false);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    movedRef.current = false;
    setDragging(true);
    setMoved(false);
    dragOrigin.current = { x: event.screenX, y: event.screenY };
    window.quotapet.startDrag({ x: event.screenX, y: event.screenY });
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return;
    const origin = dragOrigin.current;
    if (origin) {
      const distance = Math.hypot(event.screenX - origin.x, event.screenY - origin.y);
      if (distance > 4) {
        movedRef.current = true;
        setMoved(true);
      }
    }
    window.quotapet.moveDrag({ x: event.screenX, y: event.screenY });
  }

  function onPointerUp() {
    window.quotapet.endDrag();
    draggingRef.current = false;
    setDragging(false);
    dragOrigin.current = null;

    if (!movedRef.current) {
      window.quotapet.togglePopover();
    }
  }

  function onClose(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    window.quotapet.close();
  }

  return (
    <main className="pet-stage">
      <button
        className={`pet-button ${dragging || moved ? "is-dragging" : ""}`}
        type="button"
        aria-label="Open QuotaPet summary"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GoldCat />
        <span className="token-pill">{compactNumber(usage.todayTokens)}</span>
      </button>
      <button className="pet-close" type="button" aria-label="Close QuotaPet" onClick={onClose}>
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
  const providerRows = useMemo(
    () => [
      { name: "Codex", state: "connected", value: `${compactNumber(usage.todayTokens)} today` },
      { name: "Claude Code", state: "mock", value: "provider planned" },
      { name: "Cursor", state: "mock", value: "provider planned" },
    ],
    [usage.todayTokens],
  );

  return (
    <main className="popover">
      <header className="popover-header">
        <div>
          <strong>QuotaPet</strong>
          <span>v0.1 · {usage.status}</span>
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
          <div className="provider-row" key={row.name}>
            <span className={`provider-dot ${row.state}`} />
            <strong>{row.name}</strong>
            <small>{row.value}</small>
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
