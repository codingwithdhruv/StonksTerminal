import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import axios from 'axios';
import { fetchDynamicEtfs, classifyTheme, formatGrowth } from '@/lib/market';
import { fetchAlpacaAssets } from '@/lib/alpaca-assets';
import { getProfiles, getMetrics, getCatalysts } from '@/lib/finnhub-cache';
import { getAlphaVantageOverviews } from '@/lib/alphavantage';
import { getTiingoFundamentals } from '@/lib/tiingo';
import yahooFinance2 from 'yahoo-finance2';
// @ts-ignore
const yahooFinance = typeof yahooFinance2 === 'function' ? new yahooFinance2() : (yahooFinance2.default ? new yahooFinance2.default() : yahooFinance2);

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};

interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: { c: number; v: number };
  prevDailyBar?: { c: number };
}

/** Fetch 10-day closing prices per symbol for sparkline charts */
async function fetchSparklines(symbols: string[]): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  if (symbols.length === 0) return result;
  const start = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  // limit must be generous: applies GLOBALLY across all symbols (not per-symbol)
  const limit = Math.min(symbols.length * 15, 2000);
  try {
    const res = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/bars?symbols=${symbols.join(',')}&timeframe=1Day&start=${start}&limit=${limit}`,
      { headers: alpacaHeaders, timeout: 15000 }
    );
    const bars: Record<string, Array<{ c: number }>> = res.data?.bars || {};
    for (const [sym, symBars] of Object.entries(bars)) {
      result[sym] = symBars.slice(-10).map(b => b.c);
    }
  } catch (e) {
    console.error('Sparkline fetch error:', (e as Error).message);
  }
  return result;
}

// Dynamic ETF cache
let cachedEtfs: Set<string> = new Set();
let lastEtfFetch = 0;
const ETF_CACHE_DURATION = 3600000; // 1 hour

async function getEtfSymbols(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedEtfs.size > 0 && (now - lastEtfFetch < ETF_CACHE_DURATION)) {
    return cachedEtfs;
  }
  
  const dynamicEtfs = await fetchDynamicEtfs();
  // Fallback to a minimal set if dynamic fetch fails to ensure UI doesn't break
  const fallbackEtfs = ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLK', 'XLE', 'XLV'];
  
  const newSet = new Set([...dynamicEtfs, ...fallbackEtfs]);
  cachedEtfs = newSet;
  lastEtfFetch = now;
  return newSet;
}

/**
 * Fetch missing metrics (Short Interest, Revenue Growth, EPS Growth) using Yahoo Finance quoteSummary.
 * We fetch in batches to avoid excessive Yahoo Finance rate limiting.
 */
async function fetchYFMetrics(symbols: string[]): Promise<{
  metrics: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; catalyst?: string }>;
}> {
  const metrics: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; catalyst?: string }> = {};
  if (symbols.length === 0) return { metrics };

  const CHUNK_SIZE = 15;
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    
    await Promise.allSettled(
      chunk.map(async (sym) => {
        try {
          const [result, searchRes] = await Promise.all([
            yahooFinance.quoteSummary(sym, { modules: ['defaultKeyStatistics', 'financialData'] }).catch(() => null),
            yahooFinance.search(sym, { newsCount: 1 }).catch(() => null)
          ]);
          
          const shortPctRaw = result?.defaultKeyStatistics?.shortPercentOfFloat;
          const revGrowthRaw = result?.financialData?.revenueGrowth;
          const epsGrowthRaw = result?.financialData?.earningsGrowth;
          const catalystTitle = searchRes?.news?.[0]?.title;

          metrics[sym] = {
            shortPct: shortPctRaw != null ? (shortPctRaw * 100).toFixed(2) + '%' : undefined,
            revGrowth: revGrowthRaw != null ? (revGrowthRaw >= 0 ? '+' : '') + (revGrowthRaw * 100).toFixed(1) + '%' : undefined,
            epsGrowth: epsGrowthRaw != null ? (epsGrowthRaw >= 0 ? '+' : '') + (epsGrowthRaw * 100).toFixed(1) + '%' : undefined,
            catalyst: catalystTitle || undefined,
          };
        } catch (e) {
          // Suppress errors
        }
      })
    );
    
    if (i + CHUNK_SIZE < symbols.length) {
      await new Promise(r => setTimeout(r, 200)); // Yield to prevent rate limit
    }
  }

  return { metrics };
}

export async function GET() {
  try {
    const etfSymbols = await getEtfSymbols();
    // 1. Get most active stocks (top 40) + movers (top 15) — keeps total ~50 unique symbols,
    //    of which ~30 are Finnhub-eligible common stocks, well under the 60/min limit.
    const [screenerRes, moversRes] = await Promise.allSettled([
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/most-actives?by=volume&top=40`, { headers: alpacaHeaders }),
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/movers?top=15`, { headers: alpacaHeaders }),
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

    // 3a. Fetch Alpaca asset master FIRST (cheap, no rate limit) — gives us classification
    const alpacaAssets = await fetchAlpacaAssets(symbols);

    // 3b. Fetch Finnhub profiles ONLY for symbols Finnhub can actually cover.
    const finnhubEligible = symbols.filter(s => {
      if (etfSymbols.has(s)) return false;
      const cat = alpacaAssets[s]?.category;
      if (cat && cat !== 'Stock' && cat !== 'ADR') return false;
      return true;
    });

    // 3b. Fetch Finnhub profile2 (industry/logo/mktCap/float) — 24h cached
    const profiles = await getProfiles(finnhubEligible);

    // 3c. Fetch Alpha Vantage COMPANY_OVERVIEW for symbols without a Finnhub Profile (like Warrants)
    const noProfileSymbols = symbols.filter(s => !profiles[s] && !etfSymbols.has(s));
    const avOverviews = await getAlphaVantageOverviews(noProfileSymbols);

    // 3d. Fetch Tiingo Fundamentals for missing profiles/market caps
    const tiingoFundamentals = await Promise.all(
      noProfileSymbols.map(sym => getTiingoFundamentals(sym).then(res => ({ sym, res })))
    ).then(results => results.reduce((acc, curr) => {
      if (curr.res) acc[curr.sym] = curr.res;
      return acc;
    }, {} as Record<string, any>));

    // 4. Fetch Finnhub metrics (revGrowth, epsGrowth, mktCap fallback) — 24h cached.
    const finnhubMetrics = await getMetrics(finnhubEligible);

    // 6. Fetch live catalysts via Alpaca news (1 multi-symbol call vs 88 Finnhub calls)
    const catalysts = await getCatalysts(symbols);

    // 7. Parallel fetch sparklines + Yahoo Finance for quotes/pre-market
    const [sparklines, yfMetricsRes, yfQuotes] = await Promise.all([
      fetchSparklines(symbols),
      fetchYFMetrics(symbols),
      yahooFinance.quote(symbols).catch((e: any) => {
        console.error('Yahoo Finance quote fetch error:', e.message);
        return [];
      }),
    ]);

    const yfFundamentals = yfMetricsRes.metrics;
    const yfMap: Record<string, any> = {};
    for (const q of (yfQuotes || [])) {
      if (q.symbol) yfMap[q.symbol.toUpperCase()] = q;
    }

    // 9. Build gappers array
    const gappers = symbols.map((sym) => {
      const snap = snapshots[sym];
      const prof = profiles[sym] || null;
      const fMetrics = finnhubMetrics[sym] || null;
      const avOverview = avOverviews[sym] || null;
      const tFundamentals = tiingoFundamentals[sym] || null;
      const yf = yfMap[sym] || {};
      const yfFund = yfFundamentals[sym] || {};
      const isEtf = etfSymbols.has(sym) || prof?.finnhubIndustry?.toLowerCase().includes('etf') || avOverview?.AssetType?.toLowerCase().includes('etf');
      const vol = volumeMap.get(sym) || { volume: snap?.dailyBar?.v || 0, trade_count: 0 };

      let price = snap?.latestTrade?.p || yf.regularMarketPrice || 0;
      let prevClose = snap?.prevDailyBar?.c || yf.regularMarketPreviousClose || 0;
      let changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

      let premktChgPct = '--';
      let premktVol = 0;
      if (snap?.dailyBar && snap?.prevDailyBar) {
         const prePrc = snap.dailyBar.c;
         const preChg = ((prePrc - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100;
         if (preChg !== 0) premktChgPct = (preChg >= 0 ? '+' : '') + preChg.toFixed(2) + '%';
         premktVol = snap.dailyBar.v || 0;
      }
      
      if (price === 0) return null;

      const volume = vol.volume || snap?.dailyBar?.v || yf.regularMarketVolume || 0;

      let grade = 'D';
      if (Math.abs(changePct) > 10 && volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      // Market cap: Yahoo (billions) → Finnhub profile2 → Finnhub metric (all in millions USD)
      let mktCapVal = 0;
      if (yf.marketCap && yf.marketCap > 0) {
        mktCapVal = yf.marketCap / 1000000;
      } else if (prof?.marketCapitalization && prof.marketCapitalization > 0) {
        mktCapVal = prof.marketCapitalization;
      } else if (fMetrics?.marketCapitalization && fMetrics.marketCapitalization > 0) {
        mktCapVal = fMetrics.marketCapitalization;
      } else if (tFundamentals?.marketCap && tFundamentals.marketCap > 0) {
        mktCapVal = tFundamentals.marketCap / 1000000;
      } else if (avOverview?.MarketCapitalization && avOverview.MarketCapitalization !== 'None') {
        mktCapVal = parseInt(avOverview.MarketCapitalization, 10) / 1000000;
      }
      
      const mktCapDisplay = mktCapVal > 0
        ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M')
        : (isEtf ? 'ETF' : '--');

      const capSize = mktCapVal > 0
        ? (mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : 'Micro')
        : (isEtf ? 'ETF' : '--');

      const pmChgPct = premktChgPct !== '--' ? premktChgPct :
        (yf.preMarketChangePercent != null ? (yf.preMarketChangePercent >= 0 ? '+' : '') + yf.preMarketChangePercent.toFixed(2) + '%' :
        (yf.postMarketChangePercent != null ? (yf.postMarketChangePercent >= 0 ? '+' : '') + yf.postMarketChangePercent.toFixed(2) + '%' : '--'));
      
      const pmVol = premktVol > 0 ? premktVol : (yf.preMarketVolume || yf.postMarketVolume || 0);

      const shares = yf.sharesOutstanding ? (yf.sharesOutstanding / 1000000) : (prof?.shareOutstanding || 0);
      const float = shares > 0
        ? (shares >= 1000 ? (shares / 1000).toFixed(1) + 'B' : shares.toFixed(1) + 'M')
        : '--';

      const asset = alpacaAssets[sym];
      const avIndustry = avOverview?.Sector || avOverview?.Industry;
      const industry = prof?.finnhubIndustry || avIndustry || (isEtf ? 'ETF' : asset?.industryGuess || '--');
      const theme = prof?.finnhubIndustry
        ? classifyTheme(prof.finnhubIndustry, prof.name || sym)
        : (avIndustry ? classifyTheme(avIndustry, avOverview?.Name || sym) : (isEtf ? 'ETF' : asset?.themeGuess || '--'));
      const category = isEtf
        ? 'ETF'
        : (prof?.finnhubIndustry || avIndustry ? 'Stock' : (asset?.category || '--'));

      const catalyst = catalysts[sym] || yfFund.catalyst || (isEtf ? `Leveraged/Inverse ETF tracking ${theme}` : '--');

      const logo = prof?.logo || undefined;

      return {
        symbol: sym,
        logo,
        volume,
        trade_count: vol.trade_count,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        premktChgPct: pmChgPct,
        premktVol: pmVol,
        sparkline: sparklines[sym] || [],
        grade,
        mktCap: mktCapDisplay,
        mktCapRaw: mktCapVal,
        capSize,
        float,
        shortPct: yfFund.shortPct || '--',
        theme,
        industry,
        category,
        revGrowth: yfFund.revGrowth || (fMetrics?.revenueGrowthTTMYoy != null
          ? (fMetrics.revenueGrowthTTMYoy >= 0 ? '+' : '') + fMetrics.revenueGrowthTTMYoy.toFixed(1) + '%'
          : '--'),
        epsGrowth: yfFund.epsGrowth || (fMetrics?.epsGrowthTTMYoy != null
          ? (fMetrics.epsGrowthTTMYoy >= 0 ? '+' : '') + fMetrics.epsGrowthTTMYoy.toFixed(1) + '%'
          : '--'),
        catalyst,
      };
    }).filter(Boolean);

    gappers.sort((a, b) => Math.abs(parseFloat(b!.changePct)) - Math.abs(parseFloat(a!.changePct)));

    return NextResponse.json({ data: gappers }, {
      // Cache 90s at edge, serve stale up to 5 min while revalidating —
      // gives Finnhub cache time to warm without burdening every visitor with cold-start
      headers: { 'Cache-Control': 'public, s-maxage=90, stale-while-revalidate=300' },
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error fetching market data:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Failed to fetch market data' }, { status: 500 });
  }
}
