"""
Scrapes CapitolTrades newest-first and pushes each page to the backend immediately.

Stops as soon as we hit `DUPLICATE_PAGE_STOP_THRESHOLD` consecutive pages where the
backend reports zero new trades saved — i.e. we've caught up to what's already in
the DB. Because CapitolTrades sorts newest-first, this means a typical daily run
only fetches a handful of pages instead of all ~3,000.

Usage: python -m ml.scraper.scrape_and_push
Required env vars:
  INGEST_SECRET  — must match the backend's INGEST_SECRET env var
  BACKEND_URL    — e.g. https://your-backend.onrender.com
Optional env vars:
  MAX_PAGES                       — hard cap on pages scraped (default 3500)
  DUPLICATE_PAGE_STOP_THRESHOLD   — # of consecutive all-skipped pages before stopping (default 2)
"""

from __future__ import annotations

import logging
import os
import re
import sys
import time
import random
from typing import Optional

import requests
from bs4 import BeautifulSoup

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("scraper")

BASE_URL = "https://www.capitoltrades.com/trades"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

LONG_MAX = 9_223_372_036_854_775_807
SIZE_RE = re.compile(r"([\d.]+)(K|M)?[–\-]([\d.]+)(K|M)?|([\d.]+)(K|M)?\+")
TRADE_ID_RE = re.compile(r"/trades/(\d+)")
POL_ID_RE = re.compile(r"/politicians/([A-Z0-9]+)", re.IGNORECASE)
TICKER_RE = re.compile(r"([A-Z]{1,5}):[A-Z]{2}")


def fetch_page(session: requests.Session, page_num: int) -> Optional[str]:
    url = f"{BASE_URL}?page={page_num}"
    resp = session.get(url, headers=HEADERS, timeout=20)
    if resp.status_code == 429:
        log.error("HTTP 429 on page %d — rate-limited, stopping.", page_num)
        return None
    if resp.status_code != 200:
        raise RuntimeError(f"Unexpected status {resp.status_code} on page {page_num}")
    if "Vercel Security Checkpoint" in resp.text or "_vcrcs" in resp.text:
        log.error("Vercel Security Checkpoint on page %d — blocked, stopping.", page_num)
        return None
    if "Just a moment" in resp.text or "cf-browser-verification" in resp.text:
        log.error("Cloudflare challenge on page %d — stopping.", page_num)
        return None
    return resp.text


def parse_size(text: str) -> tuple[int, int]:
    if not text:
        return 0, 0
    m = SIZE_RE.search(text.strip())
    if not m:
        return 0, 0
    if m.group(5) is not None:
        return int(_amount(m.group(5), m.group(6))), LONG_MAX
    return int(_amount(m.group(1), m.group(2))), int(_amount(m.group(3), m.group(4)))


def _amount(num: str, unit: Optional[str]) -> float:
    v = float(num)
    if unit == "K":
        v *= 1_000
    elif unit == "M":
        v *= 1_000_000
    return v


def parse_split_date(cell) -> Optional[str]:
    """Date cells have two stacked divs: e.g. '26 May' + '2026', or 'Today'."""
    divs = cell.select("div > div")
    if len(divs) >= 2:
        p1, p2 = divs[0].get_text(strip=True), divs[1].get_text(strip=True)
        if p2.lower() == "today":
            from datetime import date
            return date.today().isoformat()
        if p2.lower() == "yesterday":
            from datetime import date, timedelta
            return (date.today() - timedelta(days=1)).isoformat()
        combined = f"{p1} {p2}"
        parsed = _try_parse_date(combined)
        if parsed:
            return parsed
    return _try_parse_date(cell.get_text(strip=True))


