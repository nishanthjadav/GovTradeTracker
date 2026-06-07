import { useState, useEffect, useMemo } from "react";
import "./App.css";
import FilterBar from "./components/FilterBar";
import TradeTable from "./components/TradeTable";
import Pagination from "./components/Pagination";
import ProfilePage from "./components/ProfilePage";
import PortfolioPage from "./components/PortfolioPage";
import { defaultFilters } from "./utils/filterHelpers";
import { applyFilters } from "./utils/tradeHelpers";
import { getSessionId } from "./utils/session";

const API = "http://localhost:8080/api";

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

const PAGE_SIZE = 25;

export default function App() {
  const [politicians, setPoliticians] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [selectedPol, setSelectedPol] = useState(null);
  const [polTrades, setPolTrades] = useState([]);
  const [currentView, setCurrentView] = useState("feed");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [filters, setFilters] = useState(defaultFilters());
  const [currentPage, setCurrentPage] = useState(1);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });
  const sessionId = getSessionId();
  const [copyConfigs, setCopyConfigs] = useState([]);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/politicians`).then((r) => r.json()),
      fetch(`${API}/trades/recent?limit=500`).then((r) => r.json()),
    ])
      .then(([pols, trades]) => {
        setPoliticians(pols);
        setRecentTrades(trades);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch(`${API}/copy-configs?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(setCopyConfigs)
      .catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    setFilters(defaultFilters());
  }, [currentView, selectedPol]);

  const selectPolitician = (pol) => {
    setSelectedPol(pol);
    setCurrentView("politician");
    setTradesLoading(true);
    fetch(`${API}/politicians/${pol.id}/trades`)
      .then((r) => r.json())
      .then((trades) => { setPolTrades(trades); setTradesLoading(false); })
      .catch(() => setTradesLoading(false));
  };

  const selectPoliticianById = (id) => {
    const pol = politicians.find((p) => p.id === id);
    if (pol) selectPolitician(pol);
  };

  const filteredPols = politicians.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.state?.toLowerCase().includes(search.toLowerCase()) ||
    p.party?.toLowerCase().includes(search.toLowerCase())
  );

  const activePol = politicians.find((p) => p.id === selectedPol?.id);

  const enrichedRecentTrades = useMemo(() => {
    const politiciansById = new Map(politicians.map((p) => [p.id, p]));
    return recentTrades.map((trade) => ({
      ...trade,
      chamber: trade.chamber ?? politiciansById.get(trade.politicianId)?.chamber,
    }));
  }, [recentTrades, politicians]);

  const enrichedTrades = useMemo(() => {
    if (currentView === "politician" && selectedPol) {
      return polTrades.map((t) => ({
        ...t,
        party: activePol?.party,
        chamber: activePol?.chamber,
        politicianId: selectedPol.id,
        politicianName: activePol?.name,
      }));
    }
    return enrichedRecentTrades;
  }, [currentView, polTrades, enrichedRecentTrades, activePol, selectedPol]);

  const filteredTrades = useMemo(
    () => applyFilters(enrichedTrades, filters),
    [enrichedTrades, filters]
  );

  const pageCount = Math.max(1, Math.ceil(filteredTrades.length / PAGE_SIZE));
  const paginatedTrades = useMemo(
    () => filteredTrades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredTrades, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, currentView, selectedPol, enrichedTrades.length]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  const totalBuys = filteredTrades.filter((t) => t.tradeType?.toLowerCase() === "buy").length;
  const totalSells = filteredTrades.filter((t) => t.tradeType?.toLowerCase() === "sell").length;

  // CHANGE 1: simplified checkbox handler — no amount prompt, default $50
  const handleCopyToggle = (pol, existing) => {
    if (existing) {
      fetch(`${API}/copy-configs/${existing.id}`, { method: 'DELETE' })
        .then(() => setCopyConfigs(prev => prev.filter(c => c.id !== existing.id)))
        .catch(() => {});
    } else {
      fetch(`${API}/copy-configs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, politicianId: pol.id, amountPerTrade: 50 })
      })
        .then(r => r.json())
        .then(saved => setCopyConfigs(prev => [...prev, saved]))
        .catch(() => {});
    }
  };

  return (
    <div className={`app${isDark ? " dark" : ""}`}>
      <div className="topbar">
<div
  className="logo"
  onClick={() => setCurrentView("feed")}
  style={{ cursor: "pointer" }}
>
  Gov<span>Trade</span> Tracker
</div>        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="theme-toggle"
            onClick={() => setIsDark(!isDark)}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          <button className="top-action" onClick={() => setCurrentView("portfolio")}>
            My Portfolio
            </button>
        </div>
      </div>

      <div className="main">
        <div className="sidebar">
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
              const existing = copyConfigs.find(c => c.politicianId === pol.id);
              return (
                <div
                  key={pol.id}
                  className={`pol-row${selectedPol?.id === pol.id ? " active" : ""}`}
                  onClick={() => selectPolitician(pol)}
                >
                  <span className="pol-rank">#{i + 1}</span>
                  <div className="pol-avatar" style={{ background: av.bg, color: av.color }}>
                    {initials(pol.name)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="pol-name">{pol.name}</div>
                    <div className="pol-meta">
                      {pol.party?.replace("Republican", "R").replace("Democrat", "D").replace("Independent", "I")}
                      {pol.chamber ? ` | ${pol.chamber}` : ""}
                      {pol.state ? ` | ${pol.state}` : ""}
                    </div>
                  </div>
                  {/* CHANGE 1: simple checkbox, no amount prompt */}
                  <div style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>
                    <div className="pol-checkbox">
                      <input
                        type="checkbox"
                        checked={!!existing}
                        onChange={() => handleCopyToggle(pol, existing)}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}

{copyConfigs.length > 0 && (
  <div className="sidebar-done-bar">
    <button
      className="sidebar-done-btn"
      onClick={() => setCopyPanelOpen(!copyPanelOpen)}
    >
      Portfolio ({copyConfigs.length})
      {copyPanelOpen ? " ▲" : " ▼"}
    </button>

    {copyPanelOpen && (
      <div
        style={{
          marginTop: 8,
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        {copyConfigs.map((c) => {
          const pol = politicians.find(
            (p) => p.id === c.politicianId
          );

          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
                borderBottom:
                  "1px solid var(--color-border-subtle)",
              }}
            >
              <span>{pol?.name}</span>

              <button className="copy-remove-btn"
                onClick={() => {
                  fetch(`${API}/copy-configs/${c.id}`, {
                    method: "DELETE",
                  })
                    .then(() =>
                      setCopyConfigs((prev) =>
                        prev.filter((x) => x.id !== c.id)
                      )
                    )
                    .catch(() => {});
                }}
              >
                <span className="x-icon"/>
              </button>
            </div>
          );
        })}

        <button
          className="sidebar-done-btn"
          style={{ width: "100%", borderRadius: 0 }}
          onClick={() => setCurrentView("portfolio")}
        >
          Open Portfolio →
        </button>
      </div>
    )}
  </div>
)}
        </div>

        <div className="content">
          {currentView === "feed"  ? (
            <>
              <div className="content-header">
                <div className="content-title">Recent Trades</div>
                <div className="content-sub">Latest disclosures across all politicians</div>
              </div>
              <FilterBar trades={recentTrades} filters={filters} setFilters={setFilters} />
              <TradeTable
                trades={paginatedTrades}
                showPolitician={true}
                loading={loading}
                onSelectPolitician={selectPoliticianById}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={pageCount}
                pageSize={PAGE_SIZE}
                totalResults={filteredTrades.length}
                onPageChange={setCurrentPage}
              />
            </>
          ) : currentView === "politician" ? (
            <ProfilePage
              activePol={activePol}
              enrichedTrades={enrichedTrades}
              filters={filters}
              setFilters={setFilters}
              filteredTrades={filteredTrades}
              totalBuys={totalBuys}
              totalSells={totalSells}
              paginatedTrades={paginatedTrades}
              tradesLoading={tradesLoading}
              currentPage={currentPage}
              pageCount={pageCount}
              setCurrentPage={setCurrentPage}
              onBack={() => { setSelectedPol(null); setCurrentView("feed"); }}
            />
          ) : (
            // CHANGE 3: pass politicians prop to PortfolioPage
            <PortfolioPage
              sessionId={sessionId}
              onBack={() => setCurrentView("feed")}
              politicians={politicians}
            />
          )}
        </div>
      </div>

      {/* Copy panel popup */}
      {/* {copyConfigs.length > 0 && (
        <div style={{ position: 'fixed', left: 12, bottom: 12 }}>
          {!copyPanelOpen ? (
            <button className="theme-toggle" onClick={() => setCopyPanelOpen(true)}>
              📋 Copying ({copyConfigs.length})
            </button>
          ) : (
            <div style={{
              width: 320,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: 12,
              boxShadow: 'var(--shadow-sm)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)' }}>
                  Copying ({copyConfigs.length})
                </strong>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                  onClick={() => setCopyPanelOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                {copyConfigs.map(c => {
                  const pol = politicians.find(p => p.id === c.politicianId);
                  return (
                    <div key={c.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 0',
                      borderBottom: '1px solid var(--color-border-subtle)'
                    }}>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                        {pol?.name || c.politicianId}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                          ${Number(c.amountPerTrade).toFixed(0)}/trade
                        </div>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12 }}
                          onClick={() => {
                            fetch(`${API}/copy-configs/${c.id}`, { method: 'DELETE' })
                              .then(() => setCopyConfigs(prev => prev.filter(x => x.id !== c.id)))
                              .catch(() => {});
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop: 10 }}>
                  <button
                    className="sidebar-done-btn"
                    onClick={() => { setCopyPanelOpen(false); setCurrentView('portfolio'); }}
                  >
                    View Portfolio →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )} */}
    </div>
  );
}
