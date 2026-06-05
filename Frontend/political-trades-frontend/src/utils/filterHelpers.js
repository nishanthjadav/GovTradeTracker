export const SORT_OPTIONS = [
  { value: "date_desc", label: "Newest First" },
  { value: "date_asc", label: "Oldest First" },
  { value: "size_desc", label: "Largest Trade" },
  { value: "size_asc", label: "Smallest Trade" },
  { value: "filed_asc", label: "Fastest Filed" },
  { value: "filed_desc", label: "Slowest Filed" },
];

export function defaultFilters() {
  return {
    sort: "date_desc",
    tradeType: "all",
    ticker: "",
    politicianId: "",
    party: "all",
    chamber: "all",
    minSize: 0,
  };
}

export function hasActiveFilters(filters) {
  const defaults = defaultFilters();
  return Object.keys(defaults).some((key) => filters[key] !== defaults[key]);
}
