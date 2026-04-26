import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Mapping of internal sector slugs to Seeking Alpha screener IDs
export const SECTOR_SCREENER_MAP: Record<string, string> = {
  technology: '9679329f', // Top Technology Stocks
  healthcare: '96793114', // Top Healthcare Stocks
  macro: '96793115',      // Top Financial Stocks
  financials: '96793115', // Top Financial Stocks
  communications: '96793116', // Top Communication Stocks
  energy: '96793110',     // Top Energy Stocks
  utilities: '96793117',  // Top Utility Stocks
  realestate: '9409a325', // Top Real Estate Stocks
  crypto: '95b99d35dc24', // Top Cryptocurrency Stocks
  fda: '96793114',        // Fallback to Healthcare
  earnings: '9679348d',   // Top Growth Stocks
};

/** Fetch tickers dynamically from Seeking Alpha screeners */
export async function fetchSectorTickers(sector: string): Promise<string[]> {
  const screenerId = SECTOR_SCREENER_MAP[sector.toLowerCase()];
  if (!screenerId || !RAPIDAPI_KEY) return [];

  try {
    const res = await axios.post(
      `https://seeking-alpha.p.rapidapi.com/screeners/get-results`,
      { id: screenerId, per_page: 30 },
      {
        headers: { 
          'x-rapidapi-key': RAPIDAPI_KEY, 
          'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const tickers = (res.data?.data || []).map((item: any) => {
      const tickerId = item.relationships?.ticker?.data?.id;
      const ticker = res.data.included?.find((inc: any) => inc.id === tickerId && inc.type === 'ticker');
      return ticker?.attributes?.name?.toUpperCase();
    }).filter(Boolean);

    return tickers;
  } catch (e) {
    console.error(`Error fetching tickers for sector ${sector}:`, (e as Error).message);
    return [];
  }
}

/** Fetch dynamic list of ETFs from SA categories */
export async function fetchDynamicEtfs(): Promise<string[]> {
  if (!RAPIDAPI_KEY) return [];
  const categories = ['us-equity-markets', 'us-equity-factors', 'global-equity'];
  const symbols = new Set<string>();

  try {
    for (const cat of categories) {
      const res = await axios.get(
        `https://seeking-alpha.p.rapidapi.com/market/get-equity?filterCategory=${cat}`,
        { headers: { 'x-rapidapi-key': RAPIDAPI_KEY, 'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com' }, timeout: 8000 }
      );
      (res.data?.data || []).forEach((item: any) => {
        if (item.attributes?.slug) symbols.add(item.attributes.slug.toUpperCase());
      });
    }
    return Array.from(symbols);
  } catch (e) {
    console.error('Error fetching dynamic ETFs:', (e as Error).message);
    return [];
  }
}

/** Classifies a stock into a theme based on industry and name */
export function classifyTheme(industry: string, name: string): string {
  const text = `${industry} ${name}`.toLowerCase();
  if (text.match(/semiconductor|chip|silicon|wafer/)) return 'Semiconductors';
  if (text.match(/software|cloud|saas|platform/)) return 'Software';
  if (text.match(/biotech|pharma|drug|therapeut|oncol/)) return 'Biotechnology';
  if (text.match(/bank|financ|capital|asset management/)) return 'Financials';
  if (text.match(/energy|oil|gas|solar|wind|renew/)) return 'Energy';
  if (text.match(/crypto|bitcoin|blockchain|defi/)) return 'Crypto';
  if (text.match(/health|medical|hospital|diagnostic/)) return 'Healthcare';
  if (text.match(/retail|consumer|e-commerce|shop/)) return 'Consumer';
  if (text.match(/telecom|communic|media|stream/)) return 'Communications';
  if (text.match(/industrial|manufact|aerospace|defense/)) return 'Industrials';
  if (text.match(/real estate|reit|property/)) return 'Real Estate';
  if (text.match(/food|beverage|restaurant|grocer/)) return 'Food & Bev';
  if (text.match(/auto|vehicle|ev |electric vehicle|motor/)) return 'Automotive';
  if (text.match(/electric|power|utility/)) return 'Utilities';
  return industry || 'General';
}

/** Formats growth values for display */
export function formatGrowth(val: number | undefined | null): string {
  if (val == null) return '--';
  return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
}
