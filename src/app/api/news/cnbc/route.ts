import { NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const res = await axios.get('https://www.cnbc.com/', { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });
    
    const $ = cheerio.load(res.data);
    const mapped: any[] = [];
    
    $('.TrendingNowItem-title').each((idx, el) => {
      const a = $(el).closest('a');
      const headline = $(el).text().trim();
      let url = a.attr('href') || '';
      if (url.startsWith('/')) url = 'https://www.cnbc.com' + url;
      
      if (headline && url) {
        mapped.push({
          id: `cnbc-${Date.now()}-${idx}`,
          headline,
          summary: '',
          url,
          createdAt: new Date().toISOString(),
          source: 'CNBC',
          _timestamp: Date.now() - idx * 1000
        });
      }
    });

    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error('cnbc cheerio fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch CNBC news via cheerio' }, { status: 500 });
  }
}
