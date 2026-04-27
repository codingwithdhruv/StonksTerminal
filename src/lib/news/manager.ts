import { NewsItem, NewsProvider } from './types';
import { AlpacaProvider } from './providers/alpaca';
import { FinnhubProvider } from './providers/finnhub';
import { CnbcProvider } from './providers/cnbc';
import { AlphaVantageProvider } from './providers/alphavantage';
import { YahooFinanceProvider } from './providers/yahoofinance';
import { TiingoProvider } from './providers/tiingo';

export class NewsManager {
  private providers: NewsProvider[] = [];

  constructor() {
    this.providers = [
      new AlpacaProvider(),
      new FinnhubProvider(),
      new CnbcProvider(),
      new AlphaVantageProvider(),
      new YahooFinanceProvider(),
      new TiingoProvider()
    ];
  }

  async fetchAll(tickers?: string[]): Promise<{ data: NewsItem[]; debug: any }> {
    const results = await Promise.allSettled(
      this.providers.map(p => p.fetch(tickers))
    );

    let allNews: NewsItem[] = [];
    const sourceCounts: Record<string, number> = {};

    results.forEach((res, idx) => {
      const providerName = this.providers[idx].name;
      if (res.status === 'fulfilled') {
        allNews = allNews.concat(res.value);
        sourceCounts[providerName] = res.value.length;
      } else {
        sourceCounts[providerName] = 0;
      }
    });

    const totalBeforeDedupe = allNews.length;

    // Deduplicate by headline (case-insensitive) and URL
    const seen = new Set<string>();
    allNews = allNews.filter(item => {
      const key = `${item.headline.toLowerCase().trim()}|${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by timestamp newest first
    allNews.sort((a, b) => b._timestamp - a._timestamp);

    return {
      data: allNews,
      debug: {
        totalBeforeDedupe,
        totalAfterDedupe: allNews.length,
        sourceCounts
      }
    };
  }
}

// Singleton instance
export const newsManager = new NewsManager();
