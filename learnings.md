# StonksTerminal — Learnings (Bugs Fixed & Patterns)

## Bugs Fixed

### 1. normalizeTimestamp IST Heuristic (REMOVED)
**Bug:** `normalizeTimestamp()` in `src/lib/news.ts` had a heuristic:
```typescript
if (timestamp > now + 3 * 3600000) {
  timestamp -= 5.5 * 3600000;
}
```
This incorrectly adjusted timestamps 3+ hours in the future. Seeking Alpha commonly publishes
articles for upcoming market hours (pre-market, next-day opens), which appear future-dated. 
The correction then moved them ~5.5 hours backwards — completely wrong timestamps.

**Root cause:** All sources (Alpaca, Finnhub, SA, YF) return proper UTC or TZ-aware timestamps.
JavaScript's `Date()` parses timezone offsets correctly. No manual correction is needed.

**Fix:** Removed the IST heuristic entirely. `normalizeTimestamp` now just parses and clamps.

---

### 2. SA saMktCap Unit Mismatch
**Bug:** SA `symbols/get-data` returns `marketCap` in DOLLARS.
Finnhub `marketCapitalization` is in MILLIONS USD.
The code divided `sa.saMktCap / 1000000` to convert SA dollars to millions.
Make sure this conversion is always applied when using SA mktCap as fallback.

**Pattern:**
```typescript
// Finnhub: mktCapVal is already in millions
mktCapVal = prof.marketCapitalization; // millions USD
// SA fallback:
mktCapVal = sa.saMktCap / 1000000; // dollars → millions
```

---

### 3. Pre-Market Data Missing
**Bug:** Table had no Premkt % or Premkt Vol columns.
Alpaca snapshots don't directly provide aggregated pre-market volume.

**Fix:** Added `fetchPreMarketData()` calling Yahoo Finance `market/v2/get-quotes` which
returns `preMarketChangePercent` and `preMarketVolume` directly.

---

### 4. SA get-metrics logo extraction
**Pattern:** SA logos are in `included[]` where `type === "ticker"`, at `meta.companyLogoUrlLight`
or `meta.companyLogoUrlDark`. These are NOT in `attributes` but in `meta`.
```typescript
const logoUrl = inc.meta?.companyLogoUrlLight || inc.meta?.companyLogoUrlDark;
```

---

### 5. SA get-metrics ticker ID resolution
**Pattern:** `data[]` items contain `relationships.ticker.data.id` which is a numeric ID.
The symbol name is in `included[]` where `type === "ticker"` and `attributes.name`.
Must build `tickerIdToSym` map from `included` before processing `data[]`.

---

### 6. SA screener vs SA get-metrics ticker field difference
- Screener `included[].attributes.name` → ticker symbol (for screener results)
- News `included[].attributes.slug` → ticker slug (for news ticker mapping)
- Metrics `included[].attributes.name` → ticker symbol (for metrics)
Use `.toUpperCase()` on all slug/name values.

---

## Architecture Patterns

### ETF Detection
ETFs are detected two ways:
1. `fetchDynamicEtfs()` from SA equity categories (cached 1 hour)
2. Fallback hardcoded list: `['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLK', 'XLE', 'XLV']`
3. `finnhubIndustry.toLowerCase().includes('etf')` check at build time

ETFs skip Finnhub profile fetch; use SA mktCap fallback instead.

### Batching Strategy
- SA get-metrics: 20 symbols/batch
- Finnhub profiles: 15 symbols/batch, 200ms delay between batches
- Finnhub catalysts: 15 symbols/batch, 300ms delay between batches
- Yahoo Finance pre-market: 30 symbols/batch

### News Deduplication
- Global feed: dedup by URL (stripped of query params) AND by headline (lowercased)
- Sector news: uses same approach within sector context

### Caching (Next.js Cache-Control headers)
- Market data: `s-maxage=60, stale-while-revalidate=120` (1-2 min)
- News: `s-maxage=300, stale-while-revalidate=600` (5-10 min)
- ETF list: in-memory 1 hour

---

## Key Design Decisions

### Why IEX feed for Alpaca snapshots
`feed=iex` is used because it's available on Alpaca's free tier. SIP feed requires paid subscription
but provides more complete extended-hours data. If upgrading Alpaca, switch to `feed=sip`.

### Why Yahoo Finance for pre-market data
Yahoo Finance `market/v2/get-quotes` directly provides `preMarketChangePercent` and `preMarketVolume`
as aggregated values, avoiding the need to manually compute over individual pre-market bars.
Alpaca would require fetching all minute bars for 4:00-9:30 AM ET window, then aggregating.

### Why Finnhub for catalysts (not SA/Alpaca news)
Finnhub company-news is fast, stock-specific, and returns structured data (headline + datetime).
Used as "catalyst" = latest newsworthy event driving today's move.

---

## Terminal Features (User Vision)
- Bloomberg-style financial terminal for pre-market movers research
- Focus on US equities, ETFs, pre-market and intraday movers
- IST (India Standard Time) user — all timestamps displayed in IST
- Market Movers table: comprehensive screening with fundamental + technical metrics
- Unified Intelligence Feed: aggregated news from 4 sources sorted by recency
- AI Intelligence Brief: LLaMA-3.1-8B summary of top news via NVIDIA NIM
- Stock detail panel: click any row to see full intelligence on that stock
- Category pages: sector-specific dashboards (Technology, Healthcare, Crypto, Macro, Earnings, FDA)
