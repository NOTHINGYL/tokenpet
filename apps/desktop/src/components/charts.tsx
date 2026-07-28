import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { EmptyState } from "./ui";
import type { CostStructure, DailyUsagePoint, ModelUsagePoint, SessionUsagePoint } from "../types";
import { compactNumber, lastUpdated, maxOf, money, percent, shortDate } from "../utils/format";

type ActivityMode = "daily" | "weekly" | "cumulative";

const ACTIVITY_COLUMN_COUNT = 52;
const DAYS_PER_ACTIVITY_COLUMN = 7;

function isoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addUtcDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function utcDateLabel(value: string, includeYear = true) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function niceAxisMaximum(value: number) {
  const padded = Math.max(value, 1) * 1.04;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function dailyActivityLevels(values: number[]) {
  const maximum = Math.max(0, ...values);
  return values.map((value) => {
    if (value <= 0 || maximum <= 0) return 0;
    const ratio = value / maximum;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  });
}

function weeklyTotals(values: number[]) {
  return Array.from({ length: Math.ceil(values.length / DAYS_PER_ACTIVITY_COLUMN) }, (_value, index) =>
    values
      .slice(index * DAYS_PER_ACTIVITY_COLUMN, index * DAYS_PER_ACTIVITY_COLUMN + DAYS_PER_ACTIVITY_COLUMN)
      .reduce((sum, value) => sum + value, 0),
  );
}

function cumulativeTotals(values: number[]) {
  let runningTotal = 0;
  return values.map((value) => {
    runningTotal += value;
    return runningTotal;
  });
}

function aggregateActivityLevels(values: number[]) {
  const maximum = Math.max(0, ...values);
  return values.flatMap((value) => {
    const filled = value <= 0 || maximum <= 0 ? 0 : Math.max(1, Math.ceil((value / maximum) * DAYS_PER_ACTIVITY_COLUMN));
    return Array.from({ length: DAYS_PER_ACTIVITY_COLUMN }, (_unused, row) =>
      DAYS_PER_ACTIVITY_COLUMN - row <= filled ? 4 : 0,
    );
  });
}

export function SparkBars(props: { points: DailyUsagePoint[] }) {
  const points = [...props.points]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-60);
  if (points.length === 0) {
    return <EmptyState title="No local trend yet" detail="TokenPet will draw the daily trend after ccusage finds local records." />;
  }

  const maxTokens = maxOf(points.map((point) => point.tokens));
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const axisMax = niceAxisMaximum(maxTokens);
  const axisLabels = [axisMax, axisMax * 0.75, axisMax * 0.5, axisMax * 0.25, 0];

  return (
    <div className="daily-trend" aria-label="Daily token trend">
      <div className="trend-axis" aria-hidden="true">
        {axisLabels.map((label) => (
          <span key={label}>{compactNumber(label)}</span>
        ))}
      </div>
      <div className="spark-bars" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point, index) => {
          const height = point.tokens <= 0 ? 0 : Math.max(3, (point.tokens / axisMax) * 100);
          const edge = index < 3 ? "start" : index > points.length - 4 ? "end" : "middle";

          return (
            <div className={`spark-bar edge-${edge}`} key={point.date} style={{ "--bar-height": `${height}%` } as CSSProperties}>
              <span className="spark-bar-fill" style={{ height: `${height}%`, minHeight: point.tokens > 0 ? 3 : 0 }} />
              <small>{index % labelEvery === 0 || index === points.length - 1 ? shortDate(point.date) : ""}</small>
              <div className="trend-tooltip">
                <span className="trend-tooltip-date">{shortDate(point.date)}</span>
                <span className="trend-tooltip-metric">Tokens: {compactNumber(point.tokens)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TokenActivityGrid(props: { points: DailyUsagePoint[] }) {
  const [mode, setMode] = useState<ActivityMode>("daily");
  const [hoveredColumn, setHoveredColumn] = useState<number | null>(null);
  const today = isoDate(new Date());
  const activity = useMemo(() => {
    const byDate = props.points.reduce((dates, point) => {
      if (point.date <= today) dates.set(point.date, (dates.get(point.date) ?? 0) + Math.max(0, point.tokens));
      return dates;
    }, new Map<string, number>());
    const currentWeek = startOfUtcWeek(today);
    const start = addUtcDays(currentWeek, -(ACTIVITY_COLUMN_COUNT - 1) * DAYS_PER_ACTIVITY_COLUMN);
    const days = Array.from({ length: ACTIVITY_COLUMN_COUNT * DAYS_PER_ACTIVITY_COLUMN }, (_value, index) => {
      const date = addUtcDays(start, index);
      return { date, tokens: byDate.get(date) ?? 0 };
    });
    const values = days.map((day) => day.tokens);
    const weekly = weeklyTotals(values);
    const cumulative = cumulativeTotals(weekly);
    const levels = {
      daily: dailyActivityLevels(values),
      weekly: aggregateActivityLevels(weekly),
      cumulative: aggregateActivityLevels(cumulative),
    } satisfies Record<ActivityMode, number[]>;
    const months: Array<{ column: number; label: string }> = [{
      column: 1,
      label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
        new Date(`${start}T00:00:00.000Z`),
      ),
    }];

    for (let column = 0; column < ACTIVITY_COLUMN_COUNT; column += 1) {
      const dates = days.slice(column * DAYS_PER_ACTIVITY_COLUMN, column * DAYS_PER_ACTIVITY_COLUMN + DAYS_PER_ACTIVITY_COLUMN);
      const firstOfMonth = dates.find((day) => day.date.endsWith("-01"));
      if (!firstOfMonth) continue;
      if (column === 0 && firstOfMonth.date.slice(0, 7) === start.slice(0, 7)) continue;
      months.push({
        column: column + 1,
        label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(
          new Date(`${firstOfMonth.date}T00:00:00.000Z`),
        ),
      });
    }

    return { cumulative, days, levels, months, start, weekly };
  }, [props.points, today]);
  const modeLabel = mode === "daily" ? "Daily" : mode === "weekly" ? "Weekly" : "Cumulative";

  return (
    <section className="console-section token-activity-section">
      <div className="token-activity-header">
        <strong>Token activity</strong>
        <div aria-label="Activity granularity">
          <button aria-pressed={mode === "daily"} className={mode === "daily" ? "active" : ""} type="button" onClick={() => setMode("daily")}>Daily</button>
          <button aria-pressed={mode === "weekly"} className={mode === "weekly" ? "active" : ""} type="button" onClick={() => setMode("weekly")}>Weekly</button>
          <button aria-pressed={mode === "cumulative"} className={mode === "cumulative" ? "active" : ""} type="button" onClick={() => setMode("cumulative")}>Cumulative</button>
        </div>
      </div>
      <div className="token-activity-plot" data-activity-mode={mode}>
        <div
          aria-label={`${modeLabel} token activity over the last 52 weeks`}
          className="token-activity-grid"
          role="img"
          style={{ gridTemplateColumns: `repeat(${ACTIVITY_COLUMN_COUNT}, minmax(1px, 1fr))` }}
        >
          {activity.days.map((day, index) => {
            const column = Math.floor(index / DAYS_PER_ACTIVITY_COLUMN);
            const edge = column < 4 ? "edge-start" : column > ACTIVITY_COLUMN_COUNT - 5 ? "edge-end" : "edge-middle";
            const isFuture = day.date > today;
            const isAggregateHover = mode !== "daily" && hoveredColumn === column;
            if (mode === "daily" && isFuture) return null;

            return (
              <span
                className={`activity-cell ${edge}${isAggregateHover ? " column-hover" : ""}`}
                data-level={activity.levels[mode][index]}
                key={day.date}
              >
                {mode === "daily" ? (
                  <span className="activity-tooltip">
                    {`${compactNumber(day.tokens)} tokens on ${utcDateLabel(day.date)}`}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
        {mode !== "daily" ? (
          <div
            aria-hidden="true"
            className="token-activity-column-overlay"
            style={{ gridTemplateColumns: `repeat(${ACTIVITY_COLUMN_COUNT}, minmax(1px, 1fr))` }}
          >
            {(mode === "weekly" ? activity.weekly : activity.cumulative).map((tokens, column) => {
              const weekStart = addUtcDays(activity.start, column * DAYS_PER_ACTIVITY_COLUMN);
              const edge = column < 4 ? "edge-start" : column > ACTIVITY_COLUMN_COUNT - 5 ? "edge-end" : "edge-middle";
              const tooltip = mode === "weekly"
                ? `${compactNumber(tokens)} tokens on week of ${utcDateLabel(weekStart)}`
                : `${compactNumber(tokens)} tokens through week of ${utcDateLabel(weekStart)}`;
              return (
                <span
                  className={`activity-column-hitbox ${edge}`}
                  data-activity-tokens={tokens}
                  data-week-start={weekStart}
                  key={weekStart}
                  onMouseEnter={() => setHoveredColumn(column)}
                  onMouseLeave={() => setHoveredColumn(null)}
                >
                  <span className="activity-tooltip column-tooltip">{tooltip}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="token-activity-months" style={{ gridTemplateColumns: `repeat(${ACTIVITY_COLUMN_COUNT}, minmax(1px, 1fr))` }}>
        {activity.months.map((month) => (
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
