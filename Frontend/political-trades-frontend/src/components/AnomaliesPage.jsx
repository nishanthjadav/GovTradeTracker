import { useEffect, useMemo, useState } from "react";
import { fmtSize } from "../utils/tradeHelpers";
import Pagination from "./Pagination";

const PAGE_SIZE = 25;

const SCORE_MIN = 0.5;
const SCORE_MAX = 1.0;

function ScoreBar({ score }) {
  if (score == null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
  const pct = Math.round(score * 100);
  const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));
  const pos = Math.max(4, Math.min(96, ((clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100));
  return (
    <div className="anomaly-score-bar-wrap">
      <div className="anomaly-score-bar">
        <div className="anomaly-score-bar-track" />
        <div className="anomaly-score-bar-dot" style={{ left: `${pos}%` }} />
      </div>
      <span className="anomaly-score-pct">{pct}%</span>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "score_desc", label: "Most Anomalous" },
  { value: "score_asc", label: "Least Anomalous" },
  { value: "date_desc", label: "Newest First" },
  { value: "date_asc", label: "Oldest First" },
  { value: "scraped_desc", label: "Scraped Newest" },
  { value: "scraped_asc", label: "Scraped Oldest" },
];

const SCORE_FLOOR_OPTIONS = [
  { value: 0.5, label: "≥ 0.5" },
  { value: 0.7, label: "≥ 0.7" },
  { value: 0.8, label: "≥ 0.8" },
  { value: 0.9, label: "≥ 0.9" },
];

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

export default function AnomaliesPage({
  copyConfigs,
  onSelectPolitician,
  pendingCopyIds,
  onPendingToggle,
  anomalies = [],
  anomaliesLoading = false,
}) {
  const [currentPage, setCurrentPage] = useState(1);

  const [sort, setSort] = useState("score_desc");
  const [tradeType, setTradeType] = useState("all");
  const [copyingOnly, setCopyingOnly] = useState(false);
  const [scoreFloor, setScoreFloor] = useState(0.5);

  const trades = anomalies;
  const loading = anomaliesLoading;

  const copiedPoliticianIds = useMemo(
    () => new Set((copyConfigs || []).map((c) => c.politicianId)),
    [copyConfigs]
  );

  const filteredSorted = useMemo(() => {
    let out = trades.filter((t) => {
      if (t.anomalyScore == null || t.anomalyScore < scoreFloor) return false;
      if (tradeType !== "all" && t.tradeType?.toLowerCase() !== tradeType) return false;
      if (copyingOnly && !copiedPoliticianIds.has(t.politicianId)) return false;
      return true;
    });

    const dateOf = (t) => t.tradeDate ?? t.publishedDate ?? "";
    const scrapedOf = (t) => t.scrapedAt ?? "";
    switch (sort) {
      case "score_asc":
        out = [...out].sort((a, b) => (a.anomalyScore ?? 0) - (b.anomalyScore ?? 0));
        break;
      case "date_desc":
        out = [...out].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
        break;
      case "date_asc":
        out = [...out].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
        break;
      case "scraped_desc":
        out = [...out].sort((a, b) => scrapedOf(b).localeCompare(scrapedOf(a)));
        break;
      case "scraped_asc":
        // trades with no scrapedAt sink to the bottom regardless of direction —
        // we want "oldest actually scraped", not "unscraped first"
        out = [...out].sort((a, b) => {
          const av = scrapedOf(a), bv = scrapedOf(b);
          if (!av && !bv) return 0;
          if (!av) return 1;
          if (!bv) return -1;
          return av.localeCompare(bv);
        });
        break;
      case "score_desc":
      default:
        out = [...out].sort((a, b) => (b.anomalyScore ?? 0) - (a.anomalyScore ?? 0));
        break;
    }
    return out;
  }, [trades, sort, tradeType, copyingOnly, scoreFloor, copiedPoliticianIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sort, tradeType, copyingOnly, scoreFloor]);

  const pageCount = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE));
  const paginated = filteredSorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const showCopy = !!onPendingToggle && !!copyConfigs;

  return (
    <>
      <div className="content-header">
        <div className="content-title">Anomalies</div>
        <div className="content-sub">
          Trades flagged as statistically unusual based on filing lateness,
          position size relative to the politician's history, and clustering
          with other politicians' trades on the same ticker.
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-label">Sort</label>
          <select
            className="filter-select"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">Type</label>
          <div className="filter-pills">
            {["all", "buy", "sell"].map((value) => (
              <button
                key={value}
                className={`filter-pill${tradeType === value ? " active" : ""}${
                  value === "buy" ? " buy" : value === "sell" ? " sell" : ""
                }`}
                onClick={() => setTradeType(value)}
              >
                {value === "all" ? "All" : value === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
        </div>

        {/* <div className="filter-group">
          <label className="filter-label">Score</label>
          <select
            className="filter-select"
            value={scoreFloor}
            onChange={(e) => setScoreFloor(Number(e.target.value))}
          >
            {SCORE_FLOOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div> */}

        {showCopy && (
          <div className="filter-group">
            <label className="filter-label">Show</label>
            <button
              className={`filter-pill${copyingOnly ? " active" : ""}`}
              onClick={() => setCopyingOnly((v) => !v)}
              disabled={copiedPoliticianIds.size === 0}
              title={
                copiedPoliticianIds.size === 0
                  ? "You aren't copying any politicians yet"
                  : "Show only politicians you're copying"
              }
            >
              Copying only
            </button>
          </div>
        )}
      </div>

      {!loading && filteredSorted.length === 0 ? (
        <div className="empty">
          {trades.length === 0
            ? "No anomalies scored yet. The scorer runs weekly — check back after the next Sunday run."
            : "No anomalies match the current filters."}
        </div>
      ) : (
        <>
          <div className="trades-table-scroll">
            <AnomalyTable
              trades={paginated}
              loading={loading}
              onSelectPolitician={onSelectPolitician}
              copiedPoliticianIds={copiedPoliticianIds}
              pendingCopyIds={pendingCopyIds}
              onPendingToggle={onPendingToggle}
            />
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={pageCount}
            pageSize={PAGE_SIZE}
            totalResults={filteredSorted.length}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </>
  );
}

function AnomalyTable({
  trades,
  loading,
  onSelectPolitician,
  copiedPoliticianIds,
  pendingCopyIds,
  onPendingToggle,
}) {
  if (loading) return <div className="loading">Loading trades...</div>;
  if (!trades.length) return null;

  const showCopy = !!onPendingToggle;
  const cols = showCopy
    ? "36px minmax(130px,1.2fr) minmax(130px,1fr) 84px 90px 110px 110px minmax(180px,1.6fr) 80px"
    : "minmax(130px,1.2fr) minmax(130px,1fr) 84px 90px 110px 110px minmax(180px,1.6fr) 80px";

  // match TradeTable: every politician's first row is the "lead", subsequent rows
  // are follow-ups regardless of copied state — keeps the checkbox from repeating
  // on every duplicate row of a non-copied politician too
  const seenPoliticians = new Set();

  return (
    <div className="trades-table anomaly-table">
      <div className="table-header" style={{ gridTemplateColumns: cols }}>
        {showCopy && <div />}
        <div>Politician</div>
        <div>Company</div>
        <div>Type</div>
        <div>Ticker</div>
        <div>Trade Date</div>
        <div>Size</div>
        <div>Why anomalous</div>
        <div className="anomaly-percentile-header">
          Percentile
          <span
            className="anomaly-percentile-info"
            title="Percentile rank from 50–100% showing how unusual this trade is compared to all trades in the database. Scored by an Isolation Forest model on filing lateness, trade size, and clustering with other politicians. 100% = most anomalous."
          >
            ⓘ
          </span>
        </div>
      </div>
      {trades.map((t, i) => {
        const isCopied = copiedPoliticianIds.has(t.politicianId);
        const isPending = showCopy ? !!(pendingCopyIds?.has(t.politicianId)) : false;
        const av = avatarBg(t.party);
        const isFirstRowForPolitician = !seenPoliticians.has(t.politicianId);
        seenPoliticians.add(t.politicianId);
        const isFollowUpForCopied = showCopy && isCopied && !isFirstRowForPolitician;
        const isFollowUpForPending = showCopy && isPending && !isFirstRowForPolitician;

        return (
          <div
            key={t.id ?? i}
            className={`table-row${(isFollowUpForCopied || isFollowUpForPending) ? " table-row--copy-follow" : ""}${
              isCopied && isFirstRowForPolitician ? " table-row--copy-lead" : ""
            }`}
            style={{ gridTemplateColumns: cols }}
          >
            {showCopy && (
              <div className="row-copy-cell">
                {!isCopied && isFirstRowForPolitician ? (
                  <input
                    type="checkbox"
                    className="row-copy-checkbox"
                    checked={isPending}
                    onChange={(e) => {
                      e.stopPropagation();
                      onPendingToggle(t.politicianId);
                    }}
                  />
                ) : null}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div
                className="pol-avatar"
                style={{ background: av.bg, color: av.color, flexShrink: 0 }}
              >
                {initials(t.politicianName)}
              </div>
              <button
                type="button"
                className="pol-link"
                onClick={() => onSelectPolitician?.(t.politicianId, {
                  name: t.politicianName,
                  party: t.party,
                })}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div className="pol-name" style={{ fontSize: 12 }}>
                    {t.politicianName}
                  </div>
                  {isCopied && isFirstRowForPolitician && (
                    <span className="copy-indicator" title="You are copying this politician">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM4.5 7.5a.5.5 0 0 1 .5-.5h4.293L7.646 5.354a.5.5 0 1 1 .708-.708l2.5 2.5a.5.5 0 0 1 0 .708l-2.5 2.5a.5.5 0 0 1-.708-.708L9.293 8H5a.5.5 0 0 1-.5-.5z"/>
                      </svg>
                    </span>
                  )}
                </div>
                <div className="pol-meta">
                  {t.party?.replace("Republican", "R").replace("Democrat", "D")}
                </div>
              </button>
            </div>

            <div>
              <div className="issuer-name">{t.issuerName || "—"}</div>
            </div>

            <div>
              <span
                className={`type-badge ${
                  t.tradeType?.toLowerCase() === "buy" ? "buy-badge" : "sell-badge"
                }`}
              >
                {t.tradeType}
              </span>
            </div>

            <div>
              <span className="ticker-badge">{t.ticker}</span>
            </div>

            <div className="date-cell">{t.tradeDate ?? t.publishedDate ?? "—"}</div>

            <div className="size-cell">{fmtSize(t.sizeMin, t.sizeMax)}</div>

            <div className="anomaly-reason-cell" title={t.anomalyReason || ""}>
              {t.anomalyReason || "—"}
            </div>

            <div className="anomaly-score-cell">
              <ScoreBar score={t.anomalyScore != null ? Number(t.anomalyScore) : null} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
