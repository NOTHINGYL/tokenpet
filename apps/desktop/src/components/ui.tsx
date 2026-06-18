import type { ProviderSnapshot } from "../types";
import { compactNumber } from "../utils/format";

export function StatCard(props: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <section className={`stat-card ${props.accent ? "accent" : ""}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </section>
  );
}

export function HealthBadge(props: { status: string; loading?: boolean; error?: string | null }) {
  const tone = props.error ? "error" : props.loading ? "loading" : props.status === "ready" ? "connected" : "idle";
  const label = props.error ? "Needs attention" : props.loading ? "Refreshing" : props.status === "ready" ? "All good" : props.status;

  return (
    <span className={`health-badge ${tone}`}>
      <span />
      {label}
    </span>
  );
}

export function EmptyState(props: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </div>
  );
}

export function MetricCard(props: { label: string; value: string; detail: string; tag?: string }) {
  return (
    <section className="metric-card">
      <div>
        <span>{props.label}</span>
        {props.tag ? <em>{props.tag}</em> : null}
      </div>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </section>
  );
}

export function ProviderStatusRows(props: { providers: ProviderSnapshot[] }) {
  return (
    <section className="source-list">
      {props.providers.map((row) => (
        <div className="source-row" key={row.id}>
          <span className={`provider-dot ${row.status}`} />
          <div>
            <strong>{row.label}</strong>
            <small>
              {row.detail} · {compactNumber(row.todayTokens)} today · {compactNumber(row.allTimeTokens)} local all time
            </small>
          </div>
          <span className={`source-badge ${row.status}`}>{row.status}</span>
        </div>
      ))}
    </section>
  );
}

export function SettingToggle(props: {
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
