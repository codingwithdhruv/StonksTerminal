import { NextResponse } from 'next/server';
import axios from 'axios';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

import { categorizeNews, getCategoryLabel } from '@/lib/news';

interface YFArticle {
  title?: string;
  summary?: string;
  providerPublishTime?: number;
  uuid?: string;
  link?: string;
  relatedTickers?: string[];
  publisher?: string;
}

export async function GET() {
  try {
    const url = `https://apidojo-yahoo-finance-v1.p.rapidapi.com/news/v2/list`;
    
    // Using POST as specified by apidojo documentation for /news/v2/list
    const newsRes = await axios.post(url, {
      region: 'US',
      snippetCount: 10
    }, { 
      headers: {
        'x-api-key': RAPIDAPI_KEY,
        'x-api-host': 'apidojo-yahoo-finance-v1.p.rapidapi.com',
        'Content-Type': 'application/json'
      }
    });

    // Extract items safely depending on the APIDojo schema version
    const articles: YFArticle[] = Array.isArray(newsRes.data?.data?.main?.stream) ? newsRes.data.data.main.stream :
                     Array.isArray(newsRes.data?.items) ? newsRes.data.items :
                     Array.isArray(newsRes.data?.data) ? newsRes.data.data :
                     Array.isArray(newsRes.data) ? newsRes.data : [];

    const categorizedNews = articles.slice(0, 10).map((article) => {
      const headline = article.title || '';
      const summary = article.summary || ''; 
      const categoryClass = categorizeNews(headline, summary);
      
      // APIDojo uses unix timestamps for providerPublishTime
      const timestamp = article.providerPublishTime ? new Date(article.providerPublishTime * 1000).toISOString() : new Date().toISOString();

      return {
        id: article.uuid || Math.random().toString(),
        headline: headline,
        summary: summary,
        url: article.link || '',
        symbols: article.relatedTickers || [],
        createdAt: timestamp,
        category: getCategoryLabel(categoryClass),
        categoryClass,
        source: article.publisher || 'Yahoo Finance'
      };
    });

    return NextResponse.json({ data: categorizedNews }, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' // Cache news for 10 minutes
      }
    });
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error fetching Yahoo Finance news, using fallback data:', err.response?.data || err.message);
    
    // Fallback Mock Data to ensure UI remains populated if rate-limited
    const mockNews = [
      {
        id: `yf-mock-${Date.now()}-1`,
        headline: "Dow Jones futures rise; Fed rate cut expectations shift after inflation data",
        summary: "Market participants are recalibrating their expectations for the Federal Reserve's next move.",
        url: "#",
        symbols: ["SPY", "QQQ", "DIA"],
        createdAt: new Date().toISOString(),
        category: "General",
        categoryClass: "cat-others",
        source: "Yahoo Finance (Fallback)"
      },
      {
        id: `yf-mock-${Date.now()}-2`,
        headline: "Tech sector rallies as AI infrastructure spending hits new highs",
        summary: "Major tech giants announced increased capital expenditure for data center expansions.",
        url: "#",
        symbols: ["NVDA", "MSFT", "GOOGL"],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        category: "Themes",
        categoryClass: "cat-themes",
        source: "Yahoo Finance (Fallback)"
      },
      {
        id: `yf-mock-${Date.now()}-3`,
        headline: "Retailers warn of consumer spending slowdown ahead of holiday season",
        summary: "Several major retailers lowered their Q4 revenue forecasts citing macroeconomic headwinds.",
        url: "#",
        symbols: ["WMT", "TGT", "AMZN"],
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        category: "Earnings",
        categoryClass: "cat-earnings",
        source: "Yahoo Finance (Fallback)"
      }
    ];

    return NextResponse.json({ data: mockNews });
  }
}
