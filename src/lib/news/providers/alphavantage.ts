import axios from 'axios';
import { NewsItem, NewsProvider } from '../types';
import { generateNewsId, normalizeTimestamp, categorizeNews, getCategoryLabel, NEWS_PLACEHOLDER, cleanHeadline } from '../utils';

export class AlphaVantageProvider implements NewsProvider {
  name = 'Alpha Vantage';
  priority = 70;

  async fetch(tickers?: string[]): Promise<NewsItem[]> {
    const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
    if (!ALPHA_VANTAGE_API_KEY) return [];

    try {
      let url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&apikey=${ALPHA_VANTAGE_API_KEY}&limit=50&sort=LATEST`;
      if (tickers?.length) url += `&tickers=${tickers.join(',')}`;

      const res = await axios.get(url, { timeout: 10000 });
      if (res.data.Information && res.data.Information.includes('rate limit')) return [];

      const feed = res.data.feed || [];
      return feed.map((item: any) => {
        const headline = cleanHeadline(item.title);
        const summary = cleanHeadline(item.summary || '');
        const catClass = categorizeNews(headline, summary);
        const { iso, unix } = normalizeTimestamp(item.time_published);

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
          symbols: (item.ticker_sentiment || []).map((s: any) => s.ticker),
          imageUrl: item.banner_image || NEWS_PLACEHOLDER
        };
      });
    } catch (error) {
      console.error('Alpha Vantage fetch error:', (error as Error).message);
      return [];
    }
  }
}
