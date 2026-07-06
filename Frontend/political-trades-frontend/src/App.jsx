import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";
import FilterBar from "./components/FilterBar";
import TradeTable from "./components/TradeTable";
import Pagination from "./components/Pagination";
import ProfilePage from "./components/ProfilePage";
import PortfolioPage from "./components/PortfolioPage";
import AccountMenu from "./components/AccountMenu";
import AccountPage from "./components/AccountPage";
import LeaderboardPage from "./components/LeaderboardPage";
import AboutPage from "./components/AboutPage";
import FaqPage from "./components/FaqPage";
import AnomaliesPage from "./components/AnomaliesPage";
import { defaultFilters } from "./utils/filterHelpers";
import { applyFilters } from "./utils/tradeHelpers";
import { computeAllocations, computeActiveFlags } from "./utils/allocationHelpers";
import { apiFetch, fetchAnomalies } from "./api";
import { useAuth } from "./contexts/AuthContext";

const PAGE_SIZE = 25;

export default function App() {
  const { isGuest, signIn } = useAuth();
  const [politicians, setPoliticians] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [anomaliesLoading, setAnomaliesLoading] = useState(true);
  const [selectedPol, setSelectedPol] = useState(null);
  const [polTrades, setPolTrades] = useState([]);
  // Cache of full per-politician trade lists, keyed by politician id. Populated lazily when the
  // user picks someone from the feed's politician filter — the recentTrades slice usually doesn't
  // contain their older trades, so without this the filter just shows an empty table.
  const [feedPolTradesCache, setFeedPolTradesCache] = useState({});
  const [feedPolTradesLoading, setFeedPolTradesLoading] = useState(false);
  const [currentView, setCurrentView] = useState("feed");
  const [loading, setLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [filters, setFilters] = useState(defaultFilters());
  const [currentPage, setCurrentPage] = useState(1);
  const [copyConfigs, setCopyConfigs] = useState([]);
  // ref mirrors copyConfigs so batch handlers (handleSaveCopies loops through
  // pending ids synchronously) can read the latest post-add state without
  // waiting for react to flush.
  const copyConfigsRef = useRef(copyConfigs);
  useEffect(() => { copyConfigsRef.current = copyConfigs; }, [copyConfigs]);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  const [pendingCopyIds, setPendingCopyIds] = useState(new Set());
  const [portfolioRefreshKey, setPortfolioRefreshKey] = useState(0);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  // remembered allocation profile — lives at app level so add/remove from any
  // page (feed, leaderboard, anomalies) can rebalance even when PortfolioPage
  // isn't mounted.
  const [activeProfile, setActiveProfileState] = useState(() => {
    try { return localStorage.getItem("allocProfile") || "custom"; } catch { return "custom"; }
  });
  const setActiveProfile = (p) => {
    setActiveProfileState(p);
    try { localStorage.setItem("allocProfile", p); } catch { /* storage disabled */ }
  };
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

    // fetch anomalies in parallel with the initial bundle so switching to the
    // anomalies tab is instant. don't block the main feed on it.
    fetchAnomalies(300, 0.5)
      .then((data) => setAnomalies(Array.isArray(data) ? data : []))
      .catch(() => setAnomalies([]))
      .finally(() => setAnomaliesLoading(false));
  }, []);

  // one-shot post-load correction: if the stored allocations don't sum to 100
  // (older accounts pre-dating the rebalance fix, or a stale write), snap them
  // to the current profile once. Runs after both configs and politicians land.
  const didInitialFixRef = useRef(false);
  useEffect(() => {
    if (didInitialFixRef.current) return;
    if (loading) return;
    if (copyConfigs.length === 0) return;
    if (politicians.length === 0) return;
    didInitialFixRef.current = true;
    const total = copyConfigs.reduce((s, c) => s + Number(c.portfolioPercent ?? 0), 0);
    if (Math.abs(total - 100) < 0.5) return;
    const pById = new Map(politicians.map((p) => [p.id, p]));
    const pcts = computeAllocations(copyConfigs, activeProfile, pById);
    // inline the update — pushAllocations isn't declared yet at this point in the file
    const updated = copyConfigs.map((c) => ({
      ...c,
      portfolioPercent: pcts[c.id] ?? Number(c.portfolioPercent ?? 0),
    }));
    copyConfigsRef.current = updated;
    setCopyConfigs(updated);
    for (const c of copyConfigs) {
      if (typeof c.id !== "number") continue;
      const p = pcts[c.id];
      if (p == null) continue;
      apiFetch(`/copy-configs/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ portfolioPercent: p }),
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, copyConfigs.length, politicians.length]);

  useEffect(() => {
    setFilters(defaultFilters());
  }, [currentView, selectedPol]);

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

  // auto-open panel when first politician is added
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

  const selectPoliticianById = (id, fallbackMeta) => {
    const pol = politicians.find((p) => p.id === id);
    if (pol) {
      selectPolitician(pol);
    } else if (fallbackMeta) {
      // politician not in local cache yet — use metadata from the trade and navigate anyway
      const synthetic = { id, ...fallbackMeta };
      setPoliticians((prev) =>
        prev.find((p) => p.id === id) ? prev : [...prev, synthetic]
      );
      selectPolitician(synthetic);
    }
  };

  const activePol = politicians.find((p) => p.id === selectedPol?.id);

  // When the feed's politician filter is set, fetch that politician's full trade history once and
  // cache it. Without this, the filter is applied against the recent-trades slice, which usually
  // doesn't include that politician's older trades — so the table appears empty.
  useEffect(() => {
    if (currentView !== "feed") return;
    const polId = filters.politicianId;
    if (!polId) return;
    if (feedPolTradesCache[polId]) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate "start loading" before an async fetch
    setFeedPolTradesLoading(true);
    apiFetch(`/politicians/${polId}/trades`)
      .then((r) => (r.ok ? r.json() : []))
      .then((trades) => {
        setFeedPolTradesCache((prev) => ({ ...prev, [polId]: trades || [] }));
        setFeedPolTradesLoading(false);
      })
      .catch(() => setFeedPolTradesLoading(false));
  }, [currentView, filters.politicianId, feedPolTradesCache]);

  const enrichedRecentTrades = useMemo(() => {
    const politiciansById = new Map(politicians.map((p) => [p.id, p]));
    // If the user picked a specific politician in the feed filter, use that politician's full
    // trade list (once it's loaded) as the source — otherwise we'd be filtering only the recent
    // slice. The trades coming from /politicians/{id}/trades don't carry politician metadata on
    // each row (since the endpoint is keyed by politician), so we stamp it back on here.
    const filterPolId = filters.politicianId;
    const sourceTrades =
      filterPolId && feedPolTradesCache[filterPolId]
        ? feedPolTradesCache[filterPolId].map((t) => {
            const pol = politiciansById.get(filterPolId);
            return {
              ...t,
              politicianId: filterPolId,
              politicianName: t.politicianName ?? pol?.name,
              party: t.party ?? pol?.party,
              chamber: t.chamber ?? pol?.chamber,
            };
          })
        : recentTrades;
    return sourceTrades.map((trade) => ({
      ...trade,
      chamber: trade.chamber ?? politiciansById.get(trade.politicianId)?.chamber,
    }));
  }, [recentTrades, politicians, filters.politicianId, feedPolTradesCache]);

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

  // dedupe copyConfigs by politicianId — strictmode used to leave dupes in db.
  // prefer numeric ids over optimistic ones; highest numeric id wins
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

  const politiciansById = useMemo(
    () => new Map(politicians.map((p) => [p.id, p])),
    [politicians]
  );

  // push a batch of {id, percent} PATCHes; server calls fire in parallel, local
  // state updated optimistically so the UI never shows an intermediate 105%.
  const pushAllocations = (updates) => {
    const byId = new Map(updates.map((u) => [u.id, u]));
    // apply optimistically and keep ref in sync
    const next = copyConfigsRef.current.map((c) => {
      const u = byId.get(c.id);
      if (!u) return c;
      return { ...c, portfolioPercent: u.percent, ...(u.active !== undefined ? { active: u.active } : {}) };
    });
    copyConfigsRef.current = next;
    setCopyConfigs(next);
    for (const u of updates) {
      if (typeof u.id !== "number") continue;
      const body = { portfolioPercent: u.percent };
      if (u.active !== undefined) body.active = u.active;
      apiFetch(`/copy-configs/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).catch(() => {});
    }
  };

  // rebalance a set of configs against the current profile and push results.
  // used by PortfolioPage when the user clicks a profile button or drags a slider.
  const applyProfileToConfigs = (configs, profile) => {
    if (configs.length === 0) return;
    setActiveProfile(profile);
    const pcts = computeAllocations(configs, profile, politiciansById);
    const flags = computeActiveFlags(configs, profile, politiciansById);
    pushAllocations(configs.map((c) => ({
      id: c.id,
      percent: pcts[c.id] ?? Number(c.portfolioPercent ?? 0),
      active: flags[c.id],
    })));
  };

  const handleCopyToggleById = (politicianId) => {
    if (isGuest) {
      setShowSignInPrompt(true);
      return;
    }
    // read latest via ref so batch flows (handleSaveCopies iterating pending ids)
    // see the results of the previous iteration's setCopyConfigs.
    const currentConfigs = copyConfigsRef.current;
    const pol = politicians.find((p) => p.id === politicianId);
    const existing = currentConfigs.find((c) => c.politicianId === politicianId);

    if (existing) {
      // REMOVE: drop the config, then rebalance what's left so total returns to 100%
      const remaining = currentConfigs.filter((c) => c.politicianId !== politicianId);
      copyConfigsRef.current = remaining;
      setCopyConfigs(remaining);
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
      if (remaining.length > 0) {
        const pcts = computeAllocations(remaining, activeProfile, politiciansById);
        const flags = computeActiveFlags(remaining, activeProfile, politiciansById);
        pushAllocations(remaining.map((c) => ({
          id: c.id,
          percent: pcts[c.id] ?? Number(c.portfolioPercent ?? 0),
          active: flags[c.id],
        })));
      }
      return;
    }

    // ADD: compute new allocations against (existing + new) BEFORE dispatching the POST
    // so the newcomer starts at the right percentage — no 105% flash.
    const optimisticId = `optimistic-${politicianId}`;
    const newStub = {
      id: optimisticId,
      politicianId,
      politicianName: pol?.name ?? politicianId,
      portfolioPercent: 0,
      active: true,
      politician: pol,
    };
    const nextConfigs = [...currentConfigs, newStub];
    const pcts = computeAllocations(nextConfigs, activeProfile, politiciansById);
    const flags = computeActiveFlags(nextConfigs, activeProfile, politiciansById);
    const newPercent = pcts[optimisticId] ?? 5;

    const updatedList = nextConfigs.map((c) => ({
      ...c,
      portfolioPercent: pcts[c.id] ?? Number(c.portfolioPercent ?? 0),
      ...(flags[c.id] !== undefined ? { active: flags[c.id] } : {}),
    }));
    // keep ref in sync immediately so the next iteration in handleSaveCopies
    // sees the newcomer as an existing entry.
    copyConfigsRef.current = updatedList;
    setCopyConfigs(updatedList);

    // PATCH existing rows to their new percentages (parallel)
    for (const c of currentConfigs) {
      if (typeof c.id !== "number") continue;
      const p = pcts[c.id];
      if (p == null) continue;
      const body = { portfolioPercent: p };
      if (flags[c.id] !== undefined) body.active = flags[c.id];
      apiFetch(`/copy-configs/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }).catch(() => {});
    }

    // POST the new one with its target percentage
    apiFetch(`/copy-configs`, {
      method: "POST",
      body: JSON.stringify({ politicianId, portfolioPercent: newPercent }),
    })
      .then(async (r) => {
        if (!r.ok) {
          setCopyConfigs((s) => s.filter((c) => c.id !== optimisticId));
          copyConfigsRef.current = copyConfigsRef.current.filter((c) => c.id !== optimisticId);
          return;
        }
        const saved = await r.json().catch(() => null);
        if (!saved || saved.id == null) return;
        // by the time POST resolves, the newcomer's optimistic percent may have
        // changed due to intervening add/remove/preset actions. preserve the
        // current live percent instead of the stale one from this closure.
        const liveOptimistic = copyConfigsRef.current.find((c) => c.id === optimisticId);
        const livePercent = liveOptimistic
          ? Number(liveOptimistic.portfolioPercent ?? newPercent)
          : newPercent;
        const nextList = copyConfigsRef.current.map((c) =>
          c.id === optimisticId
            ? { ...saved, politicianName: pol?.name ?? politicianId, portfolioPercent: livePercent }
            : c
        );
        copyConfigsRef.current = nextList;
        setCopyConfigs(nextList);
        // if the live percent differs from what we POSTed, PATCH the backend
        // to match so it's not stuck at the initial value.
        if (Math.abs(livePercent - newPercent) > 0.01) {
          apiFetch(`/copy-configs/${saved.id}`, {
            method: "PATCH",
            body: JSON.stringify({ portfolioPercent: livePercent }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  };

  const handlePendingToggle = (politicianId) => {
    if (isGuest) { setShowSignInPrompt(true); return; }
    setPendingCopyIds((prev) => {
      const next = new Set(prev);
      next.has(politicianId) ? next.delete(politicianId) : next.add(politicianId);
      return next;
    });
  };

  const handleSaveCopies = () => {
    const toSave = [...pendingCopyIds];
    setPendingCopyIds(new Set());
    toSave.forEach((politicianId) => handleCopyToggleById(politicianId));
  };

  return (
    <div className="app dark">
      <div className="topbar">
        <div
          className="logo"
          onClick={() => {
            // Full reset — not just setCurrentView. The user expects clicking the brand to wipe
            // any politician filter / selected profile and land on the clean feed. Without resetting
            // filters here, picking a politician (which sets filters.politicianId) leaves the feed
            // empty when they come back via the logo.
            setSelectedPol(null);
            setFilters(defaultFilters());
            setCurrentPage(1);
            setCurrentView("feed");
          }}
          style={{ cursor: "pointer" }}
        >
          Gov Trade Tracker
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className={`top-action${currentView === "portfolio" ? " active" : ""}`}
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
          <button
            className={`top-action${currentView === "leaderboard" ? " active" : ""}`}
            onClick={() => setCurrentView("leaderboard")}
          >
            Leaderboard
          </button>
          <button
            className={`top-action${currentView === "anomalies" ? " active" : ""}`}
            onClick={() => setCurrentView("anomalies")}
          >
            Anomalies
          </button>
          <button
            className={`top-action${currentView === "about" ? " active" : ""}`}
            onClick={() => setCurrentView("about")}
          >
            About
          </button>
          <button
            className={`top-action${currentView === "faq" ? " active" : ""}`}
            onClick={() => setCurrentView("faq")}
          >
            FAQ
          </button>
          <AccountMenu onOpenAccount={() => setCurrentView("account")} />
        </div>
      </div>

      <div className="main">
        <div className="content">
          {currentView === "feed" ? (
            <>
              <FilterBar
                trades={recentTrades}
                politicians={politicians}
                filters={filters}
                setFilters={setFilters}
              />
              <div className="trades-table-scroll">
                <TradeTable
                  trades={paginatedTrades}
                  showPolitician={true}
                  loading={loading || feedPolTradesLoading}
                  onSelectPolitician={selectPoliticianById}
                  copyConfigs={displayedCopyConfigs}
                  pendingCopyIds={pendingCopyIds}
                  onPendingToggle={handlePendingToggle}
                />
              </div>
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
          ) : currentView === "leaderboard" ? (
            <LeaderboardPage
              politicians={politicians}
              trades={enrichedRecentTrades}
              copyConfigs={displayedCopyConfigs}
              pendingCopyIds={pendingCopyIds}
              onPendingToggle={handlePendingToggle}
              onSelectPolitician={selectPoliticianById}
              onBack={() => setCurrentView("feed")}
            />
          ) : currentView === "anomalies" ? (
            <AnomaliesPage
              copyConfigs={displayedCopyConfigs}
              onSelectPolitician={selectPoliticianById}
              pendingCopyIds={pendingCopyIds}
              onPendingToggle={handlePendingToggle}
              anomalies={anomalies}
              anomaliesLoading={anomaliesLoading}
            />
          ) : currentView === "about" ? (
            <AboutPage onBack={() => setCurrentView("feed")} />
          ) : currentView === "faq" ? (
            <FaqPage onBack={() => setCurrentView("feed")} />
          ) : (
            <PortfolioPage
              refreshKey={portfolioRefreshKey}
              onBack={() => setCurrentView("feed")}
              politicians={politicians}
              copyConfigs={displayedCopyConfigs}
              activeProfile={activeProfile}
              onApplyProfile={applyProfileToConfigs}
              onMarkCustom={() => setActiveProfile("custom")}
              onToggleCopy={handleCopyToggleById}
              onSelectPolitician={selectPoliticianById}
              onUpdateCopyConfig={(updated) =>
                setCopyConfigs((prev) =>
                  prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
                )
              }
            />
          )}
        </div>
      </div>

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
                          handleCopyToggleById(c.politicianId);
                          setPendingCopyIds((prev) => {
                            const next = new Set(prev);
                            next.delete(c.politicianId);
                            return next;
                          });
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
      {pendingCopyIds.size > 0 && (
        <button className="save-copies-btn" onClick={handleSaveCopies}>
          Save {pendingCopyIds.size} {pendingCopyIds.size === 1 ? "politician" : "politicians"}
        </button>
      )}
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
