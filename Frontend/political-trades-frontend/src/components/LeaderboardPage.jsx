import { useMemo, useState } from "react";
import { fmtSize } from "../utils/tradeHelpers";

function initials(name) {
  if (!name) return "??";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

function avatarBg(party) {
  if (!party) return { bg: "#f1f5f9", color: "#94a3b8" };
  if (party.toLowerCase().includes("republican")) return { bg: "#fee2e2", color: "#dc2626" };
  if (party.toLowerCase().includes("democrat")) return { bg: "#dbeafe", color: "#3b82f6" };
  return { bg: "#f1f5f9", color: "#94a3b8" };
}

const METRICS = [
  { value: "active",    label: "Most Active" },
  { value: "size",      label: "Biggest Trader" },
  { value: "anomalous", label: "Most Anomalous" },
  { value: "copied",    label: "Most Copied" },
  { value: "bullish",   label: "Most Bullish" },
];

const METRIC_SUBTITLES = {
  active:    "Politicians ranked by number of trades disclosed recently",
  size:      "Politicians ranked by total disclosed trade volume",
  anomalous: "Politicians ranked by their highest individual trade anomaly score",
  copied:    "Politicians most copied across all users",
  bullish:   "Politicians with the highest buy-to-sell ratio (min. 5 trades)",
};

const MIN_TRADES_FOR_BULLISH = 5;
const TOP_N = 50;

export default function LeaderboardPage({
  politicians,
  trades,
  copyConfigs,
  onSelectPolitician,
  onBack,
}) {
  const [metric, setMetric] = useState("active");
  const [partyFilter, setPartyFilter] = useState("all");
  const [chamberFilter, setChamberFilter] = useState("all");

  const ranked = useMemo(() => {
    const polById = new Map(politicians.map((p) => [p.id, p]));

    const stats = new Map();
    for (const t of trades) {
      if (!t.politicianId) continue;
      let s = stats.get(t.politicianId);
      if (!s) {
        s = { count: 0, buys: 0, sells: 0, totalSize: 0, maxSize: 0, maxAnomalyScore: 0 };
        stats.set(t.politicianId, s);
      }
      s.count += 1;
      const type = t.tradeType?.toLowerCase();
      if (type === "buy") s.buys += 1;
      else if (type === "sell") s.sells += 1;

      const size = t.sizeMin ?? 0;
      if (size > 0 && size < 1e15) {
        s.totalSize += size;
        if (size > s.maxSize) s.maxSize = size;
      }

      const score = t.anomalyScore != null ? Number(t.anomalyScore) : 0;
      if (score > s.maxAnomalyScore) s.maxAnomalyScore = score;
    }

    const copyCounts = new Map();
    for (const c of copyConfigs || []) {
      copyCounts.set(c.politicianId, (copyCounts.get(c.politicianId) || 0) + 1);
    }

    const rows = politicians
      .filter((p) => {
        if (partyFilter !== "all" && !p.party?.toLowerCase().includes(partyFilter)) return false;
        if (chamberFilter !== "all" && p.chamber?.toLowerCase() !== chamberFilter) return false;
        return true;
      })
      .map((p) => {
        const s = stats.get(p.id) || { count: 0, buys: 0, sells: 0, totalSize: 0, maxSize: 0, maxAnomalyScore: 0 };
        const decided = s.buys + s.sells;
        const bullishRatio = decided > 0 ? s.buys / decided : 0;
        return {
          politician: p,
          count: s.count,
          buys: s.buys,
          sells: s.sells,
          totalSize: s.totalSize,
          maxSize: s.maxSize,
          maxAnomalyScore: s.maxAnomalyScore,
          copied: copyCounts.get(p.id) || 0,
          bullishRatio,
          decided,
        };
      });

    let sorted;
    if (metric === "active") {
      sorted = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
    } else if (metric === "size") {
      sorted = rows.filter((r) => r.totalSize > 0).sort((a, b) => b.totalSize - a.totalSize);
    } else if (metric === "anomalous") {
      sorted = rows.filter((r) => r.maxAnomalyScore > 0).sort((a, b) => b.maxAnomalyScore - a.maxAnomalyScore);
    } else if (metric === "copied") {
      sorted = rows.filter((r) => r.copied > 0).sort((a, b) => b.copied - a.copied);
    } else {
      sorted = rows
        .filter((r) => r.decided >= MIN_TRADES_FOR_BULLISH)
        .sort((a, b) => b.bullishRatio - a.bullishRatio || b.decided - a.decided);
    }

    return sorted.slice(0, TOP_N);
  }, [politicians, trades, copyConfigs, metric, partyFilter, chamberFilter]);

  const fmtMetric = (row) => {
    if (metric === "active")    return `${row.count} trades`;
    if (metric === "size")      return fmtSize(row.totalSize, row.totalSize);
    if (metric === "anomalous") return `${Math.round(row.maxAnomalyScore * 100)}th pct`;
    if (metric === "copied")    return `${row.copied} ${row.copied === 1 ? "user" : "users"}`;
    return `${Math.round(row.bullishRatio * 100)}% buys`;
  };

  const cols = "48px minmax(180px,1fr) 70px 90px 110px 120px";

  return (
    <>
      <div className="content-header">
        <div className="content-title">Leaderboard</div>
        <div className="content-sub">{METRIC_SUBTITLES[metric]}</div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Metric</label>
          <div className="filter-pills">
            {METRICS.map((m) => (
              <button
                key={m.value}
                className={`filter-pill ${metric === m.value ? "active" : ""}`}
                onClick={() => setMetric(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Party</label>
          <div className="filter-pills">
            <button className={`filter-pill ${partyFilter === "all" ? "active" : ""}`} onClick={() => setPartyFilter("all")}>All</button>
            <button className={`filter-pill dem ${partyFilter === "democrat" ? "active" : ""}`} onClick={() => setPartyFilter("democrat")}>Dem</button>
            <button className={`filter-pill rep ${partyFilter === "republican" ? "active" : ""}`} onClick={() => setPartyFilter("republican")}>Rep</button>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Chamber</label>
          <div className="filter-pills">
            <button className={`filter-pill ${chamberFilter === "all" ? "active" : ""}`} onClick={() => setChamberFilter("all")}>All</button>
            <button className={`filter-pill ${chamberFilter === "house" ? "active" : ""}`} onClick={() => setChamberFilter("house")}>House</button>
            <button className={`filter-pill ${chamberFilter === "senate" ? "active" : ""}`} onClick={() => setChamberFilter("senate")}>Senate</button>
          </div>
        </div>
      </div>

      <div className="trades-table-scroll">
        <div className="trades-table" style={{ minWidth: 600 }}>
          <div className="table-header" style={{ gridTemplateColumns: cols }}>
            <div>#</div>
            <div>Politician</div>
            <div>Trades</div>
            <div>Buy / Sell</div>
            <div>Largest Trade</div>
            <div style={{ textAlign: "right" }}>
              {METRICS.find((m) => m.value === metric)?.label}
            </div>
          </div>

          {ranked.length === 0 ? (
            <div className="empty">No politicians match the current filters.</div>
          ) : (
            ranked.map((row, i) => {
              const p = row.politician;
              const av = avatarBg(p.party);
              return (
                <div
                  key={p.id}
                  className="table-row"
                  style={{ gridTemplateColumns: cols }}
                  onClick={() => onSelectPolitician?.(p.id)}
                >
                  <div className="pol-rank">{i + 1}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div className="pol-avatar" style={{ background: av.bg, color: av.color, flexShrink: 0 }}>
                      {initials(p.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="pol-name">{p.name}</div>
                      <div className="pol-meta">
                        {p.party?.replace("Republican", "R").replace("Democrat", "D")}
                        {p.chamber ? ` · ${p.chamber}` : ""}
                        {p.state ? ` · ${p.state}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="size-cell">{row.count}</div>
                  <div className="leaderboard-buysell">
                    <span className="buy-text">{row.buys}B</span>
                    <span className="leaderboard-buysell-sep">/</span>
                    <span className="sell-text">{row.sells}S</span>
                  </div>
                  <div className="size-cell">
                    {row.maxSize > 0 ? fmtSize(row.maxSize, row.maxSize) : "—"}
                  </div>
                  <div className="size-cell" style={{ textAlign: "right" }}>
                    {fmtMetric(row)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
