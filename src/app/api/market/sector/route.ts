import { NextResponse } from 'next/server';
import axios from 'axios';
import { classifyTheme, formatGrowth } from '@/lib/market';
import { fetchAlpacaAssets, AlpacaAsset } from '@/lib/alpaca-assets';
import { getProfiles, getCatalysts } from '@/lib/finnhub-cache';

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

interface YFPreMarket {
  premktChgPct: string;
  premktVol: number;
}

/**
 * Map sector slugs to Finnhub industry keyword matchers.
 * Match uses word-boundary at start (\b{kw}) so 'technology' won't match 'biotechnology'.
 */
const SECTOR_INDUSTRY_MAP: Record<string, string[]> = {
  technology: ['technology', 'semiconductor', 'software', 'internet', 'electronic', 'computer', 'it services', 'information technology', 'data processing'],
  healthcare: ['biotechnology', 'pharmaceutical', 'health care', 'health-care', 'healthcare', 'medical', 'hospital', 'diagnostic', 'life science', 'drug'],
  macro: ['bank', 'financial', 'capital market', 'insurance', 'credit', 'investment', 'diversified financial', 'asset management'],
  financials: ['bank', 'financial', 'capital market', 'insurance', 'credit', 'investment', 'diversified financial', 'asset management'],
  communications: ['communic', 'media', 'telecom', 'interactive', 'entertainment', 'broadcast', 'wireless'],
  energy: ['oil', 'gas', 'energy', 'solar', 'wind', 'renew', 'petroleum', 'coal', 'nuclear'],
  utilities: ['utilit', 'electric', 'water utility', 'gas distribut', 'power'],
  realestate: ['real estate', 'reit', 'property'],
  crypto: ['cryptocurrency', 'blockchain', 'digital asset', 'bitcoin', 'crypto'],
  fda: ['biotechnology', 'pharmaceut', 'drug', 'medical device', 'life science', 'clinical'],
  earnings: [], // no filter — show top movers by grade
};

