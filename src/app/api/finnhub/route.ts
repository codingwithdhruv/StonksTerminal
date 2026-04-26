import { NextResponse } from 'next/server';
import { categorizeNews, getCategoryLabel, normalizeTimestamp } from '@/lib/news';

export const revalidate = 60; // Cache for 60 seconds

interface FinnhubNews {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  related?: string;
  image?: string;
}

export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Finnhub API key not configured' },
      { status: 500 }
    );
  }

  try {
    // Fetch a large number of general news items from Finnhub
    const response = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`,
      { 
        next: { revalidate: 60 } // Revalidate every 60 seconds
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Finnhub API Error: ${response.status} - ${errorText}`);
      throw new Error(`Finnhub API responded with status: ${response.status}`);
    }

    const data: FinnhubNews[] = await response.json();

    // Map Finnhub response to our common NewsItem interface
    // Finnhub response shape: 
    // { category, datetime (seconds), headline, id, image, related (comma-separated), source, summary, url }
    const formattedNews = data.slice(0, 100).map((item) => {
      const categoryClass = categorizeNews(item.headline, item.summary);
      return {
        id: `finnhub-${item.id}`,
        headline: item.headline,
        summary: item.summary,
        source: item.source || 'Finnhub',
        url: item.url,
        // Convert UNIX timestamp in seconds to ISO string
        createdAt: normalizeTimestamp(item.datetime * 1000).iso,
        _timestamp: normalizeTimestamp(item.datetime * 1000).unix,
        category: getCategoryLabel(categoryClass),
        categoryClass: categoryClass,
        symbols: item.related ? item.related.split(',') : [],
        // Pass through Finnhub's image URL
        imageUrl: item.image || '/images/news-placeholder.png',
      };
    });

    return NextResponse.json({ data: formattedNews });
  } catch (error: unknown) {
    console.error('Error fetching Finnhub news:', error);
    
    // In case of error, return a fallback or empty array to avoid breaking UI
    return NextResponse.json({ data: [] }, { status: 500 });
  }
}
