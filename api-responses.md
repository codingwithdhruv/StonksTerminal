# StonksTerminal — Raw API Responses

> Verified 2026-04-27. Use this to parse without hitting APIs unnecessarily.

---

## Alpaca Markets

### Most-Actives Screener
```
GET /v1beta1/screener/stocks/most-actives?by=volume&top=50
Headers: APCA-API-KEY-ID, APCA-API-SECRET-KEY
```
**Response:**
```json
{
  "most_actives": [
    { "symbol": "INTC", "volume": 281415840, "trade_count": 0 },
    { "symbol": "NVDA", "volume": 214773817, "trade_count": 0 }
  ]
}
```

### Movers (Gainers + Losers)
```
GET /v1beta1/screener/stocks/movers?top=20
```
**Response:**
```json
{
  "gainers": [
    { "symbol": "USGOW", "percent_change": 344.68 },
    { "symbol": "MXL",   "percent_change": 76.12 }
  ],
  "losers": [
    { "symbol": "ESHAR", "percent_change": -95.5 }
  ],
  "last_updated": "2026-04-25T...",
  "market_type": "regular"
}
```

### Snapshots (price, volume, prev close)
```
GET /v2/stocks/snapshots?symbols=NVDA,AAPL&feed=iex
```
**Response:**
```json
{
  "AAPL": {
    "latestTrade":   { "p": 270.83, "s": 100, "t": "...", "x": "C" },
    "dailyBar":      { "c": 271.04, "h": 272.99, "l": 269.66, "n": 16024, "o": 272.68, "t": "...", "v": 1158665, "vw": 270.886 },
    "prevDailyBar":  { "c": 273.49, "h": 275.71, "l": 271.70, "n": 12076, "o": 275.05, "t": "...", "v": 765952,  "vw": 273.573 },
    "latestQuote": { "ap": 270.88, "as": 2, "ax": "P", "bp": 270.83, "bs": 1, "bx": "P", "t": "..." },
    "minuteBar": { ... }
  }
}
```
**Key fields:** `latestTrade.p` = current price; `dailyBar.v` = today's volume; `prevDailyBar.c` = previous close

### Multi-Symbol Daily Bars (sparklines)
```
GET /v2/stocks/bars?symbols=NVDA,AAPL&timeframe=1Day&start=2026-04-17&limit=1000
```
**⚠ CRITICAL:** `limit` applies GLOBALLY across ALL symbols, not per-symbol.
With 70 symbols and limit=10, only 10 bars are returned total. Use `limit = numSymbols * 15`.

**Response:**
```json
{
  "bars": {
    "AAPL": [
      { "c": 270.205, "h": 272.28, "l": 266.78, "n": 19927, "o": 266.96, "t": "2026-04-17T04:00:00Z", "v": 1390506, "vw": 270.189 },
      { "c": 273.06, ... }
    ],
    "INTC": [ ... ]
  },
  "next_page_token": "..." 
}
```
**Coverage:** Not all symbols have IEX/SIP coverage. Without `feed=iex`, more symbols return data but some liquid stocks (NVDA) may still be absent. Use `limit` calculation above.

### News
```
GET /v2/news?symbols=AAPL&limit=40&sort=desc
```
**Response:**
```json
{
  "news": [
    {
      "id": 12345,
      "headline": "AAPL beats earnings...",
      "summary": "Apple Inc...",
      "url": "https://...",
      "source": "benzinga",
      "symbols": ["AAPL"],
      "images": [{"url": "https://...image.jpg", "size": "large"}],
      "created_at": "2026-04-25T10:30:00Z"
    }
  ]
}
```
**Timestamp:** `created_at` is ISO string (UTC). Parse directly, no offset needed.

---

## Finnhub

