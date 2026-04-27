import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const scriptPath = path.resolve(process.cwd(), 'usefulRepos');
    const { stdout } = await execAsync(`python3 -c "import sys; import json; sys.path.append('${scriptPath}'); from ycnbc import News; news = News(); trending = news.trending(); print(json.dumps(trending))"`);
    
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) throw new Error('Invalid format from ycnbc');
    
    const mapped = parsed.map((item, idx) => ({
      id: `cnbc-${Date.now()}-${idx}`,
      headline: item.headline || '',
      summary: '',
      url: item.link || '',
      createdAt: new Date().toISOString(),
      source: 'CNBC',
      _timestamp: Date.now() - idx * 1000 // Fake timestamp for sorting
    }));
    
    return NextResponse.json({ data: mapped });
  } catch (error) {
    console.error('ycnbc fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch CNBC news' }, { status: 500 });
  }
}
