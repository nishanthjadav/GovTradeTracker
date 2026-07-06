import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { fetchPortfolioHistory } from "../api";

const CHART_HEIGHT = 260;
const MIN_CHART_WIDTH = 480;
const RANGES = ["1D", "1M", "1Y", "ALL"];

// mirrors the alpaca portfolio chart. equity samples come from the backend
// which proxies /v2/account/portfolio/history — the chart fetches on every
// range change and on manual refresh.
export default function PnlChart({ refreshKey }) {
  const [range, setRange] = useState("1D");
  const [data, setData] = useState({ timestamps: [], equity: [], baseValue: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const wrapRef = useRef(null);
  const svgRef = useRef(null);

  // container width tracking so 1 svg unit == 1 css px (no stretched text)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      setWidth(Math.max(MIN_CHART_WIDTH, Math.round(w)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchPortfolioHistory(range)
      .then((res) => {
        if (!res) { setError(true); return; }
        setData({
          timestamps: res.timestamps || [],
          equity: res.equity || [],
          baseValue: res.baseValue ?? null,
          windowStart: res.windowStart ?? null,
          windowEnd: res.windowEnd ?? null,
        });
        setNow(Date.now());
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [range]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // filter out zero/null equity samples that alpaca returns before market open
  const points = useMemo(() => {
    const out = [];
    for (let i = 0; i < data.timestamps.length; i++) {
      const t = data.timestamps[i];
      const v = data.equity[i];
      if (!t || !Number.isFinite(v) || v <= 0) continue;
      out.push({ t, v });
    }
    return out;
  }, [data]);

  const lastValue = points.length ? points[points.length - 1].v : null;
  // baseValue is the anchor alpaca hands back — either yesterday's close (1D)
  // or start-of-period equity. use it if present so change% matches alpaca.
  const baseValue = data.baseValue ?? (points.length ? points[0].v : null);
  const periodChange = lastValue != null && baseValue != null ? lastValue - baseValue : 0;
  const periodChangePct = baseValue ? (periodChange / baseValue) * 100 : 0;
  const positive = periodChange >= 0;

  const w = width;
  const h = CHART_HEIGHT;
  const padL = 64, padR = 24, padT = 24, padB = 40;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  // x-axis spans the FULL trailing window (from backend windowStart→windowEnd),
  // not just where the data happens to fall. this way the labels correctly
  // reflect "last 24h" / "last 30d" even when samples cluster at one end
  // (market-hours only, weekend chart shows friday's session, etc.).
  const dataMinT = xs.length ? Math.min(...xs) : 0;
  const dataMaxT = xs.length ? Math.max(...xs) : 1;
  const xMin = data.windowStart ?? dataMinT;
  const xMax = data.windowEnd ?? Math.max(dataMaxT, xMin + 1);
  const yMinData = ys.length ? Math.min(...ys) : 0;
  const yMaxData = ys.length ? Math.max(...ys) : 1;
  const ySpan = Math.max(yMaxData - yMinData, 1);
  const yPad = ySpan * 0.10;
  const yMin = yMinData - yPad;
  const yMax = yMaxData + yPad;

  const xScale = (t) => padL + ((t - xMin) / (xMax - xMin)) * innerW;
  const yScale = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  // three y-ticks: min / mid / max of the actual data (matches alpaca)
  const yTickVals = points.length
    ? (yMinData === yMaxData ? [yMinData] : [yMaxData, (yMinData + yMaxData) / 2, yMinData])
    : [];
  const yMaxAbs = Math.max(Math.abs(yMinData), Math.abs(yMaxData), 1);
  const yUnit = yMaxAbs >= 1_000_000 ? 1_000_000 : yMaxAbs >= 1_000 ? 1_000 : 1;
  const rangeInUnit = Math.max(yMaxData - yMinData, 1) / yUnit;
  let axisPrecision = yUnit === 1 ? 0 : 2;
  if (rangeInUnit > 0 && rangeInUnit < 0.01) axisPrecision = 3;
  if (rangeInUnit > 0 && rangeInUnit < 0.001) axisPrecision = 4;
  const yTicks = yTickVals.map((v) => ({ v, label: fmtAxis(v, axisPrecision, yUnit) }));

  // x-axis: three evenly-spaced ticks across the trailing window.
  // labels: hour-of-day for 1D, calendar date for 1M/1Y/ALL.
  // for 1D, if a tick falls on a different calendar day than "now",
  // prefix with the weekday so the 24h wraparound is obvious
  // ("Sun 10 AM / 10 PM / Mon 10 AM" reads unambiguously).
  const xTicks = useMemo(() => {
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMax <= xMin) return [];
    const n = 3;
    const step = (xMax - xMin) / (n - 1);
    const nowDay = new Date(xMax).getDate();
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = xMin + step * i;
      let label;
      if (range === "1D") {
        const d = new Date(t);
        const showDay = d.getDate() !== nowDay;
        label = showDay ? `${fmtWeekday(t)} ${fmtTime(t)}` : fmtTime(t);
      } else {
        label = fmtDate(t, range);
      }
      out.push({
        t,
        anchor: i === 0 ? "start" : i === n - 1 ? "end" : "middle",
        label,
      });
    }
    return out;
  }, [xMin, xMax, range]);

  // smooth cardinal-spline path — alpaca chart is smoothed, not step-after.
  // area path re-uses the smooth line then drops to the bottom of the plot.
  const linePath = useMemo(() => buildSmoothPath(points, xScale, yScale), [points, w, yMin, yMax]);
  const areaPath = points.length
    ? linePath + ` L ${xScale(points[points.length - 1].t)} ${padT + innerH} L ${xScale(points[0].t)} ${padT + innerH} Z`
    : "";

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg || !points.length) return;
    const rect = svg.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    if (xPx < padL || xPx > w - padR) { setHover(null); return; }
    let best = points[0], bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(xScale(p.t) - xPx);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    setHover({ x: xScale(best.t), y: yScale(best.v), value: best.v, date: best.t });
  };

  const changeColor = positive ? "var(--color-success)" : "var(--color-danger)";
  // yellow line + faded yellow fill regardless of direction (alpaca style).
  // direction is conveyed by the change% color, not by the curve.
  const lineColor = "var(--color-warning)";

  const hasData = points.length > 0;
  const displayValue = lastValue ?? 0;

  return (
    <div className="pnl-chart-wrap" ref={wrapRef}>
      <div className="pnl-chart-header">
        <div className="pnl-chart-header-title">Your portfolio</div>
        <div className="pnl-chart-header-actions">
          <div className="pnl-chart-ranges">
            {RANGES.map((r) => (
              <button
                key={r}
                className={`pnl-chart-range${range === r ? " active" : ""}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            className={`pnl-chart-refresh${loading ? " spinning" : ""}`}
            onClick={load}
            title="Refresh"
            disabled={loading}
            aria-label="Refresh chart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="pnl-chart-values">
        <span className="pnl-chart-value-prefix">$</span>
        <span className="pnl-chart-value">
          {hasData
            ? displayValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : "—"}
        </span>
        {hasData && (
          <span className="pnl-chart-change" style={{ color: changeColor }}>
            {periodChange >= 0 ? "+" : "-"}${Math.abs(periodChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="pnl-chart-change-pct">
              &nbsp;({periodChange >= 0 ? "+" : ""}{periodChangePct.toFixed(2)}%)
            </span>
          </span>
        )}
      </div>
      <div className="pnl-chart-timestamp">{fmtTimestamp(now)}</div>

      {!hasData ? (
        <div className="pnl-chart-empty-body">
          {loading ? "Loading..." : error ? "Couldn't load portfolio history. Refresh to retry." : "Connect Alpaca to see your equity curve."}
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            className="pnl-chart-svg"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="pnlAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {yTicks.map((tick, i) => (
              <g key={i}>
                <line
                  x1={padL} x2={w - padR}
                  y1={yScale(tick.v)} y2={yScale(tick.v)}
                  stroke="var(--color-border-subtle, var(--color-border))"
                  strokeDasharray="3,4"
                  strokeWidth={0.8}
                  opacity={0.55}
                />
                <text
                  x={padL - 10} y={yScale(tick.v) + 3}
                  textAnchor="end"
                  fontSize="11"
                  fontFamily="var(--font-family-mono)"
                  fill="var(--color-text-muted)"
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {xTicks.map((tick, i) => (
              <text
                key={i}
                x={xScale(tick.t)}
                y={h - 12}
                textAnchor={tick.anchor}
                fontSize="11"
                fontFamily="var(--font-family-mono)"
                fill="var(--color-text-muted)"
              >
                {tick.label}
              </text>
            ))}

            <path d={areaPath} fill="url(#pnlAreaGradient)" stroke="none" />
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

            {hover && (
              <>
                <line
                  x1={hover.x} x2={hover.x}
                  y1={padT} y2={h - padB}
                  stroke="var(--color-text-muted)"
                  strokeDasharray="2,3"
                  strokeWidth="0.8"
                  opacity="0.7"
                />
                <circle cx={hover.x} cy={hover.y} r="4" fill={lineColor} stroke="var(--color-surface)" strokeWidth="1.5" />
              </>
            )}
          </svg>

          {hover && (
            <div
              className="pnl-chart-tooltip"
              style={{ left: `${(hover.x / w) * 100}%` }}
            >
              <div className="pnl-chart-tooltip-value">
                ${hover.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="pnl-chart-tooltip-date">
                {range === "1D" ? fmtTooltipTime(hover.date) : fmtTooltipDate(hover.date)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// smooth line via catmull-rom → cubic bezier. tension 0.5 stays near the
// samples without overshooting on volatile bars.
function buildSmoothPath(points, xScale, yScale) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const x = xScale(points[0].t), y = yScale(points[0].v);
    return `M ${x} ${y}`;
  }
  const px = points.map((p) => xScale(p.t));
  const py = points.map((p) => yScale(p.v));
  let d = `M ${px[0]} ${py[0]}`;
  for (let i = 0; i < px.length - 1; i++) {
    const x0 = i === 0 ? px[0] : px[i - 1];
    const y0 = i === 0 ? py[0] : py[i - 1];
    const x1 = px[i];
    const y1 = py[i];
    const x2 = px[i + 1];
    const y2 = py[i + 1];
    const x3 = i + 2 < px.length ? px[i + 2] : x2;
    const y3 = i + 2 < py.length ? py[i + 2] : y2;
    const cp1x = x1 + (x2 - x0) / 6;
    const cp1y = y1 + (y2 - y0) / 6;
    const cp2x = x2 - (x3 - x1) / 6;
    const cp2y = y2 - (y3 - y1) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
  }
  return d;
}

function fmtAxis(n, precision = 1, forcedUnit = null) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const unit = forcedUnit ?? (abs >= 1_000_000 ? 1_000_000 : abs >= 1_000 ? 1_000 : 1);
  const suffix = unit === 1_000_000 ? "M" : unit === 1_000 ? "k" : "";
  return `${sign}$${(abs / unit).toFixed(precision)}${suffix}`;
}

function fmtTime(t) {
  const d = new Date(t);
  let h = d.getHours();
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h} ${suffix}`;
}

function fmtWeekday(t) {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function fmtDate(t, range) {
  const d = new Date(t);
  if (range === "1Y" || range === "ALL") {
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTooltipDate(t) {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function fmtTooltipTime(t) {
  const d = new Date(t);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtTimestamp(t) {
  const d = new Date(t);
  const date = d.toLocaleDateString(undefined, { month: "long", day: "2-digit" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  const tz = tzAbbrev(d);
  return `${date}, ${time}${tz ? " " + tz : ""}`;
}

function tzAbbrev(d) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(d);
    const tz = parts.find((p) => p.type === "timeZoneName");
    return tz ? tz.value : "";
  } catch {
    return "";
  }
}
