export const fmtSize = (min, max) => {
  if (!min && !max) return "—";
  const fmtNum = (n) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${(n / 1_000).toFixed(0)}K`;
  if (max === 9223372036854775807 || max > 5_000_000) return `${fmtNum(min)}+`;
  return `${fmtNum(min)} - ${fmtNum(max)}`;
};

const parseDateValue = (value) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getSortDateValue = (trade) => {
  const publishedDateVal = parseDateValue(trade.publishedDate);
  const tradeDateVal = parseDateValue(trade.tradeDate);
  return publishedDateVal || tradeDateVal || 0;
};

const normalizeChamber = (value) => value?.toString().trim().toLowerCase() ?? "";

export const applyFilters = (trades, filters) => {
  let result = [...trades];

  if (filters.tradeType !== "all")
    result = result.filter((t) => t.tradeType?.toLowerCase() === filters.tradeType);

  if (filters.ticker)
    result = result.filter((t) => t.ticker?.toUpperCase().includes(filters.ticker));

  if (filters.company)
    result = result.filter((t) =>
      t.issuerName?.toLowerCase().includes(filters.company.toLowerCase())
    );

  if (filters.politicianId)
    result = result.filter((t) => t.politicianId === filters.politicianId);

  if (filters.party !== "all")
    result = result.filter((t) => t.party?.toLowerCase().includes(filters.party));

  if (filters.chamber !== "all")
    result = result.filter(
      (t) => normalizeChamber(t.chamber) === normalizeChamber(filters.chamber)
    );

  if (filters.minSize > 0)
    result = result.filter((t) => (t.sizeMin ?? 0) >= filters.minSize);

  result = [...result].sort((a, b) => {
    const aDate = getSortDateValue(a);
    const bDate = getSortDateValue(b);

    switch (filters.sort) {
      case "date_asc":
        return aDate - bDate;
      case "date_desc":
        return bDate - aDate;
      case "scraped_desc":
      case "scraped_asc": {
        const aScraped = parseDateValue(a.scrapedAt);
        const bScraped = parseDateValue(b.scrapedAt);
        // trades without a scrapedAt sink to the bottom in both directions —
        // "oldest scraped" should still be a scraped trade, not an unscraped one
        if (!aScraped && !bScraped) return 0;
        if (!aScraped) return 1;
        if (!bScraped) return -1;
        return filters.sort === "scraped_asc" ? aScraped - bScraped : bScraped - aScraped;
      }
      case "size_desc":
        return (b.sizeMin ?? 0) - (a.sizeMin ?? 0);
      case "size_asc":
        return (a.sizeMin ?? 0) - (b.sizeMin ?? 0);
      case "filed_asc":
        return (a.filedAfterDays ?? 999) - (b.filedAfterDays ?? 999);
      case "filed_desc":
        return (b.filedAfterDays ?? 0) - (a.filedAfterDays ?? 0);
      default:
        return 0;
    }
  });

  return result;
};
