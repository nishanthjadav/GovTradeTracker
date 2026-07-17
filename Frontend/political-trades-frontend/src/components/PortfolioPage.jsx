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

// short badge text — "partially_filled" is too wide for the status cell, so we
// abbreviate the long ones. the full status still drives the badge color class.
function statusLabel(status) {
  if (!status) return "—";
  switch (status) {
    case "partially_filled": return "PARTIAL";
    case "pending_new":
    case "accepted":
    case "new": return "PENDING";
    default: return status.toUpperCase();
  }
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

export default function PortfolioPage({
  refreshKey,
  onBack,
  politicians = [],
  copyConfigs: externalCopyConfigs,
  activeProfile = "custom",
  onApplyProfile,
  onMarkCustom,
  onToggleCopy,
  onSelectPolitician,
  onUpdateCopyConfig,
}) {
  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [sliderValues, setSliderValues] = useState({});
  const [maxFiledDaysValues, setMaxFiledDaysValues] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [allocTooltip, setAllocTooltip] = useState(null);

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

  // ids the user is actively dragging. entries added on slider change and
  // cleared after the debounced patch settles. mirror-effect skips these so
  // the round-trip echo doesn't yank the slider back mid-drag.
  const dirtySliderIdsRef = useRef(new Set());
  // last-seen c.portfolioPercent per config id. lets us detect changes made
  // by App (e.g. preset button rebalance) versus echoes of our own PATCH
  // round-trip, and only mirror the former into sliderValues.
  const lastSeenPercentRef = useRef({});
  useEffect(() => {
    setSliderValues((prev) => {
      const next = { ...prev };
      const seen = lastSeenPercentRef.current;
      const dirty = dirtySliderIdsRef.current;
      for (const c of copying) {
        const incoming = Number(c.portfolioPercent ?? 5);
        const lastSeen = seen[c.id];
        // skip mirror while the user is actively editing this slider
        if (dirty.has(c.id)) {
          seen[c.id] = incoming;
          continue;
        }
        if (lastSeen == null || lastSeen !== incoming) {
          next[c.id] = incoming;
        }
        seen[c.id] = incoming;
      }
      for (const id of Object.keys(next)) {
        if (!copying.find((c) => String(c.id) === id)) {
          delete next[id];
          delete seen[id];
        }
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
    // debounce settled, clear dirty flag so mirror-effect can resume for this id
    dirtySliderIdsRef.current.delete(configId);
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
    dirtySliderIdsRef.current.add(config.id);
    setSliderValues(prev => ({ ...prev, [config.id]: clamped }));
    patchPercent(config.id, clamped);
    // any manual slider touch invalidates the preset — from now on we rebalance
    // proportionally rather than snapping back to even/dem75/etc.
    if (activeProfile !== "custom") onMarkCustom?.();
  };

  const handleMaxFiledDaysChange = (config, rawVal) => {
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

  const handleRemove = (config) => {
    // route through App's toggle so removal also rebalances the remaining allocations
    onToggleCopy?.(config.politicianId);
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
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const applyProfile = (profile) => {
    if (enrichedCopying.length === 0) return;
    onApplyProfile?.(enrichedCopying, profile);
  };

  const returnColor = (val) =>
    val == null ? "var(--color-text-muted)" : val >= 0 ? "var(--color-success)" : "var(--color-danger)";

  const handlePolClick = (politicianId) => {
    if (onSelectPolitician && politicianId) onSelectPolitician(politicianId);
  };

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

      <div className="portfolio-section">
        <PnlChart refreshKey={refreshKey} />
      </div>

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
              {[...enrichedCopying]
                .sort((a, b) => {
                  const pa = (a.politician?.party ?? a.party ?? "").toLowerCase();
                  const pb = (b.politician?.party ?? b.party ?? "").toLowerCase();
                  // group reps then dems then others
                  const rank = (p) => (p.startsWith("r") ? 0 : p.startsWith("d") ? 1 : 2);
                  return rank(pa) - rank(pb);
                })
                .map((c) => {
                  const pct = sliderValues[c.id] ?? Number(c.portfolioPercent ?? 5);
                  const party = c.politician?.party ?? c.party;
                  const av = avatarBg(party);
                  return (
                    <div
                      key={c.politicianId}
                      className="allocation-bar-hitarea"
                      style={{ width: `${pct}%` }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.parentElement.getBoundingClientRect();
                        const segRect = e.currentTarget.getBoundingClientRect();
                        const xPct = ((segRect.left + segRect.width / 2 - rect.left) / rect.width) * 100;
                        setAllocTooltip({
                          name: c.politicianName,
                          pct,
                          party,
                          xPct,
                        });
                      }}
                      onMouseLeave={() => setAllocTooltip(null)}
                    >
                      <div
                        className={`allocation-bar-segment${!c.active ? " paused" : ""}`}
                        style={{ background: av.color }}
                      />
                    </div>
                  );
                })}
              {allocTooltip && (
                <div
                  className="allocation-bar-tooltip"
                  style={{ left: `${allocTooltip.xPct}%` }}
                >
                  <div className="allocation-bar-tooltip-name">
                    <span
                      className="allocation-bar-tooltip-dot"
                      style={{ background: avatarBg(allocTooltip.party).color }}
                    />
                    {allocTooltip.name}
                  </div>
                  <div className="allocation-bar-tooltip-pct">
                    {allocTooltip.pct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            <div className="allocation-profiles">
              <span className="allocation-profiles-label">Quick allocate:</span>
              {[
                { key: "even",    label: "Even distribution" },
                { key: "dem75",   label: "75% Dem / 25% Rep" },
                { key: "rep75",   label: "75% Rep / 25% Dem" },
                { key: "demOnly", label: "Democrats only" },
                { key: "repOnly", label: "Republicans only" },
              ].map((p) => (
                <button
                  key={p.key}
                  className={`allocation-profile-btn${activeProfile === p.key ? " active" : ""}`}
                  onClick={() => applyProfile(p.key)}
                >
                  {p.label}
                </button>
              ))}
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
                <div>Description</div>
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
                    <span className={`portfolio-status-badge status-${t.status}`}>{statusLabel(t.status)}</span>
                  </div>
                  <div className="portfolio-desc-cell" title={t.description || ""}>
                    {t.description || "—"}
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

