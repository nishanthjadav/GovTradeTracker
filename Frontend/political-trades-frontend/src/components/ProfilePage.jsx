import FilterBar from "./FilterBar";
import TradeTable from "./TradeTable";
import Pagination from "./Pagination";

export default function ProfilePage({
  activePol,
  enrichedTrades,
  filters,
  setFilters,
  filteredTrades,
  totalBuys,
  totalSells,
  paginatedTrades,
  tradesLoading,
  currentPage,
  pageCount,
  setCurrentPage,
  onBack,
}) {
  return (
    <>
      <div className="content-header">
        <div>
          <div className="content-title">{activePol?.name}</div>
          <div className="content-sub">
            {activePol?.party} | {activePol?.chamber} | {activePol?.state}
          </div>
        </div>
      </div>
           <div style={{ height: 16 }} />

      <FilterBar trades={enrichedTrades} filters={filters} setFilters={setFilters} profileMode={true} />
      <div className="results-meta">
        {filteredTrades.length.toLocaleString()} trades
        <span className="results-breakdown">
          <span className="buy-text">{totalBuys} buys</span>
          <span> | </span>
          <span className="sell-text">{totalSells} sells</span>
        </span>
      </div>
      <div className="trades-table-scroll">
        <TradeTable trades={paginatedTrades} showPolitician={false} loading={tradesLoading} />
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={pageCount}
        pageSize={25}
        totalResults={filteredTrades.length}
        onPageChange={setCurrentPage}
      />
    </>
  );
}
