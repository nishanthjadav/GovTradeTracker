import { useMemo } from "react";
import { SORT_OPTIONS, defaultFilters, hasActiveFilters } from "../utils/filterHelpers";

export default function FilterBar({ trades, filters, setFilters, profileMode = false }) {
  const tickers = useMemo(() => {
    const s = new Set(trades.map((t) => t.ticker).filter(Boolean));
    return [...s].sort();
  }, [trades]);

  const politicianOptions = useMemo(() => {
    const seen = new Map();
    trades.forEach((t) => {
      if (t.politicianName && !seen.has(t.politicianId))
        seen.set(t.politicianId, t.politicianName);
    });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [trades]);

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <label className="filter-label">Sort</label>
        <select
          className="filter-select"
          value={filters.sort}
          onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
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
              className={`filter-pill${filters.tradeType === value ? " active" : ""}${
                value === "buy" ? " buy" : value === "sell" ? " sell" : ""
              }`}
              onClick={() => setFilters((f) => ({ ...f, tradeType: value }))}
            >
              {value === "all" ? "All" : value === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label className="filter-label">Ticker</label>
        <input
          className="filter-input"
          placeholder="e.g. NVDA"
          value={filters.ticker}
          onChange={(e) => setFilters((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
          list="ticker-list"
        />
        <datalist id="ticker-list">
          {tickers.map((ticker) => (
            <option key={ticker} value={ticker} />
          ))}
        </datalist>
      </div>

      {!profileMode && politicianOptions.length > 1 && (
        <div className="filter-group">
          <label className="filter-label">Politician</label>
          <select
            className="filter-select"
            value={filters.politicianId}
            onChange={(e) => setFilters((f) => ({ ...f, politicianId: e.target.value }))}
          >
            <option value="">All</option>
            {politicianOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!profileMode && (
        <>
          <div className="filter-group">
            <label className="filter-label">Party</label>
            <div className="filter-pills">
              {[
                { v: "all", label: "All" },
                { v: "democrat", label: "Dem", cls: " dem" },
                { v: "republican", label: "Rep", cls: " rep" },
              ].map(({ v, label, cls = "" }) => (
                <button
                  key={v}
                  className={`filter-pill${filters.party === v ? " active" : ""}${cls}`}
                  onClick={() => setFilters((f) => ({ ...f, party: v }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">Chamber</label>
            <div className="filter-pills">
              {["all", "Senate", "House"].map((value) => (
                <button
                  key={value}
                  className={`filter-pill${filters.chamber === value ? " active" : ""}`}
                  onClick={() => setFilters((f) => ({ ...f, chamber: value }))}
                >
                  {value === "all" ? "All" : value}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="filter-group">
        <label className="filter-label">Min Size</label>
        <select
          className="filter-select"
          value={filters.minSize}
          onChange={(e) => setFilters((f) => ({ ...f, minSize: Number(e.target.value) }))}
        >
          <option value={0}>Any</option>
          <option value={1000}>$1K+</option>
          <option value={15000}>$15K+</option>
          <option value={50000}>$50K+</option>
          <option value={100000}>$100K+</option>
          <option value={250000}>$250K+</option>
          <option value={500000}>$500K+</option>
          <option value={1000000}>$1M+</option>
        </select>
      </div>

      {hasActiveFilters(filters) && (
        <button className="filter-reset" onClick={() => setFilters(defaultFilters())}>
          Clear
        </button>
      )}
    </div>
  );
}
