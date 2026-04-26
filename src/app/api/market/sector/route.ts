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

// Curated sector ticker lists — top traded stocks per sector
const SECTOR_TICKERS: Record<string, string[]> = {
  technology: [
    'AAPL','MSFT','NVDA','AMD','INTC','GOOGL','META','AMZN','AVGO','QCOM',
    'TSM','CRM','ORCL','ADBE','NOW','SHOP','PLTR','SNOW','MU','DELL',
    'NET','UBER','MRVL','ARM','SMCI','CRWD','PANW','ZS','DDOG','ANET',
  ],
  healthcare: [
    'UNH','JNJ','LLY','PFE','ABBV','MRK','TMO','ABT','DHR','BMY',
    'AMGN','GILD','VRTX','REGN','ISRG','MDT','SYK','BSX','ZTS','HCA',
    'MRNA','BIIB','ILMN','DXCM','ALGN','HIMS','DNA','RXRX','ARCT','SGEN',
  ],
  crypto: [
    'COIN','MARA','RIOT','MSTR','CLSK','HUT','BITF','CIFR','WULF','BTBT',
    'SI','ARBK','SOS','CORZ','GREE','BTDR','IREN','HIVE','DGII','HOOD',
  ],
  energy: [
    'XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','PXD',
    'DVN','HAL','FANG','HES','BKR','ENPH','SEDG','FSLR','RUN','PLUG',
    'NEE','DUK','SO','AES','CWEN','NOVA','ARRY','STEM','BE','CHPT',
  ],
  macro: [
    'SPY','QQQ','IWM','DIA','TLT','GLD','SLV','UNG','USO','VXX',
    'JPM','BAC','GS','MS','C','WFC','BRK.B','BLK','SCHW','AXP',
    'V','MA','PYPL','SQ','AFRM','SOFI','NU','UPST','LC','ALLY',
  ],
  fda: [
    'MRNA','PFE','BNTX','NVAX','REGN','VRTX','SGEN','BMRN','ALNY','IONS',
    'RARE','BLUE','SRPT','EXEL','HALO','PCVX','RCKT','FATE','CRSP','NTLA',
    'BEAM','EDIT','VERV','ACAD','ARCT','DNLI','APLS','IMVT','RVMD','SRRK',
  ],
  earnings: [
    'AAPL','MSFT','GOOGL','AMZN','META','NVDA','TSLA','NFLX','AMD','INTC',
    'CRM','ORCL','ADBE','NOW','SHOP','PLTR','SNOW','MU','JPM','BAC',
    'GS','WFC','UNH','JNJ','PFE','XOM','CVX','HD','WMT','COST',
  ],
};

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
  if (text.match(/auto|vehicle|ev |electric vehicle|motor/)) return 'Automotive';
  return industry || 'General';
}

interface AlpacaSnapshot {
  latestTrade?: { p: number };
  dailyBar?: { c: number; v: number };
  prevDailyBar?: { c: number };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  const tickers = SECTOR_TICKERS[sector.toLowerCase()];
  if (!tickers) {
    return NextResponse.json({ error: `Unknown sector: ${sector}` }, { status: 400 });
  }

  try {
    // 1. Fetch Alpaca snapshots for all sector tickers
    const symbolsStr = tickers.join(',');
    const snapshotRes = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/snapshots?symbols=${symbolsStr}&feed=iex`,
      { headers: alpacaHeaders, timeout: 10000 }
    );
    const snapshots: Record<string, AlpacaSnapshot> = snapshotRes.data || {};

    // 2. Fetch SA get-data for fundamentals
    let saData: Record<string, { shortPct?: string; revGrowth?: string; epsGrowth?: string; saMktCap?: number }> = {};
    if (RAPIDAPI_KEY) {
      try {
        // Batch in groups of 20
        for (let i = 0; i < tickers.length; i += 20) {
          const batch = tickers.slice(i, i + 20);
          const res = await axios.get(
            `https://seeking-alpha.p.rapidapi.com/symbols/get-data?symbol=${batch.join(',')}&fields=short_interest_shares_outstanding,revenue_growth,eps,marketCap`,
            {
              headers: {
                'x-rapidapi-key': RAPIDAPI_KEY,
                'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
              },
              timeout: 10000,
            }
          );
          for (const item of (res.data?.data || [])) {
            const sym = (item.id || '').toUpperCase();
            const a = item.attributes || {};
            saData[sym] = {
              shortPct: a.shortInterestSharesOutstanding != null ? a.shortInterestSharesOutstanding.toFixed(1) + '%' : undefined,
              revGrowth: a.revenueGrowth != null ? (Math.abs(a.revenueGrowth) < 1 ? (a.revenueGrowth * 100).toFixed(1) : a.revenueGrowth.toFixed(1)) + '%' : undefined,
              epsGrowth: a.eps != null ? '$' + a.eps.toFixed(2) : undefined,
              saMktCap: a.marketCap || undefined,
            };
          }
        }
      } catch (e) {
        console.error('SA sector data error:', (e as Error).message);
      }
    }

    // 3. Fetch Finnhub profiles (batch of 15 to respect rate limits)
    const profiles: Record<string, { name?: string; mktCap?: number; shares?: number; industry?: string }> = {};
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
                return { symbol: sym, data: { name: d.name, mktCap: d.marketCapitalization, shares: d.shareOutstanding, industry: d.finnhubIndustry } };
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

    // 4. Build results
    const stocks = tickers.map((sym) => {
      const snap = snapshots[sym];
      const sa = saData[sym] || {};
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

      return {
        symbol: sym,
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
        catalyst: '--',
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
