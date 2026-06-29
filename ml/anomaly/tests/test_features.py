from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.anomaly import features


def _toy_trades() -> pd.DataFrame:
    rows = []
    # politician A: 6 trades, mostly normal filing (4-6 days), one late (60)
    for i, fad in enumerate([4, 5, 6, 4, 5, 60]):
        rows.append({
            "id": 100 + i,
            "politician_id": "A",
            "ticker": "AAPL",
            "trade_date": pd.Timestamp("2026-01-01") + pd.Timedelta(days=i),
            "published_date": pd.Timestamp("2026-01-05") + pd.Timedelta(days=i),
            "filed_after_days": fad,
            "size_min": 1000,
            "size_max": 15000,
        })
    # politician B: 3 trades — below MIN_TRADES_FOR_PER_POL, should use sitewide z
    for i in range(3):
        rows.append({
            "id": 200 + i,
            "politician_id": "B",
            "ticker": "MSFT",
            "trade_date": pd.Timestamp("2026-02-01") + pd.Timedelta(days=i),
            "published_date": pd.Timestamp("2026-02-05") + pd.Timedelta(days=i),
            "filed_after_days": 5,
            "size_min": 5000,
            "size_max": 50000,
        })
    return pd.DataFrame(rows)


def test_midpoint_handles_long_max_sentinel():
    assert features.midpoint_size(1000, 15000) == 8000
    # LONG_MAX_VALUE sentinel → cap at 1.5x min
    capped = features.midpoint_size(1_000_000, features.LONG_MAX_VALUE)
    assert capped == 1_500_000


def test_midpoint_returns_none_for_missing_min():
    assert features.midpoint_size(None, 100) is None


def test_per_politician_z_flags_outlier():
    trades = _toy_trades()
    z = features.compute_filing_lateness_z(trades)
    outlier_row = trades[trades["id"] == 105].index[0]
    normal_row = trades[trades["id"] == 100].index[0]
    assert abs(z.loc[outlier_row]) > abs(z.loc[normal_row]) * 2


def test_small_politician_uses_sitewide_fallback():
    trades = _toy_trades()
    z = features.compute_filing_lateness_z(trades)
    b_rows = trades[trades["politician_id"] == "B"].index
    # sitewide z for filed_after_days=5 is slightly negative — politician A's 60-day outlier drags the mean up
    assert not (z.loc[b_rows] == 0).all()


def test_cluster_density_with_no_clustering_is_zero():
    trades = pd.DataFrame([{
        "id": 1,
        "politician_id": "X",
        "ticker": "UNIQ",
        "trade_date": pd.Timestamp("2026-01-01"),
        "published_date": pd.Timestamp("2026-01-01"),
        "filed_after_days": 5,
        "size_min": 100,
        "size_max": 1000,
    }])
    density = features.compute_cluster_density(trades)
    assert density.iloc[0] == 0.0


def test_cluster_density_flags_cluster():
    trades = pd.DataFrame([
        {"id": 1, "politician_id": "A", "ticker": "NVDA",
         "trade_date": pd.Timestamp("2026-01-01"),
         "published_date": pd.Timestamp("2026-01-01"),
         "filed_after_days": 5, "size_min": 100, "size_max": 1000},
        {"id": 2, "politician_id": "B", "ticker": "NVDA",
         "trade_date": pd.Timestamp("2026-01-02"),
         "published_date": pd.Timestamp("2026-01-02"),
         "filed_after_days": 5, "size_min": 100, "size_max": 1000},
        {"id": 3, "politician_id": "C", "ticker": "NVDA",
         "trade_date": pd.Timestamp("2026-01-03"),
         "published_date": pd.Timestamp("2026-01-03"),
         "filed_after_days": 5, "size_min": 100, "size_max": 1000},
    ])
    density = features.compute_cluster_density(trades)
    # symmetric cluster — within-ticker average == per-trade value so normalized = 1.0
    assert pytest.approx(density.iloc[0], rel=1e-3) == 1.0
    assert pytest.approx(density.iloc[1], rel=1e-3) == 1.0
    assert pytest.approx(density.iloc[2], rel=1e-3) == 1.0


def test_top_reason_picks_dominant_feature():
    feature_row = pd.Series({
        "filing_lateness_z": 0.5,
        "size_log_z": 4.0,  # dominant
        "cluster_density": 1.1,
    })
    trade_row = pd.Series({
        "filed_after_days": 5,
        "size_min": 1_500_000,
        "size_max": 5_000_000,
        "ticker": "MSFT",
    })
    reason = features.top_reason(feature_row, trade_row)
    assert "size" in reason.lower()
    assert len(reason) < 120


def test_top_reason_uses_first_name_when_available():
    feature_row = pd.Series({
        "filing_lateness_z": 0.5,
        "size_log_z": 4.0,
        "cluster_density": 1.1,
    })
    trade_row = pd.Series({
        "filed_after_days": 5,
        "size_min": 1_500_000,
        "size_max": 5_000_000,
        "ticker": "MSFT",
        "politician_name": "Nancy Pelosi",
    })
    reason = features.top_reason(feature_row, trade_row)
    assert "Nancy" in reason
    assert "this politician" not in reason


def test_top_reason_falls_back_when_name_missing():
    # missing/NaN/empty name should still produce a readable reason
    feature_row = pd.Series({
        "filing_lateness_z": 4.0,  # dominant
        "size_log_z": 0.1,
        "cluster_density": 1.0,
    })
    for name in (None, float("nan"), "", "   "):
        trade_row = pd.Series({
            "filed_after_days": 90,
            "size_min": 1000,
            "size_max": 15000,
            "ticker": "AAPL",
            "politician_name": name,
        })
        reason = features.top_reason(feature_row, trade_row)
        assert "this politician" in reason
