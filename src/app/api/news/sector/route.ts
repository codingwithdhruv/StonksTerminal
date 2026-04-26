import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel } from '@/lib/news';

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};

// Key tickers per sector for news lookup
const SECTOR_NEWS_TICKERS: Record<string, string[]> = {
  technology: ['AAPL', 'MSFT', 'NVDA', 'AMD', 'INTC', 'GOOGL', 'META', 'AMZN', 'AVGO', 'CRM'],
  healthcare: ['UNH', 'JNJ', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO', 'AMGN', 'GILD', 'MRNA'],
  crypto: ['COIN', 'MARA', 'RIOT', 'MSTR', 'CLSK', 'HUT', 'BITF', 'HOOD'],
  energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'ENPH', 'FSLR', 'NEE', 'PLUG'],
  macro: ['SPY', 'QQQ', 'TLT', 'GLD', 'JPM', 'BAC', 'GS', 'V', 'MA'],
  fda: ['MRNA', 'PFE', 'REGN', 'VRTX', 'CRSP', 'NTLA', 'BEAM', 'EDIT', 'ALNY', 'IONS'],
  earnings: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'JPM', 'BAC'],
};

// SA news categories per sector
const SA_NEWS_CATEGORIES: Record<string, string> = {
  technology: 'market-news::technology',
  healthcare: 'market-news::healthcare',
  crypto: 'market-news::crypto',
  energy: 'market-news::energy',
  macro: 'market-news::us-economy',
  fda: 'market-news::healthcare',
  earnings: 'earnings::earnings-news',
};

interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  url: string;
  symbols: string[];
  createdAt: string;
  category: string;
  categoryClass: string;
  source: string;
  imageUrl?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  const tickers = SECTOR_NEWS_TICKERS[sector.toLowerCase()];
  if (!tickers) {
    return NextResponse.json({ error: `Unknown sector: ${sector}` }, { status: 400 });
  }

  const allNews: NewsItem[] = [];

  // 1. Fetch Alpaca news for sector tickers
  try {
    const symbolsStr = tickers.join(',');
    const res = await axios.get(
      `${ALPACA_DATA_URL}/v1beta1/news?symbols=${symbolsStr}&limit=50&sort=desc`,
      { headers: alpacaHeaders, timeout: 10000 }
    );
    for (const article of (res.data.news || [])) {
      const cc = categorizeNews(article.headline, article.summary);
      // Extract best image from Alpaca images array
      let imageUrl: string | undefined;
      if (article.images && article.images.length > 0) {
        const large = article.images.find((i: { size: string; url: string }) => i.size === 'large');
        const small = article.images.find((i: { size: string; url: string }) => i.size === 'small');
        const thumb = article.images.find((i: { size: string; url: string }) => i.size === 'thumb');
        imageUrl = large?.url || small?.url || thumb?.url;
      }
      allNews.push({
        id: `alpaca-${article.id}`,
        headline: article.headline,
        summary: article.summary || '',
        url: article.url,
        symbols: article.symbols || [],
        createdAt: article.created_at,
        category: getCategoryLabel(cc),
        categoryClass: cc,
        source: article.source || 'Alpaca',
        imageUrl,
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

      // Build ticker map
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

        allNews.push({
          id: `sa-sector-${article.id}`,
          headline,
          summary: '',
          url: `https://seekingalpha.com${article.links?.self || ''}`,
          symbols: syms,
          createdAt: publishOn ? new Date(publishOn).toISOString() : new Date().toISOString(),
          category: getCategoryLabel(cc),
          categoryClass: cc,
          source: 'Seeking Alpha',
          imageUrl,
        });
      }
    } catch (e) {
      console.error('SA sector news error:', (e as Error).message);
    }

    // 3. Also fetch SA news by individual key symbols for more coverage
    try {
      const topTickers = tickers.slice(0, 3); // Top 3 sector tickers
      for (const ticker of topTickers) {
        const res = await axios.get(
          `https://seeking-alpha.p.rapidapi.com/news/v2/list-by-symbol?id=${ticker.toLowerCase()}&size=10`,
          {
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
            },
            timeout: 8000,
          }
        );
        for (const article of (res.data?.data || [])) {
          const headline = article.attributes?.title || '';
          const publishOn = article.attributes?.publishOn || '';
          const cc = categorizeNews(headline, '');
          const imageUrl = article.attributes?.gettyImageUrl || undefined;
          allNews.push({
            id: `sa-sym-${article.id}`,
            headline,
            summary: '',
            url: `https://seekingalpha.com${article.links?.self || ''}`,
            symbols: [ticker],
            createdAt: publishOn ? new Date(publishOn).toISOString() : new Date().toISOString(),
            category: getCategoryLabel(cc),
            categoryClass: cc,
            source: 'Seeking Alpha',
            imageUrl,
          });
        }
      }
    } catch (e) {
      console.error('SA symbol news error:', (e as Error).message);
    }
  }

  // Deduplicate by headline
  const seenHeadlines = new Set<string>();
  const uniqueNews = allNews.filter(item => {
    const key = item.headline.toLowerCase().trim();
    if (seenHeadlines.has(key)) return false;
    seenHeadlines.add(key);
    return true;
  });

  // Sort newest first
  uniqueNews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ data: uniqueNews }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
