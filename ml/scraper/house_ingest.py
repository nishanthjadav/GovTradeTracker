"""
Ingests US House stock-trade disclosures from the (free, no-auth, daily-updated)
house-stock-watcher community dataset and pushes them to the backend's
/api/ingest/trades endpoint — the same endpoint the CapitolTrades scraper used.

Why this exists: CapitolTrades started returning HTTP 429 (anti-bot), and the
free tiers of the paid APIs (FMP etc.) don't include congressional data. The
house-stock-watcher mirror publishes parsed PTR filings as a single JSON file,
refreshed daily, going back to 2012 — no scraping, no anti-bot, no API key.

Source: https://github.com/TattooedHead/house-stock-watcher-data
         data/all_transactions.json  (raw.githubusercontent.com)

Senate data has no equivalent free/current feed yet — this is House-only.

Usage: python -m ml.scraper.house_ingest
Required env vars:
  INGEST_SECRET  — must match the backend's INGEST_SECRET
  BACKEND_URL    — e.g. https://govtradetracker-backend.onrender.com
Optional env vars:
  HOUSE_DATA_URL — override the source URL (default: the TattooedHead raw file)
  PUSH_BATCH_SIZE      — trades per POST (default 200)
  MAX_DISCLOSURE_AGE_DAYS — only push rows disclosed within N days; omit/0 = all
                            (use a small value like 30 for the daily job, omit for backfill)
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import sys
import time
from datetime import date, datetime
from typing import Optional

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("house_ingest")

DEFAULT_DATA_URL = (
    "https://raw.githubusercontent.com/TattooedHead/"
    "house-stock-watcher-data/HEAD/data/all_transactions.json"
)

# maps the dataset's transaction "type" onto the backend's trade_type vocabulary.
# the backend's copy-trading logic only fires on "buy"/"sell"; anything else is
# stored but never copied. "Exchange" rows are real disclosures we want to keep,
# so we pass them through as "exchange" rather than dropping them.
TYPE_MAP = {
    "purchase": "buy",
    "sale": "sell",
    "sale (partial)": "sell",
    "sale (full)": "sell",
    "exchange": "exchange",
}

LONG_MAX = 9_223_372_036_854_775_807  # matches Java Long.MAX_VALUE (open-ended "$X+")

# "$1,001 - $15,000"  |  "$15,001"  |  "$15,001 -"  |  "$354.20"
_AMOUNT_NUM = re.compile(r"\$([\d,]+(?:\.\d+)?)")


def parse_amount(raw: Optional[str]) -> tuple[int, int]:
    """Return (size_min, size_max) in whole dollars.

    Ranges -> (low, high). A lone value with a trailing dash, or a single bound
    like '$15,001', is treated as open-ended -> (low, LONG_MAX), matching how the
    old scraper encoded CapitolTrades' '$X+' buckets. A single exact dollar value
    (e.g. '$354.20') -> (v, v). Junk (e.g. 'Spouse/DC Over') -> (0, 0).
    """
    if not raw:
        return 0, 0
    nums = _AMOUNT_NUM.findall(raw)
    if not nums:
        return 0, 0
    vals = [int(round(float(n.replace(",", "")))) for n in nums]
    if len(vals) >= 2:
        return vals[0], vals[1]
    # single number present
    lo = vals[0]
    # a trailing dash ("$15,001 -") or a known range-floor implies open-ended
    if raw.rstrip().endswith("-") or lo in (15_001, 50_001, 100_001, 250_001, 500_001, 1_000_001, 5_000_001):
        return lo, LONG_MAX
    return lo, lo  # exact single value


def parse_date(raw: Optional[str]) -> Optional[date]:
    """Dataset dates are MM/DD/YYYY. Returns a date or None (drops '0000-00-00' etc.)."""
    if not raw:
        return None
    raw = raw.strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def clean(s: Optional[str]) -> Optional[str]:
    """Strip null bytes (some PDF-parsed fields contain them) and surrounding space."""
    if s is None:
        return None
    return s.replace("\x00", "").strip() or None


def politician_id_from_name(name: str) -> str:
    """Stable slug PK for the politicians table, e.g. 'David J. Taylor' -> 'HR-DAVID-J-TAYLOR'.
    Prefixed 'HR-' to namespace House reps and avoid colliding with any future Senate ids."""
    slug = re.sub(r"[^A-Z0-9]+", "-", (name or "UNKNOWN").upper()).strip("-")
    return f"HR-{slug}" if slug else "HR-UNKNOWN"


def synth_trade_id(rec: dict) -> str:
    """Deterministic unique id for the backend's dedup key (capitol_trades_id is
    NOT NULL + UNIQUE). The dataset's filing_id is per-FILING, and one filing lists
    many transactions, so we hash filing_id + the fields that distinguish rows
    within a filing. Same row -> same id, so re-running is idempotent."""
    basis = "|".join(str(rec.get(k, "")) for k in (
        "filing_id", "ticker", "transaction_date", "type", "amount", "asset_description", "owner"
    ))
    return "HSW-" + hashlib.sha1(basis.encode("utf-8", "replace")).hexdigest()[:20]


def clean_issuer(desc: Optional[str]) -> Optional[str]:
    """Extract a clean issuer name from the dataset's asset_description.

    Many rows append the PTR's free-text sections onto the asset name, e.g.
    'L3Harris Technologies, Inc. Common Stock F S: New S O: Shares of Restricted
    Stock D: On 6...' — the ' F S:', ' C:', ' D:', ' O:' markers introduce
    Filing-Status / Comment / Description / Owner blobs that can run to 500+ chars
    and blow past the issuer_name varchar(255) column. Cut at the first such marker,
    then hard-cap at 255 as a backstop."""
    s = clean(desc)
    if not s:
        return None
    # cut at the first " X:" style section marker (1-3 uppercase letters + colon)
    m = re.search(r"\s[A-Z]{1,3}:\s", s)
    if m:
        s = s[:m.start()].strip()
    if len(s) > 255:
        s = s[:255].rstrip()
    return s or None


def map_record(rec: dict) -> Optional[dict]:
    """Map one house-stock-watcher record to the backend ingest schema.
    Returns None for rows we can't/shouldn't ingest."""
    trade_type = TYPE_MAP.get((rec.get("type") or "").strip().lower())
    if trade_type is None:
        return None  # unknown transaction type — skip

    trade_date = parse_date(rec.get("transaction_date"))
    disclosure_date = parse_date(rec.get("disclosure_date"))

    filed_after_days = None
    if trade_date and disclosure_date and disclosure_date >= trade_date:
        filed_after_days = (disclosure_date - trade_date).days

    size_min, size_max = parse_amount(rec.get("amount"))

    representative = clean(rec.get("representative")) or "Unknown"
    district = (clean(rec.get("district")) or "")
    state = district[:2].upper() if len(district) >= 2 and district[:2].isalpha() else None

    ticker = clean(rec.get("ticker"))
    if ticker in ("--", "N/A"):
        ticker = None
    # Upstream occasionally mis-parses the ticker from a garbled PDF (e.g. a lone
    # "K" for an Alphabet/GOOGL row). When the asset_description carries an explicit
    # "(TICKER)" and the raw ticker looks suspicious (<=2 chars), trust the parens.
    desc_raw = rec.get("asset_description") or ""
    paren = re.search(r"\(([A-Z]{1,5})\)", desc_raw)
    if paren and (not ticker or len(ticker) <= 2) and paren.group(1) != ticker:
        ticker = paren.group(1)

    return {
        "capitolTradesId": synth_trade_id(rec),
        "politicianId":    politician_id_from_name(representative),
        "politicianName":  representative,
        "party":           None,          # not present in the House feed
        "chamber":         "House",
        "state":           state,
        "issuerName":      clean_issuer(rec.get("asset_description")),
        "ticker":          ticker,
        "publishedDate":   disclosure_date.isoformat() if disclosure_date else None,
        "tradeDate":       trade_date.isoformat() if trade_date else None,
        "filedAfterDays":  filed_after_days,
        "owner":           clean(rec.get("owner")),
        "tradeType":       trade_type,
        "sizeMin":         size_min,
        "sizeMax":         size_max,
        "price":           None,          # not present in the House feed
    }


def push_batch(batch: list[dict], backend_url: str, secret: str) -> Optional[dict]:
    """POST one batch, retrying on transient network/5xx failures. The free-tier
    backend occasionally drops the connection (ConnectionReset) or 502s under load;
    retrying with backoff lets a long backfill ride through it instead of crashing.
    Returns the result dict, or None on a non-retryable auth failure."""
    if not batch:
        return {"saved": 0, "skipped": 0, "errors": 0}
    max_attempts = 5
    for attempt in range(1, max_attempts + 1):
        try:
            resp = requests.post(
                f"{backend_url}/api/ingest/trades",
                json=batch,
                headers={"Content-Type": "application/json", "X-Ingest-Secret": secret},
                timeout=90,
            )
            if resp.status_code == 401:
                log.error("Ingest secret rejected — check INGEST_SECRET matches on both sides.")
                return None
            if resp.status_code >= 500:
                raise requests.exceptions.HTTPError(f"backend {resp.status_code}")
            resp.raise_for_status()
            return resp.json()
        except (requests.exceptions.ConnectionError,
                requests.exceptions.Timeout,
                requests.exceptions.HTTPError) as e:
            if attempt == max_attempts:
                log.error("Batch failed after %d attempts: %s", max_attempts, e)
                raise
            backoff = min(30, 3 * (2 ** (attempt - 1)))
            log.warning("Batch push failed (%s) — attempt %d/%d, backing off %ds.",
                        e, attempt, max_attempts, backoff)
            time.sleep(backoff)


def main() -> int:
    backend_url = os.environ.get("BACKEND_URL", "").rstrip("/")
    secret = os.environ.get("INGEST_SECRET", "")
    if not backend_url:
        log.error("BACKEND_URL env var is required.")
        return 1
    if not secret:
        log.error("INGEST_SECRET env var is required.")
        return 1

    data_url = os.environ.get("HOUSE_DATA_URL", DEFAULT_DATA_URL)
    batch_size = int(os.environ.get("PUSH_BATCH_SIZE", "200"))
    max_age = int(os.environ.get("MAX_DISCLOSURE_AGE_DAYS", "0"))

    log.info("Fetching House dataset: %s", data_url)
    resp = requests.get(data_url, timeout=120)
    resp.raise_for_status()
    records = resp.json()
    log.info("Fetched %d raw records.", len(records))

    cutoff = None
    if max_age > 0:
        cutoff = date.today().toordinal() - max_age

    mapped: list[dict] = []
    skipped_type = skipped_old = 0
    for rec in records:
        if cutoff is not None:
            dd = parse_date(rec.get("disclosure_date"))
            if dd is None or dd.toordinal() < cutoff:
                skipped_old += 1
                continue
        m = map_record(rec)
        if m is None:
            skipped_type += 1
            continue
        mapped.append(m)

    log.info("Mapped %d records (skipped %d unknown-type, %d older-than-%dd).",
             len(mapped), skipped_type, skipped_old, max_age)

    total_saved = total_skipped = total_errors = 0
    for i in range(0, len(mapped), batch_size):
        batch = mapped[i:i + batch_size]
        result = push_batch(batch, backend_url, secret)
        if result is None:
            return 1
        total_saved += result.get("saved", 0)
        total_skipped += result.get("skipped", 0)
        total_errors += result.get("errors", 0)
        log.info("Batch %d-%d pushed — saved: %d, skipped: %d, errors: %d",
                 i, i + len(batch), result.get("saved", 0), result.get("skipped", 0), result.get("errors", 0))
        time.sleep(0.5)  # ease load on the free-tier backend between batches

    log.info("Run complete — total saved: %d, skipped: %d, errors: %d",
             total_saved, total_skipped, total_errors)
    return 0


if __name__ == "__main__":
    sys.exit(main())