### Company Profile
```
GET https://finnhub.io/api/v1/stock/profile2?symbol=NVDA&token={KEY}
```
**Response:**
```json
{
  "ticker": "NVDA",
  "name": "NVIDIA Corp",
  "logo": "https://static2.finnhub.io/file/publicdatany/finnhubimage/stock/logo/NVDA.png",
  "marketCapitalization": 5060960.984,   // !! MILLIONS USD
  "shareOutstanding": 24300.0,            // !! MILLIONS
  "finnhubIndustry": "Semiconductors",
  "weburl": "https://www.nvidia.com/",
  "country": "US",
  "currency": "USD",
  "exchange": "NASDAQ NMS - GLOBAL MARKET",
  "ipo": "1999-01-22",
  "phone": "...",
  "shareOutstanding": 24300.0
}
```
**⚠ Units:** `marketCapitalization` in **millions USD** (not dollars, not billions). Multiply by 1000 for billions display. `shareOutstanding` in millions.

### Company News (catalyst)
```
GET https://finnhub.io/api/v1/company-news?symbol=NVDA&from=2026-04-18&to=2026-04-25&token={KEY}
```
**Response:**
```json
[
  {
    "id": 99887766,
    "headline": "NVIDIA Announces...",
    "summary": "...",
    "url": "https://...",
    "source": "reuters",
    "image": "https://...image.jpg",
    "datetime": 1745567400,    // !! UNIX SECONDS (multiply × 1000 for JS Date)
    "category": "company news",
    "related": "NVDA"
  }
]
```
**⚠ Units:** `datetime` is **unix seconds**. Always multiply ×1000: `new Date(datetime * 1000)`.

---

## Seeking Alpha via RapidAPI

**Host:** `seeking-alpha.p.rapidapi.com`
**⚠ STATUS:** Monthly quota exceeded on both known API keys (as of 2026-04-27). All SA endpoints return empty or quota message. Code must gracefully handle this (catch → skip).

### get-metrics — SI%, Revenue Growth, EPS Growth, Logos (JSON:API format)
```
GET /symbols/get-metrics?symbols=NVDA,AAPL&fields=short_interest_percent_of_float,revenue_growth,diluted_eps_growth
```
**Parsing algorithm (JSON:API):**
1. Build `tickerIdToSym` map from `included` where `type === "ticker"` (id → symbol name)
2. Build `metricTypeMap` from `included` where `type === "metric_type"` (id → field name)
3. Extract logos from `included[ticker].meta.companyLogoUrlLight` or `companyLogoUrlDark`
4. For each `data` item: lookup `ticker.id` → symbol, `metric_type.id` → field, then `attributes.value`

**Response skeleton:**
```json
{
  "data": [
    {
      "type": "metric",
      "attributes": { "value": 0.025 },
      "relationships": {
        "ticker":      { "data": { "id": "123", "type": "ticker" } },
        "metric_type": { "data": { "id": "456", "type": "metric_type" } }
      }
    }
  ],
  "included": [
    { "type": "ticker",      "id": "123", "attributes": { "name": "NVDA" }, "meta": { "companyLogoUrlLight": "https://..." } },
    { "type": "metric_type", "id": "456", "attributes": { "field": "short_interest_percent_of_float" } }
  ]
}
```

### get-data — Market Cap
```
GET /symbols/get-data?symbol=NVDA,AAPL&fields=marketCap
```
**⚠ Units:** `marketCap` in **dollars** (not millions). Divide by 1,000,000 to compare with Finnhub.
```json
{ "data": [{ "id": "nvda", "attributes": { "marketCap": 5060000000000 } }] }
```

### SA Screener (get-results)
```
POST /screeners/get-results
Body: { "id": "9679329f", "per_page": 30 }
```
**⚠ STATUS:** Returns 403 "A logged in user is required" with standard API keys. 
**Alternative:** Use Alpaca most-actives + Finnhub industry filter instead.

---

## Yahoo Finance via APIDojo RapidAPI

**Host:** `apidojo-yahoo-finance-v1.p.rapidapi.com`

