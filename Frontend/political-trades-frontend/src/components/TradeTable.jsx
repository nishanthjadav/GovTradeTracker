import { fmtSize } from "../utils/tradeHelpers";

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

// keep in sync with AnomaliesPage default minScore — top 20% most anomalous
const ANOMALY_CHIP_THRESHOLD = 0.8;

export default function TradeTable({
  trades,
  showPolitician,
  loading,
  onSelectPolitician,
  copyConfigs,
  pendingCopyIds,
  onPendingToggle,
}) {
  if (loading) return <div className="loading">Loading trades...</div>;
  if (!trades.length) return <div className="empty">No trades match the current filters.</div>;

  const showCopy = showPolitician && copyConfigs && onPendingToggle;

  const seenPoliticians = new Set();

  const cols = showPolitician
    ? showCopy
      ? "36px minmax(130px,1fr) minmax(130px,1fr) 100px 100px 130px 110px"
      : "minmax(130px,1fr) minmax(130px,1fr) 100px 100px 130px 110px"
    : "minmax(160px,2fr) minmax(80px,1fr) 100px 100px 130px 110px";

  return (
    <div className="trades-table">
      <div className="table-header" style={{ gridTemplateColumns: cols }}>
        {showCopy && <div />}
        {showPolitician && <div>Politician</div>}
        <div>Company</div>
        <div>Type</div>
        <div>Ticker</div>
        <div>Size</div>
        <div>Trade Date</div>
      </div>
      {trades.map((t, i) => {
        const isCopied = showCopy
          ? !!copyConfigs.find((c) => c.politicianId === t.politicianId)
          : false;
        const isPending = showCopy ? !!(pendingCopyIds?.has(t.politicianId)) : false;
        const av = avatarBg(t.party);

        const isFirstRowForPolitician = !seenPoliticians.has(t.politicianId);
        seenPoliticians.add(t.politicianId);

        const isFollowUpForCopied = isCopied && !isFirstRowForPolitician;
        const isFollowUpForPending = isPending && !isFirstRowForPolitician;

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
                {!isCopied ? (
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

            {showPolitician ? (
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
                  onClick={() => onSelectPolitician?.(t.politicianId)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div className="pol-name" style={{ fontSize: 12 }}>{t.politicianName}</div>
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
            ) : null}

            <div>
              <div className="issuer-row">
                <div className="issuer-name">{t.issuerName || "—"}</div>
              </div>
              {t.filedAfterDays != null && (
                <div className="issuer-meta">filed {t.filedAfterDays}d after</div>
              )}
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
              {t.ticker && <span className="ticker-badge">{t.ticker}</span>}
            </div>

            <div className="size-cell">{fmtSize(t.sizeMin, t.sizeMax)}</div>
            <div className="date-cell">
              {t.tradeDate ?? t.publishedDate ?? "—"}
              {t.anomalyScore != null && t.anomalyScore >= ANOMALY_CHIP_THRESHOLD && (
                <span
                  className="anomaly-dot"
                  title={t.anomalyReason || "Statistically unusual trade"}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
