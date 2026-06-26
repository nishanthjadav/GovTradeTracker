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
  onCopyToggle,
}) {
  if (loading) return <div className="loading">Loading trades...</div>;
  if (!trades.length) return <div className="empty">No trades match the current filters.</div>;

  const showCopy = showPolitician && copyConfigs && onCopyToggle;

  // only show checkbox on the first row per copied politician — dim the rest
  const checkboxShownFor = new Set();

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
        const av = avatarBg(t.party);

        const isFirstRowForPolitician =
          showCopy && !checkboxShownFor.has(t.politicianId);
        if (showCopy && isCopied) checkboxShownFor.add(t.politicianId);

        const isFollowUpForCopied =
          showCopy && isCopied && !isFirstRowForPolitician;
        const showCheckboxForThisRow = showCopy && (!isCopied || isFirstRowForPolitician);

        return (
          <div
            key={t.id ?? i}
            className={`table-row${isFollowUpForCopied ? " table-row--copy-follow" : ""}${
              isCopied && isFirstRowForPolitician ? " table-row--copy-lead" : ""
            }`}
            style={{ gridTemplateColumns: cols }}
          >
            {showCopy && (
              <div className="row-copy-cell">
                {showCheckboxForThisRow ? (
                  <input
                    type="checkbox"
                    className="row-copy-checkbox"
                    checked={isCopied}
                    onChange={(e) => {
                      e.stopPropagation();
                      onCopyToggle(t.politicianId);
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
                  <div className="pol-name" style={{ fontSize: 12 }}>{t.politicianName}</div>
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
              <span className="ticker-badge">{t.ticker}</span>
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