### Pre-Market Quotes
```
GET /market/v2/get-quotes?region=US&symbols=NVDA,AAPL
```
**Response:**
```json
{
  "quoteResponse": {
    "result": [
      {
        "symbol": "NVDA",
        "preMarketChangePercent": 1.67,    // float — 1.67 = +1.67%
        "preMarketVolume": 2500000,
        "preMarketPrice": 209.50,
        "regularMarketPrice": 207.98,
        "regularMarketChangePercent": 4.16,
        "marketCap": 5060000000000
      }
    ],
    "error": null
  }
}
```
**⚠ Notes:**
- `preMarketChangePercent` is null/absent outside pre-market hours (4:00–9:30 AM ET on weekdays)
- Returns empty on weekends — expected behavior, not an error
- Batch up to 30 symbols per request

### News
```
GET /news/v2/list?region=US&snippetCount=28&s=AAPL
```
**Response:**
```json
{
  "stream": [
    {
      "id": "abc123",
      "content": {
        "title": "...",
        "summary": "...may contain &#34;HTML entities&#34;...",
        "pubDate": "2026-04-25T10:30:00.000Z",
        "thumbnail": { "resolutions": [{ "url": "https://...", "width": 800, "height": 600 }] },
        "provider": { "displayName": "Reuters" },
        "canonicalUrl": { "url": "https://..." },
        "relatedTickers": [{ "symbol": "AAPL" }]
      }
    }
  ]
}
```
**⚠ HTML Entities:** Summaries often contain `&#34;` ("), `&#39;` ('), `&amp;` (&) etc.
Always decode with `decodeHtml()` before displaying.

---

## Key Calculated Fields

| Field | Formula |
|---|---|
| CHG % | `(latestTrade.p - prevDailyBar.c) / prevDailyBar.c * 100` |
| CAP SIZE | Mega>200B, Large>10B, Mid>2B, Small>300M, Micro>0 (mktCapVal in millions) |
| GRADE | A: \|chg\|>10%+vol>500K; B: \|chg\|>5%+vol>100K; C: \|chg\|>2%; D: else |
| PREMKT % | `(preMarketChangePercent >= 0 ? '+' : '') + pct.toFixed(2) + '%'` |

---

## Known API Limitations

| API | Limitation | Workaround |
|---|---|---|
| SA screener | Requires login (403) | Alpaca most-actives + Finnhub industry filter |
| SA metrics | Monthly quota exceeded | Graceful -- fallback, no crash |
| YF pre-market | RapidAPI subscription returns "not subscribed" | Show -- always; consider removing column |
| Alpaca bars | `limit` is GLOBAL, not per-symbol | Set `limit = numSymbols * 15` |
| Alpaca bars | IEX feed excludes many symbols (NVDA etc.) | Remove `feed=iex`, use default |
| Finnhub profile2 | 60 req/min HARD limit (returns "API limit reached") | 24h in-memory cache + Alpaca catalyst replacement |
| Finnhub company-news | 60 req/min — too expensive per-symbol | Use Alpaca multi-symbol news instead (1 call vs 88) |
| Finnhub mktCap | In MILLIONS USD | Do NOT divide by 1M again |
| SA marketCap | In DOLLARS | Divide by 1,000,000 for millions |
| Vercel functions | Cold-start = empty in-memory cache | Aggressive caching helps subsequent warm requests |
| Finnhub profile2 | Empty for warrants/rights/units (USGOW, ESHAR) | Alpaca `/v2/assets/{symbol}` provides name + classification |

## Sector Filtering Strategy

When matching `finnhubIndustry` to a sector, use **word-boundary regex** (`\b{kw}`) NOT substring match:
- `'biotechnology'.includes('technology')` → true (BUG: pulls biotech into Technology)
- `/\btechnology/.test('biotechnology')` → false (CORRECT)

For symbols without Finnhub profile (warrants, rights), use Alpaca asset name's `industryGuess` from regex pattern matching on company name.

## Catalyst Source Strategy

**DO NOT** call Finnhub `/company-news?symbol=X` per-symbol — burns 88 of the 60/min budget instantly.

**DO** use Alpaca `/v1beta1/news?symbols=X,Y,Z,...&limit=50` once. One call returns 50 articles, each with a `symbols[]` array. Map first headline per symbol → catalyst. Single API call for all 88 stocks.
