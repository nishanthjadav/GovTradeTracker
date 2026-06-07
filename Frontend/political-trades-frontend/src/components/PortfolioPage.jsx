import { useEffect, useState } from "react";
import "../App.css";
import "./PortfolioPage.css";

const API = "http://localhost:8080/api";

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

export default function PortfolioPage({ sessionId, setCurrentView, politicians = [] }) {  const [summary, setSummary] = useState(null);
  const [trades, setTrades] = useState([]);
  const [copying, setCopying] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingAmount, setEditingAmount] = useState("");

  useEffect(() => {
    fetch(`${API}/copy-configs?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(setCopying)
      .catch(() => setCopying([]));

    fetch(`${API}/portfolio?sessionId=${sessionId}`)
      .then(r => r.json())
      .then((data) => {
        setSummary(data.summary || null);
        setTrades(data.trades || []);
      })
      .catch(() => {});
  }, [sessionId]);

  // Enrich copy configs with full politician info from the sidebar list
  const enrichedCopying = copying.map(c => {
    const pol = politicians.find(p => p.id === c.politicianId);
    return { ...c, politician: pol };
  });

  const handleToggleActive = async (config) => {
    const updated = { ...config, active: !config.active };
    await fetch(`${API}/copy-configs/${config.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: updated.active })
    }).catch(() => {});
    setCopying(prev => prev.map(c => c.id === config.id ? { ...c, active: updated.active } : c));
  };

  const handleSaveAmount = async (config) => {
    const val = parseFloat(editingAmount);
    if (!val || val <= 0) return;
    await fetch(`${API}/copy-configs/${config.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountPerTrade: val })
    }).catch(() => {});
    setCopying(prev => prev.map(c => c.id === config.id ? { ...c, amountPerTrade: val } : c));
    setEditingId(null);
  };

  const handleRemove = async (config) => {
    await fetch(`${API}/copy-configs/${config.id}`, { method: 'DELETE' }).catch(() => {});
    setCopying(prev => prev.filter(c => c.id !== config.id));
  };

  const returnColor = (val) =>
    val == null ? "var(--color-text-muted)" : val >= 0 ? "var(--color-success)" : "var(--color-danger)";

  return (
    <div className="portfolio-page">
      {/* Header */}
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
        <div className="portfolio-section-title">Copying</div>
        {enrichedCopying.length === 0 ? (
          <div className="empty">
            You're not copying anyone yet. Check politicians in the sidebar to start.
          </div>
        ) : (
          <div className="copying-grid">
            {enrichedCopying.map(c => {
              const av = avatarBg(c.politician?.party);
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} className={`copy-card${c.active ? "" : " copy-card--paused"}`}>
                  <div className="copy-card-top">
                    <div className="copy-card-avatar" style={{ background: av.bg, color: av.color }}>
                      {initials(c.politician?.name || c.politicianId)}
                    </div>
                    <div className="copy-card-info">
                      <div className="copy-card-name">
                        {c.politician?.name || c.politicianId}
                      </div>
                      <div className="copy-card-meta">
                        {c.politician?.party?.replace("Republican", "R").replace("Democrat", "D")}
                        {c.politician?.chamber ? ` · ${c.politician.chamber}` : ""}
                        {c.politician?.state ? ` · ${c.politician.state}` : ""}
                      </div>
                    </div>
                    <button className="copy-card-remove" onClick={() => handleRemove(c)} title="Remove">✕</button>
                  </div>

                  <div className="copy-card-amount">
                    {isEditing ? (
                      <div className="copy-amount-edit">
                        <span className="copy-amount-prefix">$</span>
                        <input
                          className="filter-input"
                          style={{ width: 80 }}
                          value={editingAmount}
                          onChange={e => setEditingAmount(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSaveAmount(c)}
                          autoFocus
                        />
                        <button className="copy-amount-save" onClick={() => handleSaveAmount(c)}>Save</button>
                        <button className="copy-amount-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="copy-amount-display">
                        <span className="copy-amount-value">${Number(c.amountPerTrade).toFixed(0)} per trade</span>
                        <button
                          className="copy-amount-edit-btn"
                          onClick={() => { setEditingId(c.id); setEditingAmount(c.amountPerTrade); }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
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
                <div className="portfolio-pol-cell">
                  <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--color-text-primary)" }}>
                    {t.politicianName || t.politicianId}
                  </div>
                </div>
                <div>
                  <span className="ticker-badge">{t.ticker || "—"}</span>
                </div>
                <div>
                  <span className={`type-badge ${t.side === "buy" ? "buy-badge" : "sell-badge"}`}>
                    {t.side}
                  </span>
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
                  <span className={`portfolio-status-badge status-${t.status}`}>
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
