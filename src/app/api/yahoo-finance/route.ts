import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, NewsItem, generateNewsId, NEWS_PLACEHOLDER } from '@/lib/news';

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
    return NextResponse.json({ data: [] });
  }

  try {
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

    let mapped: NewsItem[] = [];

    const stream = newsRes.data?.data?.main?.stream as YFStreamItem[] | undefined;
    if (Array.isArray(stream) && stream.length > 0) {
      mapped = stream
        .filter((item) => item.content?.title)
        .map((item) => {
          const c = item.content!;
          const headline = c.title || '';
          const summary = c.summary || '';
          const categoryClass = categorizeNews(headline, summary);
          const { iso, unix } = normalizeTimestamp(c.pubDate || Date.now());
          const resolutions = c.thumbnail?.resolutions || [];
          const bestThumb = resolutions.length > 0 ? resolutions[resolutions.length - 1] : undefined;

          return {
            id: generateNewsId('Yahoo Finance', headline),
            headline,
            summary,
            url: c.clickThroughUrl?.url || '',
            symbols: (c.finance?.stockTickers || []).map((t) => t.symbol || '').filter(Boolean),
            createdAt: iso,
            _timestamp: unix,
            category: getCategoryLabel(categoryClass),
            categoryClass,
            source: c.provider?.displayName || 'Yahoo Finance',
            imageUrl: bestThumb?.url || NEWS_PLACEHOLDER,
          };
        });
    } else {
      const articles: YFArticleLegacy[] =
        Array.isArray(newsRes.data?.items) ? newsRes.data.items :
        Array.isArray(newsRes.data?.data) ? newsRes.data.data :
        Array.isArray(newsRes.data) ? newsRes.data : [];

      mapped = articles.slice(0, 30).map((article) => {
        const headline = article.title || '';
        const summary = article.summary || '';
        const categoryClass = categorizeNews(headline, summary);
        const { iso, unix } = normalizeTimestamp(article.providerPublishTime ? article.providerPublishTime * 1000 : Date.now());
        const resolutions = article.thumbnail?.resolutions || [];
        const bestThumb = resolutions.length > 0 ? resolutions[resolutions.length - 1] : undefined;

        return {
          id: generateNewsId('Yahoo Finance', headline),
          headline,
          summary,
          url: article.link || '',
          symbols: article.relatedTickers || [],
          createdAt: iso,
          _timestamp: unix,
          category: getCategoryLabel(categoryClass),
          categoryClass,
          source: article.publisher || 'Yahoo Finance',
          imageUrl: bestThumb?.url || NEWS_PLACEHOLDER,
        };
      });
    }

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error('Error fetching Yahoo Finance news:', error);
    return NextResponse.json({ data: [] });
  }
}
