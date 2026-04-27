import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, NewsItem, generateNewsId, NEWS_PLACEHOLDER } from '@/lib/news';

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const headers = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID,
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY,
};

interface AlpacaNewsImage {
  size: string;
  url: string;
}

interface AlpacaNews {
  id: number;
  headline: string;
  summary: string;
  url: string;
  source: string;
  symbols: string[];
  created_at: string;
  images?: AlpacaNewsImage[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');

  try {
    let url = `${ALPACA_DATA_URL}/v1beta1/news?limit=50&sort=desc`;
    if (symbols) url += `&symbols=${symbols}`;

    const newsRes = await axios.get(url, { headers, timeout: 10000 });
    const articles: AlpacaNews[] = newsRes.data.news || [];
    
    // Fetch one more page to get 100 articles
    let moreArticles: AlpacaNews[] = [];
    const nextToken = newsRes.data.next_page_token;
    if (nextToken) {
      try {
        const moreRes = await axios.get(`${url}&page_token=${nextToken}`, { headers, timeout: 10000 });
        moreArticles = moreRes.data.news || [];
      } catch { /* ignore */ }
    }

    const allArticles = [...articles, ...moreArticles];

    const mapped: NewsItem[] = allArticles.map((article) => {
      const categoryClass = categorizeNews(article.headline, article.summary);
      let imageUrl: string | undefined;
      if (article.images && article.images.length > 0) {
        imageUrl = article.images.find(i => i.size === 'large')?.url || 
                   article.images.find(i => i.size === 'small')?.url;
      }

      const { iso, unix } = normalizeTimestamp(article.created_at);

      return {
        id: generateNewsId(article.source || 'Alpaca', article.headline),
        headline: article.headline,
        summary: article.summary,
        url: article.url,
        symbols: article.symbols || [],
        createdAt: iso,
        _timestamp: unix,
        category: getCategoryLabel(categoryClass),
        categoryClass,
        source: article.source || 'Alpaca',
        imageUrl: imageUrl || NEWS_PLACEHOLDER,
      };
    });

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error('Alpaca news error:', error);
    return NextResponse.json({ data: [] });
  }
}
