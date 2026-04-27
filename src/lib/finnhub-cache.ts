import axios from 'axios';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

export interface FinnhubProfile {
  ticker?: string;
  name?: string;
  logo?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
  finnhubIndustry?: string;
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

// Profile cache: 24 hours (mktCap, industry, logo don't change in a day)
const PROFILE_TTL = 24 * 3600 * 1000;
const profileCache = new Map<string, CacheEntry<FinnhubProfile | null>>();

// Catalyst (company-news) cache: 10 minutes
const CATALYST_TTL = 10 * 60 * 1000;
const catalystCache = new Map<string, CacheEntry<string>>();

// Track rate limit (Finnhub free: 60/min)
let rateLimitRemaining = 60;
let rateLimitReset = 0;

function updateRateLimit(headers: Record<string, string | undefined>) {
  const remaining = headers['x-ratelimit-remaining'];
  const reset = headers['x-ratelimit-reset'];
  if (remaining != null) rateLimitRemaining = parseInt(remaining, 10);
  if (reset != null) rateLimitReset = parseInt(reset, 10) * 1000;
}

function canCall(): boolean {
  if (rateLimitRemaining > 2) return true;
  if (Date.now() > rateLimitReset) {
    rateLimitRemaining = 60;
    return true;
  }
  return false;
}

/** Fetch Finnhub profile2 with 24h cache. Returns null on failure (rate limit, 404, etc.) */
export async function getProfile(symbol: string): Promise<FinnhubProfile | null> {
  const cached = profileCache.get(symbol);
  if (cached && Date.now() < cached.expiry) return cached.data;
  if (!FINNHUB_API_KEY || !canCall()) return cached?.data ?? null;

  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
      { timeout: 5000, validateStatus: () => true }
    );
    updateRateLimit(res.headers as Record<string, string>);
    const profile = res.data && res.data.ticker ? res.data as FinnhubProfile : null;
    profileCache.set(symbol, { data: profile, expiry: Date.now() + PROFILE_TTL });
    return profile;
  } catch {
    profileCache.set(symbol, { data: null, expiry: Date.now() + PROFILE_TTL / 4 });
    return null;
  }
}

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

/**
 * Fetch catalyst headlines using Alpaca's multi-symbol news endpoint.
 * ONE API call returns headlines for ALL symbols (vs 88 Finnhub calls).
 * This is the primary catalyst source — Finnhub company-news is no longer used per-symbol.
 */
export async function getCatalystsFromAlpaca(symbols: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (symbols.length === 0) return result;

  // Check cache first
  const uncached: string[] = [];
  for (const sym of symbols) {
    const cached = catalystCache.get(sym);
    if (cached && Date.now() < cached.expiry) {
      if (cached.data) result[sym] = cached.data;
    } else {
      uncached.push(sym);
    }
  }
  if (uncached.length === 0) return result;

  try {
    // Alpaca news supports up to ~50 symbols per request; chunk to avoid URL length issues
    const CHUNK = 40;
    for (let i = 0; i < uncached.length; i += CHUNK) {
      const batch = uncached.slice(i, i + CHUNK);
      const res = await axios.get(
        `${ALPACA_DATA_URL}/v1beta1/news?symbols=${batch.join(',')}&limit=50&sort=desc`,
        {
          headers: {
            'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
            'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
          },
          timeout: 10000,
        }
      );
      const news: Array<{ headline?: string; symbols?: string[] }> = res.data?.news || [];
      for (const article of news) {
        if (!article.headline || !article.symbols) continue;
        for (const sym of article.symbols) {
          if (batch.includes(sym) && !result[sym]) {
            result[sym] = article.headline;
          }
        }
      }
    }
    // Cache all (including misses as empty so we don't refetch immediately)
    for (const sym of uncached) {
      catalystCache.set(sym, { data: result[sym] || '', expiry: Date.now() + CATALYST_TTL });
    }
  } catch (e) {
    console.error('Alpaca news catalyst fetch error:', (e as Error).message);
  }
  return result;
}

/** Batch fetch profiles for many symbols, parallel-but-throttled */
export async function getProfiles(symbols: string[]): Promise<Record<string, FinnhubProfile | null>> {
  const result: Record<string, FinnhubProfile | null> = {};
  // Concurrency 5 to avoid bursting rate limit
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(sym => getProfile(sym).then(p => ({ sym, p }))));
    for (const { sym, p } of batchResults) result[sym] = p;
    // Brief pause between batches if many symbols
    if (i + BATCH < symbols.length && rateLimitRemaining < 30) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return result;
}

/** Backward-compat alias — now uses Alpaca news (1 call vs 88 Finnhub calls) */
export const getCatalysts = getCatalystsFromAlpaca;
