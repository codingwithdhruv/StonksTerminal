import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { GET as getAlpaca } from '@/app/api/news/route';
import { GET as getFinnhub } from '@/app/api/finnhub/route';
import { GET as getYahooFinance } from '@/app/api/yahoo-finance/route';
import { GET as getCnbc } from '@/app/api/news/cnbc/route';
import { GET as getSeekingAlpha } from '@/app/api/news/seeking-alpha/route';
import { getTiingoNews } from '@/lib/tiingo';
import { getAlphaVantageNews } from '@/lib/alphavantage-news';
import { categorizeNews, getCategoryLabel, NewsItem, NEWS_PLACEHOLDER } from '@/lib/news';

export async function GET(request: Request) {
  try {
    const [alpacaRes, finnhubRes, yfRes, cnbcRes, tiingoNews, avNews, saRes] = await Promise.allSettled([
      getAlpaca(request),
      getFinnhub(),
      getYahooFinance(),
      getCnbc(),
      getTiingoNews(),
      getAlphaVantageNews(),
      getSeekingAlpha()
    ]);

    let allNews: NewsItem[] = [];
    const counts: Record<string, number> = {
      Alpaca: 0,
      Finnhub: 0,
      'Yahoo Finance': 0,
      CNBC: 0,
      Tiingo: 0,
      'Alpha Vantage': 0,
      'Seeking Alpha': 0
    };

    if (alpacaRes.status === 'fulfilled') {
      const data = await alpacaRes.value.json();
      if (data.data) {
        const items = data.data.map((item: NewsItem) => ({ ...item, source: item.source || 'Alpaca' }));
        allNews = allNews.concat(items);
        counts.Alpaca = items.length;
      }
    }
    
    if (finnhubRes.status === 'fulfilled') {
      const data = await finnhubRes.value.json();
      if (data.data) {
        const items = (data.data as NewsItem[]).map(item => ({ ...item, source: item.source || 'Finnhub' }));
        allNews = allNews.concat(items);
        counts.Finnhub = items.length;
      }
    }

    if (yfRes.status === 'fulfilled') {
      const data = await yfRes.value.json();
      if (data.data) {
        const items = (data.data as NewsItem[]).map(item => ({ ...item, source: item.source || 'Yahoo Finance' }));
        allNews = allNews.concat(items);
        counts['Yahoo Finance'] = items.length;
      }
    }

    if (cnbcRes.status === 'fulfilled') {
      const data = await cnbcRes.value.json();
      if (data.data) {
        const items = (data.data as NewsItem[]).map(item => ({ ...item, source: item.source || 'CNBC' }));
        allNews = allNews.concat(items);
        counts.CNBC = items.length;
      }
    }

    if (tiingoNews.status === 'fulfilled' && tiingoNews.value.length > 0) {
      allNews = allNews.concat(tiingoNews.value);
      counts.Tiingo = tiingoNews.value.length;
    }

    if (avNews.status === 'fulfilled' && avNews.value.length > 0) {
      allNews = allNews.concat(avNews.value);
      counts['Alpha Vantage'] = avNews.value.length;
    }

    if (saRes.status === 'fulfilled') {
      const data = await saRes.value.json();
      if (data.data) {
        const items = (data.data as NewsItem[]).map(item => ({ ...item, source: item.source || 'Seeking Alpha' }));
        allNews = allNews.concat(items);
        counts['Seeking Alpha'] = items.length;
      }
    }

    // Normalize: ensure every item has required fields for frontend rendering
    allNews = allNews.map(item => {
      const categoryClass = item.categoryClass || categorizeNews(item.headline || '', item.summary || '');
      return {
        ...item,
        headline: item.headline || '',
        summary: item.summary || '',
        category: item.category || getCategoryLabel(categoryClass),
        categoryClass,
        symbols: item.symbols || [],
        url: item.url || '',
        source: item.source || 'Unknown',
        imageUrl: item.imageUrl || NEWS_PLACEHOLDER,
        _timestamp: item._timestamp || (item.createdAt ? new Date(item.createdAt).getTime() : Date.now()),
        createdAt: item.createdAt || new Date().toISOString(),
      };
    });

    // Deduplicate by URL and headline
    const seenUrls = new Set<string>();
    const seenHeadlines = new Set<string>();
    
    const processedNews = allNews.filter(item => {
      if (!item.url && !item.headline) return false;
      const urlKey = item.url ? item.url.split('?')[0] : '';
      const headlineKey = item.headline ? item.headline.toLowerCase().trim() : '';
      if ((urlKey && seenUrls.has(urlKey)) || (headlineKey && seenHeadlines.has(headlineKey))) return false;
      if (urlKey) seenUrls.add(urlKey);
      if (headlineKey) seenHeadlines.add(headlineKey);
      return true;
    });

    // Sort by timestamp (newest first)
    processedNews.sort((a, b) => b._timestamp - a._timestamp);

    return NextResponse.json({ 
      data: processedNews,
      debug: {
        totalBeforeDedupe: allNews.length,
        totalAfterDedupe: processedNews.length,
        sourceCounts: counts
      }
    });
  } catch (error) {
    console.error('Failed to fetch unified news:', error);
    return NextResponse.json({ error: 'Failed to fetch unified news' }, { status: 500 });
  }
}
