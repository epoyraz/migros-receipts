# Migros Kassenbons Dashboard

A self-contained dashboard that turns your Migros receipt CSV exports into an
interactive HTML page — spending over time, top products, store breakdown,
shopping habits by weekday/hour, used discounts, and a stock-chart-style
"Aktienkurse" view of how prices of your most-bought products have moved.

**Live demo:** https://epoyraz.github.io/migros-receipts/

![Dashboard preview](https://img.shields.io/badge/built%20with-Chart.js-ff6b00)

## Quick start

```bash
git clone https://github.com/epoyraz/migros-receipts.git
cd migros-receipts

# 1. Drop your Migros CSV exports into ./data/
#    (see data/README.md for how to export them from migros.ch)

# 2. Generate the dashboard (no dependencies needed — pure Node)
node build-dashboard.mjs

# 3. Open the result in your browser
#    Windows:  start dashboard.html
#    macOS:    open  dashboard.html
#    Linux:    xdg-open dashboard.html
```

That's it. The output `dashboard.html` is a single self-contained file with
your data baked in — you can email it, host it, or just open it locally.

## What you get

**Übersicht (overview)**
- Total spend, number of trips, average basket, items bought, total saved on Aktionen
- Monthly spending bar chart
- Top 20 most-bought products
- Spending by store, by year, by weekday, by hour of day
- Top discounts (Aktionen) used
- Spending by category (heuristic keyword match)

**Aktienkurse**
- Auto-detected top price movers across your purchase history (5 biggest risers,
  5 biggest fallers — products you've bought ≥10 times across ≥2 years)
- Each rendered as a stock-chart-style line with first/last/min/max prices

## Requirements

- Node.js 18+ (uses ES modules and built-in `fs` only — no `npm install` needed)
- A modern browser to view the result

## Privacy

Your CSVs never leave your machine. The repo's `.gitignore` excludes `*.csv`
and the `receipts/` folder so you can't accidentally commit raw data. Only
`dashboard.html` — which contains the aggregated data needed for the charts —
is meant to be shared.

## Project layout

```
data/                 # Your CSVs go here (gitignored)
build-dashboard.mjs   # Reads data/*.csv → writes dashboard.html
dashboard.html        # Generated output (also published to GitHub Pages)
```
