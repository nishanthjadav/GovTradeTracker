# idempotent batch — safe to rerun, rewrites all rows
# usage: DATABASE_URL=postgres://... python -m ml.anomaly.score_anomalies

from __future__ import annotations

import logging
import sys
import time
from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from ml.anomaly import db, features

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("anomaly")


# contamination is a soft hint to the model only — actual scoring is percentile-rank
N_ESTIMATORS = 200
CONTAMINATION = 0.05
RANDOM_STATE = 42


def load_trades(conn) -> pd.DataFrame:
    sql = """
        SELECT
            id,
            politician_id,
            ticker,
            trade_date,
            published_date,
            filed_after_days,
            size_min,
            size_max
        FROM trades
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        cols = [d.name for d in cur.description]
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=cols)
    df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce")
    df["published_date"] = pd.to_datetime(df["published_date"], errors="coerce")
    log.info("Loaded %d trades", len(df))
    return df


def score(trades: pd.DataFrame) -> tuple[np.ndarray, list[str]]:
    feats = features.build_features(trades)
    matrix = feats.matrix

    if len(matrix) < 20:
        # too few rows to fit a meaningful isolation forest — bail with zero scores
        log.warning("Only %d trades — too few to fit Isolation Forest, skipping.", len(matrix))
        return np.zeros(len(matrix)), [""] * len(matrix)

    log.info("Fitting Isolation Forest on %d trades x %d features", *matrix.shape)
    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
    )
    model.fit(matrix)

    # decision_function: higher = more normal — invert then percentile-rank to [0, 1]
    raw = -model.decision_function(matrix)
    ranks = pd.Series(raw).rank(method="average", pct=True).to_numpy()

    reasons = []
    for idx in trades.index:
        reasons.append(features.top_reason(feats.df.loc[idx], trades.loc[idx]))

    return ranks, reasons


def write_scores(conn, ids: Iterable[int], scores: np.ndarray, reasons: list[str]) -> int:
    update_sql = """
        UPDATE trades
           SET anomaly_score = %s,
               anomaly_reason = %s
         WHERE id = %s
    """
    rows = list(zip(
        (round(float(s), 4) for s in scores),
        (r[:120] if r else None for r in reasons),
        ids,
    ))
    with conn.cursor() as cur:
        cur.executemany(update_sql, rows)
    conn.commit()
    return len(rows)


def main() -> int:
    started = time.time()
    with db.connect() as conn:
        trades = load_trades(conn)
        if trades.empty:
            log.info("No trades found — nothing to score.")
            return 0

        scores, reasons = score(trades)
        n = write_scores(conn, trades["id"].tolist(), scores, reasons)

    elapsed = time.time() - started
    above_8 = int((scores >= 0.8).sum())
    log.info("Updated %d trades in %.1fs — %d scored >= 0.8 (top tier).",
             n, elapsed, above_8)
    return 0


if __name__ == "__main__":
    sys.exit(main())
