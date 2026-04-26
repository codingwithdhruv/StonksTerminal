import { NextResponse } from 'next/server';
import axios from 'axios';

const NIM_API_KEY = process.env.NIM_API_KEY;

interface Article {
  source?: string;
  category: string;
  headline: string;
  summary?: string;
}

export async function POST(request: Request) {
  try {
    const { articles } = await request.json() as { articles: Article[] };

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: 'No articles provided for summarization' }, { status: 400 });
    }

    // Format the articles into a prompt string
    const articlesText = articles.map((a, idx: number) => {
      return `[Article ${idx + 1}]
Source: ${a.source || 'Unknown'}
Category: ${a.category}
Headline: ${a.headline}
${a.summary ? `Summary: ${a.summary}` : ''}`;
    }).join('\n\n');

    const systemPrompt = `You are an expert financial analyst. Your task is to analyze the provided pre-market and market news headlines and summaries, and provide a concise, high-level summary grouped by category (e.g., Earnings, FDA, Partnerships). Focus on actionable insights, overall market sentiment, and the most significant catalysts. Do not generate a massive essay; keep it brief, impactful, and easy to scan.`;

    const response = await axios.post(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        model: 'meta/llama-3.1-8b-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here are the latest market catalysts to summarize:\n\n${articlesText}` }
        ],
        temperature: 0.3,
        max_tokens: 1024,
      },
      {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const summary = response.data.choices?.[0]?.message?.content || 'No summary generated.';

    return NextResponse.json({ data: summary });

  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Error generating AI summary:', err.response?.data || err.message);
    return NextResponse.json({ error: 'Failed to generate AI summary' }, { status: 500 });
  }
}
