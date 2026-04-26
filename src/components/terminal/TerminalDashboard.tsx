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
  const [processingAiIds, setProcessingAiIds] = useState<Set<string>>(new Set());
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

  useEffect(() => {
    const uncategorized = news.filter(n => n.category === 'Pending AI' && !processingAiIds.has(n.id.toString()));
    if (uncategorized.length === 0) return;

    const batch = uncategorized.slice(0, 5); 
    const batchIds = batch.map(n => n.id.toString());
    
    queueMicrotask(() => {
      setProcessingAiIds(prev => {
        const next = new Set(prev);
        batchIds.forEach(id => next.add(id));
        return next;
      });
    });

    fetch('/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        articles: batch.map(n => ({ id: n.id, headline: n.headline, summary: n.summary }))
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.categories) {
        setNews(prev => prev.map(n => {
          const newCat = data.categories[n.id.toString()];
          if (newCat) {
            let catClass = "border-blue-500/30 text-blue-400 bg-blue-500/10";
            if (newCat.toLowerCase().includes('earn')) catClass = "border-emerald-500/30 text-emerald-400 bg-emerald-500/10";
            if (newCat.toLowerCase().includes('fda') || newCat.toLowerCase().includes('partner')) catClass = "border-purple-500/30 text-purple-400 bg-purple-500/10";
            if (newCat.toLowerCase().includes('offer')) catClass = "border-rose-500/30 text-rose-400 bg-rose-500/10";
            if (newCat.toLowerCase().includes('up') || newCat.toLowerCase().includes('down')) catClass = "border-cyan-500/30 text-cyan-400 bg-cyan-500/10";
            
            return { ...n, category: newCat, categoryClass: catClass };
          }
          return n;
        }));
      }
    })
    .catch(err => console.error('Categorization error:', err))
    .finally(() => {
      setProcessingAiIds(prev => {
        const next = new Set(prev);
        batchIds.forEach(id => next.delete(id));
        return next;
      });
    });
  }, [news, processingAiIds]);

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

      {/* Bloomberg-Style Dense Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-4">
        
        {/* Left Pane: Market Movers */}
        <div className="col-span-5 flex flex-col rounded-md border border-border bg-card/30">
          <div className="border-b border-border bg-muted/20 px-3 py-2 font-semibold uppercase">
            Market Movers {categorySlug ? `(${categorySlug})` : ''}
          </div>
          <div className="flex bg-muted/10 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
            <div className="w-16">SYM</div>
            <div className="w-20 text-right">PRICE</div>
            <div className="w-20 text-right">CHG %</div>
            <div className="w-20 text-right">VOL</div>
            <div className="flex-1 text-right">THEME/IND</div>
          </div>
          <ScrollArea className="flex-1">
            <div className="flex flex-col divide-y divide-border/50">
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
                    <div key={idx} className="flex items-center px-3 py-2 hover:bg-muted/20 transition-colors">
                      <div className="w-16 font-bold text-slate-200">{gapper.symbol}</div>
                      <div className="w-20 text-right">${gapper.price.toFixed(2)}</div>
                      <div className={cn("w-20 text-right font-medium", isUp ? "text-emerald-400" : "text-rose-400")}>
                        {isUp ? '+' : ''}{gapper.changePct}%
                      </div>
                      <div className="w-20 text-right text-slate-400">{formatVolume(gapper.volume)}</div>
                      <div className="flex-1 text-right text-xs text-muted-foreground truncate pl-2">
                        {gapper.theme || gapper.industry || '--'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right Pane: Unified News Terminal */}
        <div className="col-span-7 flex flex-col rounded-md border border-border bg-card/30">
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
