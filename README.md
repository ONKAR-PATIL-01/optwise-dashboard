# Optwise — Options Backtesting Terminal

A broker-style dashboard for a NIFTY options backtesting strategy. Static front-end:
HTML, CSS and vanilla JavaScript, no build step.

**Live:** https://ONKAR-PATIL-01.github.io/optwise-dashboard/

## What this is

The dashboard presents a short-straddle options strategy on NIFTY: portfolio
summary, month-by-month P&L, a parameter panel, and a trade blotter.

Layout and interaction follow Indian broker terminals — a sticky index ticker,
a three-column grid, dense tabular numerals, and green/red market semantics.

## What works on the hosted page

The portfolio overview, monthly P&L cards and right-hand rails are static and
render in full.

**Run Backtest requires a local backend.** `app.js` posts to
`http://127.0.0.1:8001/api/backtest`, so the button only works when the Python
API is running on your own machine. The API, the strategy code and the broker
integration are deliberately not in this repository.

## Running locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

To enable backtests, run the companion FastAPI server on port 8001 and supply a
Dhan access token via environment variable. Never commit a broker token.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and static figures |
| `styles.css` | Design system — light broker theme, responsive to 375px |
| `app.js` | Form handling, API call, table rendering, CSV export |

## Note on the figures

The P&L shown is before hedge cost, slippage and brokerage. Treat it as an
illustration of strategy shape, not as account returns.
