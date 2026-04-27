import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, generateNewsId, NEWS_PLACEHOLDER } from '@/lib/news';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
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

    if (trendingRes.status === 'fulfilled') {
      const $ = cheerio.load(trendingRes.value.data);
      $('li[class*="TrendingNowItem"], a[class*="TrendingNowItem"]').each((idx, el) => {
        const headline = $(el).text().trim();
        let url = $(el).attr('href') || '';
        if (!url || !headline) return;
        if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
        const key = headline.toLowerCase();

        if (!seenHeadlines.has(key)) {
          seenHeadlines.add(key);
          const categoryClass = categorizeNews(headline, '');
          mapped.push({
            id: generateNewsId('CNBC', headline),
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

    if (latestRes.status === 'fulfilled') {
      const $ = cheerio.load(latestRes.value.data);
      $('.LatestNews-item').each((idx, el) => {
        const headline = $(el).find('.LatestNews-headline').text().trim();
        let url = $(el).find('a').attr('href') || '';
        if (!headline || !url) return;
        if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
        const timeText = $(el).find('.LatestNews-timestamp').text().trim();
        const key = headline.toLowerCase();

        if (!seenHeadlines.has(key)) {
          seenHeadlines.add(key);
          const categoryClass = categorizeNews(headline, '');
          const { iso, unix } = normalizeTimestamp(timeText || new Date().toISOString());

          mapped.push({
            id: generateNewsId('CNBC', headline),
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
    console.error('CNBC fetch error:', error);
    return NextResponse.json({ data: [] });
  }
}
