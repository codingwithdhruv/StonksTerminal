import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel } from '@/lib/news';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

interface SANewsItem {
  id: string;
  type?: string;
  attributes?: {
    title?: string;
    publishOn?: string;
    gettyImageUrl?: string;
  };
  links?: {
    self?: string;
    uriImage?: string;
  };
  relationships?: {
    primaryTickers?: {
      data?: Array<{ id: string; type: string }>;
    };
    secondaryTickers?: {
      data?: Array<{ id: string; type: string }>;
    };
  };
}

interface SAIncludedTicker {
  id: string;
  type: string;
  attributes?: {
    slug?: string;
    name?: string;
    company?: string;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || '40';

  if (!RAPIDAPI_KEY) {
    console.error('RAPIDAPI_KEY is not set');
    return NextResponse.json({ data: [] });
  }

  try {
    // Fetch trending news (up to 40 items)
    const trendingRes = await axios.get(
      `https://seeking-alpha.p.rapidapi.com/news/v2/list-trending?size=${size}`,
      {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
        },
        timeout: 10000,
      }
    );

    const articles: SANewsItem[] = trendingRes.data?.data || [];
    const included: SAIncludedTicker[] = trendingRes.data?.included || [];

    // Build a ticker ID -> symbol map from included data
    const tickerMap: Record<string, string> = {};
    for (const item of included) {
      if (item.type === 'ticker' && item.attributes?.slug) {
        tickerMap[item.id] = item.attributes.slug.toUpperCase();
      }
    }

    // Also fetch market-news::all for more coverage
    let moreArticles: SANewsItem[] = [];
    let moreIncluded: SAIncludedTicker[] = [];
    try {
      const allNewsRes = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/news/v2/list?category=market-news::all&size=${size}`,
        {
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
          },
          timeout: 10000,
        }
      );
      moreArticles = allNewsRes.data?.data || [];
      moreIncluded = allNewsRes.data?.included || [];
    } catch (e) {
      console.warn('SA market-news fetch failed, using trending only:', (e as Error).message);
    }

    // Merge ticker maps
    for (const item of moreIncluded) {
      if (item.type === 'ticker' && item.attributes?.slug) {
        tickerMap[item.id] = item.attributes.slug.toUpperCase();
      }
    }

    // Deduplicate articles by id
    const seenIds = new Set<string>();
    const allArticles: SANewsItem[] = [];
    for (const a of [...articles, ...moreArticles]) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id);
        allArticles.push(a);
      }
    }

    const categorizedNews = allArticles.map((article) => {
      const headline = article.attributes?.title || '';
      const publishOn = article.attributes?.publishOn || '';
      const categoryClass = categorizeNews(headline, '');

      // Extract ticker symbols from relationships
      const syms: string[] = [];
      const primaryTickers = article.relationships?.primaryTickers?.data || [];
      const secondaryTickers = article.relationships?.secondaryTickers?.data || [];
      for (const t of [...primaryTickers, ...secondaryTickers]) {
        const sym = tickerMap[t.id];
        if (sym && !syms.includes(sym)) syms.push(sym);
      }

      // Extract image: prefer gettyImageUrl, fallback to uriImage
      const imageUrl = article.attributes?.gettyImageUrl || article.links?.uriImage || undefined;

      return {
        id: `sa-${article.id}`,
        headline,
        summary: '', // SA trending/list doesn't include summary in basic response
        url: `https://seekingalpha.com${article.links?.self || ''}`,
        symbols: syms,
        createdAt: publishOn ? new Date(publishOn).toISOString() : new Date().toISOString(),
        category: getCategoryLabel(categoryClass),
        categoryClass,
        source: 'Seeking Alpha',
        imageUrl,
      };
    });

    return NextResponse.json({ data: categorizedNews }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error: unknown) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching Seeking Alpha news:', err.response?.status, err.response?.data || err.message);

    // Return empty instead of mock data — other sources will fill the feed
    return NextResponse.json({ data: [] });
  }
}
