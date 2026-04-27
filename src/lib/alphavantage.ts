import axios from 'axios';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

export interface AlphaVantageOverview {
  Symbol?: string;
  AssetType?: string;
  Name?: string;
  Description?: string;
  Sector?: string;
  Industry?: string;
  MarketCapitalization?: string;
  EBITDA?: string;
  PERatio?: string;
  DividendYield?: string;
  EPS?: string;
  SharesOutstanding?: string;
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

// 24 hours cache TTL (same as finnhub profile2)
const OVERVIEW_TTL = 24 * 3600 * 1000;
const overviewCache = new Map<string, CacheEntry<AlphaVantageOverview | null>>();

export async function getAlphaVantageOverview(symbol: string): Promise<AlphaVantageOverview | null> {
  const cached = overviewCache.get(symbol);
  if (cached && Date.now() < cached.expiry) return cached.data;
  if (!ALPHA_VANTAGE_API_KEY) return cached?.data ?? null;

  try {
    const res = await axios.get(
      `https://www.alphavantage.co/query?function=COMPANY_OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_API_KEY}`,
      { timeout: 8000, validateStatus: () => true }
    );
    
    // Alpha Vantage might return { "Information": "Rate limit..." } if limit is hit
    if (res.data && res.data.Information && res.data.Information.includes('rate limit')) {
      // Don't cache rate limits permanently
      overviewCache.set(symbol, { data: null, expiry: Date.now() + 60000 });
      return null;
    }

    // If it doesn't have a Symbol, it's probably empty or invalid
    if (!res.data || !res.data.Symbol) {
      overviewCache.set(symbol, { data: null, expiry: Date.now() + OVERVIEW_TTL });
      return null;
    }

    const overview = res.data as AlphaVantageOverview;
    overviewCache.set(symbol, { data: overview, expiry: Date.now() + OVERVIEW_TTL });
    return overview;
  } catch {
    overviewCache.set(symbol, { data: null, expiry: Date.now() + 60000 });
    return null;
  }
}

/** Batch fetch profiles for many symbols, parallel but throttled */
export async function getAlphaVantageOverviews(symbols: string[]): Promise<Record<string, AlphaVantageOverview | null>> {
  const result: Record<string, AlphaVantageOverview | null> = {};
  const BATCH = 3;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(sym => getAlphaVantageOverview(sym).then(p => ({ sym, p }))));
    for (const { sym, p } of batchResults) result[sym] = p;
    // Brief pause between batches
    if (i + BATCH < symbols.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return result;
}
