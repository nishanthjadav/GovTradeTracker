# GovTradeTracker

A web app for tracking stock trades made by US politicians and optionally copying them through your own brokerage account.

## What it does

- Aggregates congressional stock trade disclosures and displays them in a filterable feed
- Browse trades by politician, party, chamber, ticker, or date range
- View individual politician profiles with their full trade history and buy/sell breakdown
- **Leaderboard**: ranks politicians by trading activity
- **Anomalies**: an ML model (Isolation Forest) scores each trade based on filing lateness, trade size, and clustering patterns. High-scoring trades are surfaced here as statistically unusual
- **Copy trading**: sign in with Google, pick politicians to follow, and the app will mirror their new trades into your connected Alpaca brokerage account
- **My Portfolio**: tracks P&L on all copied trades using live prices from Alpaca

## Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Java Spring Boot, PostgreSQL, Alpaca API for brokerage integration
- **ML**: Python + scikit-learn Isolation Forest, runs as a GitHub Actions workflow to keep anomaly scores fresh

## Project structure

```
GovTradeTracker/
├── Backend/political-trades-backend/   # Spring Boot API
├── Frontend/political-trades-frontend/ # React app
└── ml/anomaly/                         # Python anomaly scoring
```

## Running locally

**Backend**: requires Java 17+ and a PostgreSQL database
```bash
cd Backend/political-trades-backend
cp .env.example .env   # fill in DB credentials and API keys
./mvnw spring-boot:run
```

**Frontend**
```bash
cd Frontend/political-trades-frontend
npm install
npm run dev
```

The frontend expects the backend running at `localhost:8080`.

**Anomaly scoring** (optional, Python 3.11+)
```bash
pip install -r ml/anomaly/requirements.txt
DATABASE_URL=postgres://... python -m ml.anomaly.score_anomalies
```
