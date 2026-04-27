import axios from 'axios';
import { NewsItem } from '@/lib/news';

const TIINGO_API_KEY = process.env.TIINGO_API_KEY;

export interface TiingoFundamentals {
  marketCap?: number;
  enterpriseVal?: number;
  peRatio?: number;
  pbRatio?: number;
  trailingPEG1Y?: number;
}

// 24-hour cache for Tiingo fundamentals (free tier: 50 req/hour)
const fundamentalsCache = new Map<string, { data: TiingoFundamentals | null; ts: number }>();
const CACHE_TTL = 24 * 3600 * 1000;

export async function getTiingoFundamentals(symbol: string): Promise<TiingoFundamentals | null> {
  if (!TIINGO_API_KEY) return null;

  const cached = fundamentalsCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const res = await axios.get(
      `https://api.tiingo.com/tiingo/fundamentals/${symbol}/daily?token=${TIINGO_API_KEY}`,
      { timeout: 8000 }
    );
    const data = res.data;
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      const result: TiingoFundamentals = {
        marketCap: latest.marketCap,
        enterpriseVal: latest.enterpriseVal,
        peRatio: latest.peRatio,
        pbRatio: latest.pbRatio,
        trailingPEG1Y: latest.trailingPEG1Y,
      };
      fundamentalsCache.set(symbol, { data: result, ts: Date.now() });
      return result;
    }
  } catch {
    // Silently ignore 404s / unsupported symbols
  }
  fundamentalsCache.set(symbol, { data: null, ts: Date.now() });
  return null;
}

/**
 * Fetch Tiingo news. Returns [] silently if the API key lacks news access
 * (free tier does not include News API — requires Power/Business plan).
 */
export async function getTiingoNews(symbols: string[] = []): Promise<NewsItem[]> {
  if (!TIINGO_API_KEY) return [];
  try {
    const symParam = symbols.length > 0 ? `&tickers=${symbols.join(',')}` : '';
    const res = await axios.get(
      `https://api.tiingo.com/tiingo/news?token=${TIINGO_API_KEY}${symParam}&limit=30`,
      { timeout: 8000 }
    );
    const data = res.data;

    if (Array.isArray(data)) {
      return data.map((item, idx) => ({
        id: item.id || `tiingo-${Date.now()}-${idx}`,
        headline: item.title,
        summary: item.description || '',
        category: '',
        categoryClass: 'cat-others' as const,
        createdAt: item.publishedDate,
        symbols: item.tickers || [],
        url: item.url,
        source: item.source || 'Tiingo',
        _timestamp: new Date(item.publishedDate).getTime(),
      }));
    }
  } catch {
    // Free-tier keys lack News API access — silently return empty
  }
  return [];
}
