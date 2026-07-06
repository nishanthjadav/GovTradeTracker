// pure allocation helpers used by App.jsx to keep portfolio percentages
// summing to exactly 100 as politicians are added/removed.
// all functions take (configs, profile, politiciansById) and return
// { id -> percent } — configs' ids can be numeric (real) or string (optimistic).

export function round1(n) { return Math.round(n * 2) / 2; }

function partyOf(cfg) { return cfg.__party || cfg.politician?.party || cfg.party || ""; }
function isDem(p) { return !!p && p.toLowerCase().includes("democrat"); }
function isRep(p) { return !!p && p.toLowerCase().includes("republican"); }

function distribute(ids, budget) {
  if (ids.length === 0) return {};
  const each = round1(budget / ids.length);
  const out = {};
  for (const id of ids) out[id] = each;
  const sum = ids.reduce((s, id) => s + out[id], 0);
  const delta = budget - sum;
  if (delta !== 0) out[ids[0]] = round1(out[ids[0]] + delta);
  return out;
}

// force `pcts` map to sum to exactly 100 by nudging the largest entry
function forceSum100(pcts) {
  const ids = Object.keys(pcts);
  if (ids.length === 0) return pcts;
  const sum = ids.reduce((s, id) => s + pcts[id], 0);
  const delta = 100 - sum;
  if (delta === 0) return pcts;
  const largest = ids.reduce((a, b) => (pcts[a] >= pcts[b] ? a : b));
  return { ...pcts, [largest]: round1(pcts[largest] + delta) };
}

export function computeAllocations(configs, profile, politiciansById) {
  if (configs.length === 0) return {};

  const enriched = configs.map((c) => ({
    ...c,
    __party: politiciansById.get(c.politicianId)?.party ?? partyOf(c),
  }));

  if (profile === "even") {
    return forceSum100(distribute(enriched.map((c) => c.id), 100));
  }

  if (profile === "demOnly") {
    const dems = enriched.filter((c) => isDem(c.__party));
    if (dems.length === 0) return forceSum100(distribute(enriched.map((c) => c.id), 100));
    const share = distribute(dems.map((c) => c.id), 100);
    for (const c of enriched) if (!(c.id in share)) share[c.id] = 0;
    return forceSum100(share);
  }

  if (profile === "repOnly") {
    const reps = enriched.filter((c) => isRep(c.__party));
    if (reps.length === 0) return forceSum100(distribute(enriched.map((c) => c.id), 100));
    const share = distribute(reps.map((c) => c.id), 100);
    for (const c of enriched) if (!(c.id in share)) share[c.id] = 0;
    return forceSum100(share);
  }

  if (profile === "dem75" || profile === "rep75") {
    const dems = enriched.filter((c) => isDem(c.__party));
    const reps = enriched.filter((c) => isRep(c.__party));
    const others = enriched.filter((c) => !isDem(c.__party) && !isRep(c.__party));
    const heavy = profile === "dem75" ? dems : reps;
    const light = profile === "dem75" ? reps : dems;
    if (heavy.length === 0 && light.length === 0) {
      return forceSum100(distribute(others.map((c) => c.id), 100));
    }
    if (heavy.length === 0) {
      const share = distribute(light.map((c) => c.id), 100);
      for (const c of others) share[c.id] = 0;
      return forceSum100(share);
    }
    if (light.length === 0) {
      const share = distribute(heavy.map((c) => c.id), 100);
      for (const c of others) share[c.id] = 0;
      return forceSum100(share);
    }
    const share = {
      ...distribute(heavy.map((c) => c.id), 75),
      ...distribute(light.map((c) => c.id), 25),
    };
    for (const c of others) share[c.id] = 0;
    return forceSum100(share);
  }

  // custom: preserve relative ratios of anyone with a non-zero percentage,
  // and give newly added entries (percent == 0) a fair 100/N share. existing
  // shares scale down proportionally to make room. this way clicking "even
  // distribution" is still what handles a full re-slice; add-under-custom
  // does the minimum-effort thing.
  const N = enriched.length;
  const zeroCount = enriched.filter((c) => Number(c.portfolioPercent ?? 0) <= 0).length;
  if (zeroCount === N) {
    // nothing to preserve, fall back to even split
    return forceSum100(distribute(enriched.map((c) => c.id), 100));
  }
  const nonZeroTotal = enriched.reduce(
    (s, c) => s + Math.max(0, Number(c.portfolioPercent ?? 0)), 0
  );
  const newcomerShare = zeroCount > 0 ? (100 / N) * zeroCount : 0;
  const remainingBudget = 100 - newcomerShare;
  const scale = nonZeroTotal > 0 ? remainingBudget / nonZeroTotal : 0;
  const out = {};
  const zeroBudget = zeroCount > 0 ? newcomerShare / zeroCount : 0;
  for (const c of enriched) {
    const current = Number(c.portfolioPercent ?? 0);
    if (current <= 0) {
      out[c.id] = round1(zeroBudget);
    } else {
      out[c.id] = round1(current * scale);
    }
  }
  return forceSum100(out);
}

export function computeActiveFlags(configs, profile, politiciansById) {
  if (profile !== "demOnly" && profile !== "repOnly") return {};
  const out = {};
  for (const c of configs) {
    const party = politiciansById.get(c.politicianId)?.party ?? partyOf(c);
    out[c.id] = profile === "demOnly" ? isDem(party) : isRep(party);
  }
  return out;
}
