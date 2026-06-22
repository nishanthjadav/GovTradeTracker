import { useEffect, useState, useRef, useCallback } from "react";
import "../App.css";
import "./PortfolioPage.css";
import { apiFetch } from "../api";

function initials(name) {
  if (!name) return "??";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}

function avatarBg(party) {
  if (!party) return { bg: "var(--color-bg-tertiary)", color: "var(--color-text-muted)" };
  if (party.toLowerCase().includes("republican")) return { bg: "var(--color-danger-bg)", color: "var(--color-danger)" };
  if (party.toLowerCase().includes("democrat")) return { bg: "#dbeafe", color: "#3b82f6" };
  return { bg: "var(--color-bg-tertiary)", color: "var(--color-text-muted)" };
}

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function PortfolioPage({ refreshKey, onBack, politicians = [], copyConfigs: externalCopyConfigs, onRemoveCopyConfig, onUpdateCopyConfig }) {
  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [sliderValues, setSliderValues] = useState({});

  const copying = externalCopyConfigs ?? [];

  useEffect(() => {
    apiFetch(`/portfolio`)
      .then(r => r.json())
      .then((data) => {
        setSummary(data.summary || null);
        setTrades(data.trades || []);
      })
      .catch(() => {});
  }, [refreshKey]);

  // Sync slider values when configs arrive or change
  useEffect(() => {
    setSliderValues(prev => {
      const next = { ...prev };
      for (const c of copying) {
        if (next[c.id] == null) next[c.id] = Number(c.portfolioPercent ?? 5);
      }
      return next;
    });
  }, [copying]);

  const enrichedCopying = (() => {
    const isReal = (c) => typeof c.id === "number";
    const seen = new Map();
    for (const c of copying) {
      const prev = seen.get(c.politicianId);
      if (!prev) {
        seen.set(c.politicianId, c);
      } else if (isReal(c) && !isReal(prev)) {
        seen.set(c.politicianId, c);
      } else if (isReal(c) && isReal(prev) && c.id > prev.id) {
        seen.set(c.politicianId, c);
      }
    }
    return Array.from(seen.values()).map((c) => {
      const pol = politicians.find((p) => p.id === c.politicianId);
      return { ...c, politician: pol };
    });
  })();

  const totalAllocated = enrichedCopying.reduce(
    (sum, c) => sum + (sliderValues[c.id] ?? Number(c.portfolioPercent ?? 5)), 0
  );
  const remaining = Math.max(0, 100 - totalAllocated);
  const isOverBudget = totalAllocated > 100;

  const onUpdateRef = useRef(onUpdateCopyConfig);
  useEffect(() => { onUpdateRef.current = onUpdateCopyConfig; }, [onUpdateCopyConfig]);

  const patchPercent = useDebouncedCallback(async (configId, val) => {
    await apiFetch(`/copy-configs/${configId}`, {
      method: 'PATCH',
      body: JSON.stringify({ portfolioPercent: val })
    }).catch(() => {});
    onUpdateRef.current?.({ id: configId, portfolioPercent: val });
  }, 400);

  const handleSliderChange = (config, rawVal) => {
    const val = Number(rawVal);
    const currentVal = sliderValues[config.id] ?? Number(config.portfolioPercent ?? 5);
    const maxAllowed = Math.min(100, currentVal + remaining);
    const clamped = Math.min(val, maxAllowed);
    setSliderValues(prev => ({ ...prev, [config.id]: clamped }));
    patchPercent(config.id, clamped);
  };

  const handleToggleActive = async (config) => {
    const newActive = !config.active;
    await apiFetch(`/copy-configs/${config.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: newActive })
    }).catch(() => {});
    onUpdateCopyConfig?.({ id: config.id, active: newActive });
  };

  const handleRemove = async (config) => {
    await apiFetch(`/copy-configs/${config.id}`, { method: 'DELETE' }).catch(() => {});
    onRemoveCopyConfig?.(config.id);
  };

  const returnColor = (val) =>
    val == null ? "var(--color-text-muted)" : val >= 0 ? "var(--color-success)" : "var(--color-danger)";

  return (
    <div className="portfolio-page">
      <div className="content-header">
        <div className="portfolio-header-row">
          <div>
            <div className="content-title">My Portfolio</div>
            <div className="content-sub">Copied politicians and auto-executed trades</div>
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Invested</div>
          <div className="stat-val" style={{ color: "var(--color-text-primary)" }}>
            {summary?.totalInvested != null ? `$${Number(summary.totalInvested).toLocaleString()}` : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Current Value</div>
          <div className="stat-val" style={{ color: "var(--color-text-primary)" }}>
            {summary?.totalCurrentValue != null ? `$${Number(summary.totalCurrentValue).toLocaleString()}` : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overall Return</div>
          <div className="stat-val" style={{ color: returnColor(summary?.overallReturnPercent) }}>
            {summary?.overallReturnPercent != null
              ? `${summary.overallReturnPercent >= 0 ? "+" : ""}${summary.overallReturnPercent.toFixed(2)}%`
              : "—"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Best Politician</div>
          <div className="stat-val" style={{ fontSize: "var(--font-size-md)", color: "var(--color-success)" }}>
            {summary?.bestPolitician ?? "—"}
          </div>
          <div className="stat-label" style={{ marginTop: 4 }}>Best Trade</div>
          <div style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-sm)", color: "var(--color-success)" }}>
            {summary?.bestTradeTicker ?? "—"}
          </div>
        </div>
      </div>

      {/* Copying section */}
      <div className="portfolio-section">

        {enrichedCopying.length > 0 && (
          <div className="allocation-budget">
            <div className="allocation-budget-header">
              <span className="allocation-budget-label">Portfolio Allocation</span>
              <span className={`allocation-budget-total${isOverBudget ? " over" : totalAllocated >= 95 ? " near" : ""}`}>
                {totalAllocated.toFixed(1)}% <span className="allocation-budget-of">of 100%</span>
              </span>
            </div>
            <div className="allocation-bar-track">
              {enrichedCopying.map((c) => {
                const pct = sliderValues[c.id] ?? Number(c.portfolioPercent ?? 5);
                const av = avatarBg(c.politician?.party ?? c.party);
                return (
                  <div
                    key={c.politicianId}
                    className={`allocation-bar-segment${!c.active ? " paused" : ""}`}
                    style={{ width: `${pct}%`, background: av.color }}
                    title={`${c.politicianName}: ${pct.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <div className="allocation-budget-legend">
              {enrichedCopying.map((c) => {
                const pct = sliderValues[c.id] ?? Number(c.portfolioPercent ?? 5);
                const av = avatarBg(c.politician?.party ?? c.party);
                return (
                  <div key={c.politicianId} className="allocation-legend-item">
                    <span className="allocation-legend-dot" style={{ background: av.color }} />
                    <span className="allocation-legend-name">{c.politicianName?.split(" ").pop()}</span>
                    <span className="allocation-legend-pct">{pct.toFixed(1)}%</span>
                  </div>
                );
              })}
              {!isOverBudget && remaining > 0.05 && (
                <div className="allocation-legend-item muted">
                  <span className="allocation-legend-dot" style={{ background: "var(--color-border)" }} />
                  <span className="allocation-legend-name">Unallocated</span>
                  <span className="allocation-legend-pct">{remaining.toFixed(1)}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        {enrichedCopying.length === 0 ? (
          <div className="empty">
            You're not copying anyone yet.
          </div>
        ) : (
          <div className="copying-grid">
            {enrichedCopying.map(c => {
              const av = avatarBg(c.politician?.party ?? c.party);
              const sliderVal = sliderValues[c.id] ?? Number(c.portfolioPercent ?? 5);
              const maxAllowed = Math.min(100, sliderVal + remaining);
              return (
                <div key={c.politicianId} className={`copy-card${c.active ? "" : " copy-card--paused"}`}>
                  <div className="copy-card-top">
                    <div className="copy-card-avatar" style={{ background: av.bg, color: av.color }}>
                      {initials(c.politicianName || c.politician?.name || c.politicianId)}
                    </div>
                    <div className="copy-card-info">
                      <div className="copy-card-name">{c.politicianName || c.politician?.name || c.politicianId}</div>
                      <div className="copy-card-meta">
                        {c.politician?.party?.replace("Republican", "R").replace("Democrat", "D")}
                        {c.politician?.chamber ? ` · ${c.politician.chamber}` : ""}
                        {c.politician?.state ? ` · ${c.politician.state}` : ""}
                      </div>
                    </div>
                    <button className="copy-card-remove" onClick={() => handleRemove(c)} title="Remove">✕</button>
                  </div>

                  <div className="copy-card-slider-section">
                    <div className="copy-slider-header">
                      <span className="copy-slider-label">Allocation</span>
                      <span className="copy-slider-value">{sliderVal.toFixed(1)}%</span>
                    </div>
                    <input
                      type="range"
                      className="copy-slider"
                      min={1}
                      max={maxAllowed}
                      step={0.5}
                      value={sliderVal}
                      onChange={e => handleSliderChange(c, e.target.value)}
                      style={{
                        "--slider-pct": `${((sliderVal - 1) / (maxAllowed - 1)) * 100}%`,
                        "--slider-color": av.color
                      }}
                    />
                    <div className="copy-slider-ticks">
                      <span>1%</span>
                      <span>{Math.round(maxAllowed / 2)}%</span>
                      <span>{Math.round(maxAllowed)}%</span>
                    </div>
                  </div>

                  <div className="copy-card-footer">
                    <button
                      className={`copy-toggle-btn${c.active ? " active" : ""}`}
                      onClick={() => handleToggleActive(c)}
                    >
                      {c.active ? "⏸ Pause" : "▶ Resume"}
                    </button>
                    <span className={`copy-status-badge${c.active ? " active" : " paused"}`}>
                      {c.active ? "Active" : "Paused"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Trade History */}
      <div className="portfolio-section">
        <div className="portfolio-section-title">Trade History</div>
        {trades.length === 0 ? (
          <div className="empty">
            No trades executed yet. Trades will appear here once a copied politician files a new disclosure.
          </div>
        ) : (
          <div className="portfolio-table-wrap">
            <div className="portfolio-table-header">
              <div>Politician</div>
              <div>Ticker</div>
              <div>Side</div>
              <div>Invested</div>
              <div>Fill Price</div>
              <div>Current</div>
              <div>P&amp;L</div>
              <div>Date</div>
              <div>Status</div>
            </div>
            {trades.map(t => (
              <div key={t.id} className="portfolio-table-row">
                <div>
                  <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                    {t.politicianName || t.politicianId}
                  </div>
                </div>
                <div><span className="ticker-badge">{t.ticker || "—"}</span></div>
                <div>
                  <span className={`type-badge ${t.side === "buy" ? "buy-badge" : "sell-badge"}`}>{t.side}</span>
                </div>
                <div className="size-cell">
                  {t.amountInvested != null ? `$${Number(t.amountInvested).toLocaleString()}` : "—"}
                </div>
                <div className="size-cell">
                  {t.fillPrice != null ? `$${Number(t.fillPrice).toFixed(2)}` : "—"}
                </div>
                <div className="size-cell">
                  {t.currentPrice != null ? `$${Number(t.currentPrice).toFixed(2)}` : "—"}
                </div>
                <div style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-xs)" }}>
                  {t.pnl != null ? (
                    <span style={{ color: returnColor(t.pnl) }}>
                      {t.pnl >= 0 ? "+" : ""}${Number(t.pnl).toFixed(2)}
                      {t.pnlPercent != null && (
                        <span style={{ marginLeft: 4, opacity: 0.8 }}>
                          ({t.pnlPercent >= 0 ? "+" : ""}{Number(t.pnlPercent).toFixed(1)}%)
                        </span>
                      )}
                    </span>
                  ) : "—"}
                </div>
                <div className="date-cell">
                  {t.executedAt ? new Date(t.executedAt).toLocaleDateString() : "—"}
                </div>
                <div>
                  <span className={`portfolio-status-badge status-${t.status}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
