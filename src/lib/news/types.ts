export type CategoryClass = 
  | 'cat-earnings' 
  | 'cat-partnerships' 
  | 'cat-themes' 
  | 'cat-orders' 
  | 'cat-fda' 
  | 'cat-offerings' 
  | 'cat-technology' 
  | 'cat-healthcare' 
  | 'cat-crypto' 
  | 'cat-macro' 
  | 'cat-energy' 
  | 'cat-others';

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  url: string;
  source: string;
  createdAt: string;
  _timestamp: number;
  category: string;
  categoryClass: CategoryClass;
  symbols: string[];
  imageUrl?: string;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  relevanceScore?: number; // 0-100
}

export interface NewsProvider {
  name: string;
  priority: number; // Higher is more "reliable" or "primary"
  fetch(tickers?: string[]): Promise<NewsItem[]>;
}
