import { useEffect, useState } from "react";
import { fetchAnomalies } from "../api";
import TradeTable from "./TradeTable";
import Pagination from "./Pagination";

const PAGE_SIZE = 25;
const DEFAULT_LIMIT = 200;

export default function AnomaliesPage({
  copyConfigs,
  onSelectPolitician,
  onCopyToggle,
}) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetchAnomalies(DEFAULT_LIMIT, 0.8)
      .then((data) => setTrades(Array.isArray(data) ? data : []))
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, []);

  const pageCount = Math.max(1, Math.ceil(trades.length / PAGE_SIZE));
  const paginated = trades.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

      <div className="anomalies-disclaimer">
        <strong>Anomalous ≠ improper.</strong> This is a descriptive signal —
        it surfaces trades that stand out from the broader pattern, not
        accusations of wrongdoing. Hover over the ⚠ chip on any trade to see
        which feature drove the score.
      </div>

      {!loading && trades.length === 0 ? (
        <div className="empty">
          No anomalies scored yet. The scorer runs weekly — check back after the
          next Sunday run.
        </div>
      ) : (
        <>
          <div className="trades-table-scroll">
            <TradeTable
              trades={paginated}
              showPolitician={true}
              loading={loading}
              onSelectPolitician={onSelectPolitician}
              copyConfigs={copyConfigs}
              onCopyToggle={onCopyToggle}
            />
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={pageCount}
            pageSize={PAGE_SIZE}
            totalResults={trades.length}
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </>
  );
}
