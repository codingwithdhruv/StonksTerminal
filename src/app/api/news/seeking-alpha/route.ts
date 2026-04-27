import { NextResponse } from 'next/server';
import axios from 'axios';
import { categorizeNews, getCategoryLabel, normalizeTimestamp, NewsItem, NEWS_PLACEHOLDER } from '@/lib/news';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

export async function GET() {
  if (!RAPIDAPI_KEY) return NextResponse.json({ data: [] });

  try {
    const res = await axios.get('https://seeking-alpha.p.rapidapi.com/news/v2/list', {
      params: { category: 'market-news', size: '20' },
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'seeking-alpha.p.rapidapi.com'
      },
      timeout: 10000
    });

    const items = res.data?.data || [];
    const mapped: NewsItem[] = items.map((item: any) => {
      const attrs = item.attributes;
      const headline = attrs?.title || '';
      const summary = attrs?.content || '';
      const categoryClass = categorizeNews(headline, summary);
      const { iso, unix } = normalizeTimestamp(attrs?.publishOn || Date.now());

      return {
        id: `sa-${item.id}`,
        headline,
        summary,
        url: `https://seekingalpha.com${attrs?.getLink || ''}`,
        symbols: [], // Seeking Alpha API returns symbols in a nested structure, keeping it simple for now
        createdAt: iso,
        _timestamp: unix,
        category: getCategoryLabel(categoryClass),
        categoryClass,
        source: 'Seeking Alpha',
        imageUrl: NEWS_PLACEHOLDER
      };
    });

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error('Seeking Alpha News error:', error);
    return NextResponse.json({ data: [] });
  }
}
