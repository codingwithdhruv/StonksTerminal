import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import axios from 'axios';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, NewsItem, NEWS_PLACEHOLDER } from '@/lib/news';

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};

/** Map sector slug to Alpaca news search keywords */
const SECTOR_KEYWORDS: Record<string, string[]> = {
  technology: ['nvidia', 'amd', 'apple', 'microsoft', 'google', 'meta', 'tech', 'semiconductor', 'software'],
  healthcare: ['fda', 'biotech', 'pharma', 'drug', 'clinical', 'health', 'medical'],
  macro: ['fed', 'inflation', 'gdp', 'rate', 'treasury', 'powell', 'fomc', 'recession'],
  financials: ['bank', 'jpmorgan', 'goldman', 'wells fargo', 'citigroup', 'financial'],
  communications: ['comcast', 'disney', 'netflix', 'verizon', 'at&t', 'media'],
  energy: ['oil', 'gas', 'opec', 'crude', 'energy', 'renewable', 'solar'],
  utilities: ['utility', 'electric', 'power'],
  realestate: ['real estate', 'reit', 'housing'],
  crypto: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'coinbase', 'mara'],
  fda: ['fda', 'clinical', 'trial', 'approval', 'drug'],
  earnings: ['earnings', 'revenue', 'guidance', 'beat', 'miss'],
};

function matchesNewsKeywords(text: string, sector: string): boolean {
  const kws = SECTOR_KEYWORDS[sector.toLowerCase()] || [];
  if (kws.length === 0) return true;
  const lower = text.toLowerCase();
  return kws.some(kw => lower.includes(kw));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  const allNews: NewsItem[] = [];

  // 1. Fetch general Alpaca news (top 50 latest), filter by keywords matching sector
  try {
    const res = await axios.get(
      `${ALPACA_DATA_URL}/v1beta1/news?limit=50&sort=desc`,
      { headers: alpacaHeaders, timeout: 10000 }
    );
    for (const article of (res.data.news || [])) {
      const text = `${article.headline} ${article.summary || ''}`;
      if (!matchesNewsKeywords(text, sector)) continue;

      const cc = categorizeNews(article.headline, article.summary);
      let imageUrl: string | undefined;
      if (article.images && article.images.length > 0) {
        imageUrl = article.images.find((i: { size: string; url: string }) => i.size === 'large')?.url ||
                   article.images.find((i: { size: string; url: string }) => i.size === 'small')?.url;
      }
      const { iso, unix } = normalizeTimestamp(article.created_at);
      allNews.push({
        id: `alpaca-${article.id}`,
        headline: article.headline,
        summary: article.summary || '',
        url: article.url,
        symbols: article.symbols || [],
        createdAt: iso,
        _timestamp: unix,
        category: getCategoryLabel(cc),
        categoryClass: cc,
        source: article.source || 'Alpaca',
        imageUrl: imageUrl || NEWS_PLACEHOLDER,
      });
    }
  } catch (e) {
    console.error('Alpaca sector news error:', (e as Error).message);
  }



  // Deduplicate and Normalize Timings (IST handling)
  const seenUrls = new Set();
  const seenHeadlines = new Set();
  const now = Date.now();
  
  const processedNews = allNews
    .filter(item => {
      const urlKey = item.url ? item.url.split('?')[0] : '';
      const headlineKey = item.headline ? item.headline.toLowerCase().trim() : '';
      if ((urlKey && seenUrls.has(urlKey)) || (headlineKey && seenHeadlines.has(headlineKey))) return false;
      if (urlKey) seenUrls.add(urlKey);
      if (headlineKey) seenHeadlines.add(headlineKey);
      return true;
    })
    .map(item => {
      const { iso, unix } = normalizeTimestamp(item.createdAt);
      
      return {
        ...item,
        createdAt: iso,
        _timestamp: unix
      };
    });

  processedNews.sort((a, b) => b._timestamp - a._timestamp);

  return NextResponse.json({ data: processedNews }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
