import axios from 'axios';

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_TRADING_URL = 'https://paper-api.alpaca.markets';

const headers = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID || '',
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY || '',
};

export interface AlpacaAsset {
  symbol: string;
  name: string;
  exchange: string;
  class: string;
  category: 'Stock' | 'Warrant' | 'Right' | 'Unit' | 'Preferred' | 'Note' | 'ETF' | 'ADR';
  industryGuess: string;
  themeGuess: string;
}

/** Detect security type from Alpaca asset name */
function classifyByName(name: string): AlpacaAsset['category'] {
  const n = name.toLowerCase();
  if (n.includes('warrant')) return 'Warrant';
  if (n.includes('right')) return 'Right';
  if (n.includes('unit')) return 'Unit';
  if (n.includes('preferred')) return 'Preferred';
  if (n.includes('note')) return 'Note';
  if (n.includes('depositary') || n.includes('adr')) return 'ADR';
  return 'Stock';
}

/** Guess industry/theme from name keywords (used when Finnhub fails) */
function guessIndustry(name: string): { industry: string; theme: string } {
  const n = name.toLowerCase();
  if (n.match(/acquisition corp|spac|capital corp/)) return { industry: 'SPAC / Acquisition', theme: 'SPAC' };
  if (n.match(/gold|silver|mining|metal|copper/)) return { industry: 'Mining', theme: 'Mining' };
  if (n.match(/oil|gas|petroleum|energy/)) return { industry: 'Oil & Gas', theme: 'Energy' };
  if (n.match(/biotech|biopharm|therapeut|oncolog|pharma/)) return { industry: 'Biotechnology', theme: 'Biotechnology' };
  if (n.match(/medical|health|hospital|clinical/)) return { industry: 'Health Care', theme: 'Healthcare' };
  if (n.match(/bank|financ|capital|holdings|asset management/)) return { industry: 'Financials', theme: 'Financials' };
  if (n.match(/tech|software|systems|digital|cyber|ai |artificial/)) return { industry: 'Technology', theme: 'Technology' };
  if (n.match(/semiconductor|silicon|chip/)) return { industry: 'Semiconductors', theme: 'Semiconductors' };
  if (n.match(/crypto|bitcoin|blockchain/)) return { industry: 'Cryptocurrency', theme: 'Crypto' };
  if (n.match(/real estate|reit|property/)) return { industry: 'Real Estate', theme: 'Real Estate' };
  if (n.match(/auto|vehicle|motor|electric vehicle/)) return { industry: 'Automotive', theme: 'Automotive' };
  if (n.match(/retail|consumer|brand|apparel/)) return { industry: 'Retail', theme: 'Consumer' };
  if (n.match(/food|beverage|restaurant/)) return { industry: 'Food & Beverages', theme: 'Food & Bev' };
  if (n.match(/communic|media|telecom/)) return { industry: 'Communications', theme: 'Communications' };
  if (n.match(/etf|fund|trust|index/)) return { industry: 'ETF', theme: 'ETF' };
  return { industry: '--', theme: '--' };
}

let cachedAssets: Map<string, AlpacaAsset> | null = null;
let lastCacheTime = 0;
const CACHE_DURATION = 24 * 3600 * 1000; // 24 hours

/** Fetch and cache the full Alpaca asset master list. ~5500 NASDAQ + ~3000 NYSE entries. */
async function loadAssetCache(): Promise<Map<string, AlpacaAsset>> {
  if (cachedAssets && Date.now() - lastCacheTime < CACHE_DURATION) return cachedAssets;
  const map = new Map<string, AlpacaAsset>();
  try {
    const res = await axios.get(`${ALPACA_TRADING_URL}/v2/assets?status=active`, {
      headers,
      timeout: 30000,
    });
    const assets: Array<{ symbol: string; name: string; exchange: string; class: string }> = res.data || [];
    for (const a of assets) {
      const category = classifyByName(a.name || '');
      const guess = guessIndustry(a.name || '');
      map.set(a.symbol, {
        symbol: a.symbol,
        name: a.name || a.symbol,
        exchange: a.exchange || '',
        class: a.class || '',
        category,
        industryGuess: guess.industry,
        themeGuess: guess.theme,
      });
    }
    cachedAssets = map;
    lastCacheTime = Date.now();
  } catch (e) {
    console.error('Alpaca assets fetch error:', (e as Error).message);
  }
  return map;
}

/** Get Alpaca asset info for a list of symbols (uses cached master list) */
export async function fetchAlpacaAssets(symbols: string[]): Promise<Record<string, AlpacaAsset>> {
  const cache = await loadAssetCache();
  const result: Record<string, AlpacaAsset> = {};
  for (const sym of symbols) {
    const asset = cache.get(sym);
    if (asset) result[sym] = asset;
  }
  return result;
}
