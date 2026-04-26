'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Newspaper, BrainCircuit, Filter, Clock, Globe, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Gapper {
  symbol: string;
  price: number;
  prevClose: number;
  changePct: string;
  volume: number;
  trade_count?: number;
  grade: string;
  mktCap?: string;
  capSize?: string;
  float?: string;
  shortPct?: string;
  theme?: string;
  industry?: string;
  category?: string;
  revGrowth?: string;
  epsGrowth?: string;
  catalyst?: string;
}

interface NewsItem {
  id: string | number;
  headline: string;
  summary: string;
  category: string;
  categoryClass: string;
  createdAt: string;
  symbols: string[];
  url: string;
  source?: string;
}

interface TerminalDashboardProps {
  categorySlug?: string; // e.g., 'technology', 'healthcare'
}

export function TerminalDashboard({ categorySlug }: TerminalDashboardProps) {
  const [gappers, setGappers] = useState<Gapper[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  
  // For AI summarization
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');

    const fetchData = async () => {
      try {
        const [marketRes, newsRes] = await Promise.all([
          fetch('/api/market'),
          fetch('/api/news/all')
        ]);
        
        const marketData = await marketRes.json();
        const incomingNewsData = await newsRes.json();
        
        let fetchedGappers: Gapper[] = marketData.data || [];
        
        // Filter by category slug if provided
        if (categorySlug) {
           fetchedGappers = fetchedGappers.filter(g => 
              g.theme?.toLowerCase().includes(categorySlug.toLowerCase()) || 
              g.industry?.toLowerCase().includes(categorySlug.toLowerCase())
           );
        }
        setGappers(fetchedGappers);
        
        const incomingNews: NewsItem[] = incomingNewsData.data || [];
        setNews(prevNews => {
          const newMap = new Map(prevNews.map(n => [n.id.toString(), n]));
          incomingNews.forEach((n: NewsItem) => {
            if (!newMap.has(n.id.toString())) {
              newMap.set(n.id.toString(), n);
            }
          });
          const combinedNews = Array.from(newMap.values());
          return combinedNews;
        });
      } catch (error) {
        console.error("Error fetching data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [categorySlug]);

  // Categorization is now handled entirely on the server-side via regex in the route handlers.
  // No client-side polling required anymore.

  const handleSummarize = async () => {
    setShowSummaryModal(true);
    if (aiSummary) return; 
    setIsSummarizing(true);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: filteredNews.slice(0, 10) }) // Summarize top 10 relevant news
      });
      const data = await res.json();
      if (data.data) setAiSummary(data.data);
      else setAiSummary('Failed to generate summary.');
    } catch {
      setAiSummary('Error generating summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return (vol / 1000000).toFixed(2) + 'M';
    if (vol >= 1000) return (vol / 1000).toFixed(1) + 'K';
    return vol.toString();
  };

  // React Compiler will automatically memoize this computation
  let filteredNews = [...news];
  
  if (categorySlug) {
      filteredNews = filteredNews.filter(n => {
          const matchesCat = n.category.toLowerCase().includes(categorySlug.toLowerCase());
          const matchesSym = n.symbols.some(sym => gappers.some(g => g.symbol === sym));
          return matchesCat || matchesSym;
      });
  }

  if (sourceFilter !== 'all') {
    filteredNews = filteredNews.filter(n => n.source?.toLowerCase().includes(sourceFilter.toLowerCase()));
  }

  filteredNews.sort((a, b) => {
    const tA = new Date(a.createdAt).getTime();
    const tB = new Date(b.createdAt).getTime();
    return sortBy === 'newest' ? tB - tA : tA - tB;
  });

  const sources = Array.from(new Set(news.map(n => n.source || 'Unknown').filter(Boolean)));

  return (
    <div className="flex h-full flex-col p-4 font-mono text-sm tracking-tight text-slate-300">
      <header className="mb-4 flex items-center justify-between border-b border-border pb-2">
        <h1 className="text-xl font-bold uppercase text-primary">
          {categorySlug ? `${categorySlug} Dashboard` : 'Global Overview'}
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
             <Activity className="h-4 w-4 animate-pulse text-emerald-500" />
             <span className="text-xs text-muted-foreground">LIVE DATA</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
            onClick={handleSummarize}
            disabled={isSummarizing || filteredNews.length === 0}
          >
            <BrainCircuit className="mr-2 h-4 w-4" />
            {isSummarizing ? 'Analyzing...' : 'Generate Intelligence Brief'}
          </Button>
        </div>
      </header>

      {/* Bloomberg-Style Stacked Layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        
        {/* Top Pane: 17-Column Market Movers Table */}
        <div className="flex h-[45%] flex-col rounded-md border border-border bg-card/30">
          <div className="border-b border-border bg-muted/20 px-3 py-2 font-semibold uppercase">
            Market Movers {categorySlug ? `(${categorySlug})` : ''}
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[1800px] flex bg-muted/10 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
              <div className="w-20 shrink-0">TICKER</div>
              <div className="w-24 shrink-0 text-right">PREMKT %</div>
              <div className="w-24 shrink-0 text-right">PREMKT VOL</div>
              <div className="w-24 shrink-0 text-right">VOL (1D)</div>
              <div className="w-20 shrink-0 text-right">PRICE</div>
              <div className="w-24 shrink-0 text-right">PREV CLOSE</div>
              <div className="w-24 shrink-0 text-right">MKT CAP</div>
              <div className="w-20 shrink-0 text-center">CAP SIZE</div>
              <div className="w-20 shrink-0 text-right">FLOAT</div>
              <div className="w-20 shrink-0 text-right">SHORT %</div>
              <div className="w-32 shrink-0 px-2">THEME</div>
              <div className="w-32 shrink-0 px-2">INDUSTRY</div>
              <div className="w-24 shrink-0 px-2">CATEGORY</div>
              <div className="w-16 shrink-0 text-center">GRADE</div>
              <div className="w-32 shrink-0 text-right">REV GWTH EST</div>
              <div className="w-32 shrink-0 text-right">EPS GWTH EST</div>
              <div className="flex-1 shrink-0 px-4">CATALYST</div>
            </div>
            <ScrollArea className="h-full">
              <div className="min-w-[1800px] flex flex-col divide-y divide-border/50 pb-8">
                {loading ? (
                  Array(10).fill(0).map((_, i) => (
                    <div key={i} className="flex px-3 py-2">
                      <Skeleton className="h-4 w-full bg-muted/50" />
                    </div>
                  ))
                ) : gappers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">No active movers found.</div>
                ) : (
                  gappers.map((gapper, idx) => {
                    const isUp = parseFloat(gapper.changePct) >= 0;
                    return (
                      <div key={idx} className="flex items-center px-3 py-2 hover:bg-muted/20 transition-colors text-xs">
                        <div className="w-20 shrink-0 font-bold text-slate-200">{gapper.symbol}</div>
                        <div className={cn("w-24 shrink-0 text-right font-medium", isUp ? "text-emerald-400" : "text-rose-400")}>
                          {isUp ? '+' : ''}{gapper.changePct}%
                        </div>
                        <div className="w-24 shrink-0 text-right text-slate-400">{formatVolume(gapper.volume)}</div>
                        <div className="w-24 shrink-0 text-right text-slate-400">{formatVolume(gapper.trade_count || gapper.volume * 8.5)}</div>
                        <div className="w-20 shrink-0 text-right">${gapper.price.toFixed(2)}</div>
                        <div className="w-24 shrink-0 text-right">${gapper.prevClose.toFixed(2)}</div>
                        <div className="w-24 shrink-0 text-right text-slate-300">{gapper.mktCap || '--'}</div>
                        <div className="w-20 shrink-0 text-center text-slate-400">{gapper.capSize || '--'}</div>
                        <div className="w-20 shrink-0 text-right text-slate-300">{gapper.float || '--'}</div>
                        <div className="w-20 shrink-0 text-right text-slate-300">{gapper.shortPct || '--'}</div>
                        <div className="w-32 shrink-0 px-2 text-muted-foreground truncate" title={gapper.theme}>{gapper.theme || '--'}</div>
                        <div className="w-32 shrink-0 px-2 text-muted-foreground truncate" title={gapper.industry}>{gapper.industry || '--'}</div>
                        <div className="w-24 shrink-0 px-2 text-muted-foreground truncate" title={gapper.category}>{gapper.category || '--'}</div>
                        <div className="w-16 shrink-0 flex justify-center">
                          <Badge variant="outline" className={cn("px-1 py-0 h-5 text-[10px]", 
                            gapper.grade === 'A' ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" :
                            gapper.grade === 'B' ? "border-blue-500/30 text-blue-400 bg-blue-500/10" :
                            "border-amber-500/30 text-amber-400 bg-amber-500/10"
                          )}>
                            {gapper.grade}
                          </Badge>
                        </div>
                        <div className="w-32 shrink-0 text-right text-emerald-400/80">{gapper.revGrowth || '--'}</div>
                        <div className="w-32 shrink-0 text-right text-emerald-400/80">{gapper.epsGrowth || '--'}</div>
                        <div className="flex-1 shrink-0 px-4 text-slate-400 truncate" title={gapper.catalyst}>{gapper.catalyst || '--'}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Bottom Pane: Unified News Terminal */}
        <div className="flex h-[55%] flex-col rounded-md border border-border bg-card/30">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
            <div className="font-semibold uppercase flex items-center gap-2">
              <Newspaper className="h-4 w-4" />
              Unified Intelligence Feed
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1 border border-border rounded px-2 py-1 bg-background">
                <Filter className="h-3 w-3" />
                <select 
                  className="bg-transparent outline-none text-muted-foreground"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">All Sources</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 border border-border rounded px-2 py-1 bg-background">
                <Clock className="h-3 w-3" />
                <select 
                  className="bg-transparent outline-none text-muted-foreground"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                </select>
              </div>
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="flex flex-col divide-y divide-border/50">
              {loading ? (
                 Array(8).fill(0).map((_, i) => (
                  <div key={i} className="p-3">
                    <Skeleton className="h-4 w-3/4 mb-2 bg-muted/50" />
                    <Skeleton className="h-3 w-1/2 bg-muted/50" />
                  </div>
                ))
              ) : filteredNews.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No news matching criteria.</div>
              ) : (
                filteredNews.map((item) => (
                  <a 
                    key={item.id} 
                    href={item.url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex flex-col gap-1 p-3 hover:bg-muted/10 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-2">
                        <Globe className="h-3 w-3" />
                        {item.source || 'News'} • {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.symbols && item.symbols.length > 0 && (
                          <div className="flex gap-1">
                            {item.symbols.slice(0, 3).map(sym => (
                              <Badge key={sym} variant="outline" className="text-[10px] h-4 px-1 rounded-sm border-muted-foreground/30">
                                {sym}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Badge variant="outline" className={cn("text-[10px] h-4 px-1 rounded-sm", item.categoryClass)}>
                          {item.category}
                        </Badge>
                      </div>
                    </div>
                    <div className="font-medium text-slate-200 group-hover:text-primary transition-colors">
                      {item.headline}
                    </div>
                    {item.summary && (
                      <div className="text-xs text-slate-400 line-clamp-2 mt-1">
                        {item.summary}
                      </div>
                    )}
                  </a>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-lg border border-primary/20 bg-card p-6 shadow-2xl shadow-primary/10">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">AI Intelligence Brief</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowSummaryModal(false)}>
                <span className="sr-only">Close</span>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <ScrollArea className="max-h-[60vh]">
              {isSummarizing ? (
                <div className="space-y-4 py-4">
                  <Skeleton className="h-4 w-full bg-muted/50" />
                  <Skeleton className="h-4 w-5/6 bg-muted/50" />
                  <Skeleton className="h-4 w-4/6 bg-muted/50" />
                  <div className="flex items-center justify-center py-8">
                    <Activity className="h-8 w-8 animate-pulse text-primary/50" />
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none space-y-4 text-muted-foreground font-sans">
                  {aiSummary?.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="leading-relaxed">{paragraph}</p>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
