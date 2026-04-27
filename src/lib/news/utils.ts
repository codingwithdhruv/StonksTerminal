import { CategoryClass, NewsItem } from './types';

export const NEWS_PLACEHOLDER = '/images/news-placeholder.png';

export function generateNewsId(source: string, headline: string): string {
  const hash = headline.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
  return `${source.toLowerCase().replace(/\s+/g, '-')}-${Math.abs(hash).toString(36)}`;
}

export function normalizeTimestamp(input: string | number | Date): { iso: string; unix: number } {
  const date = new Date(input);
  const unix = isNaN(date.getTime()) ? Date.now() : date.getTime();
  return {
    iso: new Date(unix).toISOString(),
    unix
  };
}

export function categorizeNews(headline: string, summary: string): CategoryClass {
  const text = `${headline} ${summary}`.toLowerCase();

  if (text.match(/earnings|revenue|eps|quarterly|fiscal|profit|beat|miss/)) return 'cat-earnings';
  if (text.match(/fda|clinical trial|phase 1|phase 2|phase 3|approval|drug|biotech/)) return 'cat-fda';
  if (text.match(/partner|joint venture|collaborat|agreement|alliance/)) return 'cat-partnerships';
  if (text.match(/offering|ipo|direct listing|shares|warrant|convertible/)) return 'cat-offerings';
  if (text.match(/order|contract|award|deal|customer/)) return 'cat-orders';
  if (text.match(/bitcoin|ethereum|crypto|blockchain|nft|defi/)) return 'cat-crypto';
  if (text.match(/ai |artificial intelligence|software|cloud|semiconductor|chip/)) return 'cat-technology';
  if (text.match(/health|medical|hospital|therapy/)) return 'cat-healthcare';
  if (text.match(/fed |inflation|gdp|interest rate|macro|economy/)) return 'cat-macro';
  if (text.match(/oil|gas|energy|solar|wind|renewable/)) return 'cat-energy';
  if (text.match(/theme|sector|industry|trend/)) return 'cat-themes';
  
  return 'cat-others';
}

export function getCategoryLabel(cat: CategoryClass): string {
  const labels: Record<CategoryClass, string> = {
    'cat-earnings': 'Earnings',
    'cat-partnerships': 'Partnership',
    'cat-themes': 'Thematic',
    'cat-orders': 'Orders',
    'cat-fda': 'FDA/Clinical',
    'cat-offerings': 'Offering',
    'cat-technology': 'Technology',
    'cat-healthcare': 'Healthcare',
    'cat-crypto': 'Crypto',
    'cat-macro': 'Macro',
    'cat-energy': 'Energy',
    'cat-others': 'Intel'
  };
  return labels[cat];
}

export function cleanHeadline(headline: string): string {
  return headline
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
