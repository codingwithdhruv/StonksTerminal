import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { articles } = await req.json();

    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return NextResponse.json({ error: 'Invalid or empty articles array' }, { status: 400 });
    }

    const apiKey = process.env.NIM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'NIM API key not configured' }, { status: 500 });
    }

    // Format the prompt for LLaMA 3.1 8B Instruct
    // We strictly ask for a JSON object response mapping ID to Category to parse it reliably.
    const promptText = `
You are a financial news categorization AI. 
Categorize the following news articles into ONE of the following precise categories: 
Earnings, FDA, Partnerships, Offerings, Macro, Upgrades/Downgrades, General.

Input Articles:
${articles.map(a => `ID: ${a.id} | Headline: ${a.headline}`).join('\n')}

Output ONLY a valid JSON object where the keys are the article IDs, and the values are the categories. 
Example Output:
{
  "article-1": "Earnings",
  "article-2": "FDA"
}
Do not output any markdown formatting, markdown code blocks, or explanatory text. Just the raw JSON object.
`;

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: promptText }],
        temperature: 0.1,
        max_tokens: 1024,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('NIM AI API Error:', errorText);
      return NextResponse.json({ error: 'Failed to categorize via NIM AI' }, { status: 500 });
    }

    const aiData = await response.json();
    let resultText = aiData.choices[0].message.content.trim();

    // Clean up potential markdown formatting that LLaMA might still output despite instructions
    if (resultText.startsWith('```json')) {
      resultText = resultText.substring(7);
    }
    if (resultText.startsWith('```')) {
      resultText = resultText.substring(3);
    }
    if (resultText.endsWith('```')) {
      resultText = resultText.substring(0, resultText.length - 3);
    }

    const categoriesMap = JSON.parse(resultText);

    return NextResponse.json({ categories: categoriesMap });

  } catch (error) {
    console.error('Error in AI categorization route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
