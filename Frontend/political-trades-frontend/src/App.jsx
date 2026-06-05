import { useState, useEffect, useMemo } from "react";
import "./App.css";
import FilterBar from "./components/FilterBar";
import TradeTable from "./components/TradeTable";
import Pagination from "./components/Pagination";
import ProfilePage from "./components/ProfilePage";
import { defaultFilters } from "./utils/filterHelpers";
import { applyFilters } from "./utils/tradeHelpers";

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
  const [tab, setTab] = useState("feed");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [filters, setFilters] = useState(defaultFilters());
  const [currentPage, setCurrentPage] = useState(1);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });

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
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    setFilters(defaultFilters());
  }, [tab, selectedPol]);

  const selectPolitician = (pol) => {
    setSelectedPol(pol);
    setTab("politician");
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
    if (tab === "politician" && selectedPol) {
      return polTrades.map((t) => ({
        ...t,
        party: activePol?.party,
        chamber: activePol?.chamber,
        politicianId: selectedPol.id,
        politicianName: activePol?.name,
      }));
    }
    return enrichedRecentTrades;
  }, [tab, polTrades, enrichedRecentTrades, activePol, selectedPol]);

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
  }, [filters, tab, selectedPol, enrichedTrades.length]);

  useEffect(() => {
    if (currentPage > pageCount) {
      setCurrentPage(pageCount);
    }
  }, [currentPage, pageCount]);

  const totalBuys = filteredTrades.filter((t) => t.tradeType?.toLowerCase() === "buy").length;
  const totalSells = filteredTrades.filter((t) => t.tradeType?.toLowerCase() === "sell").length;

  return (
    <div className={`app${isDark ? " dark" : ""}`}>
      <div className="topbar">
        <div className="logo">Gov<span>Trade</span> Tracker</div>
        <button
          className="theme-toggle"
          onClick={() => setIsDark(!isDark)}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? "☀️" : "🌙"}
        </button>
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
                  {/* <div className="pol-stats">
                    <div className="pol-count">{pol.totalTrades}</div>
                    <div className="pol-buysell">
                      <span style={{ color: "#16a34a" }}>{pol.buys}</span>
                      <span style={{ color: "#cbd5e1" }}> / </span>
                      <span style={{ color: "#dc2626" }}>{pol.sells}</span>
                    </div>
                  </div> */}
                </div>
              );
            })
          )}
        </div>

        <div className="content">
          {tab === "feed" || !selectedPol ? (
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
          ) : (
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
              onBack={() => { setSelectedPol(null); setTab("feed"); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

