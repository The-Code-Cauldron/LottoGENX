# LottoGENX

**UK Lotto Intelligence Engine**

Statistical analysis of 1,057 UK National Lottery draws (October 2015 – May 2026). Built on the 1-59 format era only. No predictions. No guarantees. Pattern analysis only.

---

## What It Does

Ten analytical tabs running against a merged dataset of 1,057 draws:

| Tab | What It Shows |
|---|---|
| Overview | Dataset summary, decade distribution, top 12 hottest balls |
| Heatmap | All 59 balls colour-coded by frequency across 1,057 draws |
| Due Analysis | Law of averages — which balls are below expected frequency |
| Pairs & Sync | Chi-square significance analysis of ball co-occurrence patterns |
| Ball Spotlight | Full profile for any ball 1–59: frequency, due score, year trend, pairs |
| Magic Combos | Algorithmic combination generator — 5 modes, 74,613 combinations scored |
| Probability | Hypergeometric match probabilities, expected wait per prize tier, cost analysis |
| Checker | Enter up to 3 lines — scored on due coverage, sync, balance, decade spread |
| My Numbers | Full analysis of your chosen line against the merged dataset |
| Verdict | Nine key findings from the full data |

---

## Magic Combos Algorithm

Scores every combination from a mode-specific pool of top 22 candidate balls (C(22,6) = 74,613 combinations). Each scored across four dimensions:

- **Due** — how far below expected frequency the numbers are (law of averages position)
- **Sync** — chi-square significance of co-occurrence pairs within the line
- **Balance** — sum in the 165–195 optimal band + odd/even split
- **Spread** — number of decades (1–9, 10–19, 20–29, 30–39, 40–49, 50–59) covered

Five modes: Balanced / Due Maximum / Sync Maximum / All-Terrain / Hot Momentum.

Top 5 results returned with a diversity filter — no two results share more than 3 numbers.

---

## Dataset

**Merged:**
- `lotto_results.csv` — October 2015 to March 2020 (441 draws, 1-59 format)
- 2020–2026 frequency analysis (616 draws)
- **Total: 1,057 draws · 6,342 ball appearances**

Pre-October 2015 draws excluded — the lottery ran a 1-49 format before that date and the data is not comparable.

Pair analysis (chi-square significance) is anchored to the 2020–2026 era (616 draws, expected pair frequency 5.40).

---

## Stack

- Node.js + Express (static file server)
- Vanilla JavaScript — no framework, no build step
- No database. No API. No external dependencies at runtime.
- Deployed on Railway.

---

## Deploy

```bash
npm install
node server.js
```

Railway reads the Procfile and runs `node server.js`. No environment variables required.

---

## Legal

See [LEGAL.md](LEGAL.md).

This tool is for statistical analysis and entertainment only. It does not constitute gambling advice. The National Lottery is operated by Camelot UK Lotteries Limited. Must be 18 or over to play.

---

Built by [The Code Cauldron](https://github.com/The-Code-Cauldron)
