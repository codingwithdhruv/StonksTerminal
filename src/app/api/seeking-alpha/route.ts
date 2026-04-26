import { NextResponse } from 'next/server';
import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

import { categorizeNews, getCategoryLabel } from '@/lib/news';

interface SAArticle {
  id: string;
  attributes?: {
    title: string;
  };
  links?: {
    self: string;
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const size = searchParams.get('size') || '10';

  try {
    const url = `https://seeking-alpha.p.rapidapi.com/news/v2/list-trending?size=${size}`;
    
    const newsRes = await axios.get(url, { 
      headers: {
        'x-api-key': RAPIDAPI_KEY,
        'x-api-host': 'seeking-alpha.p.rapidapi.com'
      }
    });

    const articles: SAArticle[] = newsRes.data.data || [];

    const categorizedNews = articles.map((article) => {
      const headline = article.attributes?.title || '';
      const summary = ''; // Seeking Alpha trending endpoint doesn't usually provide a summary in the list view
      const categoryClass = categorizeNews(headline, summary);
      
      // Try to extract a symbol if present (often requires another endpoint, but we leave it empty for now)
      return {
        id: article.id,
        headline: headline,
        summary: summary,
        url: `https://seekingalpha.com${article.links?.self || ''}`,
        symbols: [],
        createdAt: new Date().toISOString(), // The trending endpoint doesn't include exact publish time in the basic attributes, using now or we can parse it if available
        category: getCategoryLabel(categoryClass),
        categoryClass,
        source: 'Seeking Alpha'
      };
    });

    return NextResponse.json({ data: categorizedNews }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' // Cache news for 10 minutes
      }
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error fetching Seeking Alpha news, using fallback data:', err.response?.data || err.message);
    
    // Fallback Mock Data to ensure UI remains populated if rate-limited
    const mockNews = [
      {
        id: `sa-mock-${Date.now()}-1`,
        headline: "Major Biotech Firm Announces Positive Phase 3 Results for Oncology Drug",
        summary: "The drug showed a statistically significant improvement in overall survival.",
        url: "#",
        symbols: ["PFE", "MRNA"],
        createdAt: new Date().toISOString(),
        category: "FDA",
        categoryClass: "cat-fda",
        source: "Seeking Alpha (Fallback)"
      },
      {
        id: `sa-mock-${Date.now()}-2`,
        headline: "Software Giant Acquires Promising Cybersecurity Startup for $2.5B",
        summary: "The acquisition aims to bolster enterprise security offerings.",
        url: "#",
        symbols: ["CRWD", "PANW", "MSFT"],
        createdAt: new Date(Date.now() - 1800000).toISOString(),
        category: "Partnerships",
        categoryClass: "cat-partnerships",
        source: "Seeking Alpha (Fallback)"
      },
      {
        id: `sa-mock-${Date.now()}-3`,
        headline: "Energy Company Announces $500M Secondary Stock Offering",
        summary: "Proceeds will be used to fund expansion of renewable energy projects.",
        url: "#",
        symbols: ["XOM", "CVX"],
        createdAt: new Date(Date.now() - 5400000).toISOString(),
        category: "Offerings",
        categoryClass: "cat-offerings",
        source: "Seeking Alpha (Fallback)"
      }
    ];

    return NextResponse.json({ data: mockNews });
  }
}
