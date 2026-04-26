import { NextResponse } from 'next/server';
import axios from 'axios';

const ALPACA_API_KEY_ID = process.env.ALPACA_API_KEY_ID;
const ALPACA_API_SECRET_KEY = process.env.ALPACA_API_SECRET_KEY;
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

const headers = {
  'APCA-API-KEY-ID': ALPACA_API_KEY_ID,
  'APCA-API-SECRET-KEY': ALPACA_API_SECRET_KEY,
};

interface AlpacaNews {
  id: number;
  headline: string;
  summary: string;
  url: string;
  symbols: string[];
  created_at: string;
}

// GET handler
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = searchParams.get('symbols');

  try {
    let url = `${ALPACA_DATA_URL}/v1beta1/news?limit=50&sort=desc`;
    if (symbols) {
      url += `&symbols=${symbols}`;
    }

    const newsRes = await axios.get(url, { headers });
    const articles: AlpacaNews[] = newsRes.data.news || [];

    const categorizedNews = articles.map((article) => {
      return {
        id: article.id,
        headline: article.headline,
        summary: article.summary,
        url: article.url,
        symbols: article.symbols,
        createdAt: article.created_at,
        category: 'Pending AI',
        categoryClass: 'border-muted text-muted-foreground bg-muted/10'
      };
    });

    return NextResponse.json({ data: categorizedNews }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' // Cache news for 10 minutes
      }
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error fetching news:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
