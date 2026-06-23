import { useMemo, useState, useRef } from "react";

/**
 * Net P/L chart — Robinhood / Fidelity style.
 *
 * Data model: each trade row from /portfolio carries:
 *   - amountInvested, fillPrice, currentPrice (snapshot now)
 *   - executedAt (ISO datetime)
 *
 * We construct a step-wise series of "cumulative net P/L" at each trade's
 * execution date. Between executions, the line stays flat at the most recent
 * realized value (since we only have today's price snapshot — we can't
 * reconstruct historical mark-to-market without a price-history feed).
 *
 * Each point: x = executedAt date, y = sum of (current - fill) * shares for
 * all buys executed at-or-before that point. A final point at "today" extends
 * the line to the right edge so the most recent state is visible.
 */
export default function PnlChart({ trades = [] }) {
  const [range, setRange] = useState("ALL"); // "1W" | "1M" | "3M" | "1Y" | "ALL"
  const [hover, setHover] = useState(null); // { x, y, value, date } in user units
  const svgRef = useRef(null);

  const allPoints = useMemo(() => buildPoints(trades), [trades]);
  const points = useMemo(() => filterByRange(allPoints, range), [allPoints, range]);

  if (allPoints.length === 0) {
    return (
      <div className="pnl-chart-empty">
        No trade data yet — your P/L chart will appear here once trades are executed.
      </div>
    );
  }

  const w = 800;
  const h = 240;
  const padL = 56, padR = 16, padT = 18, padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs, xMin + 1); // avoid div by zero
  // Pad y range a bit so the line never hugs the edge
  const rawYMin = Math.min(...ys, 0);
  const rawYMax = Math.max(...ys, 0);
  const ySpan = Math.max(rawYMax - rawYMin, 1);
  const yPad = ySpan * 0.12;
  const yMin = rawYMin - yPad;
  const yMax = rawYMax + yPad;

  const xScale = (t) => padL + ((t - xMin) / (xMax - xMin)) * innerW;
  const yScale = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const zeroY = yScale(0);

  // Build step-after path: hold then jump (mimics realized P/L stepping at each trade)
  const linePath = buildStepPath(points, xScale, yScale);
  const areaPath = linePath
    + ` L ${xScale(points[points.length - 1].t)} ${zeroY}`
    + ` L ${xScale(points[0].t)} ${zeroY} Z`;

  const lastValue = points[points.length - 1].v;
  const firstValue = points[0].v;
  const periodChange = lastValue - firstValue;
  const positive = lastValue >= 0;
  const periodPositive = periodChange >= 0;

  const lineColor = positive ? "var(--color-success)" : "var(--color-danger)";
  const areaColor = positive ? "var(--color-success)" : "var(--color-danger)";

  // Y-axis tick labels
  const yTicks = niceTicks(yMin, yMax, 4);

  const handleMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = w / rect.width;
    const xPx = (e.clientX - rect.left) * scaleX;
    if (xPx < padL || xPx > w - padR) {
      setHover(null);
      return;
    }
    // Find nearest point
    let best = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(xScale(p.t) - xPx);
      if (d < bestDist) { bestDist = d; best = p; }
    }
    setHover({
      x: xScale(best.t),
      y: yScale(best.v),
      value: best.v,
      date: best.t,
    });
  };

  return (
    <div className="pnl-chart-wrap">
      <div className="pnl-chart-header">
        <div className="pnl-chart-values">
          <div className="pnl-chart-current" style={{ color: positive ? "var(--color-success)" : "var(--color-danger)" }}>
            {lastValue >= 0 ? "+" : "-"}${Math.abs(lastValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="pnl-chart-change" style={{ color: periodPositive ? "var(--color-success)" : "var(--color-danger)" }}>
            {periodChange >= 0 ? "▲" : "▼"} ${Math.abs(periodChange).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span className="pnl-chart-change-period"> ({rangeLabel(range)})</span>
          </div>
        </div>
        <div className="pnl-chart-ranges">
          {["1W","1M","3M","1Y","ALL"].map(r => (
            <button
              key={r}
              className={`pnl-chart-range${range === r ? " active" : ""}`}
              onClick={() => setRange(r)}
            >{r}</button>
          ))}
        </div>
      </div>

      <svg
        ref={svgRef}
        className="pnl-chart-svg"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="pnlAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaColor} stopOpacity="0.30" />
            <stop offset="100%" stopColor={areaColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y gridlines + labels */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL} x2={w - padR}
              y1={yScale(t)} y2={yScale(t)}
              stroke="var(--color-border-subtle, var(--color-border))"
              strokeDasharray={t === 0 ? "0" : "2,3"}
              strokeWidth={t === 0 ? 1 : 0.6}
              opacity={t === 0 ? 0.7 : 0.5}
            />
            <text
              x={padL - 8} y={yScale(t) + 3}
              textAnchor="end"
              fontSize="10"
              fontFamily="var(--font-family-mono)"
              fill="var(--color-text-muted)"
            >
              {fmtAxis(t)}
            </text>
          </g>
        ))}

        {/* X axis labels (first, middle, last) */}
        {[points[0], points[Math.floor(points.length / 2)], points[points.length - 1]].map((p, i) => (
          <text
            key={i}
            x={xScale(p.t)}
            y={h - 8}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            fontSize="10"
            fontFamily="var(--font-family-mono)"
            fill="var(--color-text-muted)"
          >
            {fmtDate(p.t)}
          </text>
        ))}

        {/* Area + line */}
        <path d={areaPath} fill="url(#pnlAreaGradient)" stroke="none" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />

        {/* Hover crosshair */}
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
          style={{
            left: `${(hover.x / w) * 100}%`,
          }}
        >
          <div className="pnl-chart-tooltip-value" style={{ color: hover.value >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
            {hover.value >= 0 ? "+" : "-"}${Math.abs(hover.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="pnl-chart-tooltip-date">{fmtTooltipDate(hover.date)}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Build cumulative P/L points from executed trades.
 * - Each trade contributes (current - fill) * (amountInvested / fill) for buys.
 * - For sells, we treat amountInvested as the qty sold and skip from P/L
 *   contribution since the realized P/L was already booked when the position
 *   moved. (Approximation — without lot tracking we can't reconstruct exact
 *   realized P/L; this matches the existing /portfolio summary behavior.)
 *
 * Sorts by executedAt ascending, accumulates step-wise. Adds a synthetic
 * "now" point at the end to extend the line to today.
 */
function buildPoints(trades) {
  if (!trades || trades.length === 0) return [];

  const valid = trades
    .filter((t) => t.executedAt && t.side === "buy" && t.fillPrice != null && t.currentPrice != null && Number(t.fillPrice) > 0)
    .map((t) => {
      const fill = Number(t.fillPrice);
      const cur = Number(t.currentPrice);
      const amt = Number(t.amountInvested);
      const shares = amt / fill;
      const pnl = (cur - fill) * shares;
      return {
        t: new Date(t.executedAt).getTime(),
        pnl,
      };
    })
    .sort((a, b) => a.t - b.t);

  if (valid.length === 0) return [];

  let cum = 0;
  const out = [];
  // Start with a baseline 0 just before the first trade, so the area
  // visually rises from zero rather than starting at the first P/L value.
  const firstT = valid[0].t;
  out.push({ t: Math.max(firstT - 24 * 3600 * 1000, firstT - 60 * 1000), v: 0 });

  for (const p of valid) {
    cum += p.pnl;
    out.push({ t: p.t, v: cum });
  }
  // Extend to "now"
  const nowT = Date.now();
  if (nowT > out[out.length - 1].t) {
    out.push({ t: nowT, v: cum });
  }
  return out;
}

function filterByRange(points, range) {
  if (!points || points.length === 0) return points;
  if (range === "ALL") return points;
  const now = Date.now();
  const days = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365 }[range] ?? null;
  if (!days) return points;
  const cutoff = now - days * 24 * 3600 * 1000;
  const inRange = points.filter((p) => p.t >= cutoff);
  if (inRange.length < 2) {
    // Synthesize a starting baseline at cutoff using the most recent prior cumulative value
    let baseline = 0;
    for (const p of points) {
      if (p.t < cutoff) baseline = p.v;
      else break;
    }
    return [{ t: cutoff, v: baseline }, ...inRange.length > 0 ? inRange : [{ t: now, v: baseline }]];
  }
  return inRange;
}

function buildStepPath(points, xScale, yScale) {
  if (points.length === 0) return "";
  let d = `M ${xScale(points[0].t)} ${yScale(points[0].v)}`;
  for (let i = 1; i < points.length; i++) {
    const x = xScale(points[i].t);
    const y = yScale(points[i].v);
    const prevY = yScale(points[i - 1].v);
    // Step-after style: hold prev value then jump vertically at new x
    d += ` L ${x} ${prevY} L ${x} ${y}`;
  }
  return d;
}

function fmtAxis(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${n < 0 ? "-" : ""}$${(abs / 1_000).toFixed(1)}K`;
  return `${n < 0 ? "-" : ""}$${abs.toFixed(0)}`;
}

function fmtDate(t) {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtTooltipDate(t) {
  const d = new Date(t);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function rangeLabel(r) {
  return { "1W": "1 week", "1M": "1 month", "3M": "3 months", "1Y": "1 year", "ALL": "all time" }[r] ?? r;
}

function niceTicks(min, max, count) {
  if (min === max) return [min];
  const span = max - min;
  const step = niceStep(span / count);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max; v += step) {
    ticks.push(Number(v.toFixed(8)));
  }
  // Always include zero if it's in range
  if (min < 0 && max > 0 && !ticks.includes(0)) {
    ticks.push(0);
    ticks.sort((a, b) => a - b);
  }
  return ticks;
}

function niceStep(rough) {
  if (rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = Math.pow(10, exp);
  const norm = rough / base;
  let nice;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return nice * base;
}
