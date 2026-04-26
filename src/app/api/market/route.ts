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
  'XLY','XLP','XLB','XLU','UVIX','TSLL','TSLG',
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

/**
 * Fetch Seeking Alpha get-data for fundamentals.
 * This endpoint returns FLAT attributes: { revenueGrowth, eps, marketCap, shortInterestSharesOutstanding }
 */
async function fetchSAData(symbols: string[]): Promise<Record<string, {
  shortPct?: string;
  revGrowth?: string;
  epsGrowth?: string;
  saMktCap?: number;
}>> {
  const result: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number }> = {};
  if (!RAPIDAPI_KEY || symbols.length === 0) return result;

  // SA get-data accepts comma-separated symbols, max ~25 at a time
  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) {
    batches.push(symbols.slice(i, i + 20));
  }

  for (const batch of batches) {
    try {
      const symbolStr = batch.join(',');
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/symbols/get-data?symbol=${symbolStr}&fields=short_interest_shares_outstanding,revenue_growth,eps,marketCap`,
        {
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
          },
          timeout: 10000,
        }
      );

      const items = res.data?.data || [];
      for (const item of items) {
        const sym = (item.id || '').toUpperCase();
        if (!sym) continue;
        const a = item.attributes || {};

        const shortRaw = a.shortInterestSharesOutstanding;
        const revRaw = a.revenueGrowth;
        const epsRaw = a.eps;
        const mktCapRaw = a.marketCap;

        result[sym] = {
          shortPct: shortRaw != null ? shortRaw.toFixed(1) + '%' : undefined,
          revGrowth: revRaw != null ? (revRaw > 100 ? revRaw.toFixed(1) + '%' : (revRaw * (Math.abs(revRaw) < 1 ? 100 : 1)).toFixed(1) + '%') : undefined,
          epsGrowth: epsRaw != null ? '$' + epsRaw.toFixed(2) : undefined,
          saMktCap: mktCapRaw || undefined,
        };
      }
    } catch (e) {
      console.error('SA get-data batch error:', (e as Error).message);
    }
  }
  return result;
}

/** Fetch latest news headline per symbol from Finnhub as live catalyst */
async function fetchCatalysts(symbols: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!FINNHUB_API_KEY) return result;

  const stockSymbols = symbols.filter(s => !KNOWN_ETFS.has(s)).slice(0, 15);
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const promises = stockSymbols.map(async (sym) => {
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
        if (!volumeMap.has(s.symbol)) {
          volumeMap.set(s.symbol, { volume: 0, trade_count: 0 });
        }
      }
      for (const s of (moversRes.value.data.losers || [])) {
        symbolSet.add(s.symbol);
        if (!volumeMap.has(s.symbol)) {
          volumeMap.set(s.symbol, { volume: 0, trade_count: 0 });
        }
      }
    }

    const symbols = Array.from(symbolSet);
    if (symbols.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 2. Get snapshots for ALL symbols
    const symbolsStr = symbols.join(',');
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbolsStr}&feed=iex`,
      { headers: alpacaHeaders }
    );
    const snapshots: Record<string, AlpacaSnapshot> = snapshotRes.data || {};

    // Update volumes from snapshots for symbols that came from movers
    for (const sym of symbols) {
      const snap = snapshots[sym];
      if (snap?.dailyBar?.v && volumeMap.has(sym)) {
        const existing = volumeMap.get(sym)!;
        if (existing.volume === 0) {
          volumeMap.set(sym, { volume: snap.dailyBar.v, trade_count: existing.trade_count });
        }
      }
    }

    // 3. Fetch Finnhub profiles (batch, skip ETFs)
    const nonEtfSymbols = symbols.filter(s => !KNOWN_ETFS.has(s));
    const profiles: Record<string, FinnhubProfile | null> = {};

    if (FINNHUB_API_KEY) {
      // Fetch in batches of 15 to respect rate limits (30/sec free tier)
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
        // Small delay between batches to stay under rate limit
        if (i + 15 < nonEtfSymbols.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }
    }

    // 4. Fetch SA data for fundamentals (short interest, rev growth, eps, marketCap fallback)
    const saData = await fetchSAData(nonEtfSymbols);

    // 5. Fetch live catalysts
    const catalysts = await fetchCatalysts(symbols);

    // 6. Build gappers array
    const gappers = symbols.map((sym) => {
      const snap = snapshots[sym];
      const prof = profiles[sym] || null;
      const sa = saData[sym] || {};
      const isEtf = KNOWN_ETFS.has(sym);
      const vol = volumeMap.get(sym) || { volume: 0, trade_count: 0 };

      let price = 0;
      let prevClose = 0;
      let changePct = 0;

      if (snap) {
        price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
        prevClose = snap.prevDailyBar?.c || price;
        if (prevClose > 0) {
          changePct = ((price - prevClose) / prevClose) * 100;
        }
      }

      // Skip symbols with no price data
      if (price === 0) return null;

      // Volume from snapshot if not from screener
      const volume = vol.volume || snap?.dailyBar?.v || 0;

      // Grade
      let grade = 'D';
      if (Math.abs(changePct) > 10 && volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      // Market cap: prefer Finnhub (in millions), fallback to SA (in raw dollars)
      let mktCapDisplay = '--';
      let mktCapVal = 0; // in millions for size classification
      if (prof?.marketCapitalization && prof.marketCapitalization > 0) {
        mktCapVal = prof.marketCapitalization;
      } else if (sa.saMktCap && sa.saMktCap > 0) {
        mktCapVal = sa.saMktCap / 1000000; // SA returns raw dollars
      }

      if (mktCapVal > 0) {
        mktCapDisplay = mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M';
      } else if (isEtf) {
        mktCapDisplay = 'ETF';
      }

      const capSize = mktCapVal > 0
        ? (mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : 'Micro')
        : (isEtf ? 'ETF' : '--');

      const float = prof?.shareOutstanding
        ? (prof.shareOutstanding >= 1000 ? (prof.shareOutstanding / 1000).toFixed(1) + 'B' : prof.shareOutstanding.toFixed(1) + 'M')
        : '--';

      const industry = prof?.finnhubIndustry || (isEtf ? 'ETF' : '--');
      const theme = classifyTheme(industry, prof?.name || sym);
      const category = isEtf ? 'ETF' : (prof?.finnhubIndustry ? 'Stock' : '--');

      // SA live data
      const shortPct = sa.shortPct || '--';
      const revGrowth = sa.revGrowth || '--';
      const epsGrowth = sa.epsGrowth || '--';

      // Live catalyst
      const catalyst = catalysts[sym] || (isEtf ? `Leveraged/Inverse ETF tracking ${theme} sector` : '--');

      return {
        symbol: sym,
        volume,
        trade_count: vol.trade_count,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        grade,
        mktCap: mktCapDisplay,
        capSize,
        float,
        shortPct,
        theme,
        industry,
        category,
        revGrowth,
        epsGrowth,
        catalyst,
      };
    }).filter(Boolean);

    // Sort by absolute change %
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
