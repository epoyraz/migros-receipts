import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = "data";

if (!existsSync(DATA_DIR)) {
  console.error(`No ./${DATA_DIR}/ directory found.`);
  console.error("Create it and place your Migros CSV exports inside, then rerun.");
  process.exit(1);
}

const csvFiles = readdirSync(DATA_DIR)
  .filter((f) => f.toLowerCase().endsWith(".csv"))
  .sort();

if (csvFiles.length === 0) {
  console.error(`No .csv files found in ./${DATA_DIR}/`);
  console.error("Export your receipts from migros.ch (Cumulus → Kassenbons → CSV) and drop the files into ./data/.");
  process.exit(1);
}

const allLines = [];
csvFiles.forEach((file, i) => {
  const lines = readFileSync(join(DATA_DIR, file), "utf8").trim().split("\n");
  if (i === 0) allLines.push(...lines);
  else allLines.push(...lines.slice(1));
});
const allCsv = allLines.join("\n");
const csvJson = JSON.stringify(allCsv);

// --- Compute top price changes (the "Aktienkurse" segment) ---
function computePriceItems(csvText) {
  const lines = csvText.split("\n").slice(1);
  const rows = [];
  for (const line of lines) {
    const c = line.split(";");
    if (c.length < 9) continue;
    const [d, m, y] = c[0].split(".");
    const qty = parseFloat(c[6]);
    const disc = parseFloat(c[7]);
    const amt = parseFloat(c[8]);
    if (!(qty > 0) || !(amt > 0)) continue;
    rows.push({ year: +y, article: c[5], unitPrice: (amt + disc) / qty });
  }
  const byArticle = {};
  rows.forEach((r) => {
    (byArticle[r.article] = byArticle[r.article] || []).push(r);
  });
  const cands = [];
  for (const [name, entries] of Object.entries(byArticle)) {
    if (entries.length < 10) continue;
    const years = new Set(entries.map((e) => e.year));
    if (years.size < 2) continue;
    const byYear = {};
    entries.forEach((e) => {
      (byYear[e.year] = byYear[e.year] || []).push(e.unitPrice);
    });
    const yk = Object.keys(byYear).sort();
    const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const firstAvg = avg(byYear[yk[0]]);
    const lastAvg = avg(byYear[yk[yk.length - 1]]);
    const pct = ((lastAvg - firstAvg) / firstAvg) * 100;
    cands.push({ name, pct });
  }
  cands.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const ups = cands.filter((c) => c.pct > 5).slice(0, 5);
  const downs = cands.filter((c) => c.pct < -5).slice(0, 5);
  return [...ups, ...downs].map((c) => ({
    name: c.name,
    pct: (c.pct >= 0 ? "+" : "") + c.pct.toFixed(1) + "%",
    up: c.pct >= 0,
  }));
}

const PRICE_ITEMS = computePriceItems(allCsv);
const priceItemsJson = JSON.stringify(PRICE_ITEMS);

