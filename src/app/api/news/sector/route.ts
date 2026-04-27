import { NextResponse } from 'next/server';
import { GET as getUnifiedNews } from '@/app/api/news/all/route';
import { NewsItem } from '@/lib/news';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Map sector slug to news search keywords for filtering */
const SECTOR_KEYWORDS: Record<string, string[]> = {
  technology: ['nvidia', 'amd', 'apple', 'microsoft', 'google', 'meta', 'tech', 'semiconductor', 'software', 'ai ', 'artificial intelligence'],
  healthcare: ['fda', 'biotech', 'pharma', 'drug', 'clinical', 'health', 'medical', 'hospital', 'biology'],
  macro: ['fed ', 'inflation', 'gdp', 'rate', 'treasury', 'powell', 'fomc', 'recession', 'economy', 'economic'],
  financials: ['bank', 'jpmorgan', 'goldman', 'wells fargo', 'citigroup', 'financial', 'insurance', 'wealth'],
  communications: ['comcast', 'disney', 'netflix', 'verizon', 'at&t', 'media', 'telecom', 'internet'],
  energy: ['oil', 'gas', 'opec', 'crude', 'energy', 'renewable', 'solar', 'wind', 'petroleum'],
  utilities: ['utility', 'electric', 'power', 'water', 'grid'],
  realestate: ['real estate', 'reit', 'housing', 'property', 'mortgage'],
  crypto: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'coinbase', 'mara', 'solana', 'doge'],
  fda: ['fda', 'clinical', 'trial', 'approval', 'drug', 'treatment'],
  earnings: ['earnings', 'revenue', 'guidance', 'beat', 'miss', 'quarterly', 'eps'],
};

function matchesNewsKeywords(item: NewsItem, sector: string): boolean {
  const kws = SECTOR_KEYWORDS[sector.toLowerCase()] || [];
  if (kws.length === 0) return true;
  
  const text = `${item.headline} ${item.summary || ''}`.toLowerCase();
  
  // Also check symbols
  const syms = (item.symbols || []).map(s => s.toLowerCase());
  
  return kws.some(kw => text.includes(kw.toLowerCase())) || 
         syms.some(s => kws.includes(s));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sector = searchParams.get('sector') || 'technology';

  try {
    // 1. Fetch the unified news feed
    const response = await getUnifiedNews(request);
    const data = await response.json();
    const allNews: NewsItem[] = data.data || [];

    // 2. Filter by sector keywords
    const filteredNews = allNews.filter(item => matchesNewsKeywords(item, sector));

    return NextResponse.json({ data: filteredNews }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (e) {
    console.error('Sector news aggregation error:', (e as Error).message);
    return NextResponse.json({ data: [] });
  }
}
