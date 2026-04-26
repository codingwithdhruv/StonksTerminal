import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel } from '@/lib/news';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

interface YFStreamItem {
  content?: {
    id?: string;
    title?: string;
    summary?: string;
    pubDate?: string;
    provider?: { displayName?: string };
    clickThroughUrl?: { url?: string };
    finance?: { stockTickers?: Array<{ symbol?: string }> };
    thumbnail?: { resolutions?: Array<{ url?: string; width?: number; height?: number }> };
  };
}

interface YFArticleLegacy {
  title?: string;
  summary?: string;
  providerPublishTime?: number;
  uuid?: string;
  link?: string;
  relatedTickers?: string[];
  publisher?: string;
  thumbnail?: { resolutions?: Array<{ url?: string }> };
}

export async function GET() {
  if (!RAPIDAPI_KEY) {
    console.error('RAPIDAPI_KEY is not set');
    return NextResponse.json({ data: [] });
  }

  try {
    // Try the v2/list endpoint with POST
    const url = `https://apidojo-yahoo-finance-v1.p.rapidapi.com/news/v2/list`;

    const newsRes = await axios.post(url, {
      region: 'US',
      snippetCount: 30,
    }, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    // Parse response — APIDojo has multiple response shapes across versions
    let parsedNews: Array<{
      id: string;
      headline: string;
      summary: string;
      url: string;
      symbols: string[];
      createdAt: string;
      source: string;
    }> = [];

    // Try the newer stream format first
    const stream = newsRes.data?.data?.main?.stream as YFStreamItem[] | undefined;
    if (Array.isArray(stream) && stream.length > 0) {
      parsedNews = stream
        .filter((item) => item.content?.title)
        .map((item) => {
          const c = item.content!;
          const symbols = (c.finance?.stockTickers || [])
            .map((t) => t.symbol || '')
            .filter(Boolean);
          // Pick the largest resolution thumbnail
          const resolutions = c.thumbnail?.resolutions || [];
          const bestThumb = resolutions.length > 0 ? resolutions[resolutions.length - 1] : undefined;
          return {
            id: c.id || Math.random().toString(36),
            headline: c.title || '',
            summary: c.summary || '',
            url: c.clickThroughUrl?.url || '',
            symbols,
            createdAt: c.pubDate ? new Date(c.pubDate).toISOString() : new Date().toISOString(),
            source: c.provider?.displayName || 'Yahoo Finance',
            imageUrl: bestThumb?.url || undefined,
          };
        });
    } else {
      // Fallback to legacy format
      const articles: YFArticleLegacy[] =
        Array.isArray(newsRes.data?.items) ? newsRes.data.items :
        Array.isArray(newsRes.data?.data) ? newsRes.data.data :
        Array.isArray(newsRes.data) ? newsRes.data : [];

      parsedNews = articles.slice(0, 30).map((article) => {
        const resolutions = article.thumbnail?.resolutions || [];
        const bestThumb = resolutions.length > 0 ? resolutions[resolutions.length - 1] : undefined;
        return {
          id: article.uuid || Math.random().toString(36),
          headline: article.title || '',
          summary: article.summary || '',
          url: article.link || '',
          symbols: article.relatedTickers || [],
          createdAt: article.providerPublishTime
            ? new Date(article.providerPublishTime * 1000).toISOString()
            : new Date().toISOString(),
          source: article.publisher || 'Yahoo Finance',
          imageUrl: bestThumb?.url || undefined,
        };
      });
    }

    // Apply categorization
    const categorizedNews = parsedNews.map((item) => {
      const categoryClass = categorizeNews(item.headline, item.summary);
      return {
        ...item,
        id: `yf-${item.id}`,
        category: getCategoryLabel(categoryClass),
        categoryClass,
      };
    });

    return NextResponse.json({ data: categorizedNews }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: unknown) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching Yahoo Finance news:', err.response?.status, err.response?.data || err.message);

    // Return empty instead of mock — other sources cover the feed
    return NextResponse.json({ data: [] });
  }
}
