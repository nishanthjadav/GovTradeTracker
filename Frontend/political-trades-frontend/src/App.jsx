import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import FilterBar from "./components/FilterBar";
import TradeTable from "./components/TradeTable";
import Pagination from "./components/Pagination";
import ProfilePage from "./components/ProfilePage";
import PortfolioPage from "./components/PortfolioPage";
import AccountMenu from "./components/AccountMenu";
import AccountPage from "./components/AccountPage";
import { defaultFilters } from "./utils/filterHelpers";
import { applyFilters } from "./utils/tradeHelpers";
import { apiFetch } from "./api";
import { useAuth } from "./contexts/AuthContext";

const PAGE_SIZE = 25;

export default function App() {
  const { isGuest, signIn } = useAuth();
  const [politicians, setPoliticians] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [selectedPol, setSelectedPol] = useState(null);
  const [polTrades, setPolTrades] = useState([]);
  const [currentView, setCurrentView] = useState("feed");
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [filters, setFilters] = useState(defaultFilters());
  const [currentPage, setCurrentPage] = useState(1);
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : false;
  });
  const [copyConfigs, setCopyConfigs] = useState([]);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  const [portfolioRefreshKey, setPortfolioRefreshKey] = useState(0);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const copyPanelRef = useRef(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/politicians`).then((r) => r.json()),
      apiFetch(`/trades/recent?limit=500`).then((r) => r.json()),
      apiFetch(`/copy-configs`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([pols, trades, configs]) => {
        setPoliticians(pols);
        setRecentTrades(trades);
        const polMap = new Map(pols.map((p) => [p.id, p.name]));
        const enriched = configs.map((c) => ({
          ...c,
          politicianName: polMap.get(c.politicianId) ?? c.politicianId,
        }));
        setCopyConfigs(enriched);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    setFilters(defaultFilters());
  }, [currentView, selectedPol]);

  // Close copy panel when clicking outside
  useEffect(() => {
    if (!copyPanelOpen) return;
    const handler = (e) => {
      if (copyPanelRef.current && !copyPanelRef.current.contains(e.target)) {
        setCopyPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [copyPanelOpen]);

  // Auto-open panel when first politician is added
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (copyConfigs.length > prevCountRef.current && prevCountRef.current === 0) {
      setCopyPanelOpen(true);
    }
    prevCountRef.current = copyConfigs.length;
  }, [copyConfigs.length]);

  const selectPolitician = (pol) => {
    setSelectedPol(pol);
    setCurrentView("politician");
    setTradesLoading(true);
    apiFetch(`/politicians/${pol.id}/trades`)
      .then((r) => r.json())
      .then((trades) => {
        setPolTrades(trades);
        setTradesLoading(false);
      })
      .catch(() => setTradesLoading(false));
  };

  const selectPoliticianById = (id) => {
    const pol = politicians.find((p) => p.id === id);
    if (pol) selectPolitician(pol);
  };

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

  // Dedupe copyConfigs by politicianId for display (defensive — earlier StrictMode
  // bugs may have left duplicate rows in the DB). Prefer numeric-id entries over
  // optimistic-id ones; among numerics, prefer the highest id.
  const displayedCopyConfigs = useMemo(() => {
    const isReal = (c) => typeof c.id === "number";
    const seen = new Map();
    for (const c of copyConfigs) {
      const prev = seen.get(c.politicianId);
      if (!prev) {
        seen.set(c.politicianId, c);
      } else if (isReal(c) && !isReal(prev)) {
        seen.set(c.politicianId, c);
      } else if (isReal(c) && isReal(prev) && c.id > prev.id) {
        seen.set(c.politicianId, c);
      }
    }
    return Array.from(seen.values());
  }, [copyConfigs]);

  const handleCopyToggleById = (politicianId) => {
    if (isGuest) {
      setShowSignInPrompt(true);
      return;
    }
    const pol = politicians.find((p) => p.id === politicianId);
    const existing = copyConfigs.find((c) => c.politicianId === politicianId);

    if (existing) {
      // Optimistic remove
      setCopyConfigs((prev) => prev.filter((c) => c.politicianId !== politicianId));
      if (typeof existing.id === "number") {
        apiFetch(`/copy-configs/${existing.id}`, { method: "DELETE" })
          .then((r) => {
            if (!r.ok && r.status !== 404) {
              setCopyConfigs((s) =>
                s.find((c) => c.politicianId === politicianId) ? s : [...s, existing]
              );
            }
          })
          .catch(() => {});
      }
    } else {
      const optimisticId = `optimistic-${politicianId}`;
      const optimistic = {
        id: optimisticId,
        politicianId,
        politicianName: pol?.name ?? politicianId,
        portfolioPercent: 5,
        active: true,
      };
      setCopyConfigs((prev) =>
        prev.find((c) => c.politicianId === politicianId) ? prev : [...prev, optimistic]
      );
      apiFetch(`/copy-configs`, {
        method: "POST",
        body: JSON.stringify({ politicianId, portfolioPercent: 5 }),
      })
        .then(async (r) => {
          if (!r.ok) {
            setCopyConfigs((s) => s.filter((c) => c.id !== optimisticId));
            return;
          }
          const saved = await r.json().catch(() => null);
          if (!saved || saved.id == null) return;
          setCopyConfigs((s) =>
            s.map((c) =>
              c.id === optimisticId
                ? { ...saved, politicianName: pol?.name ?? politicianId }
                : c
            )
          );
        })
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
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="theme-toggle"
            onClick={() => setIsDark(!isDark)}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          <button
            className="top-action"
            onClick={() => {
              if (currentView === "portfolio") {
                setPortfolioRefreshKey((k) => k + 1);
              } else {
                setCurrentView("portfolio");
              }
            }}
          >
            My Portfolio
          </button>
          <AccountMenu onOpenAccount={() => setCurrentView("account")} />
        </div>
      </div>

      <div className="main">
        <div className="content">
          {currentView === "feed" ? (
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
                copyConfigs={displayedCopyConfigs}
                onCopyToggle={handleCopyToggleById}
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
              onBack={() => {
                setSelectedPol(null);
                setCurrentView("feed");
              }}
            />
          ) : currentView === "account" ? (
            <AccountPage onBack={() => setCurrentView("feed")} />
          ) : (
            <PortfolioPage
              refreshKey={portfolioRefreshKey}
              onBack={() => setCurrentView("feed")}
              politicians={politicians}
              copyConfigs={displayedCopyConfigs}
              onRemoveCopyConfig={(id) =>
                setCopyConfigs((prev) => prev.filter((c) => c.id !== id))
              }
              onUpdateCopyConfig={(updated) =>
                setCopyConfigs((prev) =>
                  prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
                )
              }
            />
          )}
        </div>
      </div>

      {/* Bottom-left copy panel — shown whenever there are active copy configs */}
      {displayedCopyConfigs.length > 0 && (
        <div className="copy-tray" ref={copyPanelRef}>
          <button
            className="copy-tray-toggle"
            onClick={() => setCopyPanelOpen((o) => !o)}
          >
            <span className="copy-tray-label">
              Copying
              <span className="copy-tray-badge">{displayedCopyConfigs.length}</span>
            </span>
            <span className={`copy-tray-chevron${copyPanelOpen ? " open" : ""}`}>▲</span>
          </button>

          {copyPanelOpen && (
            <div className="copy-tray-drawer">
              <div className="copy-tray-list">
                {displayedCopyConfigs.map((c) => {
                  const name = c.politicianName || politicians.find((p) => p.id === c.politicianId)?.name || c.politicianId;
                  return (
                    <div key={c.politicianId} className="copy-tray-item">
                      <span className="copy-tray-name">{name}</span>
                      <button
                        className="copy-tray-remove"
                        onClick={() => {
                          apiFetch(`/copy-configs/${c.id}`, { method: "DELETE" })
                            .then(() =>
                              setCopyConfigs((prev) => prev.filter((x) => x.id !== c.id))
                            )
                            .catch(() => {});
                        }}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="copy-tray-footer">
                <button
                  className="copy-tray-portfolio-btn"
                  onClick={() => {
                    setCopyPanelOpen(false);
                    setCurrentView("portfolio");
                  }}
                >
                  Open Portfolio →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Sign-in prompt modal for guests */}
      {showSignInPrompt && (
        <div
          onClick={() => setShowSignInPrompt(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 16, padding: "32px 28px",
              maxWidth: 380, width: "90%", textAlign: "center",
              boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign in to copy trades</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
              Create an account to copy politician trades and track your portfolio.
            </div>
            <button onClick={signIn} style={{
              width: "100%", padding: "10px 0", background: "#3b82f6", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 10,
            }}>
              Sign in with Google
            </button>
            <button onClick={() => setShowSignInPrompt(false)} style={{
              width: "100%", padding: "8px 0", background: "transparent", color: "#64748b",
              border: "none", fontSize: 13, cursor: "pointer",
            }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
