# three feature families — keep them orthogonal-ish so the "reason" string is meaningful

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

# per-pol stats are too noisy below this many trades
MIN_TRADES_FOR_PER_POL = 5

CLUSTER_WINDOW_DAYS = 7

# Long.MAX_VALUE sentinel from the Java scraper for open-ended size ranges like "$1M+"
LONG_MAX_VALUE = 9_223_372_036_854_775_807


@dataclass
class FeatureFrame:
    df: pd.DataFrame

    @property
    def matrix(self) -> np.ndarray:
        cols = ["filing_lateness_z", "size_log_z", "cluster_density"]
        return self.df[cols].fillna(0.0).to_numpy()


def midpoint_size(size_min: Optional[float], size_max: Optional[float]) -> Optional[float]:
    if size_min is None or pd.isna(size_min):
        return None
    if size_max is None or pd.isna(size_max) or size_max >= LONG_MAX_VALUE:
        # open-ended upper bound — cap at 1.5x lower to match the java scraper's computeSellQty
        return float(size_min) * 1.5
    return (float(size_min) + float(size_max)) / 2.0


def _zscore(series: pd.Series) -> pd.Series:
    if len(series) == 0:
        return series
    mean = series.mean()
    std = series.std(ddof=0)
    if std is None or std == 0 or pd.isna(std):
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - mean) / std


def _per_politician_z(values: pd.Series, politician_ids: pd.Series) -> pd.Series:
    result = pd.Series(np.zeros(len(values)), index=values.index, dtype=float)
    sitewide = _zscore(values.dropna())

    for pid, group_idx in politician_ids.groupby(politician_ids).groups.items():
        group_vals = values.loc[group_idx].dropna()
        if len(group_vals) >= MIN_TRADES_FOR_PER_POL:
            z = _zscore(group_vals)
            result.loc[z.index] = z
        else:
            # fall back to sitewide z when the politician's group is too small
            result.loc[group_vals.index] = sitewide.loc[group_vals.index]
    return result


def compute_filing_lateness_z(trades: pd.DataFrame) -> pd.Series:
    # null filed_after_days stays NaN — fillna(0) later treats it as "average", not a penalty
    return _per_politician_z(trades["filed_after_days"].astype(float),
                             trades["politician_id"])


def compute_size_log_z(trades: pd.DataFrame) -> pd.Series:
    midpoints = trades.apply(
        lambda r: midpoint_size(r["size_min"], r["size_max"]), axis=1
    )
    # log1p handles zero/None safely
    log_sizes = midpoints.apply(lambda m: np.log1p(m) if m is not None else None)
    return _per_politician_z(log_sizes.astype(float), trades["politician_id"])


def compute_cluster_density(trades: pd.DataFrame) -> pd.Series:
    # result > 1 means above-average clustering for this ticker; missing ticker/date gets 0
    result = pd.Series(np.zeros(len(trades)), index=trades.index, dtype=float)

    effective_date = trades["trade_date"].fillna(trades["published_date"])
    valid = trades["ticker"].notna() & effective_date.notna()
    if not valid.any():
        return result

    window = pd.Timedelta(days=CLUSTER_WINDOW_DAYS)

    ticker_groups = trades.loc[valid].assign(_date=effective_date.loc[valid])

    per_ticker_avg: dict[str, float] = {}

    for ticker, group in ticker_groups.groupby("ticker"):
        dates = group["_date"].to_numpy()
        politicians = group["politician_id"].to_numpy()
        counts = np.zeros(len(group), dtype=int)
        for i in range(len(group)):
            window_mask = (np.abs(dates - dates[i]) <= window) & (politicians != politicians[i])
            counts[i] = int(window_mask.sum())
        avg = max(float(counts.mean()), 1e-6)
        per_ticker_avg[ticker] = avg
        # normalize by per-ticker average so tickers everyone trades don't dominate
        normalized = counts / avg
        result.loc[group.index] = normalized

    return result


def build_features(trades: pd.DataFrame) -> FeatureFrame:
    df = pd.DataFrame(index=trades.index)
    df["filing_lateness_z"] = compute_filing_lateness_z(trades)
    df["size_log_z"] = compute_size_log_z(trades)
    df["cluster_density"] = compute_cluster_density(trades)
    return FeatureFrame(df=df)


def top_reason(feature_row: pd.Series, trade_row: pd.Series) -> str:
    # for cluster_density, ratio > 1 is the "extreme" direction — treat like a positive z
    candidates = [
        ("filing_lateness_z", abs(feature_row["filing_lateness_z"])),
        ("size_log_z", abs(feature_row["size_log_z"])),
        ("cluster_density", max(feature_row["cluster_density"] - 1.0, 0.0)),
    ]
    candidates.sort(key=lambda x: x[1], reverse=True)
    name = candidates[0][0]

    if name == "filing_lateness_z":
        fad = trade_row.get("filed_after_days")
        if fad is None or pd.isna(fad):
            return "Unusual filing pattern for this politician"
        return f"Filed {int(fad)} days after trade — unusual for this politician"

    if name == "size_log_z":
        mid = midpoint_size(trade_row.get("size_min"), trade_row.get("size_max"))
        if mid is None:
            return "Unusual position size for this politician"
        if mid >= 1_000_000:
            label = f"~${mid / 1_000_000:.1f}M"
        elif mid >= 1_000:
            label = f"~${mid / 1_000:.0f}K"
        else:
            label = f"~${mid:.0f}"
        return f"Position size {label} — unusual for this politician"

    ticker = trade_row.get("ticker") or "this ticker"
    return f"Many politicians traded {ticker} within a week of this trade"