// --- Dynamic subtitle from year range ---
const allYears = new Set();
allLines.slice(1).forEach((l) => {
  const c = l.split(";");
  if (c[0]) allYears.add(c[0].split(".")[2]);
});
const yearsSorted = [...allYears].filter(Boolean).sort();
const yearRange =
  yearsSorted.length > 1
    ? `${yearsSorted[0]} - ${yearsSorted[yearsSorted.length - 1]}`
    : yearsSorted[0] || "";

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Migros Kassenbons Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<script src="https://cdn.jsdelivr.net/npm/luxon@3"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-luxon@1"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f1117; color: #e0e0e0; padding: 20px; }
  h1 { text-align: center; font-size: 2rem; margin-bottom: 8px; color: #ff6b00; }
  .subtitle { text-align: center; color: #888; margin-bottom: 30px; font-size: 0.95rem; }
  .kpi-row { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; margin-bottom: 30px; }
  .kpi { background: #1a1d27; border-radius: 12px; padding: 20px 28px; min-width: 180px; text-align: center; border: 1px solid #2a2d37; }
  .kpi .value { font-size: 2rem; font-weight: 700; color: #ff6b00; }
  .kpi .label { font-size: 0.85rem; color: #999; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(500px, 1fr)); gap: 20px; margin-bottom: 20px; }
  .card { background: #1a1d27; border-radius: 12px; padding: 20px; border: 1px solid #2a2d37; }
  .card h2 { font-size: 1.1rem; margin-bottom: 14px; color: #ccc; }
  .card canvas { width: 100% !important; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #2a2d37; }
  th { color: #ff6b00; font-weight: 600; }
  td { color: #ccc; }
  tr:hover td { background: #22252f; }
  .rank { color: #666; width: 30px; }
  .amount { text-align: right; font-variant-numeric: tabular-nums; }
  .bar-bg { background: #2a2d37; border-radius: 4px; height: 8px; width: 100%; }
  .bar-fill { background: #ff6b00; border-radius: 4px; height: 8px; }
  .wide { grid-column: 1 / -1; }
  .section-title { font-size: 1.4rem; color: #ff6b00; margin: 30px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #2a2d37; }
  .section-sub { color: #666; font-size: 0.9rem; font-weight: normal; }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } .kpi { min-width: 140px; } }
</style>
</head>
<body>
<h1>Migros Kassenbons</h1>
<p class="subtitle">Deine Einkaufsanalyse ${yearRange}</p>

<div class="kpi-row" id="kpis"></div>

<h2 class="section-title">Übersicht</h2>
<div class="grid" id="grid"></div>

<h2 class="section-title">Aktienkurse <span class="section-sub">— Preisverlauf einzelner Produkte</span></h2>
<div class="grid" id="gridPrices"></div>

<script>
const RAW = ${csvJson};

// Parse CSV
const rows = RAW.split("\\n");
const header = rows[0].split(";");
const data = rows.slice(1).map(r => {
  const cols = r.split(";");
  const [d,m,y] = cols[0].split(".");
  return {
    date: new Date(+y, +m - 1, +d),
    year: +y,
    month: +m,
    time: cols[1],
    store: cols[2],
    register: cols[3],
    txn: cols[4],
    article: cols[5],
    qty: parseFloat(cols[6]),
    discount: parseFloat(cols[7]),
    amount: parseFloat(cols[8])
  };
}).filter(d => !isNaN(d.amount));

// --- Helpers ---
function groupBy(arr, fn) {
  const m = {};
  arr.forEach(r => { const k = fn(r); (m[k] = m[k] || []).push(r); });
  return m;
}
function sum(arr, fn) { return arr.reduce((s, r) => s + fn(r), 0); }
function round2(n) { return Math.round(n * 100) / 100; }
function fmtCHF(n) { return "CHF " + n.toFixed(2); }

// --- KPIs ---
const totalSpent = round2(sum(data, r => r.amount));
const totalDiscount = round2(sum(data, r => r.discount));
const txnKeys = new Set(data.map(r => r.date.toISOString() + r.txn));
const totalTrips = txnKeys.size;
const avgBasket = round2(totalSpent / totalTrips);
const totalItems = round2(sum(data, r => r.qty));

const kpiDiv = document.getElementById("kpis");
[
  { v: fmtCHF(totalSpent), l: "Gesamtausgaben" },
  { v: totalTrips, l: "Einkäufe" },
  { v: fmtCHF(avgBasket), l: "Ø Warenkorb" },
  { v: Math.round(totalItems), l: "Artikel gekauft" },
  { v: fmtCHF(totalDiscount), l: "Gespart (Aktionen)" },
].forEach(k => {
  kpiDiv.innerHTML += \`<div class="kpi"><div class="value">\${k.v}</div><div class="label">\${k.l}</div></div>\`;
});

const grid = document.getElementById("grid");
const gridPrices = document.getElementById("gridPrices");
function addCard(title, id, wide, container = grid) {
  const cls = wide ? "card wide" : "card";
  container.innerHTML += \`<div class="\${cls}"><h2>\${title}</h2><div id="\${id}"></div></div>\`;
}
function addChart(title, id, wide, container = grid) {
  const cls = wide ? "card wide" : "card";
  container.innerHTML += \`<div class="\${cls}"><h2>\${title}</h2><canvas id="\${id}"></canvas></div>\`;
}

// --- 1. Monthly spending over time ---
addChart("Monatliche Ausgaben", "chartMonthly", true);

// --- 2. Top 20 products ---
addCard("Top 20 Produkte", "tableProducts", false);

// --- 3. Spending by store ---
addChart("Ausgaben nach Filiale", "chartStores", false);

// --- 4. Average basket by year ---
addChart("Ø Warenkorb nach Jahr", "chartBasketYear", false);

// --- 5. Day of week ---
addChart("Einkäufe nach Wochentag", "chartDow", false);

// --- 6. Hour of day ---
addChart("Einkaufszeit (Tageszeit)", "chartHour", false);

// --- 7. Top discounted products ---
addCard("Meistgenutzte Aktionen", "tableDiscounts", false);

// --- 8. Spending by category (heuristic) ---
addChart("Ausgaben nach Kategorie (geschätzt)", "chartCategory", false);

// --- 9. Price history (stock-style) — auto-computed top movers ---
const PRICE_ITEMS = ${priceItemsJson};
PRICE_ITEMS.forEach((it, i) => {
  addChart(\`\${it.name} (\${it.pct})\`, \`chartPrice\${i}\`, false, gridPrices);
});

// Chart defaults
Chart.defaults.color = "#999";
Chart.defaults.borderColor = "#2a2d37";
const ORANGE = "#ff6b00";
const ORANGE2 = "#ff8c33";
const ORANGE3 = "#ffad66";

// === 1. Monthly spending ===
const byMonth = {};
data.forEach(r => {
  const k = r.year + "-" + String(r.month).padStart(2, "0");
  byMonth[k] = (byMonth[k] || 0) + r.amount;
});
const monthKeys = Object.keys(byMonth).sort();
new Chart(document.getElementById("chartMonthly"), {
  type: "bar",
  data: {
    labels: monthKeys,
    datasets: [{
      label: "Ausgaben (CHF)",
      data: monthKeys.map(k => round2(byMonth[k])),
      backgroundColor: ORANGE,
      borderRadius: 4,
    }]
  },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});

// === 2. Top 20 products ===
const prodCount = {};
data.forEach(r => {
  if (r.qty > 0) prodCount[r.article] = (prodCount[r.article] || 0) + r.qty;
});
const topProds = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 20);
const maxCount = topProds[0][1];
let prodHtml = "<table><tr><th class='rank'>#</th><th>Produkt</th><th class='amount'>Anzahl</th><th style='width:120px'></th></tr>";
topProds.forEach(([name, count], i) => {
  const pct = (count / maxCount * 100).toFixed(0);
  prodHtml += \`<tr><td class='rank'>\${i + 1}</td><td>\${name}</td><td class='amount'>\${Math.round(count)}</td><td><div class='bar-bg'><div class='bar-fill' style='width:\${pct}%'></div></div></td></tr>\`;
});
prodHtml += "</table>";
document.getElementById("tableProducts").innerHTML = prodHtml;

// === 3. Stores ===
const byStore = {};
data.forEach(r => { byStore[r.store] = (byStore[r.store] || 0) + r.amount; });
const storeEntries = Object.entries(byStore).sort((a, b) => b[1] - a[1]);
new Chart(document.getElementById("chartStores"), {
  type: "doughnut",
  data: {
    labels: storeEntries.map(e => e[0]),
    datasets: [{
      data: storeEntries.map(e => round2(e[1])),
      backgroundColor: storeEntries.map((_, i) => \`hsl(\${20 + i * 25}, 85%, \${55 - i * 3}%)\`),
      borderWidth: 0,
    }]
  },
  options: { plugins: { legend: { position: "right" } } }
});

// === 4. Avg basket by year ===
const txnByYear = {};
data.forEach(r => {
  const k = r.year + "_" + r.date.toISOString() + "_" + r.txn;
  if (!txnByYear[r.year]) txnByYear[r.year] = {};
  txnByYear[r.year][k] = (txnByYear[r.year][k] || 0) + r.amount;
});
const years = Object.keys(txnByYear).sort();
const avgByYear = years.map(y => {
  const txns = Object.values(txnByYear[y]);
  return round2(txns.reduce((s, v) => s + v, 0) / txns.length);
});
new Chart(document.getElementById("chartBasketYear"), {
  type: "bar",
  data: {
    labels: years,
    datasets: [{
      label: "Ø Warenkorb (CHF)",
      data: avgByYear,
      backgroundColor: [ORANGE, ORANGE2, ORANGE3],
      borderRadius: 6,
    }]
  },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});

// === 5. Day of week ===
const dayNames = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const txnByDow = [0,0,0,0,0,0,0];
const txnCountByDow = [0,0,0,0,0,0,0];
const seenTxnDow = new Set();
data.forEach(r => {
  const dow = r.date.getDay();
  const k = r.date.toISOString() + r.txn;
  txnByDow[dow] += r.amount;
  if (!seenTxnDow.has(k)) { txnCountByDow[dow]++; seenTxnDow.add(k); }
});
new Chart(document.getElementById("chartDow"), {
  type: "bar",
  data: {
    labels: dayNames,
    datasets: [
      { label: "Anzahl Einkäufe", data: txnCountByDow, backgroundColor: ORANGE, borderRadius: 4 },
    ]
  },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});

// === 6. Hour of day ===
const hourCounts = new Array(24).fill(0);
const seenTxnHour = new Set();
data.forEach(r => {
  const k = r.date.toISOString() + r.txn;
  if (!seenTxnHour.has(k)) {
    const h = parseInt(r.time.split(":")[0]);
    hourCounts[h]++;
    seenTxnHour.add(k);
  }
});
new Chart(document.getElementById("chartHour"), {
  type: "line",
  data: {
    labels: Array.from({length:24}, (_,i) => i + ":00"),
    datasets: [{
      label: "Einkäufe",
      data: hourCounts,
      borderColor: ORANGE,
      backgroundColor: "rgba(255,107,0,0.1)",
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: ORANGE,
    }]
  },
  options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
});

// === 7. Top discounts ===
const discProds = {};
data.forEach(r => {
  if (r.discount > 0) {
    discProds[r.article] = (discProds[r.article] || 0) + r.discount;
  }
});
const topDisc = Object.entries(discProds).sort((a, b) => b[1] - a[1]).slice(0, 15);
const maxDisc = topDisc[0]?.[1] || 1;
let discHtml = "<table><tr><th class='rank'>#</th><th>Produkt</th><th class='amount'>Gespart</th><th style='width:120px'></th></tr>";
topDisc.forEach(([name, amt], i) => {
  const pct = (amt / maxDisc * 100).toFixed(0);
  discHtml += \`<tr><td class='rank'>\${i + 1}</td><td>\${name}</td><td class='amount'>\${fmtCHF(round2(amt))}</td><td><div class='bar-bg'><div class='bar-fill' style='width:\${pct}%'></div></div></td></tr>\`;
});
discHtml += "</table>";
document.getElementById("tableDiscounts").innerHTML = discHtml;

// === 8. Categories (heuristic) ===
const categories = {
  "Getränke": ["cola","pepsi","red bull","energy milk","ginger ale","evian","rivella","fanta","sprite","ice tea","schorle","wasser","saft","drink","latte","coffee","kaffee","espresso","kombucha","gönrgy","prime","bundaberg","ramune","coconut water","manella","living things","milch ","milk","coco drink","choco drink","apfelsaft"],
  "Snacks & Süsses": ["chips","kinder","haribo","red band","katjes","smarties","schokolade","chocolate","frey","sablé","patatli","salzstange","reiswaffel","erdnuss","smoki","cookie","waffel","wunderland","mushrooms","flips","gummibär","sweet","riegel","snickers","mars","twix"],
  "Brot & Backwaren": ["brot","brötli","toast","croissant","weggli","bread","coquerli","blätterteig","laugenbrezel","cake","gifflar","pizzetta","börek"],
  "Milchprodukte & Eier": ["joghurt","yogurt","feta","käse","cheese","grana","eier","butter","raccard","leerdammer","emilio","bifidus","raclette","mozzarella"],
  "Fertiggerichte": ["poké bowl","sushi","pizza","margherita","salad","shaker","wrap","nasi goreng","backfisch","quinoa vegg","saladbowl","bowl"],
  "Früchte & Gemüse": ["avocado","gurke","tomate","zitrone","zwiebel","kohlrabi","kokosnuss","ananas","kartoffel","radieschen","cherry","banane","apfel","birne","orange","kiwi"],
  "Haushalt & Non-Food": ["dettol","potz","scotch","schwamm","notizblock","kugelschreiber","philips","kassentragtasche","mclean","durgol","latex","spray","desinfekt","oneblade","abfluss"],
};

const catTotals = {};
let catOther = 0;
data.forEach(r => {
  if (r.amount <= 0) return;
  const low = r.article.toLowerCase();
  let found = false;
  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => low.includes(kw))) {
      catTotals[cat] = (catTotals[cat] || 0) + r.amount;
      found = true;
      break;
    }
  }
  if (!found) catOther += r.amount;
});
catTotals["Sonstiges"] = catOther;

// === 9. Price history stock-graph style ===
function makePriceChart(canvasId, articleName, color, trendUp) {
  const points = data
    .filter(r => r.article === articleName && r.qty > 0 && r.amount > 0)
    .map(r => ({
      x: r.date.getTime(),
      y: round2((r.amount + r.discount) / r.qty),
      date: r.date,
    }))
    .sort((a, b) => a.x - b.x);

  const prices = points.map(p => p.y);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const firstP = prices[0];
  const lastP = prices[prices.length - 1];
  const pct = ((lastP - firstP) / firstP * 100).toFixed(1);

  // Draw a subtitle with summary
  const card = document.getElementById(canvasId).parentElement;
  const summary = document.createElement("div");
  summary.style.cssText = "font-size:0.85rem;color:#999;margin-top:-8px;margin-bottom:10px;";
  summary.innerHTML = \`<span style="color:\${color};font-weight:600;">CHF \${firstP.toFixed(2)} → CHF \${lastP.toFixed(2)}</span> · Min \${minP.toFixed(2)} · Max \${maxP.toFixed(2)} · \${points.length} Käufe\`;
  card.insertBefore(summary, document.getElementById(canvasId));

  new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      datasets: [{
        label: "Stückpreis (CHF)",
        data: points,
        borderColor: color,
        backgroundColor: color + "22",
        fill: true,
        stepped: false,
        tension: 0.1,
        pointRadius: 3,
        pointBackgroundColor: color,
        borderWidth: 2,
      }]
    },
    options: {
      parsing: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toLocaleDateString("de-CH"),
            label: (ctx) => "CHF " + ctx.parsed.y.toFixed(2),
          }
        }
      },
      scales: {
        x: {
          type: "time",
          time: { unit: "month", displayFormats: { month: "MMM yy" } },
          adapters: {},
        },
        y: { title: { display: true, text: "CHF" } }
      }
    }
  });
}

const catEntries = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
const catColors = ["#ff6b00","#ff8c33","#ffad66","#ffce99","#4ecdc4","#45b7aa","#38a18f","#2b8b75"];
new Chart(document.getElementById("chartCategory"), {
  type: "doughnut",
  data: {
    labels: catEntries.map(e => e[0]),
    datasets: [{
      data: catEntries.map(e => round2(e[1])),
      backgroundColor: catColors,
      borderWidth: 0,
    }]
  },
  options: { plugins: { legend: { position: "right" } } }
});

// Price history charts
PRICE_ITEMS.forEach((it, i) => {
  makePriceChart(\`chartPrice\${i}\`, it.name, it.up ? "#ff4444" : "#4ecdc4", it.up);
});
</script>
</body>
</html>`;

writeFileSync("dashboard.html", html);
console.log(`Wrote dashboard.html from ${csvFiles.length} CSV file(s) in ./${DATA_DIR}/`);
console.log(`Years: ${yearRange} · Auto-detected ${PRICE_ITEMS.length} price-change items`);
