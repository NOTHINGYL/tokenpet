import { Fragment, useMemo, useState, type CSSProperties } from "react";
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
  const axisMax = Math.ceil(maxTokens / 20_000_000) * 20_000_000 || 20_000_000;
  const axisLabels = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];

  return (
    <div className="daily-trend" aria-label="Daily token trend">
      <div className="trend-axis" aria-hidden="true">
        {axisLabels.map((label) => (
          <span key={label}>{label === 0 ? "0" : `${(label / 1_000_000).toFixed(1)}M`}</span>
        ))}
      </div>
      <div className="spark-bars" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point, index) => {
          const height = Math.max(3, (point.tokens / axisMax) * 100);
          const edge = index < 3 ? "start" : index > points.length - 4 ? "end" : "middle";

          return (
            <div className={`spark-bar edge-${edge}`} key={point.date} style={{ "--bar-height": `${height}%` } as CSSProperties}>
              <span style={{ height: `${height}%` }} />
              <small>{index % labelEvery === 0 || index === points.length - 1 ? shortDate(point.date) : ""}</small>
              <div className="trend-tooltip">
                <strong>{shortDate(point.date)}</strong>
                <span>Tokens : {compactNumber(point.tokens)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TokenActivityGrid(props: { points: DailyUsagePoint[] }) {
  const [mode, setMode] = useState<"daily" | "weekly" | "cumulative">("daily");
  const source = props.points.length > 0 ? props.points : [];
  const maxTokens = maxOf(source.map((point) => point.tokens));
  const byDate = new Map(source.map((point) => [point.date, point.tokens]));
  const end = source.length > 0 ? new Date(`${source[source.length - 1].date}T00:00:00`) : new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 363);

  const rawDays: Array<{ date: Date; key: string; tokens: number }> = [];
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    const tokens = byDate.get(key) ?? 0;
    rawDays.push({
      date: new Date(date),
      key,
      tokens,
    });
  }

  const days = useMemo(() => {
    let cumulative = 0;
    const totalTokens = rawDays.reduce((sum, day) => sum + day.tokens, 0);
    const weeklyTotals = rawDays.map((item, itemIndex) => {
      const startIndex = Math.max(0, itemIndex - item.date.getDay());
      return rawDays.slice(startIndex, Math.min(startIndex + 7, rawDays.length)).reduce((sum, weekDay) => sum + weekDay.tokens, 0);
    });
    const maxWeekly = maxOf(weeklyTotals);

    return rawDays.map((day, index) => {
      cumulative += day.tokens;
      const weekStart = Math.max(0, index - day.date.getDay());
      const weekTokens = rawDays.slice(weekStart, Math.min(weekStart + 7, rawDays.length)).reduce((sum, item) => sum + item.tokens, 0);
      const value = mode === "weekly" ? weekTokens : mode === "cumulative" ? cumulative : day.tokens;
      const maxValue = mode === "weekly" ? maxWeekly : mode === "cumulative" ? Math.max(totalTokens, 1) : maxTokens;

      return {
        ...day,
        displayTokens: value,
        level: value === 0 ? 0 : Math.max(1, Math.ceil((value / maxValue) * 5)),
      };
    });
  }, [maxTokens, mode, rawDays]);

  const leadingBlanks = days[0]?.date.getDay() ?? 0;
  const cells = [
    ...Array.from({ length: leadingBlanks }, (_value, index) => ({ key: `blank-${index}`, blank: true as const })),
    ...days.map((day) => ({ ...day, blank: false as const })),
  ];
  const columns = Math.ceil(cells.length / 7);
  const monthLabels = cells.reduce<Array<{ label: string; column: number }>>((labels, cell, index) => {
    if (cell.blank) return labels;
    const isFirstDay = cell.date.getDate() <= 7;
    const label = new Intl.DateTimeFormat("en", { month: "short" }).format(cell.date);
    if (isFirstDay && labels[labels.length - 1]?.label !== label) {
      labels.push({ label, column: Math.floor(index / 7) + 1 });
    }
    return labels;
  }, []);

  return (
    <section className="console-section token-activity-section">
      <div className="token-activity-header">
        <strong>Token activity</strong>
        <div aria-label="Activity granularity">
          <button className={mode === "daily" ? "active" : ""} type="button" onClick={() => setMode("daily")}>Daily</button>
          <button className={mode === "weekly" ? "active" : ""} type="button" onClick={() => setMode("weekly")}>Weekly</button>
          <button className={mode === "cumulative" ? "active" : ""} type="button" onClick={() => setMode("cumulative")}>Cumulative</button>
        </div>
      </div>
      <div className="token-activity-grid" style={{ gridTemplateColumns: `repeat(${columns}, 12px)` }}>
        {cells.map((cell, index) => {
          const edge = Math.floor(index / 7) < 4 ? "start" : Math.floor(index / 7) > columns - 5 ? "end" : "middle";
          return (
            <span
              className={cell.blank ? "activity-cell blank" : `activity-cell edge-${edge}`}
              data-level={cell.blank ? undefined : cell.level}
              key={cell.key}
            >
              {cell.blank ? null : (
                <span className="activity-tooltip">
                  {`${compactNumber(cell.displayTokens)} tokens on ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(cell.date)}`}
                </span>
              )}
            </span>
          );
        })}
      </div>
      <div className="token-activity-months" style={{ gridTemplateColumns: `repeat(${columns}, 12px)` }}>
        {monthLabels.map((month) => (
          <span key={`${month.label}-${month.column}`} style={{ gridColumn: month.column }}>
            {month.label}
          </span>
        ))}
      </div>
    </section>
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
