import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, NEWS_PLACEHOLDER } from '@/lib/news';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    // Fetch both trending and latest pages concurrently
    const [trendingRes, latestRes] = await Promise.allSettled([
      axios.get('https://www.cnbc.com/', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      }),
      axios.get('https://www.cnbc.com/latest-news/', {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      }),
    ]);

    const seenHeadlines = new Set<string>();
    const mapped: any[] = [];
    const now = Date.now();

    // 1. Parse trending items from homepage
    if (trendingRes.status === 'fulfilled') {
      const $ = cheerio.load(trendingRes.value.data);
      $('li[class*="TrendingNowItem"]').each((idx, el) => {
        const headline = $(el).find('a').text().trim();
        let url = $(el).find('a').attr('href') || '';
        if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
        const key = headline.toLowerCase();

        if (headline && url && !seenHeadlines.has(key)) {
          seenHeadlines.add(key);
          const categoryClass = categorizeNews(headline, '');
          mapped.push({
            id: `cnbc-trending-${now}-${idx}`,
            headline,
            summary: '',
            category: getCategoryLabel(categoryClass),
            categoryClass,
            url,
            symbols: [],
            createdAt: new Date().toISOString(),
            source: 'CNBC',
            imageUrl: NEWS_PLACEHOLDER,
            _timestamp: now - idx * 1000,
          });
        }
      });
    }

    // 2. Parse latest news cards
    if (latestRes.status === 'fulfilled') {
      const $ = cheerio.load(latestRes.value.data);
      $('div[class*="Card-card"], div[class*="LatestNews-headline"]').each((idx, el) => {
        const titleEl = $(el).find('a[class*="Card-title"], a[class*="LatestNews-headlineWrapper"]').first();
        const headline = titleEl.text().trim();
        let url = titleEl.attr('href') || '';
        if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
        const timeText = $(el).find('span[class*="Card-time"], time').first().text().trim();
        const key = headline.toLowerCase();

        if (headline && url && !seenHeadlines.has(key)) {
          seenHeadlines.add(key);
          const categoryClass = categorizeNews(headline, '');
          // Try to parse relative time from CNBC (e.g., "2 hours ago")
          const { iso, unix } = normalizeTimestamp(timeText || new Date().toISOString());

          mapped.push({
            id: `cnbc-latest-${now}-${idx}`,
            headline,
            summary: '',
            category: getCategoryLabel(categoryClass),
            categoryClass,
            url,
            symbols: [],
            createdAt: iso,
            source: 'CNBC',
            imageUrl: NEWS_PLACEHOLDER,
            _timestamp: unix,
          });
        }
      });
    }

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error('cnbc cheerio fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch CNBC news' }, { status: 500 });
  }
}
