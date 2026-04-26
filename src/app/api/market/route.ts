import { NextResponse } from 'next/server';
import axios from 'axios';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID,
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY,
};

interface FinnhubProfile {
  name?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
  finnhubIndustry?: string;
  ticker?: string;
}

interface AlpacaMostActive {
  symbol: string;
  volume: number;
  trade_count: number;
}

interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: { c: number; v: number };
  prevDailyBar?: { c: number };
}

// Known ETF tickers that Finnhub won't have profile data for
const KNOWN_ETFS = new Set(['SOXL','SOXS','TQQQ','SQQQ','QQQ','SPY','IWM','UVXY','SPXS','SPXL','LABU','LABD','ARKK','TNA','TZA','FAS','FAZ','DUST','NUGT','JNUG','JDST','TECL','TECS','FNGU','FNGD','UPRO','SDOW','UDOW','SH','SDS','SSO','VOO','VTI','DIA','XLF','XLK','XLE','XLV','XLI','XLRE','XLC','XLY','XLP','XLB','XLU']);

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

// Fetch Seeking Alpha metrics for symbols to get real short interest, rev growth, eps growth
async function fetchSAMetrics(symbols: string[]): Promise<Record<string, {
  shortPct?: string;
  revGrowth?: string;
  epsGrowth?: string;
}>> {
  const result: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string }> = {};
  if (!RAPIDAPI_KEY) return result;

  try {
    const symbolStr = symbols.join(',');
    const res = await axios.get(
      `https://seeking-alpha.p.rapidapi.com/symbols/get-metrics?symbols=${symbolStr}&fields=short_interest_percent_of_float,revenue_growth,dilutedEpsGrowth`,
      {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
        },
        timeout: 8000,
      }
    );

    const metricsData = res.data?.data || [];
    for (const item of metricsData) {
      const sym = item?.attributes?.slug?.toUpperCase() || item?.id;
      if (!sym) continue;
      const attrs = item?.attributes || {};
      result[sym] = {
        shortPct: attrs.shortInterestPercentOfFloat != null
          ? (attrs.shortInterestPercentOfFloat * 100).toFixed(1) + '%'
          : attrs.short_interest_percent_of_float != null
          ? (attrs.short_interest_percent_of_float).toFixed(1) + '%'
          : undefined,
        revGrowth: attrs.revenueGrowth != null
          ? (attrs.revenueGrowth * 100).toFixed(1) + '%'
          : attrs.revenue_growth != null
          ? (attrs.revenue_growth * 100).toFixed(1) + '%'
          : undefined,
        epsGrowth: attrs.dilutedEpsGrowth != null
          ? (attrs.dilutedEpsGrowth * 100).toFixed(1) + '%'
          : attrs.diluted_eps_growth != null
          ? (attrs.diluted_eps_growth * 100).toFixed(1) + '%'
          : undefined,
      };
    }
  } catch (e) {
    console.error('SA metrics fetch error:', (e as Error).message);
  }
  return result;
}

// Fetch latest news headline per symbol from Finnhub to use as live catalyst
async function fetchCatalysts(symbols: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!FINNHUB_API_KEY) return result;

  // Only fetch for non-ETF symbols to save rate limits
  const stockSymbols = symbols.filter(s => !KNOWN_ETFS.has(s)).slice(0, 12);

  const promises = stockSymbols.map(async (sym) => {
    try {
      const res = await axios.get(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${getDateStr(-7)}&to=${getDateStr(0)}&token=${FINNHUB_API_KEY}`,
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

function getDateStr(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

export async function GET() {
  try {
    // 1. Get most active stocks from Alpaca (top 30 to have enough after filtering)
    const screenerRes = await axios.get(
      `${ALPACA_DATA_URL}/v1beta1/screener/stocks/most-actives?by=volume&top=30`,
      { headers: alpacaHeaders }
    );
    const mostActives: AlpacaMostActive[] = screenerRes.data.most_actives || [];

    if (mostActives.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const symbols = mostActives.map((s) => s.symbol);
    const symbolsStr = symbols.join(',');

    // 2. Get snapshots for price data
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbolsStr}&feed=iex`,
      { headers: alpacaHeaders }
    );
    const snapshots: Record<string, AlpacaSnapshot> = snapshotRes.data;

    // 3. Fetch Finnhub profiles for ALL symbols (batch with small delays to respect rate limits)
    const profilePromises = symbols.map(async (sym) => {
      if (!FINNHUB_API_KEY || KNOWN_ETFS.has(sym)) {
        return { symbol: sym, profile: null };
      }
      try {
        const res = await axios.get(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_API_KEY}`,
          { timeout: 5000 }
        );
        // Finnhub returns empty object {} for unknown tickers
        const data = res.data;
        if (data && data.ticker) {
          return { symbol: sym, profile: data as FinnhubProfile };
        }
        return { symbol: sym, profile: null };
      } catch {
        return { symbol: sym, profile: null };
      }
    });

    const profilesArray = await Promise.all(profilePromises);
    const profiles: Record<string, FinnhubProfile | null> = {};
    for (const p of profilesArray) {
      profiles[p.symbol] = p.profile;
    }

    // 4. Fetch Seeking Alpha metrics (short interest, rev growth, eps growth)
    const nonEtfSymbols = symbols.filter(s => !KNOWN_ETFS.has(s));
    const saMetrics = await fetchSAMetrics(nonEtfSymbols.slice(0, 20));

    // 5. Fetch live catalysts from Finnhub news
    const catalysts = await fetchCatalysts(symbols);

    // 6. Process everything together
    const gappers = mostActives.map((s) => {
      const sym = s.symbol;
      const snap = snapshots[sym];
      const prof = profiles[sym];
      const metrics = saMetrics[sym] || {};
      const isEtf = KNOWN_ETFS.has(sym);

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

      // Performance Grading logic
      let grade = 'D';
      if (Math.abs(changePct) > 10 && s.volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && s.volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      // Market cap from Finnhub (in millions, we convert to billions)
      const mktCapVal = prof?.marketCapitalization || 0;
      const mktCap = mktCapVal > 0 ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M') : (isEtf ? 'ETF' : '--');
      const capSize = mktCapVal > 0
        ? (mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : 'Micro')
        : (isEtf ? 'ETF' : '--');
      const float = prof?.shareOutstanding
        ? (prof.shareOutstanding >= 1000 ? (prof.shareOutstanding / 1000).toFixed(1) + 'B' : prof.shareOutstanding.toFixed(1) + 'M')
        : '--';

      const industry = prof?.finnhubIndustry || (isEtf ? 'ETF' : '--');
      const theme = classifyTheme(industry, prof?.name || sym);
      const category = isEtf ? 'ETF' : (prof?.finnhubIndustry ? 'Stock' : '--');

      // Live data from Seeking Alpha or fallback
      const shortPct = metrics.shortPct || '--';
      const revGrowth = metrics.revGrowth || '--';
      const epsGrowth = metrics.epsGrowth || '--';

      // Live catalyst from recent news
      const catalyst = catalysts[sym] || (isEtf ? `Leveraged/Inverse ETF tracking ${theme} sector` : '--');

      return {
        symbol: sym,
        volume: s.volume,
        trade_count: s.trade_count,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        grade,
        mktCap,
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
    });

    // Filter to show only significant movers
    const filteredGappers = gappers
      .filter((g) => Math.abs(parseFloat(g.changePct)) > 0.5)
      .sort((a, b) => Math.abs(parseFloat(b.changePct)) - Math.abs(parseFloat(a.changePct)));

    return NextResponse.json({ data: filteredGappers }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error fetching market data:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
