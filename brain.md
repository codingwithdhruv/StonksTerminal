# StonksTerminal — Brain (API Data Formats & Architecture)

## Stack
- Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- Server: Next.js API routes at `/src/app/api/`
- UI: Single main component `TerminalDashboard` with Market Movers table + Unified Intelligence Feed

## Environment Variables
| Variable | Source | Usage |
|----------|--------|-------|
| `ALPACA_API_KEY_ID` | Alpaca Markets | Market data, news |
| `ALPACA_API_SECRET_KEY` | Alpaca Markets | Auth header |
| `ALPACA_DATA_URL` | Alpaca | Base URL, defaults to `https://data.alpaca.markets` |
| `FINNHUB_API_KEY` | Finnhub | Company profiles, news, catalysts |
| `RAPIDAPI_KEY` | RapidAPI (shared) | Seeking Alpha + Yahoo Finance |
| `NIM_API_KEY` | NVIDIA NIM | AI summarization (optional) |

---

## API Data Formats

### Alpaca Markets

**Headers:** `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY`

**Most Actives:**
```
GET /v1beta1/screener/stocks/most-actives?by=volume&top=50
Response: { most_actives: [{ symbol, volume, trade_count }] }
```

**Movers:**
```
GET /v1beta1/screener/stocks/movers?top=20
Response: { gainers: [{ symbol }], losers: [{ symbol }] }
```

**Snapshots (price data):**
```
GET /v2/stocks/snapshots?symbols={csv}&feed=iex
Response: {
  AAPL: {
    latestTrade: { p: number (price) },
    latestQuote: { ap, bp },
    minuteBar: { o, h, l, c, v, t },
    dailyBar: { c: number (close), v: number (volume), t },
    prevDailyBar: { c: number (prev close), v }
  }
}
```

**News:**
```
GET /v1beta1/news?limit=50&sort=desc[&symbols=AAPL,TSLA][&page_token=...]
Response: {
  news: [{
    id: number,
    headline: string,
    summary: string,
    url: string,
    source: string,
    symbols: string[],
    created_at: string  ← ISO 8601 UTC (e.g. "2024-01-15T14:30:00Z") ✓ already UTC
    images: [{ size: "large"|"small"|"thumb", url: string }]
  }],
  next_page_token: string | null
}
```

---

### Finnhub

**Company Profile:**
```
GET /stock/profile2?symbol={sym}&token={key}
Response: {
  ticker: string,
  name: string,
  logo: string (URL),
  marketCapitalization: number (in millions USD),
  shareOutstanding: number (in millions),
  finnhubIndustry: string
}
NOTE: marketCapitalization is in MILLIONS, not dollars. capSize thresholds apply to this unit.
```

**Company News (Catalysts):**
```
GET /company-news?symbol={sym}&from=YYYY-MM-DD&to=YYYY-MM-DD&token={key}
Response: [{ id, headline, summary, url, source, datetime: number (UNIX seconds UTC), image }]
NOTE: datetime is UNIX seconds, multiply by 1000 for ms. Always UTC. ✓
```

**General News:**
```
GET /news?category=general&token={key}
Response: [{ id, category, datetime: number (UNIX seconds UTC), headline, image, related, source, summary, url }]
NOTE: datetime is UNIX seconds UTC. related = comma-separated tickers.
```

---

### Seeking Alpha (via RapidAPI)
**Host header:** `x-rapidapi-host: seeking-alpha.p.rapidapi.com`

**Screener Results (sector tickers):**
```
POST /screeners/get-results
Body: { id: "screenerId", per_page: 30 }
Response (JSON-API):
{
  data: [{ relationships: { ticker: { data: { id: "tickerId" } } } }],
  included: [{ id: "tickerId", type: "ticker", attributes: { name: "AAPL" } }]
}
NOTE: ticker symbol is in included[].attributes.name (NOT slug for screeners)
```

**Sector Screener IDs:**
- technology: `9679329f`
- healthcare: `96793114`
- macro/financials: `96793115`
- communications: `96793116`
- energy: `96793110`
- utilities: `96793117`
- realestate: `9409a325`
- crypto: `95b99d35dc24`
- earnings: `9679348d`

**Symbol Metrics:**
```
GET /symbols/get-metrics?symbols={csv}&fields=short_interest_percent_of_float,revenue_growth,diluted_eps_growth
Response (JSON-API):
{
  data: [{
    attributes: { value: number },
    relationships: {
      ticker: { data: { id: "tickerId" } },
      metric_type: { data: { id: "metricTypeId" } }
    }
  }],
  included: [
    { id, type: "ticker", attributes: { name: "AAPL" }, meta: { companyLogoUrlLight, companyLogoUrlDark } },
    { id, type: "metric_type", attributes: { field: "short_interest_percent_of_float" } }
  ]
}
NOTE: metric_type.field values: "short_interest_percent_of_float", "revenue_growth", "diluted_eps_growth"
NOTE: revenue_growth and diluted_eps_growth are decimal fractions (0.12 = 12%), multiply/format accordingly
NOTE: short_interest_percent_of_float is already a percentage (15.2 = 15.2%)
```

**Symbol Data (Market Cap fallback):**
```
GET /symbols/get-data?symbol={csv}&fields=marketCap
Response: { data: [{ id: "AAPL", attributes: { marketCap: number (in dollars) } }] }
NOTE: saMktCap is in DOLLARS. Divide by 1,000,000 to get millions for comparison with Finnhub.
```

