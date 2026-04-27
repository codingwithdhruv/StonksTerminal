import axios from 'axios';
import { NewsItem, NewsProvider } from '../types';
import { generateNewsId, normalizeTimestamp, categorizeNews, getCategoryLabel, NEWS_PLACEHOLDER, cleanHeadline } from '../utils';

export class YahooFinanceProvider implements NewsProvider {
  name = 'Yahoo Finance';
  priority = 60;

  async fetch(): Promise<NewsItem[]> {
    const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
    if (!RAPIDAPI_KEY) return [];

    try {
      const url = `https://apidojo-yahoo-finance-v1.p.rapidapi.com/news/v2/list`;
      const res = await axios.post(url, { region: 'US', snippetCount: 30 }, {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const items: any[] = res.data?.data?.main?.stream || res.data?.items || res.data?.data || [];
      return items.filter(i => (i.content?.title || i.title)).map((item: any) => {
        const c = item.content || item;
        const headline = cleanHeadline(c.title);
        const summary = cleanHeadline(c.summary || '');
        const catClass = categorizeNews(headline, summary);
        const { iso, unix } = normalizeTimestamp(c.pubDate || c.providerPublishTime * 1000 || Date.now());

        const resolutions = c.thumbnail?.resolutions || [];
        const imageUrl = resolutions.length ? resolutions[resolutions.length - 1].url : NEWS_PLACEHOLDER;

        return {
          id: generateNewsId(this.name, headline),
          headline,
          summary,
          url: c.clickThroughUrl?.url || c.link || '',
          source: c.provider?.displayName || c.publisher || this.name,
          createdAt: iso,
          _timestamp: unix,
          category: getCategoryLabel(catClass),
          categoryClass: catClass,
          symbols: (c.finance?.stockTickers || []).map((t: any) => t.symbol) || c.relatedTickers || [],
          imageUrl
        };
      });
    } catch (error) {
      console.error('Yahoo Finance fetch error:', (error as Error).message);
      return [];
    }
  }
}
