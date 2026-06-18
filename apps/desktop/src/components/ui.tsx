import type { ProviderSnapshot } from "../types";

export function StatCard(props: { label: string; value: string; detail: string }) {
  return (
    <section className="stat-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </section>
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
            <small>{row.detail}</small>
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
