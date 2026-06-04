import { useState, useEffect } from "react";
import "./App.css";

const API = "http://localhost:8080/api";

const fmtSize = (min, max) => {
  if (!min && !max) return "—";
  const fmtNum = (n) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;

  if (max === 9223372036854775807 || max > 5_000_000) return `${fmtNum(min)}+`;
  return `${fmtNum(min)} - ${fmtNum(max)}`;
};

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

export default function App() {
  const [politicians, setPoliticians] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [selectedPol, setSelectedPol] = useState(null);
  const [polTrades, setPolTrades] = useState([]);
  const [tab, setTab] = useState("feed");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });

  useEffect(() => {
    Promise.all([
      fetch(`${API}/politicians`).then((r) => r.json()),
      fetch(`${API}/trades/recent?limit=100`).then((r) => r.json()),
    ])
      .then(([pols, trades]) => {
        setPoliticians(pols);
        setRecentTrades(trades);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  const selectPolitician = (pol) => {
    setSelectedPol(pol);
    setTab("politician");
    setTradesLoading(true);

    fetch(`${API}/politicians/${pol.id}/trades`)
      .then((r) => r.json())
      .then((trades) => {
        setPolTrades(trades);
        setTradesLoading(false);
      })
      .catch(() => setTradesLoading(false));
  };

  const filteredPols = politicians.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.state?.toLowerCase().includes(search.toLowerCase()) ||
    p.party?.toLowerCase().includes(search.toLowerCase())
  );

  const activePol = politicians.find((p) => p.id === selectedPol?.id);

  const totalBuys = recentTrades.filter(
    (t) => t.tradeType?.toLowerCase() === "buy"
  ).length;

  const totalSells = recentTrades.filter(
    (t) => t.tradeType?.toLowerCase() === "sell"
  ).length;

  return (
    <div className={`app${isDark ? " dark" : ""}`}>
      <div className="topbar">
        <div className="logo">
          Gov<span>Trade</span> Tracker
        </div>
        <button
          className="theme-toggle"
          onClick={() => setIsDark(!isDark)}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? "☀️" : "🌙"}
        </button>
      </div>

      <div className="main">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="section-header">
            Politicians · {filteredPols.length}
          </div>

          <div className="search-wrap">
            <input
              className="search-input"
              placeholder="Search name, state, party..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            filteredPols.map((pol, i) => {
              const av = avatarBg(pol.party);
              return (
                <div
                  key={pol.id}
                  className={`pol-row${
                    selectedPol?.id === pol.id ? " active" : ""
                  }`}
                  onClick={() => selectPolitician(pol)}
                >
                  <span className="pol-rank">#{i + 1}</span>

                  <div
                    className="pol-avatar"
                    style={{ background: av.bg, color: av.color }}
                  >
                    {initials(pol.name)}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div className="pol-name">{pol.name}</div>
                    <div className="pol-meta">
                      {pol.party
                        ?.replace("Republican", "R")
                        .replace("Democrat", "D")
                        .replace("Independent", "I")}
                      {pol.chamber ? ` · ${pol.chamber}` : ""}
                      {pol.state ? ` · ${pol.state}` : ""}
                    </div>
                  </div>

                  <div className="pol-stats">
                    <div className="pol-count">{pol.totalTrades}</div>
                    <div className="pol-buysell">
                      <span style={{ color: "#16a34a" }}>{pol.buys}B</span>
                      <span style={{ color: "#cbd5e1" }}> / </span>
                      <span style={{ color: "#dc2626" }}>{pol.sells}S</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Content */}
        <div className="content">
          {tab === "feed" || !selectedPol ? (
            <>
              <div className="content-header">
                <div className="content-title">Recent Trades</div>
                <div className="content-sub">
                  Latest disclosures across all politicians
                </div>
              </div>

              <TradeTable
                trades={recentTrades}
                showPolitician={true}
                loading={loading}
              />
            </>
          ) : (
            <>
              <div className="content-header">
                <div>
                  <div className="content-title">{activePol?.name}</div>
                  <div className="content-sub">
                    {activePol?.party} · {activePol?.chamber} ·{" "}
                    {activePol?.state}
                  </div>
                </div>
              </div>

              <div className="tab-row">
                <div
                  className={`tab${
                    tab === "politician" ? " active" : ""
                  }`}
                  onClick={() => setTab("politician")}
                >
                  All Trades
                </div>
                <div
                  className="tab"
                  onClick={() => {
                    setSelectedPol(null);
                    setTab("feed");
                  }}
                >
                  Back to Feed
                </div>
              </div>

              <TradeTable
                trades={polTrades}
                showPolitician={false}
                loading={tradesLoading}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TradeTable({ trades, showPolitician, loading }) {
  if (loading) return <div className="loading">Loading trades...</div>;
  if (!trades.length) return <div className="empty">No trades found.</div>;

  const cols = showPolitician
    ? "1.5fr 1.5fr 80px 80px 110px 90px"
    : "2fr 1fr 80px 80px 110px 90px";

  return (
    <div className="trades-table">
      <div className="table-header" style={{ gridTemplateColumns: cols }}>
        <div>Issuer</div>
        {showPolitician && <div>Politician</div>}
        <div>Type</div>
        <div>Ticker</div>
        <div>Size</div>
        <div>Trade Date</div>
      </div>

      {trades.map((t, i) => (
        <div
          key={t.id ?? i}
          className="table-row"
          style={{ gridTemplateColumns: cols }}
        >
          <div>
            <div className="issuer-name">{t.issuerName || "—"}</div>
            {t.filedAfterDays != null && (
              <div className="issuer-meta">
                filed {t.filedAfterDays}d after
              </div>
            )}
          </div>

          {showPolitician && (
            <div>
              <div>{t.politicianName}</div>
              <div>{t.party}</div>
            </div>
          )}

          <div>
            <span
              className={`type-badge ${
                t.tradeType?.toLowerCase() === "buy"
                  ? "buy-badge"
                  : "sell-badge"
              }`}
            >
              {t.tradeType}
            </span>
          </div>

          <div>{t.ticker || "—"}</div>

          <div className="size-cell">
            {fmtSize(t.sizeMin, t.sizeMax)}
          </div>

          <div>{t.tradeDate ?? t.publishedDate ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}