import axios from 'axios';
import * as cheerio from 'cheerio';
import { NewsItem, NewsProvider } from '../types';
import { generateNewsId, normalizeTimestamp, categorizeNews, getCategoryLabel, NEWS_PLACEHOLDER, cleanHeadline } from '../utils';

export class CnbcProvider implements NewsProvider {
  name = 'CNBC';
  priority = 80;

  async fetch(): Promise<NewsItem[]> {
    try {
      const [trendingRes, latestRes] = await Promise.allSettled([
        axios.get('https://www.cnbc.com/', { 
          timeout: 10000, 
          headers: { 'User-Agent': 'Mozilla/5.0' } 
        }),
        axios.get('https://www.cnbc.com/latest-news/', { 
          timeout: 10000, 
          headers: { 'User-Agent': 'Mozilla/5.0' } 
        })
      ]);

      const seen = new Set<string>();
      const mapped: NewsItem[] = [];
      const now = Date.now();

      if (trendingRes.status === 'fulfilled') {
        const $ = cheerio.load(trendingRes.value.data);
        $('li[class*="TrendingNowItem"], a[class*="TrendingNowItem"]').each((idx, el) => {
          const headline = cleanHeadline($(el).text());
          let url = $(el).attr('href') || '';
          if (!headline || !url) return;
          if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
          
          if (!seen.has(headline.toLowerCase())) {
            seen.add(headline.toLowerCase());
            const catClass = categorizeNews(headline, '');
            mapped.push({
              id: generateNewsId(this.name, headline),
              headline,
              summary: '',
              url,
              source: this.name,
              createdAt: new Date(now - idx * 60000).toISOString(),
              _timestamp: now - idx * 60000,
              category: getCategoryLabel(catClass),
              categoryClass: catClass,
              symbols: [],
              imageUrl: NEWS_PLACEHOLDER
            });
          }
        });
      }

      if (latestRes.status === 'fulfilled') {
        const $ = cheerio.load(latestRes.value.data);
        $('.LatestNews-item').each((idx, el) => {
          const headline = cleanHeadline($(el).find('.LatestNews-headline').text());
          let url = $(el).find('a').attr('href') || '';
          if (!headline || !url) return;
          if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
          const timeText = $(el).find('.LatestNews-timestamp').text();

          if (!seen.has(headline.toLowerCase())) {
            seen.add(headline.toLowerCase());
            const catClass = categorizeNews(headline, '');
            const { iso, unix } = normalizeTimestamp(timeText || now);
            mapped.push({
              id: generateNewsId(this.name, headline),
              headline,
              summary: '',
              url,
              source: this.name,
              createdAt: iso,
              _timestamp: unix,
              category: getCategoryLabel(catClass),
              categoryClass: catClass,
              symbols: [],
              imageUrl: NEWS_PLACEHOLDER
            });
          }
        });
      }

      return mapped;
    } catch (error) {
      console.error('CNBC scrape error:', (error as Error).message);
      return [];
    }
  }
}
