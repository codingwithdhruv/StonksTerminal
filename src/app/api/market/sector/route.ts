import { NextResponse } from 'next/server';
import axios from 'axios';
import { classifyTheme, fetchDynamicEtfs } from '@/lib/market';
import { fetchAlpacaAssets } from '@/lib/alpaca-assets';
import { getProfiles, getMetrics, getCatalysts } from '@/lib/finnhub-cache';
import { getAlphaVantageOverviews } from '@/lib/alphavantage';
import { getTiingoFundamentals } from '@/lib/tiingo';
import yahooFinance2 from 'yahoo-finance2';

// @ts-ignore
const yahooFinance = typeof yahooFinance2 === 'function' ? new yahooFinance2() : (yahooFinance2.default ? new yahooFinance2.default() : yahooFinance2);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};

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
  earnings: [],
};

function matchesSector(industry: string, theme: string, sector: string): boolean {
  const keywords = SECTOR_INDUSTRY_MAP[sector.toLowerCase()] || [];
  if (keywords.length === 0) return true;
  const haystack = `${industry} ${theme}`.toLowerCase();
  return keywords.some(kw => {
    const safe = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${safe}`, 'i').test(haystack);
  });
}

async function fetchSparklines(symbols: string[]): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  if (symbols.length === 0) return result;
  const start = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  try {
    const res = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/bars?symbols=${symbols.join(',')}&timeframe=1Day&start=${start}&limit=1000`,
      { headers: alpacaHeaders, timeout: 15000 }
    );
    const bars = res.data?.bars || {};
    for (const [sym, symBars] of Object.entries(bars)) {
      result[sym] = (symBars as any[]).slice(-10).map(b => b.c);
    }
  } catch (e) {
    console.error('Sparkline fetch error (sector):', (e as Error).message);
  }
  return result;
}

