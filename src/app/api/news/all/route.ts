import { NextResponse } from 'next/server';
import { GET as getAlpaca } from '@/app/api/news/route';
import { GET as getFinnhub } from '@/app/api/finnhub/route';
import { GET as getSeekingAlpha } from '@/app/api/seeking-alpha/route';
import { GET as getYahooFinance } from '@/app/api/yahoo-finance/route';

export async function GET(request: Request) {
  try {
    // We create mock requests if needed, but the original request can be passed along.
    // However, Finnhub and YahooFinance GET don't take a request param in their current implementation.
    const [alpacaRes, finnhubRes, saRes, yfRes] = await Promise.allSettled([
      getAlpaca(request),
      getFinnhub(),
      getSeekingAlpha(request),
      getYahooFinance()
    ]);

    interface LocalNewsItem {
      id: string | number;
      url?: string;
      headline?: string;
      source?: string;
      createdAt: string;
      [key: string]: unknown;
    }

    let allNews: LocalNewsItem[] = [];

    if (alpacaRes.status === 'fulfilled') {
      const data = await alpacaRes.value.json();
      if (data.data) {
        allNews = allNews.concat(data.data.map((item: LocalNewsItem) => ({ ...item, source: item.source || 'Alpaca' })));
      }
    }
    
    if (finnhubRes.status === 'fulfilled') {
      const data = await finnhubRes.value.json();
      if (data.data) {
        allNews = allNews.concat(data.data);
      }
    }

    if (saRes.status === 'fulfilled') {
      const data = await saRes.value.json();
      if (data.data) {
        allNews = allNews.concat(data.data);
      }
    }

    if (yfRes.status === 'fulfilled') {
      const data = await yfRes.value.json();
      if (data.data) {
        allNews = allNews.concat(data.data);
      }
    }

    // Deduplicate by URL or headline
    const seenUrls = new Set();
    const seenHeadlines = new Set();
    
    const uniqueNews = allNews.filter(item => {
      if (!item.url && !item.headline) return false;
      
      const urlKey = item.url ? item.url.split('?')[0] : '';
      const headlineKey = item.headline ? item.headline.toLowerCase().trim() : '';

      if ((urlKey && seenUrls.has(urlKey)) || (headlineKey && seenHeadlines.has(headlineKey))) {
        return false;
      }

      if (urlKey) seenUrls.add(urlKey);
      if (headlineKey) seenHeadlines.add(headlineKey);
      return true;
    });

    // Sort by Date (newest first)
    uniqueNews.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ data: uniqueNews });
  } catch (error) {
    console.error('Failed to fetch unified news:', error);
    return NextResponse.json({ error: 'Failed to fetch unified news' }, { status: 500 });
  }
}
