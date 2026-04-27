import axios from 'axios';
import { NewsItem, NewsProvider } from '../types';
import { generateNewsId, normalizeTimestamp, categorizeNews, getCategoryLabel, NEWS_PLACEHOLDER, cleanHeadline } from '../utils';

export class AlpacaProvider implements NewsProvider {
  name = 'Alpaca';
  priority = 100;

  async fetch(tickers?: string[]): Promise<NewsItem[]> {
    const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
    const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
    const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

    if (!ALPACA_API_KEY_ID || !ALPACA_API_SECRET_KEY) return [];

    try {
      let url = `${ALPACA_DATA_URL}/v1beta1/news?limit=50&sort=desc`;
      if (tickers?.length) url += `&symbols=${tickers.join(',')}`;

      const res = await axios.get(url, {
        headers: {
          'APCA-API-KEY-ID': ALPACA_API_KEY_ID,
          'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY,
        },
        timeout: 10000
      });

      const news = res.data.news || [];
      return news.map((item: any) => {
        const headline = cleanHeadline(item.headline);
        const summary = cleanHeadline(item.summary || '');
        const catClass = categorizeNews(headline, summary);
        const { iso, unix } = normalizeTimestamp(item.created_at);

        let imageUrl = NEWS_PLACEHOLDER;
        if (item.images?.length) {
          imageUrl = item.images.find((i: any) => i.size === 'large')?.url || item.images[0].url;
        }

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
          symbols: item.symbols || [],
          imageUrl
        };
      });
    } catch (error) {
      console.error('Alpaca fetch error:', (error as Error).message);
      return [];
    }
  }
}
