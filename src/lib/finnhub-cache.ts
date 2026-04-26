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

/** Fetch Finnhub company-news headline (catalyst) with 10min cache */
export async function getCatalyst(symbol: string): Promise<string> {
  const cached = catalystCache.get(symbol);
  if (cached && Date.now() < cached.expiry) return cached.data;
  if (!FINNHUB_API_KEY || !canCall()) return cached?.data ?? '';

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  try {
    const res = await axios.get(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${weekAgo}&to=${today}&token=${FINNHUB_API_KEY}`,
      { timeout: 5000, validateStatus: () => true }
    );
    updateRateLimit(res.headers as Record<string, string>);
    const news = res.data;
    const headline = (Array.isArray(news) && news.length > 0) ? (news[0].headline || '') : '';
    catalystCache.set(symbol, { data: headline, expiry: Date.now() + CATALYST_TTL });
    return headline;
  } catch {
    return cached?.data ?? '';
  }
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

/** Batch fetch catalysts for many symbols */
export async function getCatalysts(symbols: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const BATCH = 5;
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(sym => getCatalyst(sym).then(c => ({ sym, c }))));
    for (const { sym, c } of batchResults) {
      if (c) result[sym] = c;
    }
    if (i + BATCH < symbols.length && rateLimitRemaining < 30) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return result;
}
