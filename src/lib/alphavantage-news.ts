import axios from 'axios';
import { NewsItem, categorizeNews, getCategoryLabel, normalizeTimestamp, generateNewsId, NEWS_PLACEHOLDER } from './news';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

export async function getAlphaVantageNews(tickers?: string): Promise<NewsItem[]> {
  if (!ALPHA_VANTAGE_API_KEY) return [];

  try {
    let url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&apikey=${ALPHA_VANTAGE_API_KEY}&limit=50&sort=LATEST`;
    if (tickers) url += `&tickers=${tickers}`;

    const res = await axios.get(url, { timeout: 10000 });
    
    if (res.data.Information && res.data.Information.includes('rate limit')) {
      return [];
    }

    const feed = res.data.feed || [];
    return feed.map((item: any) => {
      const headline = item.title || '';
      const summary = item.summary || '';
      const categoryClass = categorizeNews(headline, summary);
      const { iso, unix } = normalizeTimestamp(item.time_published);

      return {
        id: generateNewsId('Alpha Vantage', headline),
        headline,
        summary,
        url: item.url,
        symbols: (item.ticker_sentiment || []).map((s: any) => s.ticker),
        createdAt: iso,
        _timestamp: unix,
        category: getCategoryLabel(categoryClass),
        categoryClass,
        source: 'Alpha Vantage',
        imageUrl: item.banner_image || NEWS_PLACEHOLDER
      };
    });
  } catch (error) {
    console.error('Alpha Vantage News error:', error);
    return [];
  }
}
