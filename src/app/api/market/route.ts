import { NextResponse } from 'next/server';
import axios from 'axios';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};

interface FinnhubProfile {
  name?: string;
  logo?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
  finnhubIndustry?: string;
  ticker?: string;
}

interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: { c: number; v: number };
  prevDailyBar?: { c: number };
}

// Known ETF tickers
const KNOWN_ETFS = new Set([
  'SOXL','SOXS','TQQQ','SQQQ','QQQ','SPY','IWM','UVXY','SPXS','SPXL',
  'LABU','LABD','ARKK','TNA','TZA','FAS','FAZ','DUST','NUGT','JNUG',
  'JDST','TECL','TECS','FNGU','FNGD','UPRO','SDOW','UDOW','SH','SDS',
  'SSO','VOO','VTI','DIA','XLF','XLK','XLE','XLV','XLI','XLRE','XLC',
  'XLY','XLP','XLB','XLU','UVIX','TSLL','TSLG','NVD','NVDL','SOXL',
]);

function classifyTheme(industry: string, name: string): string {
  const text = `${industry} ${name}`.toLowerCase();
  if (text.match(/semiconductor|chip|silicon|wafer/)) return 'Semiconductors';
  if (text.match(/software|cloud|saas|platform/)) return 'Software';
  if (text.match(/biotech|pharma|drug|therapeut|oncol/)) return 'Biotechnology';
  if (text.match(/bank|financ|capital|asset management/)) return 'Financials';
  if (text.match(/energy|oil|gas|solar|wind|renew/)) return 'Energy';
  if (text.match(/crypto|bitcoin|blockchain|defi/)) return 'Crypto';
  if (text.match(/health|medical|hospital|diagnostic/)) return 'Healthcare';
  if (text.match(/retail|consumer|e-commerce|shop/)) return 'Consumer';
  if (text.match(/telecom|communic|media|stream/)) return 'Communications';
  if (text.match(/industrial|manufact|aerospace|defense/)) return 'Industrials';
  if (text.match(/real estate|reit|property/)) return 'Real Estate';
  if (text.match(/food|beverage|restaurant|grocer/)) return 'Food & Bev';
  if (text.match(/auto|vehicle|ev |electric vehicle|motor/)) return 'Automotive';
  if (text.match(/electric|power|utility/)) return 'Utilities';
  return industry || 'General';
}

/** Format revenue/eps growth. SA returns percentage values (10.07 = 10.07%, -0.4671 = -46.71%) */
function formatGrowth(val: number | undefined | null): string {
  if (val == null) return '--';
  // SA get-metrics returns values like 10.071 meaning 10.07%, -84.9 meaning -84.9%
  // Values are already in percentage form
  return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
}

/**
 * Fetch SA get-metrics for SI%, rev growth, EPS growth, and stock logos.
 * get-metrics returns complex JSON-API with metric_type IDs:
 *   - 234857 = short_interest_percent_of_float
 *   - 36 = revenue_growth  
 *   - 10 = diluted_eps_growth
 * It also returns company logos in the `included` tickers.
 */
