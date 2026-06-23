import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import "../App.css";
import "./PortfolioPage.css";
import { apiFetch } from "../api";
import Pagination from "./Pagination";
import PnlChart from "./PnlChart";

const PAGE_SIZE = 25;

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

function isDemocrat(party) {
  return !!party && party.toLowerCase().includes("democrat");
}

function isRepublican(party) {
  return !!party && party.toLowerCase().includes("republican");
}

function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function PortfolioPage({
  refreshKey,
  onBack,
  politicians = [],
  copyConfigs: externalCopyConfigs,
  onSelectPolitician,
  onRemoveCopyConfig,
  onUpdateCopyConfig,
}) {
  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [sliderValues, setSliderValues] = useState({});
  const [maxFiledDaysValues, setMaxFiledDaysValues] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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

  // Sync slider + maxFiledDays values when configs arrive or change
  useEffect(() => {
    setSliderValues(prev => {
      const next = { ...prev };
      for (const c of copying) {
        if (next[c.id] == null) next[c.id] = Number(c.portfolioPercent ?? 5);
      }
      return next;
    });
    setMaxFiledDaysValues(prev => {
      const next = { ...prev };
      for (const c of copying) {
        if (next[c.id] === undefined) {
          next[c.id] = c.maxFiledDays == null ? "" : String(c.maxFiledDays);
        }
      }
      return next;
    });
  }, [copying]);

  const enrichedCopying = useMemo(() => {
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
  }, [copying, politicians]);

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

  const patchMaxFiledDays = useDebouncedCallback(async (configId, val) => {
    await apiFetch(`/copy-configs/${configId}`, {
      method: 'PATCH',
      body: JSON.stringify({ maxFiledDays: val })
    }).catch(() => {});
    onUpdateRef.current?.({ id: configId, maxFiledDays: val });
  }, 500);

  const handleSliderChange = (config, rawVal) => {
    const val = Number(rawVal);
    const currentVal = sliderValues[config.id] ?? Number(config.portfolioPercent ?? 5);
    const maxAllowed = Math.min(100, currentVal + remaining);
    const clamped = Math.min(val, maxAllowed);
    setSliderValues(prev => ({ ...prev, [config.id]: clamped }));
    patchPercent(config.id, clamped);
  };

  const handleMaxFiledDaysChange = (config, rawVal) => {
    // Allow empty string to clear the cap
    if (rawVal === "" || rawVal == null) {
      setMaxFiledDaysValues(prev => ({ ...prev, [config.id]: "" }));
      patchMaxFiledDays(config.id, null);
      return;
    }
    const n = Math.max(1, Math.min(365, parseInt(rawVal, 10) || 0));
    if (!n) {
      setMaxFiledDaysValues(prev => ({ ...prev, [config.id]: "" }));
      patchMaxFiledDays(config.id, null);
      return;
    }
    setMaxFiledDaysValues(prev => ({ ...prev, [config.id]: String(n) }));
    patchMaxFiledDays(config.id, n);
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

  const handleClearHistory = async () => {
    setClearing(true);
    try {
      const r = await apiFetch(`/portfolio/executed-trades`, { method: 'DELETE' });
      if (r.ok) {
        setTrades([]);
        setSummary((s) => s ? { ...s, totalInvested: 0, totalCurrentValue: 0, overallReturnPercent: 0, bestPolitician: null, bestTradeTicker: null } : null);
      }
    } catch {
      // noop
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  // ---- Default allocation profiles ----
  const applyProfile = async (profile) => {
    if (enrichedCopying.length === 0) return;
    const updates = computeProfileAllocations(enrichedCopying, profile);
    setSliderValues((prev) => {
      const next = { ...prev };
      for (const { id, percent } of updates) next[id] = percent;
      return next;
    });
    // Fire patches in parallel; backend tolerates rapid PATCHes
    await Promise.all(updates.map(({ id, percent }) =>
      apiFetch(`/copy-configs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ portfolioPercent: percent })
      }).catch(() => {})
    ));
    for (const { id, percent } of updates) {
      onUpdateRef.current?.({ id, portfolioPercent: percent });
    }
  };

  const returnColor = (val) =>
    val == null ? "var(--color-text-muted)" : val >= 0 ? "var(--color-success)" : "var(--color-danger)";

  const handlePolClick = (politicianId) => {
    if (onSelectPolitician && politicianId) onSelectPolitician(politicianId);
  };

  // ---- Trade history pagination ----
  const pageCount = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const paginatedTrades = useMemo(
    () => trades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [trades, currentPage]
  );
  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

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

      {/* P/L Chart */}
      <div className="portfolio-section">
        <div className="portfolio-section-title">Net Profit / Loss</div>
        <PnlChart trades={trades} />
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

            {/* Default allocation profiles */}
            <div className="allocation-profiles">
              <span className="allocation-profiles-label">Quick allocate:</span>
              <button className="allocation-profile-btn" onClick={() => applyProfile("even")}>
                Even distribution
              </button>
              <button className="allocation-profile-btn" onClick={() => applyProfile("dem75")}>
                75% Dem / 25% Rep
              </button>
              <button className="allocation-profile-btn" onClick={() => applyProfile("rep75")}>
                75% Rep / 25% Dem
              </button>
              <button className="allocation-profile-btn" onClick={() => applyProfile("demOnly")}>
                Democrats only
              </button>
              <button className="allocation-profile-btn" onClick={() => applyProfile("repOnly")}>
                Republicans only
              </button>
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
              const mfdRaw = maxFiledDaysValues[c.id];
              const mfdDisplay = mfdRaw === undefined ? (c.maxFiledDays == null ? "" : String(c.maxFiledDays)) : mfdRaw;
              return (
                <div key={c.politicianId} className={`copy-card${c.active ? "" : " copy-card--paused"}`}>
                  <div className="copy-card-top">
                    <div
                      className="copy-card-avatar copy-card-avatar--clickable"
                      style={{ background: av.bg, color: av.color }}
                      onClick={() => handlePolClick(c.politicianId)}
                      title="View trading history"
                    >
                      {initials(c.politicianName || c.politician?.name || c.politicianId)}
                    </div>
                    <div className="copy-card-info">
                      <div
                        className="copy-card-name copy-card-name--clickable"
                        onClick={() => handlePolClick(c.politicianId)}
                        title="View trading history"
                      >
                        {c.politicianName || c.politician?.name || c.politicianId}
                      </div>
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

                  {/* Max Filed Days control */}
                  <div className="copy-card-mfd-section">
                    <label className="copy-mfd-label" htmlFor={`mfd-${c.id}`}>
                      Max filed days
                      <span className="copy-mfd-hint" title="Only copy trades filed within this many days of being made. Leave blank for no limit.">ⓘ</span>
                    </label>
                    <div className="copy-mfd-input-wrap">
                      <input
                        id={`mfd-${c.id}`}
                        type="number"
                        min={1}
                        max={365}
                        placeholder="No limit"
                        className="copy-mfd-input"
                        value={mfdDisplay}
                        onChange={(e) => handleMaxFiledDaysChange(c, e.target.value)}
                      />
                      <span className="copy-mfd-unit">days</span>
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
        <div className="portfolio-section-title-row">
          <div className="portfolio-section-title">Trade History</div>
          {trades.length > 0 && (
            <button
              className="portfolio-clear-btn"
              onClick={() => setShowClearConfirm(true)}
              disabled={clearing}
              title="Delete all executed trade history"
            >
              Clear Trading History
            </button>
          )}
        </div>
        {trades.length === 0 ? (
          <div className="empty">
            No trades executed yet. Trades will appear here once a copied politician files a new disclosure.
          </div>
        ) : (
          <>
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
              {paginatedTrades.map(t => (
                <div key={t.id} className="portfolio-table-row">
                  <div>
                    <div
                      className="portfolio-pol-name"
                      onClick={() => handlePolClick(t.politicianId)}
                      title="View trading history"
                    >
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
            <Pagination
              currentPage={currentPage}
              totalPages={pageCount}
              pageSize={PAGE_SIZE}
              totalResults={trades.length}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {/* Confirm clear history modal */}
      {showClearConfirm && (
        <div className="portfolio-modal-overlay" onClick={() => !clearing && setShowClearConfirm(false)}>
          <div className="portfolio-modal" onClick={(e) => e.stopPropagation()}>
            <div className="portfolio-modal-title">Clear trading history?</div>
            <div className="portfolio-modal-body">
              This will permanently delete all {trades.length} executed trades from your portfolio. This cannot be undone.
              <br /><br />
              Your copy configurations and Alpaca positions will not be affected.
            </div>
            <div className="portfolio-modal-actions">
              <button
                className="portfolio-modal-btn"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                className="portfolio-modal-btn portfolio-modal-btn--danger"
                onClick={handleClearHistory}
                disabled={clearing}
              >
                {clearing ? "Clearing..." : "Yes, clear history"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compute new percent allocations for the given profile.
 * Returns array of { id, percent } using whole/half percent values that sum to <=100.
 *
 * Profiles:
 *  - "even": split evenly across all configs
 *  - "dem75": 75% pooled across Democrats, 25% across Republicans (others get 0 unless no D/R)
 *  - "rep75": mirror of dem75
 *  - "demOnly": 100% across Democrats (others 0)
 *  - "repOnly": 100% across Republicans (others 0)
 */
function computeProfileAllocations(configs, profile) {
  const total = 100;

  if (profile === "even") {
    const each = total / configs.length;
    return configs.map((c) => ({ id: c.id, percent: round1(Math.max(1, each)) }));
  }

  const dems = configs.filter((c) => isDemocrat(c.politician?.party));
  const reps = configs.filter((c) => isRepublican(c.politician?.party));
  const others = configs.filter((c) => !isDemocrat(c.politician?.party) && !isRepublican(c.politician?.party));

  if (profile === "demOnly") {
    if (dems.length === 0) return configs.map((c) => ({ id: c.id, percent: round1(total / configs.length) }));
    const each = total / dems.length;
    return [
      ...dems.map((c) => ({ id: c.id, percent: round1(Math.max(1, each)) })),
      ...reps.map((c) => ({ id: c.id, percent: 1 })),
      ...others.map((c) => ({ id: c.id, percent: 1 })),
    ];
  }

  if (profile === "repOnly") {
    if (reps.length === 0) return configs.map((c) => ({ id: c.id, percent: round1(total / configs.length) }));
    const each = total / reps.length;
    return [
      ...reps.map((c) => ({ id: c.id, percent: round1(Math.max(1, each)) })),
      ...dems.map((c) => ({ id: c.id, percent: 1 })),
      ...others.map((c) => ({ id: c.id, percent: 1 })),
    ];
  }

  // dem75 / rep75
  const heavySide = profile === "dem75" ? dems : reps;
  const lightSide = profile === "dem75" ? reps : dems;

  // Reserve some budget for "others" if they exist so allocation isn't lopsided.
  const otherShare = others.length > 0 ? Math.min(10, others.length * 2) : 0;
  const remaining = total - otherShare;

  // If one side empty, give all remaining to the other (and others)
  let heavyShare, lightShare;
  if (heavySide.length === 0 && lightSide.length === 0) {
    return others.map((c) => ({ id: c.id, percent: round1(total / Math.max(1, others.length)) }));
  } else if (heavySide.length === 0) {
    heavyShare = 0;
    lightShare = remaining;
  } else if (lightSide.length === 0) {
    heavyShare = remaining;
    lightShare = 0;
  } else {
    heavyShare = remaining * 0.75;
    lightShare = remaining * 0.25;
  }

  const result = [];
  if (heavySide.length > 0) {
    const each = heavyShare / heavySide.length;
    for (const c of heavySide) result.push({ id: c.id, percent: round1(Math.max(1, each)) });
  }
  if (lightSide.length > 0) {
    const each = lightShare / lightSide.length;
    for (const c of lightSide) result.push({ id: c.id, percent: round1(Math.max(1, each)) });
  }
  if (others.length > 0) {
    const each = otherShare / others.length;
    for (const c of others) result.push({ id: c.id, percent: round1(Math.max(1, each)) });
  }
  return result;
}

function round1(n) {
  return Math.round(n * 2) / 2; // round to nearest 0.5 to match slider step
}