def _try_parse_date(text: str) -> Optional[str]:
    from datetime import date
    text = text.strip()
    if not text:
        return None
    if text.lower() == "today":
        return date.today().isoformat()
    if text.lower() == "yesterday":
        from datetime import timedelta
        return (date.today() - timedelta(days=1)).isoformat()
    # strip leading time component like "11:15 "
    text = re.sub(r"^\d{1,2}:\d{2}\s*", "", text).strip()
    for fmt in ("%d %b %Y", "%b %Y"):
        try:
            from datetime import datetime
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def parse_row(row) -> Optional[dict]:
    cells = row.select("td")
    if len(cells) < 8:
        return None

    # trade id
    trade_link = row.select("a[href*='/trades/']")
    trade_link = trade_link[-1] if trade_link else None
    if not trade_link:
        return None
    m = TRADE_ID_RE.search(trade_link["href"])
    if not m:
        return None
    capitol_trades_id = m.group(1)

    # politician
    pol_cell = cells[0]
    pol_a = pol_cell.select_one("a")
    politician_name = pol_a.get_text(strip=True) if pol_a else None
    pol_href = pol_cell.select_one("a[href*='/politicians/']")
    pol_id_m = POL_ID_RE.search(pol_href["href"]) if pol_href else None
    politician_id = pol_id_m.group(1).upper() if pol_id_m else "UNKNOWN"

    party_el   = pol_cell.select_one(".party")
    chamber_el = pol_cell.select_one(".chamber")
    state_el   = pol_cell.select_one("[class*=us-state-compact--]")
    party   = party_el.get_text(strip=True)   if party_el   else None
    chamber = chamber_el.get_text(strip=True) if chamber_el else None
    state   = state_el.get_text(strip=True)   if state_el   else None

    # issuer / ticker
    issuer_cell = cells[1]
    issuer_a = issuer_cell.select_one("a")
    issuer_name = issuer_a.get_text(strip=True) if issuer_a else issuer_cell.get_text(strip=True)
    ticker_m = TICKER_RE.search(issuer_cell.get_text())
    ticker = ticker_m.group(1) if ticker_m else None

    published_date = parse_split_date(cells[2])
    trade_date     = parse_split_date(cells[3])

    # filed after days
    filed_el = cells[4].select_one(".q-value")
    filed_text = filed_el.get_text(strip=True) if filed_el else cells[4].get_text(strip=True)
    filed_m = re.search(r"(\d+)", filed_text)
    filed_after_days = int(filed_m.group(1)) if filed_m else None

    # owner
    owner_label = cells[5].select_one(".q-label")
    owner = owner_label.get_text(strip=True) if owner_label else cells[5].get_text(strip=True)

    # trade type
    tx_el = cells[6].select_one(".tx-type")
    trade_type = (tx_el.get_text(strip=True) if tx_el else cells[6].get_text(strip=True)).lower()

    # size
    size_el = cells[7].select_one(".mt-1")
    size_text = size_el.get_text(strip=True) if size_el else cells[7].get_text(strip=True)
    size_min, size_max = parse_size(size_text)

    # price
    price = None
    if len(cells) > 8:
        p_text = cells[8].get_text(strip=True).replace("$", "").replace(",", "").strip()
        if p_text and p_text.lower() != "n/a":
            try:
                price = float(p_text)
            except ValueError:
                pass

    return {
        "capitolTradesId": capitol_trades_id,
        "politicianId":    politician_id,
        "politicianName":  politician_name,
        "party":           party,
        "chamber":         chamber,
        "state":           state,
        "issuerName":      issuer_name,
        "ticker":          ticker,
        "publishedDate":   published_date,
        "tradeDate":       trade_date,
        "filedAfterDays":  filed_after_days,
        "owner":           owner,
        "tradeType":       trade_type,
        "sizeMin":         size_min,
        "sizeMax":         size_max,
        "price":           price,
    }


def push_page(page_trades: list[dict], backend_url: str, secret: str) -> Optional[dict]:
    """POST one page worth of trades to the backend. Returns the {saved, skipped, errors}
    response dict, or None if push failed in a way we don't want to retry (e.g. 401)."""
    if not page_trades:
        return {"saved": 0, "skipped": 0, "errors": 0}
    resp = requests.post(
        f"{backend_url}/api/ingest/trades",
        json=page_trades,
        headers={
            "Content-Type": "application/json",
            "X-Ingest-Secret": secret,
        },
        timeout=30,
    )
    if resp.status_code == 401:
        log.error("Ingest secret rejected — check INGEST_SECRET matches on both sides.")
        return None
    resp.raise_for_status()
    return resp.json()


