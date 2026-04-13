# Drop your Migros CSV exports here

Place one or more CSV files exported from your Migros account into this folder.
The build script reads every `*.csv` in this directory and merges them.

## How to get the CSVs

1. Sign in at <https://www.migros.ch>
2. Go to **Cumulus → Kassenbons** (digital receipts)
3. Pick a date range and choose **Export → CSV**
4. Save the file (e.g. `20240101_20241231.csv`) into this folder

You can drop multiple files (e.g. one per year) — they'll be merged automatically.

## Expected format

Semicolon-separated, German headers:

```
Datum;Zeit;Filiale;Kassennummer;Transaktionsnummer;Artikel;Menge;Aktion;Umsatz
31.12.2024;16:10:05;M Neuhausen;254;130;Philips OneBlade Kling;1;0.00;22.95
```

## Privacy

The repo's `.gitignore` excludes `*.csv`, so your data stays local. Only the
generated `dashboard.html` (with aggregated data baked in) is meant to be shared.
