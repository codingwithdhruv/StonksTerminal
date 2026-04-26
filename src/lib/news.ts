/**
 * Shared utility for news categorization logic.
 * Enhanced to map news to both specific event types AND sector/theme categories
 * so category pages can filter effectively.
 */

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
