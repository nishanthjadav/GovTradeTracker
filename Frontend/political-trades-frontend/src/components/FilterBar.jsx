import { useMemo } from "react";
import { SORT_OPTIONS, defaultFilters, hasActiveFilters } from "../utils/filterHelpers";
import SearchableSelect from "./SearchableSelect";

export default function FilterBar({ trades, filters, setFilters, profileMode = false }) {
  const tickerOptions = useMemo(() => {
    const s = new Set(trades.map((t) => t.ticker).filter(Boolean));
    return [...s].sort().map((t) => ({ value: t, label: t }));
  }, [trades]);

  const companyOptions = useMemo(() => {
    const s = new Set(trades.map((t) => t.issuerName).filter(Boolean));
    return [...s]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c }));
  }, [trades]);

  const politicianOptions = useMemo(() => {
    const seen = new Map();
    trades.forEach((t) => {
      if (t.politicianName && !seen.has(t.politicianId))
        seen.set(t.politicianId, t.politicianName);
    });
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ value: id, label: name }));
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
        <SearchableSelect
          options={tickerOptions}
          value={filters.ticker}
          onChange={(v) => setFilters((f) => ({ ...f, ticker: v }))}
          placeholder="e.g. NVDA"
          width={120}
          uppercase
        />
      </div>

      <div className="filter-group">
        <label className="filter-label">Company</label>
        <SearchableSelect
          options={companyOptions}
          value={filters.company}
          onChange={(v) => setFilters((f) => ({ ...f, company: v }))}
          placeholder="Search company..."
          width={200}
        />
      </div>

      {!profileMode && politicianOptions.length > 1 && (
        <div className="filter-group">
          <label className="filter-label">Politician</label>
          <SearchableSelect
            options={politicianOptions}
            value={filters.politicianId}
            onChange={(v) => setFilters((f) => ({ ...f, politicianId: v }))}
            placeholder="Search politician..."
            width={200}
          />
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
