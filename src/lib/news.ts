/**
 * Shared utility for news categorization logic.
 */

export type CategoryClass = 'cat-earnings' | 'cat-fda' | 'cat-partnerships' | 'cat-offerings' | 'cat-orders' | 'cat-themes' | 'cat-others';

export function categorizeNews(headline: string, summary: string): CategoryClass {
  const text = `${headline} ${summary}`.toLowerCase();
  
  if (text.match(/earnings|q[1-4]|revenue|eps|guidance|forecast/)) return 'cat-earnings';
  if (text.match(/fda|clinical|trial|phase|approval/)) return 'cat-fda';
  if (text.match(/partner|merger|acquisition|buyout|deal/)) return 'cat-partnerships';
  if (text.match(/offering|dilution|shares|raise/)) return 'cat-offerings';
  if (text.match(/order|contract|award|won/)) return 'cat-orders';
  if (text.match(/ai|crypto|ev|renewable|energy/)) return 'cat-themes';
  
  return 'cat-others';
}

export function getCategoryLabel(className: string): string {
  switch (className) {
    case 'cat-earnings': return 'Earnings';
    case 'cat-fda': return 'FDA';
    case 'cat-partnerships': return 'Partnerships';
    case 'cat-offerings': return 'Offerings';
    case 'cat-orders': return 'Orders';
    case 'cat-themes': return 'Themes';
    default: return 'General';
  }
}
