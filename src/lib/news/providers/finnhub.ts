import axios from 'axios';
import { NewsItem, NewsProvider } from '../types';
import { generateNewsId, normalizeTimestamp, categorizeNews, getCategoryLabel, NEWS_PLACEHOLDER, cleanHeadline } from '../utils';

export class FinnhubProvider implements NewsProvider {
  name = 'Finnhub';
  priority = 90;

  async fetch(tickers?: string[]): Promise<NewsItem[]> {
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (!FINNHUB_API_KEY) return [];

    try {
      // Finnhub general news is often higher quality than per-ticker for a broad feed
      const url = `https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`;
      const res = await axios.get(url, { timeout: 8000 });
      
      const news = Array.isArray(res.data) ? res.data : [];
      return news.map((item: any) => {
        const headline = cleanHeadline(item.headline);
        const summary = cleanHeadline(item.summary || '');
        const catClass = categorizeNews(headline, summary);
        const { iso, unix } = normalizeTimestamp(item.datetime * 1000);

        return {
          id: generateNewsId(this.name, headline),
          headline,
          summary,
          url: item.url,
          source: item.source || this.name,
          createdAt: iso,
          _timestamp: unix,
          category: getCategoryLabel(catClass),
          categoryClass: catClass,
          symbols: item.related?.split(',') || [],
          imageUrl: item.image || NEWS_PLACEHOLDER
        };
      });
    } catch (error) {
      console.error('Finnhub fetch error:', (error as Error).message);
      return [];
    }
  }
}