def scrape_and_push(backend_url: str, secret: str,
                    max_pages: int, duplicate_page_stop_threshold: int) -> tuple[int, int, int]:
    """Scrape page-by-page, pushing each page immediately. Stop early once we've seen
    `duplicate_page_stop_threshold` consecutive pages where the backend saved nothing new.
    Returns (total_saved, total_skipped, total_errors)."""
    session = requests.Session()

    # Warm-up: hit the homepage so Vercel sets its session cookie
    log.info("Warm-up GET /")
    try:
        session.get("https://www.capitoltrades.com/", headers=HEADERS, timeout=15)
        time.sleep(1.5 + random.random())
    except Exception as e:
        log.warning("Warm-up failed (continuing): %s", e)

    page_num = 1
    max_consecutive_errors = 5
    consecutive_errors = 0
    consecutive_all_skipped = 0
    total_saved = total_skipped = total_errors = 0

    while page_num <= max_pages:
        log.info("Scraping page %d", page_num)
        try:
            html = fetch_page(session, page_num)
            if html is None:
                break

            soup = BeautifulSoup(html, "html.parser")
            rows = soup.select("table tbody tr")

            if not rows:
                log.info("No rows on page %d — end of data.", page_num)
                break

            consecutive_errors = 0
            page_trades = []
            page_unparseable = 0

            for row in rows:
                parsed = parse_row(row)
                if parsed:
                    page_trades.append(parsed)
                else:
                    page_unparseable += 1

            if page_unparseable:
                log.warning("Page %d: %d row(s) failed to parse.", page_num, page_unparseable)

            if not page_trades:
                log.info("Page %d had no parseable trades — stopping.", page_num)
                break

            # Push this page right away so an interrupted run still saves progress.
            result = push_page(page_trades, backend_url, secret)
            if result is None:
                return total_saved, total_skipped, total_errors
            saved   = result.get("saved",   0)
            skipped = result.get("skipped", 0)
            errors  = result.get("errors",  0)
            total_saved   += saved
            total_skipped += skipped
            total_errors  += errors
            log.info("Page %d pushed — saved: %d, skipped: %d, errors: %d",
                     page_num, saved, skipped, errors)

            # Early-exit: if the backend saved nothing on this page, we've caught up to
            # already-known trades. Require N consecutive such pages to guard against
            # flukes (e.g. a single all-duplicate page from a prior partial run).
            if saved == 0 and errors == 0:
                consecutive_all_skipped += 1
                if consecutive_all_skipped >= duplicate_page_stop_threshold:
                    log.info("Hit %d consecutive all-skipped pages — caught up, stopping.",
                             consecutive_all_skipped)
                    break
            else:
                consecutive_all_skipped = 0

            page_num += 1
            time.sleep(4.5 + random.random() * 1.5)

        except Exception as e:
            consecutive_errors += 1
            log.error("Error on page %d (%d/%d): %s", page_num, consecutive_errors, max_consecutive_errors, e)
            if consecutive_errors >= max_consecutive_errors:
                log.error("Reached %d consecutive errors — aborting.", max_consecutive_errors)
                break
            backoff = min(60, 15 * (2 ** (consecutive_errors - 1)))
            log.info("Backing off %ds.", backoff)
            time.sleep(backoff)

    return total_saved, total_skipped, total_errors


def main() -> int:
    backend_url = os.environ.get("BACKEND_URL", "").rstrip("/")
    secret      = os.environ.get("INGEST_SECRET", "")

    if not backend_url:
        log.error("BACKEND_URL env var is required.")
        return 1
    if not secret:
        log.error("INGEST_SECRET env var is required.")
        return 1

    max_pages = int(os.environ.get("MAX_PAGES", "3500"))
    dup_threshold = int(os.environ.get("DUPLICATE_PAGE_STOP_THRESHOLD", "2"))

    saved, skipped, errors = scrape_and_push(backend_url, secret, max_pages, dup_threshold)
    log.info("Run complete — total saved: %d, skipped: %d, errors: %d", saved, skipped, errors)
    return 0


if __name__ == "__main__":
    sys.exit(main())
