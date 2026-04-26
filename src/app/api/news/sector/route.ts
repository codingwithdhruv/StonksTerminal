import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, NewsItem, NEWS_PLACEHOLDER } from '@/lib/news';

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};


// SA news categories per sector
const SA_NEWS_CATEGORIES: Record<string, string> = {
  technology: 'market-news::technology',
  healthcare: 'market-news::healthcare',
  macro: 'market-news::us-economy',
  financials: 'market-news::financials',
  communications: 'market-news::communication-services',
  energy: 'market-news::energy',
  utilities: 'market-news::technology', // Fallback
  realestate: 'market-news::reits',
  crypto: 'market-news::crypto',
  fda: 'market-news::healthcare',
  earnings: 'earnings::earnings-news',
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

  // 2. Fetch SA sector-specific news
  if (RAPIDAPI_KEY) {
    const saCategory = SA_NEWS_CATEGORIES[sector.toLowerCase()] || 'market-news::all';
    try {
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/news/v2/list?category=${saCategory}&size=30`,
        {
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
          },
          timeout: 10000,
        }
      );
      const articles = res.data?.data || [];
      const included = res.data?.included || [];

      const tickerMap: Record<string, string> = {};
      for (const inc of included) {
        if (inc.type === 'ticker' && inc.attributes?.slug) {
          tickerMap[inc.id] = inc.attributes.slug.toUpperCase();
        }
      }

      for (const article of articles) {
        const headline = article.attributes?.title || '';
        const publishOn = article.attributes?.publishOn || '';
        const cc = categorizeNews(headline, '');
        const imageUrl = article.attributes?.gettyImageUrl || article.links?.uriImage || undefined;

        const syms: string[] = [];
        for (const t of [...(article.relationships?.primaryTickers?.data || []), ...(article.relationships?.secondaryTickers?.data || [])]) {
          const sym = tickerMap[t.id];
          if (sym && !syms.includes(sym)) syms.push(sym);
        }

        const { iso, unix } = normalizeTimestamp(publishOn || Date.now());
        allNews.push({
          id: `sa-sector-${article.id}`,
          headline,
          summary: '',
          url: `https://seekingalpha.com${article.links?.self || ''}`,
          symbols: syms,
          createdAt: iso,
          _timestamp: unix,
          category: getCategoryLabel(cc),
          categoryClass: cc,
          source: 'Seeking Alpha',
          imageUrl: imageUrl || NEWS_PLACEHOLDER,
        });
      }
    } catch (e) {
      console.error('SA sector news error:', (e as Error).message);
    }
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