async function fetchSAMetrics(symbols: string[]): Promise<{
  metrics: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number; logo?: string }>;
}> {
  const metrics: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number; logo?: string }> = {};
  if (!RAPIDAPI_KEY || symbols.length === 0) return { metrics };

  // Step 1: get-data for marketCap (flat, simple)
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) {
    batches.push(symbols.slice(i, i + 20));
  }
  for (const batch of batches) {
    try {
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/symbols/get-data?symbol=${batch.join(',')}&fields=marketCap`,
        {
          headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com' },
          timeout: 10000,
        }
      );
      for (const item of (res.data?.data || [])) {
        const sym = (item.id || '').toUpperCase();
        if (!sym) continue;
        const a = item.attributes || {};
        metrics[sym] = { saMktCap: a.marketCap || undefined };
      }
    } catch (e) {
      console.error('SA get-data error:', (e as Error).message);
    }
  }

  // Step 2: get-metrics for SI%, rev growth, EPS growth, and logos
  // Need to batch by symbols — get-metrics takes comma-separated symbols
  for (const batch of batches) {
    try {
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/symbols/get-metrics?symbols=${batch.join(',')}&fields=short_interest_percent_of_float,revenue_growth,diluted_eps_growth`,
        {
          headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com' },
          timeout: 12000,
        }
      );

      // Build ticker ID -> symbol and logo mapping from `included`
      const tickerIdToSym: Record<string, string> = {};
      const tickerLogos: Record<string, string> = {};
      for (const inc of (res.data?.included || [])) {
        if (inc.type === 'ticker' && inc.attributes?.name) {
          const sym = inc.attributes.name.toUpperCase();
          tickerIdToSym[inc.id] = sym;
          // Extract logo from meta
          const logoUrl = inc.meta?.companyLogoUrlLight || inc.meta?.companyLogoUrlDark;
          if (logoUrl) tickerLogos[sym] = logoUrl;
        }
      }

      // Build metric_type ID -> field name mapping
      const metricTypeMap: Record<string, string> = {};
      for (const inc of (res.data?.included || [])) {
        if (inc.type === 'metric_type') {
          metricTypeMap[inc.id] = inc.attributes?.field || '';
        }
      }

      // Parse metrics
      for (const item of (res.data?.data || [])) {
        const tickerId = item.relationships?.ticker?.data?.id;
        const metricTypeId = item.relationships?.metric_type?.data?.id;
        const sym = tickerIdToSym[tickerId];
        const field = metricTypeMap[metricTypeId];
        const value = item.attributes?.value;

        if (!sym || !field || value == null) continue;

        if (!metrics[sym]) metrics[sym] = {};

        if (field === 'short_interest_percent_of_float') {
          metrics[sym].shortPct = value.toFixed(1) + '%';
        } else if (field === 'revenue_growth') {
          metrics[sym].revGrowth = formatGrowth(value);
        } else if (field === 'diluted_eps_growth') {
          metrics[sym].epsGrowth = formatGrowth(value);
        }
      }

      // Apply logos
      for (const [sym, logo] of Object.entries(tickerLogos)) {
        if (!metrics[sym]) metrics[sym] = {};
        metrics[sym].logo = logo;
      }

    } catch (e) {
      console.error('SA get-metrics error:', (e as Error).message);
    }
  }

  return { metrics };
}

