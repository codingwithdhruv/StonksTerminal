import { NextResponse } from 'next/server';
import axios from 'axios';
import { fetchDynamicEtfs, classifyTheme, formatGrowth } from '@/lib/market';
import { fetchAlpacaAssets } from '@/lib/alpaca-assets';
import { getProfiles, getMetrics, getCatalysts, fetchPreMarketBars } from '@/lib/finnhub-cache';
import yahooFinance from 'yahoo-finance2';

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

// Snapshots from Alpaca

// Metrics

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
    //     Skip ETFs and Alpaca-classified Warrant/Right/Unit/Note/Preferred (Finnhub returns {} for these).
    //     This drops the call count from ~88 → ~40, well under Finnhub's 60/min limit.
    const finnhubEligible = symbols.filter(s => {
      if (etfSymbols.has(s)) return false;
      const cat = alpacaAssets[s]?.category;
      if (cat && cat !== 'Stock' && cat !== 'ADR') return false;
      return true;
    });

    // 3b. Fetch Finnhub profile2 (industry/logo/mktCap/float) — 24h cached
    const profiles = await getProfiles(finnhubEligible);

    // 4. Fetch Finnhub metrics (revGrowth, epsGrowth, mktCap fallback) — 24h cached.
    //    Called AFTER profiles to spread rate-limit budget: ~30 profile + ~30 metric = 60/min.
    const finnhubMetrics = await getMetrics(finnhubEligible);

    // 5. Attempt SA metrics (shortPct, logos) — gracefully returns {} on quota/403
    const { metrics: saMetrics } = await fetchSAMetrics(finnhubEligible);

    // 6. Fetch live catalysts via Alpaca news (1 multi-symbol call vs 88 Finnhub calls)
    const catalysts = await getCatalysts(symbols);

    // 7. Build prevClose map for pre-market % calculation
    const prevCloses: Record<string, number> = {};
    for (const sym of symbols) {
      const snap = snapshots[sym];
      if (snap?.prevDailyBar?.c) prevCloses[sym] = snap.prevDailyBar.c;
    }

    // 8. Fetch pre-market data + sparklines + Yahoo Finance quotes in parallel
    //    Pre-market: Alpaca minute bars 4AM-9:30AM ET (free, same credentials, returns {} outside window)
    const [preMarketData, sparklines, yfQuotes] = await Promise.all([
      fetchPreMarketBars(symbols, prevCloses),
      fetchSparklines(symbols),
      (yahooFinance as any).quote(symbols).catch((e: any) => {
        console.error('Yahoo Finance quote fetch error:', e.message);
        return [];
      })
    ]);

    // Build YF data map
    const yfMap: Record<string, any> = {};
    for (const q of (yfQuotes || [])) {
      if (q.symbol) yfMap[q.symbol.toUpperCase()] = q;
    }

    // 9. Build gappers array
    const gappers = symbols.map((sym) => {
      const snap = snapshots[sym];
      const prof = profiles[sym] || null;
      const sa = saMetrics[sym] || {};
      const fMetrics = finnhubMetrics[sym] || null;
      const pm = preMarketData[sym] || { premktChgPct: '--', premktVol: 0 };
      const yf = yfMap[sym] || {};
      const isEtf = etfSymbols.has(sym) || prof?.finnhubIndustry?.toLowerCase().includes('etf') || yf.quoteType === 'ETF';
      const vol = volumeMap.get(sym) || { volume: 0, trade_count: 0 };

      let price = 0, prevClose = 0, changePct = 0;
      if (snap) {
        price = snap.latestTrade?.p || snap.dailyBar?.c || yf.regularMarketPrice || 0;
        prevClose = snap.prevDailyBar?.c || yf.regularMarketPreviousClose || price;
        if (prevClose > 0) changePct = ((price - prevClose) / prevClose) * 100;
      } else if (yf.regularMarketPrice) {
        price = yf.regularMarketPrice;
        prevClose = yf.regularMarketPreviousClose || price;
        if (prevClose > 0) changePct = ((price - prevClose) / prevClose) * 100;
      }
      
      if (price === 0) return null;

      const volume = vol.volume || snap?.dailyBar?.v || yf.regularMarketVolume || 0;

      let grade = 'D';
      if (Math.abs(changePct) > 10 && volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      // Market cap: Yahoo (billions) → Finnhub profile2 → Finnhub metric → SA (all in millions USD)
      let mktCapVal = 0;
      if (yf.marketCap && yf.marketCap > 0) {
        mktCapVal = yf.marketCap / 1000000;
      } else if (prof?.marketCapitalization && prof.marketCapitalization > 0) {
        mktCapVal = prof.marketCapitalization;
      } else if (fMetrics?.marketCapitalization && fMetrics.marketCapitalization > 0) {
        mktCapVal = fMetrics.marketCapitalization;
      } else if (sa.saMktCap && sa.saMktCap > 0) {
        mktCapVal = sa.saMktCap / 1000000;
      }
      
      const mktCapDisplay = mktCapVal > 0
        ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M')
        : (isEtf ? 'ETF' : '--');

      const capSize = mktCapVal > 0
        ? (mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : 'Micro')
        : (isEtf ? 'ETF' : '--');

      const shares = yf.sharesOutstanding || prof?.shareOutstanding || 0;
      const float = shares > 0
        ? (shares >= 1000 ? (shares / 1000).toFixed(1) + 'B' : shares.toFixed(1) + 'M')
        : '--';

      const asset = alpacaAssets[sym];
      // Industry: Finnhub primary → Alpaca asset name guess → '--'
      const industry = prof?.finnhubIndustry || (isEtf ? 'ETF' : asset?.industryGuess || '--');
      const theme = prof?.finnhubIndustry
        ? classifyTheme(prof.finnhubIndustry, prof.name || sym)
        : (isEtf ? 'ETF' : asset?.themeGuess || '--');
      // Category: ETF → "ETF"; Finnhub stock → "Stock"; Alpaca classified (Warrant/Right/Unit) → that label
      const category = isEtf
        ? 'ETF'
        : (prof?.finnhubIndustry ? 'Stock' : (asset?.category || '--'));

      const catalyst = catalysts[sym] || (isEtf ? `Leveraged/Inverse ETF tracking ${theme}` : '--');

      // Logo: prefer SA logo, fallback to Finnhub logo
      const logo = sa.logo || prof?.logo || undefined;

      // Short Interest: SA → Yahoo
      let shortPct = sa.shortPct || '--';
      if (shortPct === '--' && yf.shortPercentOfFloat) {
        shortPct = (yf.shortPercentOfFloat * 100).toFixed(1) + '%';
      }

      return {
        symbol: sym,
        logo,
        volume,
        trade_count: vol.trade_count,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        premktChgPct: pm.premktChgPct,
        premktVol: pm.premktVol,
        sparkline: sparklines[sym] || [],
        grade,
        mktCap: mktCapDisplay,
        mktCapRaw: mktCapVal, // Added for UI filtering
        capSize,
        float,
        shortPct,
        theme,
        industry,
        category,
        // revGrowth/epsGrowth: SA (quota exceeded) → Finnhub metric (free, TTM YoY %)
        revGrowth: sa.revGrowth || (fMetrics?.revenueGrowthTTMYoy != null
          ? (fMetrics.revenueGrowthTTMYoy >= 0 ? '+' : '') + fMetrics.revenueGrowthTTMYoy.toFixed(1) + '%'
          : '--'),
        epsGrowth: sa.epsGrowth || (fMetrics?.epsGrowthTTMYoy != null
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
