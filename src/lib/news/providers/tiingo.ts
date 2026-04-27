import axios from 'axios';
import { NewsItem, NewsProvider } from '../types';
import { generateNewsId, normalizeTimestamp, categorizeNews, getCategoryLabel, NEWS_PLACEHOLDER, cleanHeadline } from '../utils';

export class TiingoProvider implements NewsProvider {
  name = 'Tiingo';
  priority = 50;

  async fetch(tickers?: string[]): Promise<NewsItem[]> {
    const TIINGO_API_TOKEN = process.env.TIINGO_API_TOKEN;
    if (!TIINGO_API_TOKEN) return [];

    try {
      let url = `https://api.tiingo.com/tiingo/news?token=${TIINGO_API_TOKEN}&limit=30`;
      if (tickers?.length) url += `&tickers=${tickers.join(',')}`;

      const res = await axios.get(url, { timeout: 8000 });
      const news = Array.isArray(res.data) ? res.data : [];

      return news.map((item: any) => {
        const headline = cleanHeadline(item.title);
        const summary = cleanHeadline(item.description || '');
        const catClass = categorizeNews(headline, summary);
        const { iso, unix } = normalizeTimestamp(item.publishedDate);

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
          symbols: (item.tickers || []).map((t: string) => t.toUpperCase()),
          imageUrl: NEWS_PLACEHOLDER // Tiingo often lacks quality images
        };
      });
    } catch (error) {
      // Often permission denied on basic plan, fail silently
      return [];
    }
  }
}
