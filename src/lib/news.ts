/**
 * Shared utility for news categorization logic.
 * Enhanced to map news to both specific event types AND sector/theme categories
 * so category pages can filter effectively.
 */
export const NEWS_PLACEHOLDER = '/images/news-placeholder.png';

export type CategoryClass =
  | 'cat-earnings'
  | 'cat-fda'
  | 'cat-partnerships'
  | 'cat-offerings'
  | 'cat-orders'
  | 'cat-themes'
  | 'cat-technology'
  | 'cat-healthcare'
  | 'cat-crypto'
  | 'cat-macro'
  | 'cat-energy'
  | 'cat-others';

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  category: string;
  categoryClass: CategoryClass;
  createdAt: string;
  symbols: string[];
  url: string;
  source: string;
  imageUrl?: string;
  _timestamp: number;
}

/** Generate a stable ID based on source and headline to prevent duplicates across refreshes */
export function generateNewsId(source: string, headline: string): string {
  const hash = headline.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0);
  return `${source.toLowerCase().replace(/\s+/g, '-')}-${Math.abs(hash).toString(36)}`;
}


export function categorizeNews(headline: string, summary: string): CategoryClass {
  const text = `${headline} ${summary}`.toLowerCase();

  // Event-type categories (highest priority)
  if (text.match(/earnings|q[1-4]\s|revenue\s|eps\s|guidance|forecast|quarterly results|beat est|miss est|profit|loss per share/)) return 'cat-earnings';
  if (text.match(/fda|clinical|trial|phase\s|approval|drug|biotech|pharma|oncol|therapeut|biologic/)) return 'cat-fda';
  if (text.match(/partner|merger|acquisition|buyout|deal|takeover|acquir/)) return 'cat-partnerships';
  if (text.match(/offering|dilution|shares|raise|ipo|secondary|shelf registration|public offering/)) return 'cat-offerings';
  if (text.match(/order|contract|award|won|backlog|government contract/)) return 'cat-orders';

  // Sector/Theme categories
  if (text.match(/crypto|bitcoin|blockchain|defi|ethereum|solana|web3|token|mining.*crypto/)) return 'cat-crypto';
  if (text.match(/semiconductor|chip|nvidia|amd|intel|tsmc|ai\s|artificial intelligence|machine learning|software|cloud|saas|tech|apple|google|microsoft|meta\s|amazon/)) return 'cat-technology';
  if (text.match(/health|medical|hospital|diagnostic|patient|medicare|medicaid|insur.*health/)) return 'cat-healthcare';
  if (text.match(/fed\s|fomc|inflation|rate\s.*cut|rate\s.*hike|gdp|unemployment|treasury|bond|yield|recession|economic|macro|tariff|trade war|geopolit|central bank/)) return 'cat-macro';
  if (text.match(/oil|gas|solar|wind|renew|energy|opec|crude|natural gas|nuclear/)) return 'cat-energy';

  return 'cat-others';
}

export function getCategoryLabel(className: CategoryClass): string {
  switch (className) {
    case 'cat-earnings': return 'Earnings';
    case 'cat-fda': return 'FDA/Biotech';
    case 'cat-partnerships': return 'M&A';
    case 'cat-offerings': return 'Offerings';
    case 'cat-orders': return 'Contracts';
    case 'cat-themes': return 'Themes';
    case 'cat-technology': return 'Technology';
    case 'cat-healthcare': return 'Healthcare';
    case 'cat-crypto': return 'Crypto';
    case 'cat-macro': return 'Macro';
    case 'cat-energy': return 'Energy';
    default: return 'General';
  }
}

/**
 * Maps a sidebar category slug to the category labels/classes it should match against.
 */
export function getCategoryMatchTerms(slug: string): string[] {
  switch (slug.toLowerCase()) {
    case 'technology':
      return ['technology', 'semiconductor', 'software', 'ai', 'chip', 'tech', 'themes'];
    case 'healthcare':
      return ['healthcare', 'fda', 'biotech', 'pharma', 'medical', 'health'];
    case 'crypto':
      return ['crypto', 'bitcoin', 'blockchain', 'defi', 'ethereum'];
    case 'macro':
      return ['macro', 'economy', 'fed', 'inflation', 'treasury', 'gdp', 'tariff'];
    case 'earnings':
      return ['earnings', 'revenue', 'eps', 'quarterly', 'guidance', 'profit'];
    case 'fda':
      return ['fda', 'clinical', 'trial', 'drug', 'approval', 'biotech', 'pharma'];
    case 'energy':
      return ['energy', 'oil', 'gas', 'solar', 'renewable', 'opec'];
    default:
      return [slug];
  }
}

/**
 * Normalizes a date string or unix-ms number to an ISO string.
 * All sources (Alpaca, Finnhub, SA, Yahoo Finance) return proper UTC or
 * timezone-aware timestamps — no manual IST offset correction is applied.
 */
export function normalizeTimestamp(input: string | number): { iso: string; unix: number } {
  const timestamp = typeof input === 'number' ? input : new Date(input).getTime();
  const safe = isNaN(timestamp) || timestamp <= 0 ? Date.now() : timestamp;
  return {
    iso: new Date(safe).toISOString(),
    unix: safe,
  };
}

/**
 * Format a news timestamp in IST. Shows time only if today, otherwise
 * shows "Jan 15 09:30 AM" so older articles are clearly dated.
 */
export function formatNewsTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const ist = { timeZone: 'Asia/Kolkata' } as const;

  // Get today's date in IST
  const nowIST = new Intl.DateTimeFormat('en-IN', { ...ist, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const articleIST = new Intl.DateTimeFormat('en-IN', { ...ist, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

  const time = date.toLocaleTimeString('en-IN', { ...ist, hour: '2-digit', minute: '2-digit', hour12: true });

  if (nowIST === articleIST) return time;

  const dayMonth = date.toLocaleDateString('en-IN', { ...ist, month: 'short', day: 'numeric' });
  return `${dayMonth} ${time}`;
}

/** Keyword-based sentiment analysis for news headlines. */
export function getSentiment(headline: string, summary = ''): 'bullish' | 'bearish' | 'neutral' {
  const text = `${headline} ${summary}`.toLowerCase();
  const bullish = (text.match(/surges?|soars?|jumps?|rallies|rally|rises?|gains?|beats?|exceeds?|record high|upgrade|outperform|bullish|positive|strong|growth|profit|breakthrough|boost|momentum|win|awarded|launch/g) || []).length;
  const bearish = (text.match(/drops?|falls?|plunges?|crashes?|declines?|misses?|shortfall|downgrade|underperform|bearish|negative|weak|loss|warning|concern|risk|fear|pressure|cut|suspend|halt|recall|lawsuit|fine|penalty/g) || []).length;
  if (bullish > bearish) return 'bullish';
  if (bearish > bullish) return 'bearish';
  return 'neutral';
}