**News (Trending):**
```
GET /news/v2/list-trending?size=40
Response (JSON-API):
{
  data: [{
    id: string,
    attributes: {
      title: string,
      publishOn: string  ← ISO 8601 with TZ offset (e.g. "2024-01-15T09:30:00-05:00") ✓ parse correctly
      gettyImageUrl: string | null
    },
    links: { self: "/news/...", uriImage: string | null },
    relationships: {
      primaryTickers: { data: [{ id: "tickerId" }] },
      secondaryTickers: { data: [{ id: "tickerId" }] }
    }
  }],
  included: [{ id, type: "ticker", attributes: { slug: "aapl" } }]
}
NOTE: publishOn includes timezone offset. JS Date() parses correctly. NO manual correction needed.
NOTE: Ticker symbol from included[].attributes.slug (toUpperCase())
```

**News (Market-All):**
```
GET /news/v2/list?category=market-news::all&size=40
Same format as trending. category values: "market-news::all", "market-news::technology", etc.
```

---

### Yahoo Finance (via APIDojo RapidAPI)
**Host header:** `x-rapidapi-host: apidojo-yahoo-finance-v1.p.rapidapi.com`

**News:**
```
POST /news/v2/list
Body: { region: "US", snippetCount: 30 }
Response (stream format):
{
  data: {
    main: {
      stream: [{
        content: {
          id: string,
          title: string,
          summary: string,
          pubDate: string  ← ISO 8601 UTC (e.g. "2024-01-15T14:30:00.000Z") ✓ already UTC
          provider: { displayName: string },
          clickThroughUrl: { url: string },
          finance: { stockTickers: [{ symbol: string }] },
          thumbnail: { resolutions: [{ url, width, height }] }
        }
      }]
    }
  }
}
NOTE: pubDate is UTC ISO string. Parse with new Date() directly.
NOTE: thumbnail resolutions are sorted smallest-to-largest; use last element for best quality.
```

**Pre-Market Quotes:**
```
GET /market/v2/get-quotes?region=US&symbols={csv}
Response:
{
  quoteResponse: {
    result: [{
      symbol: string,
      regularMarketPrice: number,
      regularMarketChange: number,
      regularMarketChangePercent: number,
      preMarketPrice: number | null,
      preMarketChange: number | null,
      preMarketChangePercent: number | null,
      preMarketVolume: number | null,
      preMarketTime: number | null (UNIX seconds)
      marketState: "PRE" | "REGULAR" | "POST" | "CLOSED"
    }]
  }
}
NOTE: preMarketChangePercent is already a percentage (1.67 = +1.67%).
NOTE: preMarketVolume is total pre-market volume in shares.
NOTE: Fields are null when not in pre-market OR when no pre-market trading occurred.
```

---

### Financial Datasets MCP
- URL: `https://mcp.financialdatasets.ai/`
- Provides financial statements, ratios, price data

---

## Market Movers Table — Column Sources

| Column | API Source | Field | Notes |
|--------|-----------|-------|-------|
| Ticker | Alpaca screener | symbol | |
| Premkt % | Yahoo Finance get-quotes | preMarketChangePercent | Formatted as "+1.67%" |
| Premkt Vol | Yahoo Finance get-quotes | preMarketVolume | Raw number, formatted in UI |
| Vol (1D) | Alpaca dailyBar | dailyBar.v | |
| Price | Alpaca snapshot | latestTrade.p or dailyBar.c | |
| Prev Close | Alpaca snapshot | prevDailyBar.c | |
| MktCap | Finnhub (primary) | marketCapitalization (millions) | SA fallback: saMktCap/1e6 |
| Cap Size | Calculated | From mktCapVal (millions) | Mega>200k, Large>10k, Mid>2k, Small>300, Micro |
| Float | Finnhub | shareOutstanding (millions) | |
| Short % | Seeking Alpha get-metrics | short_interest_percent_of_float | |
| Theme | Calculated | classifyTheme(industry, name) | |
| Industry | Finnhub | finnhubIndustry | |
| Category | Inferred | ETF check or "Stock" | |
| Grade | Calculated formula | |changePct|>10%+vol>500k=A, etc. |
| Rev Growth Est | Seeking Alpha get-metrics | revenue_growth | formatGrowth() |
| EPS Growth Est | Seeking Alpha get-metrics | diluted_eps_growth | formatGrowth() |
| Catalyst | Finnhub company-news | Latest headline (7 days) | |

---

## News Feed — Timestamp Handling

**Rule: All sources return proper UTC or timezone-aware timestamps. NO manual IST correction needed.**

| Source | Field | Format | Parsing |
|--------|-------|--------|---------|
| Alpaca | created_at | ISO 8601 UTC ("...Z") | `new Date(created_at)` |
| Finnhub | datetime | UNIX seconds UTC | `new Date(datetime * 1000)` |
| Seeking Alpha | publishOn | ISO with TZ offset ("-05:00") | `new Date(publishOn)` |
| Yahoo Finance (stream) | pubDate | ISO 8601 UTC | `new Date(pubDate)` |
| Yahoo Finance (legacy) | providerPublishTime | UNIX seconds UTC | `new Date(providerPublishTime * 1000)` |

**Frontend display:** All timestamps shown in IST (Asia/Kolkata) via `toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })`.

---

## capSize Thresholds (Finnhub units = millions USD)
- Mega: > 200,000M ($200B+)
- Large: > 10,000M ($10B+)
- Mid: > 2,000M ($2B+)
- Small: > 300M ($300M+)
- Micro: anything smaller

## Grade Formula
- A: |changePct| > 10% AND volume > 500,000
- B: |changePct| > 5% AND volume > 100,000
- C: |changePct| > 2%
- D: Default
