import { fmtSize } from "../utils/tradeHelpers";

export default function TradeTable({ trades, showPolitician, loading, onSelectPolitician }) {
  if (loading) return <div className="loading">Loading trades...</div>;
  if (!trades.length) return <div className="empty">No trades match the current filters.</div>;

  const cols = showPolitician
    ? "1.5fr 1.5fr 80px 80px 110px 90px"
    : "2fr 1fr 80px 80px 110px 90px";

  return (
    <div className="trades-table">
      <div className="table-header" style={{ gridTemplateColumns: cols }}>
        {showPolitician && <div>Politician</div>}
        <div>Company</div>
        <div>Type</div>
        <div>Ticker</div>
        <div>Size</div>
        <div>Trade Date</div>
      </div>
      {trades.map((t, i) => (
        <div key={t.id ?? i} className="table-row" style={{ gridTemplateColumns: cols }}>
          {showPolitician ? (
            <div>
              <button
                type="button"
                className="pol-link"
                onClick={() => onSelectPolitician?.(t.politicianId)}
              >
                <div className="pol-name" style={{ fontSize: 12 }}>{t.politicianName}</div>
                <div className="pol-meta">{t.party?.replace("Republican", "R").replace("Democrat", "D")}</div>
              </button>
            </div>
          ) : null}

          <div>
            <div className="issuer-name">{t.issuerName || "—"}</div>
            {t.filedAfterDays != null && (
              <div className="issuer-meta">filed {t.filedAfterDays}d after</div>
            )}
          </div>

          <div>
            <span className={`type-badge ${t.tradeType?.toLowerCase() === "buy" ? "buy-badge" : "sell-badge"}`}>
              {t.tradeType}
            </span>
          </div>

          <div>
            <span className="ticker-badge">{t.ticker}</span>
          </div>

          <div className="size-cell">{fmtSize(t.sizeMin, t.sizeMax)}</div>
          <div className="date-cell">{t.tradeDate ?? t.publishedDate ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}