async function fetchYFMetrics(symbols: string[]): Promise<Record<string, any>> {
  const metrics: Record<string, any> = {};
  if (symbols.length === 0) return metrics;
  const CHUNK_SIZE = 15;
  for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + CHUNK_SIZE);
    await Promise.allSettled(chunk.map(async (sym) => {
      try {
        const [result, searchRes] = await Promise.all([
          yahooFinance.quoteSummary(sym, { modules: ['defaultKeyStatistics', 'financialData'] }).catch(() => null),
          yahooFinance.search(sym, { newsCount: 1 }).catch(() => null)
        ]);
        const shortPctRaw = result?.defaultKeyStatistics?.shortPercentOfFloat;
        const revGrowthRaw = result?.financialData?.revenueGrowth;
        const epsGrowthRaw = result?.financialData?.earningsGrowth;
        metrics[sym] = {
          shortPct: shortPctRaw != null ? (shortPctRaw * 100).toFixed(2) + '%' : undefined,
          revGrowth: revGrowthRaw != null ? (revGrowthRaw >= 0 ? '+' : '') + (revGrowthRaw * 100).toFixed(1) + '%' : undefined,
          epsGrowth: epsGrowthRaw != null ? (epsGrowthRaw >= 0 ? '+' : '') + (epsGrowthRaw * 100).toFixed(1) + '%' : undefined,
          catalyst: searchRes?.news?.[0]?.title || undefined,
        };
      } catch { /* ignore */ }
    }));
    if (i + CHUNK_SIZE < symbols.length) await new Promise(r => setTimeout(r, 200));
  }
  return metrics;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  try {
    // 1. Fetch a large set of actives and movers to filter from
    const [activesRes, gainersRes, losersRes] = await Promise.allSettled([
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/most-actives?by=volume&top=100`, { headers: alpacaHeaders }),
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/movers?top=50`, { headers: alpacaHeaders }),
      axios.get(`${ALPACA_DATA_URL}/v1beta1/screener/stocks/movers?top=50&direction=desc`, { headers: alpacaHeaders }),
    ]);

    const symbolSet = new Set<string>();
    if (activesRes.status === 'fulfilled') (activesRes.value.data.most_actives || []).forEach((s: any) => symbolSet.add(s.symbol));
    if (gainersRes.status === 'fulfilled') (gainersRes.value.data.gainers || []).forEach((s: any) => symbolSet.add(s.symbol));
    if (losersRes.status === 'fulfilled') (losersRes.value.data.losers || []).forEach((s: any) => symbolSet.add(s.symbol));

    const allSymbols = Array.from(symbolSet);
    if (allSymbols.length === 0) return NextResponse.json({ data: [] });

    // 2. Fetch metadata to filter by sector
    const [alpacaAssets, etfList] = await Promise.all([
      fetchAlpacaAssets(allSymbols),
      fetchDynamicEtfs()
    ]);
    const etfSymbols = new Set(etfList);

    const filteredSymbols = allSymbols.filter(sym => {
      const asset = alpacaAssets[sym];
      if (!asset) return false;
      return matchesSector(asset.industryGuess || '', asset.themeGuess || '', sector);
    });

    if (filteredSymbols.length === 0) return NextResponse.json({ data: [] });

    // 3. Fetch full data for filtered symbols
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${filteredSymbols.join(',')}&feed=iex`,
      { headers: alpacaHeaders, timeout: 10000 }
    );
    const snapshots = snapshotRes.data || {};

    const finnhubEligible = filteredSymbols.filter(s => {
      const cat = alpacaAssets[s]?.category;
      return !etfSymbols.has(s) && (!cat || cat === 'Stock' || cat === 'ADR');
    });

    const [profiles, finnhubMetrics, catalysts, sparklines, yfMetrics, yfQuotes] = await Promise.all([
      getProfiles(finnhubEligible),
      getMetrics(finnhubEligible),
      getCatalysts(filteredSymbols),
      fetchSparklines(filteredSymbols),
      fetchYFMetrics(filteredSymbols),
      yahooFinance.quote(filteredSymbols).catch(() => [])
    ]);

    const noProfileSymbols = filteredSymbols.filter(s => !profiles[s] && !etfSymbols.has(s));
    const [avOverviews, tiingoFundamentals] = await Promise.all([
      getAlphaVantageOverviews(noProfileSymbols),
      Promise.all(noProfileSymbols.map(sym => getTiingoFundamentals(sym).then(res => ({ sym, res })))).then(r => r.reduce((acc, c) => { if (c.res) acc[c.sym] = c.res; return acc; }, {} as any))
    ]);

    const yfMap: Record<string, any> = {};
    for (const q of (yfQuotes || [])) if (q.symbol) yfMap[q.symbol.toUpperCase()] = q;

    const allData = filteredSymbols.map(sym => {
      const snap = snapshots[sym];
      const prof = profiles[sym];
      const asset = alpacaAssets[sym];
      const av = avOverviews[sym];
      const tf = tiingoFundamentals[sym];
      const yf = yfMap[sym] || {};
      const yfM = yfMetrics[sym] || {};
      const fm = finnhubMetrics[sym];

      const isEtf = etfSymbols.has(sym) || prof?.finnhubIndustry?.toLowerCase().includes('etf') || av?.AssetType?.toLowerCase().includes('etf');
      let price = snap?.latestTrade?.p || yf.regularMarketPrice || 0;
      let prevClose = snap?.prevDailyBar?.c || yf.regularMarketPreviousClose || 0;
      let changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
      if (price === 0) return null;

      const volume = snap?.dailyBar?.v || yf.regularMarketVolume || 0;
      
      let mktCapVal = (yf.marketCap || 0) / 1000000 || prof?.marketCapitalization || fm?.marketCapitalization || (tf?.marketCap || 0) / 1000000 || parseInt(av?.MarketCapitalization || '0') / 1000000 || 0;
      let sharesVal = (yf.sharesOutstanding || 0) / 1000000 || prof?.shareOutstanding || parseInt(av?.SharesOutstanding || '0') / 1000000 || 0;
      if (mktCapVal === 0 && price > 0 && sharesVal > 0) mktCapVal = price * sharesVal;

      const industry = prof?.finnhubIndustry || av?.Sector || av?.Industry || (isEtf ? 'ETF' : asset?.industryGuess || '--');
      const theme = prof?.finnhubIndustry ? classifyTheme(prof.finnhubIndustry, prof.name || sym) : (av?.Sector ? classifyTheme(av.Sector, av.Name || sym) : (isEtf ? 'ETF' : asset?.themeGuess || '--'));

      return {
        symbol: sym,
        logo: prof?.logo || undefined,
        volume,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        sparkline: sparklines[sym] || [],
        grade: Math.abs(changePct) > 10 ? 'A' : Math.abs(changePct) > 5 ? 'B' : 'C',
        mktCap: mktCapVal > 0 ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M') : '--',
        capSize: mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : (mktCapVal > 0 || price < 5) ? 'Micro' : '--',
        float: sharesVal > 0 ? (sharesVal >= 1000 ? (sharesVal / 1000).toFixed(1) + 'B' : sharesVal.toFixed(1) + 'M') : '--',
        shortPct: yfM.shortPct || '--',
        theme,
        industry,
        revGrowth: yfM.revGrowth || (fm?.revenueGrowthTTMYoy != null ? (fm.revenueGrowthTTMYoy >= 0 ? '+' : '') + fm.revenueGrowthTTMYoy.toFixed(1) + '%' : '--'),
        epsGrowth: yfM.epsGrowth || (fm?.epsGrowthTTMYoy != null ? (fm.epsGrowthTTMYoy >= 0 ? '+' : '') + fm.epsGrowthTTMYoy.toFixed(1) + '%' : '--'),
        catalyst: catalysts[sym] || yfM.catalyst || '--',
      };
    }).filter(Boolean);

    allData.sort((a, b) => Math.abs(parseFloat(b!.changePct)) - Math.abs(parseFloat(a!.changePct)));

    return NextResponse.json({ data: allData });
  } catch (error) {
    console.error('Sector market error:', error);
    return NextResponse.json({ data: [] });
  }
}