/** Word-boundary keyword match — prevents 'technology' from matching 'biotechnology' */
function matchesSector(industry: string, theme: string, sector: string): boolean {
  const keywords = SECTOR_INDUSTRY_MAP[sector.toLowerCase()] || [];
  if (keywords.length === 0) return true; // no filter = all stocks
  const haystack = `${industry} ${theme}`.toLowerCase();
  return keywords.some(kw => {
    // Use \b at start — so 'technology' won't match inside 'biotechnology'
    const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${safe}`).test(haystack);
  });
}

/** Fetch 10-day closing prices per symbol for sparkline charts */
async function fetchSparklines(symbols: string[]): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  if (symbols.length === 0) return result;
  const start = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
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
    console.error('Sparkline fetch error (sector):', (e as Error).message);
  }
  return result;
}

/** Fetch pre-market % change and volume from Yahoo Finance */
async function fetchPreMarketData(symbols: string[]): Promise<Record<string, YFPreMarket>> {
  const result: Record<string, YFPreMarket> = {};
  if (!RAPIDAPI_KEY || symbols.length === 0) return result;

  for (let i = 0; i < symbols.length; i += 30) {
    const batch = symbols.slice(i, i + 30);
    try {
      const res = await axios.get(
        `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v2/get-quotes?region=US&symbols=${batch.join(',')}`,
        {
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
          },
          timeout: 10000,
        }
      );
      const quotes: Array<{
        symbol?: string;
        preMarketChangePercent?: number | null;
        preMarketVolume?: number | null;
      }> = res.data?.quoteResponse?.result || [];

      for (const q of quotes) {
        if (!q.symbol) continue;
        const pct = q.preMarketChangePercent;
        result[q.symbol] = {
          premktChgPct: pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '--',
          premktVol: q.preMarketVolume ?? 0,
        };
      }
    } catch (e) {
      console.error('YF pre-market error (sector):', (e as Error).message);
    }
    if (i + 30 < symbols.length) await new Promise(r => setTimeout(r, 200));
  }
  return result;
}

/** Fetch SA get-metrics for SI%, rev growth, EPS growth, logos — graceful on quota */
async function fetchSAMetrics(symbols: string[]): Promise<
  Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number; logo?: string }>
> {
  const metrics: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number; logo?: string }> = {};
  if (!RAPIDAPI_KEY || symbols.length === 0) return metrics;

  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));

  for (const batch of batches) {
    try {
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/symbols/get-data?symbol=${batch.join(',')}&fields=marketCap`,
        { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com' }, timeout: 10000 }
      );
      for (const item of (res.data?.data || [])) {
        const sym = (item.id || '').toUpperCase();
        if (sym) metrics[sym] = { saMktCap: item.attributes?.marketCap || undefined };
      }
    } catch { /* quota or network error — skip */ }
  }

  for (const batch of batches) {
    try {
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/symbols/get-metrics?symbols=${batch.join(',')}&fields=short_interest_percent_of_float,revenue_growth,diluted_eps_growth`,
        { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com' }, timeout: 12000 }
      );

      const tickerIdToSym: Record<string, string> = {};
      const tickerLogos: Record<string, string> = {};
      const metricTypeMap: Record<string, string> = {};

      for (const inc of (res.data?.included || [])) {
        if (inc.type === 'ticker' && inc.attributes?.name) {
          const sym = inc.attributes.name.toUpperCase();
          tickerIdToSym[inc.id] = sym;
          const logo = inc.meta?.companyLogoUrlLight || inc.meta?.companyLogoUrlDark;
          if (logo) tickerLogos[sym] = logo;
        }
        if (inc.type === 'metric_type') {
          metricTypeMap[inc.id] = inc.attributes?.field || '';
        }
      }

      for (const item of (res.data?.data || [])) {
        const tickerId = item.relationships?.ticker?.data?.id;
        const metricTypeId = item.relationships?.metric_type?.data?.id;
        const sym = tickerIdToSym[tickerId];
        const field = metricTypeMap[metricTypeId];
        const value = item.attributes?.value;
        if (!sym || !field || value == null) continue;

        if (!metrics[sym]) metrics[sym] = {};
        if (field === 'short_interest_percent_of_float') metrics[sym].shortPct = value.toFixed(1) + '%';
        else if (field === 'revenue_growth') metrics[sym].revGrowth = formatGrowth(value);
        else if (field === 'diluted_eps_growth') metrics[sym].epsGrowth = formatGrowth(value);
      }

      for (const [sym, logo] of Object.entries(tickerLogos)) {
        if (!metrics[sym]) metrics[sym] = {};
        metrics[sym].logo = logo;
      }
    } catch { /* quota exceeded — skip */ }
  }

  return metrics;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  try {
    // 1. Get most-active stocks + movers from Alpaca (same source as overview)
    const [screenerRes, moversRes] = await Promise.allSettled([
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/most-actives?by=volume&top=100`, { headers: alpacaHeaders }),
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/movers?top=30`, { headers: alpacaHeaders }),
    ]);

    const symbolSet = new Set<string>();
    const volumeMap = new Map<string, number>();

    if (screenerRes.status === 'fulfilled') {
      for (const s of (screenerRes.value.data.most_actives || [])) {
        symbolSet.add(s.symbol);
        volumeMap.set(s.symbol, s.volume || 0);
      }
    }
    if (moversRes.status === 'fulfilled') {
      for (const s of [...(moversRes.value.data.gainers || []), ...(moversRes.value.data.losers || [])]) {
        symbolSet.add(s.symbol);
        if (!volumeMap.has(s.symbol)) volumeMap.set(s.symbol, 0);
      }
    }

    const allSymbols = Array.from(symbolSet);
    if (allSymbols.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 2. Fetch Alpaca snapshots for all symbols
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${allSymbols.join(',')}&feed=iex`,
      { headers: alpacaHeaders, timeout: 10000 }
    );
    const snapshots: Record<string, AlpacaSnapshot> = snapshotRes.data || {};

    // 3. Fetch Finnhub profiles (cached 24h, throttled to respect 60/min limit)
    const profiles = await getProfiles(allSymbols);

    // 4. Fetch Alpaca asset master (provides classification for warrants and industry guess as fallback)
    const alpacaAssets = await fetchAlpacaAssets(allSymbols);

    // 5. Filter symbols to those matching the sector
    //    Use Finnhub industry primary, Alpaca asset name guess as fallback
    const sectorSymbols = allSymbols.filter(sym => {
      const prof = profiles[sym];
      const asset = alpacaAssets[sym];
      const industry = prof?.finnhubIndustry || asset?.industryGuess || '';
      const theme = asset?.themeGuess || '';
      if (!industry || industry === '--') return false;
      return matchesSector(industry, theme, sector);
    });

    if (sectorSymbols.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // 6. Fetch SA metrics (graceful degradation on quota exceeded)
    const saMetrics = await fetchSAMetrics(sectorSymbols);

    // 7. Fetch catalysts (cached 10min)
    const catalysts = await getCatalysts(sectorSymbols);

    // 8. Fetch pre-market data + sparklines in parallel
    const [preMarketData, sparklines] = await Promise.all([
      fetchPreMarketData(sectorSymbols),
      fetchSparklines(sectorSymbols),
    ]);

    // 9. Build result
    const stocks = sectorSymbols.map((sym) => {
      const snap = snapshots[sym];
      const prof = profiles[sym];
      const asset: AlpacaAsset | undefined = alpacaAssets[sym];
      const sa = saMetrics[sym] || {};
      const pm = preMarketData[sym] || { premktChgPct: '--', premktVol: 0 };

      let price = 0, prevClose = 0, changePct = 0;
      if (snap) {
        price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
        prevClose = snap.prevDailyBar?.c || price;
        if (prevClose > 0) changePct = ((price - prevClose) / prevClose) * 100;
      }
      if (price === 0) return null;

      const volume = volumeMap.get(sym) || snap?.dailyBar?.v || 0;

      let grade = 'D';
      if (Math.abs(changePct) > 10 && volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      let mktCapVal = prof?.marketCapitalization || 0;
      if (mktCapVal === 0 && sa.saMktCap) mktCapVal = sa.saMktCap / 1000000;
      const mktCap = mktCapVal > 0
        ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M')
        : '--';
      const capSize = mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : mktCapVal > 0 ? 'Micro' : '--';
      const float = prof?.shareOutstanding
        ? (prof.shareOutstanding >= 1000 ? (prof.shareOutstanding / 1000).toFixed(1) + 'B' : prof.shareOutstanding.toFixed(1) + 'M')
        : '--';
      // Industry: Finnhub primary → Alpaca asset name guess → '--'
      const industry = prof?.finnhubIndustry || asset?.industryGuess || '--';
      const theme = prof?.finnhubIndustry
        ? classifyTheme(prof.finnhubIndustry, prof.name || sym)
        : (asset?.themeGuess || '--');
      const stockCategory = prof?.finnhubIndustry ? 'Stock' : (asset?.category || 'Stock');
      const logo = sa.logo || prof?.logo || undefined;

      return {
        symbol: sym,
        logo,
        volume,
        trade_count: 0,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        premktChgPct: pm.premktChgPct,
        premktVol: pm.premktVol,
        sparkline: sparklines[sym] || [],
        grade,
        mktCap,
        capSize,
        float,
        shortPct: sa.shortPct || '--',
        theme,
        industry,
        category: stockCategory,
        revGrowth: sa.revGrowth || '--',
        epsGrowth: sa.epsGrowth || '--',
        catalyst: catalysts[sym] || '--',
      };
    }).filter(Boolean);

    stocks.sort((a, b) => Math.abs(parseFloat(b!.changePct)) - Math.abs(parseFloat(a!.changePct)));

    return NextResponse.json({ data: stocks }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Sector market error:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Failed to fetch sector data' }, { status: 500 });
  }
}
