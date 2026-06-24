import { Fragment } from "react";
import { EmptyState } from "./ui";
import type { CostStructure, DailyUsagePoint, ModelUsagePoint, SessionUsagePoint } from "../types";
import { compactNumber, lastUpdated, maxOf, money, percent, shortDate } from "../utils/format";

export function SparkBars(props: { points: DailyUsagePoint[] }) {
  const points = props.points.slice(-42);
  if (points.length === 0) {
    return <EmptyState title="No local trend yet" detail="TokenPet will draw the daily trend after ccusage finds local records." />;
  }

  const maxTokens = maxOf(points.map((point) => point.tokens));
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="spark-bars" aria-label="Daily token trend" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map((point, index) => (
        <div className="spark-bar" data-tooltip={`${point.date} - ${compactNumber(point.tokens)} tokens - ${money(point.cost)}`} key={point.date}>
          <span style={{ height: `${Math.max(3, (point.tokens / maxTokens) * 100)}%` }} />
          <small>{index % labelEvery === 0 || index === points.length - 1 ? shortDate(point.date) : ""}</small>
        </div>
      ))}
    </div>
  );
}

export function DonutChart(props: {
  segments: Array<{ label: string; value: number; color: string; detail?: string }>;
  label?: string;
}) {
  const total = props.segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let offset = 25;

  return (
    <div className="donut-layout">
      <svg className="donut-chart" viewBox="0 0 42 42" role="img" aria-label={props.label ?? "Donut chart"}>
        <circle className="donut-track" cx="21" cy="21" r="15.9" />
        {props.segments.map((segment) => {
          const share = (segment.value / total) * 100;
          const dash = `${share} ${100 - share}`;
          const currentOffset = offset;
          offset -= share;
          return (
            <circle
              className="donut-segment"
              cx="21"
              cy="21"
              key={segment.label}
              r="15.9"
              stroke={segment.color}
              strokeDasharray={dash}
              strokeDashoffset={currentOffset}
            >
              <title>{`${segment.label}: ${compactNumber(segment.value)} - ${percent(segment.value / total)}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="donut-legend">
        {props.segments.map((segment) => (
          <div className="donut-legend-row" key={segment.label}>
            <span style={{ background: segment.color }} />
            <strong>{segment.label}</strong>
            <small>{segment.detail ?? `${compactNumber(segment.value)} (${percent(segment.value / total)})`}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForecastLine(props: { points: DailyUsagePoint[]; forecast: number }) {
  const history = props.points.slice(-14);
  if (history.length === 0) {
    return <EmptyState title="Forecast warming up" detail="At least one local usage day is needed before forecasting." />;
  }

  const projected = Array.from({ length: 7 }, (_value, index) => props.forecast / 7 + index * (props.forecast / 70));
  const values = [...history.map((point) => point.tokens), ...projected];
  const maxValue = maxOf(values);
  const width = 360;
  const height = 150;
  const step = width / Math.max(values.length - 1, 1);
  const path = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / maxValue) * (height - 18) - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="forecast-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Token forecast line">
      <path className="chart-gridline" d={`M 0 ${height - 8} L ${width} ${height - 8}`} />
      <path className="chart-gridline" d={`M 0 ${height / 2} L ${width} ${height / 2}`} />
      <path className="forecast-path" d={path} />
    </svg>
  );
}

export function ActivityHeatmap(props: { points: DailyUsagePoint[] }) {
  if (props.points.length === 0) {
    return <EmptyState title="No activity blocks" detail="Recent local days will appear here once usage is detected." />;
  }

  const cells = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
  const points = props.points.slice(-84);
  const maxTokens = maxOf(points.map((point) => point.tokens));

  points.forEach((point, index) => {
    const date = new Date(`${point.date}T00:00:00`);
    const weekday = Number.isNaN(date.getTime()) ? index % 7 : date.getDay();
    const bucket = Math.floor(index / 7);
    if (bucket < 12) cells[weekday][bucket] += point.tokens;
  });

  return (
    <div className="activity-heatmap">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, rowIndex) => (
        <Fragment key={day}>
          <span className="heatmap-label">{day}</span>
          {cells[rowIndex].map((value, colIndex) => (
            <span
              className="heatmap-cell"
              data-level={Math.ceil((value / maxTokens) * 5)}
              key={`${day}-${colIndex}`}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}

export function ModelUsageTable(props: { models: ModelUsagePoint[] }) {
  if (props.models.length === 0) {
    return <EmptyState title="No models yet" detail="Model usage appears after local Codex or Claude usage is detected." />;
  }

  return (
    <div className="model-table">
      {props.models.slice(0, 8).map((model, index) => (
        <div className="model-row" key={model.model}>
          <span>{index + 1}</span>
          <strong>{model.model}</strong>
          <div className="meter">
            <span style={{ width: `${Math.max(2, model.share * 100)}%` }} />
          </div>
          <small>{compactNumber(model.tokens)}</small>
          <small>{money(model.cost)}</small>
          <small>{percent(model.share)}</small>
        </div>
      ))}
    </div>
  );
}

export function SessionBreakdown(props: { sessions: SessionUsagePoint[] }) {
  if (props.sessions.length === 0) {
    return <EmptyState title="No sessions yet" detail="Local session rows will appear here after ccusage finds them." />;
  }

  return (
    <div className="session-list">
      {props.sessions.slice(0, 12).map((session) => (
        <div className="session-row" key={session.id}>
          <div>
            <strong>{session.directory}</strong>
            <small>
              {session.model} - {lastUpdated(session.lastActivity)}
            </small>
          </div>
          <div className="meter">
            <span style={{ width: `${Math.max(2, session.share * 100)}%` }} />
          </div>
          <span>{compactNumber(session.tokens)}</span>
          <span>{money(session.cost)}</span>
        </div>
      ))}
    </div>
  );
}

export function CostStructureBar(props: { structure: CostStructure }) {
  const parts = [
    { label: "Input", value: props.structure.inputTokens, className: "input" },
    { label: "Output", value: props.structure.outputTokens, className: "output" },
    { label: "Cache", value: props.structure.cacheReadTokens, className: "cache" },
    { label: "Reasoning", value: props.structure.reasoningOutputTokens, className: "reasoning" },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0) || 1;

  return (
    <div className="cost-structure">
      <div className="stacked-bar">
        {parts.map((part) => (
          <span className={part.className} key={part.label} style={{ width: `${(part.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="cost-legend">
        {parts.map((part) => (
          <div key={part.label}>
            <span className={`legend-dot ${part.className}`} />
            <strong>{part.label}</strong>
            <small>
              {compactNumber(part.value)} - {percent(part.value / total)}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
