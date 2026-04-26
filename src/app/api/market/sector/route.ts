import { NextResponse } from 'next/server';
import axios from 'axios';
import { fetchSectorTickers, classifyTheme, formatGrowth } from '@/lib/market';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};


// Metrics

interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: { c: number; v: number };
  prevDailyBar?: { c: number };
}

/** Fetch SA get-metrics for correct SI%, rev growth, EPS growth, logos, and mktCap */
async function fetchSAMetrics(symbols: string[]): Promise<
  Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number; logo?: string }>
> {
  const metrics: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number; logo?: string }> = {};
  if (!RAPIDAPI_KEY || symbols.length === 0) return metrics;

  const batches: string[][] = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));

  // get-data for mktCap fallback
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
    } catch { /* skip */ }
  }

  // get-metrics for SI%, rev growth, EPS growth, logos
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
    } catch { /* skip */ }
  }

  return metrics;
}

/** Fetch latest news headline per symbol from Finnhub as live catalyst */
async function fetchCatalysts(symbols: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!FINNHUB_API_KEY) return result;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  for (let i = 0; i < symbols.length; i += 15) {
    const batch = symbols.slice(i, i + 15);
    const promises = batch.map(async (sym) => {
      try {
        const res = await axios.get(
          `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${weekAgo}&to=${today}&token=${FINNHUB_API_KEY}`,
          { timeout: 5000 }
        );
        const news = res.data;
        if (Array.isArray(news) && news.length > 0) return { symbol: sym, catalyst: news[0].headline || '' };
        return { symbol: sym, catalyst: '' };
      } catch {
        return { symbol: sym, catalyst: '' };
      }
    });
    const results = await Promise.all(promises);
    for (const r of results) { if (r.catalyst) result[r.symbol] = r.catalyst; }
    if (i + 15 < symbols.length) await new Promise(r => setTimeout(r, 300));
  }
  return result;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  const tickers = await fetchSectorTickers(sector);
  if (!tickers || tickers.length === 0) {
    return NextResponse.json({ error: `No tickers found for sector: ${sector}. Ensure RAPIDAPI_KEY is configured.` }, { status: 404 });
  }

  try {
    // 1. Fetch Alpaca snapshots for all sector tickers
    const symbolsStr = tickers.join(',');
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbolsStr}&feed=iex`,
      { headers: alpacaHeaders, timeout: 10000 }
    );
    const snapshots: Record<string, AlpacaSnapshot> = snapshotRes.data || {};

    // 2. Fetch SA metrics (SI%, rev growth, EPS growth, logos, mktCap)
    const saMetrics = await fetchSAMetrics(tickers);

    // 3. Fetch Finnhub profiles (batch of 15 to respect rate limits)
    const profiles: Record<string, { name?: string; mktCap?: number; shares?: number; industry?: string; logo?: string }> = {};
    if (FINNHUB_API_KEY) {
      for (let i = 0; i < tickers.length; i += 15) {
        const batch = tickers.slice(i, i + 15);
        const results = await Promise.all(
          batch.map(async (sym) => {
            try {
              const res = await axios.get(
                `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_API_KEY}`,
                { timeout: 5000 }
              );
              const d = res.data;
              if (d && d.ticker) {
                return { symbol: sym, data: { name: d.name, mktCap: d.marketCapitalization, shares: d.shareOutstanding, industry: d.finnhubIndustry, logo: d.logo } };
              }
              return { symbol: sym, data: null };
            } catch {
              return { symbol: sym, data: null };
            }
          })
        );
        for (const r of results) {
          if (r.data) profiles[r.symbol] = r.data;
        }
        if (i + 15 < tickers.length) await new Promise(r => setTimeout(r, 250));
      }
    }

    // 4. Fetch catalysts for all sector tickers
    const catalysts = await fetchCatalysts(tickers);

    // 5. Build results
    const stocks = tickers.map((sym) => {
      const snap = snapshots[sym];
      const sa = saMetrics[sym] || {};
      const prof = profiles[sym];

      let price = 0, prevClose = 0, changePct = 0;
      if (snap) {
        price = snap.latestTrade?.p || snap.dailyBar?.c || 0;
        prevClose = snap.prevDailyBar?.c || price;
        if (prevClose > 0) changePct = ((price - prevClose) / prevClose) * 100;
      }
      if (price === 0) return null;

      const volume = snap?.dailyBar?.v || 0;

      let grade = 'D';
      if (Math.abs(changePct) > 10 && volume > 500000) grade = 'A';
      else if (Math.abs(changePct) > 5 && volume > 100000) grade = 'B';
      else if (Math.abs(changePct) > 2) grade = 'C';

      let mktCapVal = (prof?.mktCap || 0);
      if (mktCapVal === 0 && sa.saMktCap) mktCapVal = sa.saMktCap / 1000000;
      const mktCap = mktCapVal > 0
        ? (mktCapVal >= 1000 ? (mktCapVal / 1000).toFixed(2) + 'B' : mktCapVal.toFixed(0) + 'M')
        : '--';
      const capSize = mktCapVal > 200000 ? 'Mega' : mktCapVal > 10000 ? 'Large' : mktCapVal > 2000 ? 'Mid' : mktCapVal > 300 ? 'Small' : mktCapVal > 0 ? 'Micro' : '--';
      const float = prof?.shares
        ? (prof.shares >= 1000 ? (prof.shares / 1000).toFixed(1) + 'B' : prof.shares.toFixed(1) + 'M')
        : '--';
      const industry = prof?.industry || '--';
      const theme = classifyTheme(industry, prof?.name || sym);
      const logo = sa.logo || prof?.logo || undefined;

      return {
        symbol: sym,
        logo,
        volume,
        trade_count: 0,
        price,
        prevClose,
        changePct: changePct.toFixed(2),
        grade,
        mktCap,
        capSize,
        float,
        shortPct: sa.shortPct || '--',
        theme,
        industry,
        category: 'Stock',
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
