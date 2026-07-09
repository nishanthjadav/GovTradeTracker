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
  // spread the rounding remainder in ±0.5 steps across as many entries as
  // needed, one step per entry, cycling. this avoids dumping the whole
  // correction on a single entry (which could zero it — e.g. N=21 where
  // round1(100/21)=5.0 overshoots by 5.0). no active entry is zeroed unless
  // the budget genuinely can't give everyone at least a 0.5 step.
  const sum = ids.reduce((s, id) => s + out[id], 0);
  let delta = round1(budget - sum);
  const step = delta > 0 ? 0.5 : -0.5;
  let i = 0;
  let guard = 0;
  const maxIter = ids.length * Math.ceil(Math.abs(delta) / 0.5) + ids.length;
  while (Math.abs(delta) >= 0.5 && guard++ < maxIter) {
    const id = ids[i % ids.length];
    // don't push any entry below 0 while correcting downward
    if (step < 0 && out[id] < 0.5) { i++; continue; }
    out[id] = round1(out[id] + step);
    delta = round1(delta - step);
    i++;
  }
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

  // custom: preserve relative ratios of existing entries, and give newly
  // added entries a fair 100/N share; existing shares scale down proportionally
  // to make room. this way clicking "even distribution" is still what handles a
  // full re-slice; add-under-custom does the minimum-effort thing.
  //
  // "newcomer" is an entry that isn't persisted yet — App.jsx tags optimistic
  // stubs with a non-numeric id (`optimistic-<politicianId>`). we key off that,
  // NOT off percent == 0: a pre-existing (numeric-id) row sitting at 0% is a
  // real, intentionally-zero entry (e.g. a paused copy) and must not be
  // reclassified as a newcomer — doing so used to steal budget and strand a
  // neighbor at 0%.
  const isNewcomer = (c) => typeof c.id !== "number";
  const N = enriched.length;
  const newcomers = enriched.filter(isNewcomer);
  const existing = enriched.filter((c) => !isNewcomer(c));
  const newcomerCount = newcomers.length;
  const existingNonZeroTotal = existing.reduce(
    (s, c) => s + Math.max(0, Number(c.portfolioPercent ?? 0)), 0
  );
  // if there's nothing meaningful to preserve (no newcomers and existing all
  // zero, or everything is a newcomer), fall back to an even split.
  if ((newcomerCount === 0 && existingNonZeroTotal <= 0) || newcomerCount === N) {
    return forceSum100(distribute(enriched.map((c) => c.id), 100));
  }
  const newcomerShare = newcomerCount > 0 ? (100 / N) * newcomerCount : 0;
  const remainingBudget = 100 - newcomerShare;
  const scale = existingNonZeroTotal > 0 ? remainingBudget / existingNonZeroTotal : 0;
  const out = {};
  const newcomerBudget = newcomerCount > 0 ? newcomerShare / newcomerCount : 0;
  for (const c of enriched) {
    if (isNewcomer(c)) {
      out[c.id] = round1(newcomerBudget);
    } else {
      out[c.id] = round1(Math.max(0, Number(c.portfolioPercent ?? 0)) * scale);
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
