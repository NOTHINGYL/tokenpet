import { useMemo } from "react";
import { StatCard } from "../components/ui";
import { useUsage } from "../hooks/useUsage";
import { compactNumber, money } from "../utils/format";

export function PopoverApp() {
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
            <small>
              {compactNumber(row.todayTokens)} today · {row.detail}
            </small>
          </div>
        ))}
      </section>
    </main>
  );
}
