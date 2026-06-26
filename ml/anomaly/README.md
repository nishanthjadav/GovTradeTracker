# Trade Anomaly Scoring

Offline batch job that computes an anomaly score (0-1) and a short
human-readable reason for every trade in the database. Surfaced in the UI as
a chip on trade rows and a dedicated "Anomalies" page.

## How it works

Three features per trade, computed in `features.py`:

- **`filing_lateness_z`** — z-score of `filed_after_days` within the politician's own history. Flags politicians who suddenly file unusually late.
- **`size_log_z`** — z-score of `log(midpoint(sizeMin, sizeMax))` within the politician's own history. Flags positions that are unusually large for that person.
- **`cluster_density`** — count of *other* politicians trading the same ticker within ±7 days, normalized by the per-ticker average. Flags coordinated activity.

These feed `sklearn.ensemble.IsolationForest`, and the model's raw scores are converted to 0-1 via percentile rank so the score is directly interpretable as "more anomalous than X% of trades."

The reason string corresponds to whichever feature was most extreme for that trade.

## Running locally

```bash
cd ml/anomaly
pip install -r requirements.txt

# Use your Render external connection string
export DATABASE_URL="postgres://user:pass@host:5432/dbname"
python -m ml.anomaly.score_anomalies
```

The script is idempotent — rerunning it just overwrites all scores. There's no incremental mode (and at current data scale we don't need one).

## Tests

```bash
pip install pytest
pytest ml/anomaly/tests
```

Tests use toy DataFrames — they don't touch the DB.

## CI

Runs weekly via `.github/workflows/anomaly-scoring.yml` (Sundays, 11 AM UTC) and on manual trigger via the Actions tab. The `DATABASE_URL` secret needs to be set in repo Settings → Secrets.

## When this will need a rethink

- **Trade count past ~100k**: the script rescores everything every run. We'd switch to incremental scoring at that point.
- **Per-politician calibration drift**: if politicians change behavior over time (e.g. start filing later as a long-term trend), the z-score becomes less meaningful. Worth revisiting how we window the history.
- **More features**: if we add bill-text similarity (Phase 3) or returns-based features, this is the place they go. Keep `features.py` pure so each new family can be tested in isolation.