/** Fetch latest news headline per symbol from Finnhub as live catalyst */
async function fetchCatalysts(symbols: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!FINNHUB_API_KEY) return result;

  // Fetch for ALL non-ETF symbols, in batches of 15 to respect rate limits
  const stockSymbols = symbols.filter(s => !KNOWN_ETFS.has(s));
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  for (let i = 0; i < stockSymbols.length; i += 15) {
    const batch = stockSymbols.slice(i, i + 15);
    const promises = batch.map(async (sym) => {
      try {
        const res = await axios.get(
          `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${weekAgo}&to=${today}&token=${FINNHUB_API_KEY}`,
          { timeout: 5000 }
        );
        const news = res.data;
        if (Array.isArray(news) && news.length > 0) {
          return { symbol: sym, catalyst: news[0].headline || '' };
        }
        return { symbol: sym, catalyst: '' };
      } catch {
        return { symbol: sym, catalyst: '' };
      }
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r.catalyst) result[r.symbol] = r.catalyst;
    }

    // Rate limit delay between batches
    if (i + 15 < stockSymbols.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return result;
}

export async function GET() {
  try {
    // 1. Get most active stocks (top 50) + movers for more coverage
    const [screenerRes, moversRes] = await Promise.allSettled([
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/most-actives?by=volume&top=50`, { headers: alpacaHeaders }),
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/movers?top=20`, { headers: alpacaHeaders }),
    ]);

    // Collect all unique symbols
    const symbolSet = new Set<string>();
    const volumeMap = new Map<string, { volume: number; trade_count: number }>();

    if (screenerRes.status === 'fulfilled') {
      for (const s of (screenerRes.value.data.most_actives || [])) {
        symbolSet.add(s.symbol);
        volumeMap.set(s.symbol, { volume: s.volume || 0, trade_count: s.trade_count || 0 });
      }
    }

    if (moversRes.status === 'fulfilled') {
      for (const s of (moversRes.value.data.gainers || [])) {
        symbolSet.add(s.symbol);
        if (!volumeMap.has(s.symbol)) volumeMap.set(s.symbol, { volume: 0, trade_count: 0 });
      }
      for (const s of (moversRes.value.data.losers || [])) {
        symbolSet.add(s.symbol);
        if (!volumeMap.has(s.symbol)) volumeMap.set(s.symbol, { volume: 0, trade_count: 0 });
      }
    }

    const symbols = Array.from(symbolSet);
    if (symbols.length === 0) return NextResponse.json({ data: [] });

    // 2. Get snapshots
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbols.join(',')}&feed=iex`,
      { headers: alpacaHeaders }
    );
    const snapshots: Record<string, AlpacaSnapshot> = snapshotRes.data || {};

    // Update volumes from snapshots for movers
    for (const sym of symbols) {
      const snap = snapshots[sym];
      if (snap?.dailyBar?.v && volumeMap.has(sym)) {
        const existing = volumeMap.get(sym)!;
        if (existing.volume === 0) volumeMap.set(sym, { volume: snap.dailyBar.v, trade_count: existing.trade_count });
      }
    }

    // 3. Fetch Finnhub profiles (batch, skip ETFs)
    const nonEtfSymbols = symbols.filter(s => !KNOWN_ETFS.has(s));
    const profiles: Record<string, FinnhubProfile | null> = {};

    if (FINNHUB_API_KEY) {
      for (let i = 0; i < nonEtfSymbols.length; i += 15) {
        const batch = nonEtfSymbols.slice(i, i + 15);
        const batchResults = await Promise.all(
          batch.map(async (sym) => {
            try {
              const res = await axios.get(
                `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_API_KEY}`,
                { timeout: 5000 }
              );
              const data = res.data;
              return { symbol: sym, profile: (data && data.ticker) ? data as FinnhubProfile : null };
            } catch {
              return { symbol: sym, profile: null };
            }
          })
        );
        for (const r of batchResults) {
          profiles[r.symbol] = r.profile;
        }
        if (i + 15 < nonEtfSymbols.length) await new Promise(r => setTimeout(r, 200));
      }
    }

    // 4. Fetch SA metrics (SI%, rev growth, EPS growth, logos, marketCap fallback)
    const { metrics: saMetrics } = await fetchSAMetrics(nonEtfSymbols);

    // 5. Fetch live catalysts for ALL stocks
    const catalysts = await fetchCatalysts(symbols);

    // 6. Build gappers array
    const gappers = symbols.map((sym) => {
      const snap = snapshots[sym];
      const prof = profiles[sym] || null;
      const sa = saMetrics[sym] || {};
      const isEtf = KNOWN_ETFS.has(sym);
      const vol = volumeMap.get(sym) || { volume: 0, trade_count: 0 };

      let price = 0, prevClose = 0, changePct = 0;
      if (snap) {
        price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
        prevClose = snap.prevDailyBar?.c || price;
        if (prevClose > 0) changePct = ((price - prevClose) / prevClose) * 100;
      }
      if (price === 0) return null;

      const volume = vol.volume || snap?.dailyBar?.v || 0;

      let grade = 'D';
      if (Math.abs(changePct) > 10 && volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      // Market cap
      let mktCapVal = 0;
      if (prof?.marketCapitalization && prof.marketCapitalization > 0) {
        mktCapVal = prof.marketCapitalization;
      } else if (sa.saMktCap && sa.saMktCap > 0) {
        mktCapVal = sa.saMktCap / 1000000;
      }
      const mktCapDisplay = mktCapVal > 0
        ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M')
        : (isEtf ? 'ETF' : '--');

      const capSize = mktCapVal > 0
        ? (mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : 'Micro')
        : (isEtf ? 'ETF' : '--');

      const float = prof?.shareOutstanding
        ? (prof.shareOutstanding >= 1000 ? (prof.shareOutstanding / 1000).toFixed(1) + 'B' : prof.shareOutstanding.toFixed(1) + 'M')
        : '--';

      const industry = prof?.finnhubIndustry || (isEtf ? 'ETF' : '--');
      const theme = classifyTheme(industry, prof?.name || sym);
      const category = isEtf ? 'ETF' : (prof?.finnhubIndustry ? 'Stock' : '--');

      const catalyst = catalysts[sym] || (isEtf ? `Leveraged/Inverse ETF tracking ${theme}` : '--');

      // Logo: prefer SA logo, fallback to Finnhub logo
      const logo = sa.logo || prof?.logo || undefined;

      return {
        symbol: sym,
        logo,
        volume,
        trade_count: vol.trade_count,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        grade,
        mktCap: mktCapDisplay,
        capSize,
        float,
        shortPct: sa.shortPct || '--',
        theme,
        industry,
        category,
        revGrowth: sa.revGrowth || '--',
        epsGrowth: sa.epsGrowth || '--',
        catalyst,
      };
    }).filter(Boolean);

    gappers.sort((a, b) => Math.abs(parseFloat(b!.changePct)) - Math.abs(parseFloat(a!.changePct)));

    return NextResponse.json({ data: gappers }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error fetching market data:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
