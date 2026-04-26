'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, TrendingUp, Newspaper, Clock, ArrowUpRight, ArrowDownRight, BrainCircuit, X } from 'lucide-react';

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

export default function Dashboard() {
  const [gappers, setGappers] = useState<Gapper[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [processingAiIds, setProcessingAiIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Force dark mode on body for the Pro Max aesthetic
    document.documentElement.classList.add('dark');

    const fetchData = async () => {
      try {
        const [marketRes, alpacaNewsRes, saNewsRes, yfNewsRes, finnhubNewsRes] = await Promise.all([
          fetch('/api/market'),
          fetch('/api/news'),
          fetch('/api/seeking-alpha').catch(() => ({ json: () => ({ data: [] }) })),
          fetch('/api/yahoo-finance').catch(() => ({ json: () => ({ data: [] }) })),
          fetch('/api/finnhub').catch(() => ({ json: () => ({ data: [] }) }))
        ]);
        
        const marketData = await marketRes.json();
        const alpacaNewsData = await alpacaNewsRes.json();
        
        let saNewsData = { data: [] };
        if (saNewsRes && typeof saNewsRes.json === 'function') {
          try { saNewsData = await saNewsRes.json(); } catch { /* ignore */ }
        }

        let yfNewsData = { data: [] };
        if (yfNewsRes && typeof yfNewsRes.json === 'function') {
          try { yfNewsData = await yfNewsRes.json(); } catch { /* ignore */ }
        }

        let finnhubNewsData = { data: [] };
        if (finnhubNewsRes && typeof finnhubNewsRes.json === 'function') {
          try { finnhubNewsData = await finnhubNewsRes.json(); } catch { /* ignore */ }
        }

        const incomingNews = [
          ...(alpacaNewsData.data || []), 
          ...(saNewsData.data || []),
          ...(yfNewsData.data || []),
          ...(finnhubNewsData.data || [])
        ];
        
        setGappers(marketData.data || []);
        
        setNews(prevNews => {
          const newMap = new Map(prevNews.map(n => [n.id.toString(), n]));
          incomingNews.forEach(n => {
            // Keep existing categorized status if already present
            if (!newMap.has(n.id.toString())) {
              newMap.set(n.id.toString(), n);
            }
          });
          const combinedNews = Array.from(newMap.values());
          combinedNews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          return combinedNews;
        });
      } catch (error) {
        console.error("Error fetching data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 1 minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Effect for background categorization
  useEffect(() => {
    const uncategorized = news.filter(n => n.category === 'Pending AI' && !processingAiIds.has(n.id.toString()));
    
    if (uncategorized.length === 0) return;

    const batch = uncategorized.slice(0, 5); // Reduced from 20 to 5 to stay under Vercel's 10s execution limit
    const batchIds = batch.map(n => n.id.toString());
    
    // Mark as processing (using queueMicrotask to avoid synchronous setState in effect)
    queueMicrotask(() => {
      setProcessingAiIds(prev => {
        const next = new Set(prev);
        batchIds.forEach(id => next.add(id));
        return next;
      });
    });

    // Fire & forget categorization request
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
      // Remove from processing set so we can retry if needed
      setProcessingAiIds(prev => {
        const next = new Set(prev);
        batchIds.forEach(id => next.delete(id));
        return next;
      });
    });
  }, [news, processingAiIds]);

  const handleSummarize = async () => {
    setShowSummaryModal(true);
    if (aiSummary) return; // Don't refetch if we already have it
    
    setIsSummarizing(true);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: news })
      });
      const data = await res.json();
      if (data.data) {
        setAiSummary(data.data);
      } else {
        setAiSummary('Failed to generate summary.');
      }
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

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    return `${Math.floor(diffInHours / 24)}d ago`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <header className="flex items-center justify-between pb-6 border-b border-border/40">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="w-8 h-8 text-primary" />
              Pre-Market Intelligence
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Real-time gapper detection & AI catalyst categorization
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Market Data Connected
          </div>
        </header>

        <div className="space-y-8">
          {/* Main Gappers Data Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Top Pre-Market Movers
              </h2>
            </div>

            <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xl overflow-hidden">
              <ScrollArea className="w-full">
                <div className="min-w-[1400px]">
                  {/* Table Header */}
                  <div className="grid grid-cols-[100px_100px_100px_80px_80px_100px_100px_80px_80px_140px_140px_100px_80px_120px_120px_minmax(300px,_1fr)] text-xs font-semibold text-muted-foreground p-4 border-b border-border/40 bg-secondary/30 uppercase tracking-wider items-center gap-2">
                    <div>Ticker</div>
                    <div className="text-right">Premkt %</div>
                    <div className="text-right">Premkt Vol</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">Prev Close</div>
                    <div className="text-right">MktCap</div>
                    <div className="text-center">Cap Size</div>
                    <div className="text-right">Float</div>
                    <div className="text-right">Short %</div>
                    <div>Theme</div>
                    <div>Industry</div>
                    <div className="text-center">Category</div>
                    <div className="text-center">Grade</div>
                    <div className="text-right">Rev Growth Est</div>
                    <div className="text-right">EPS Growth Est</div>
                    <div>Catalyst</div>
                  </div>
                  
                  {/* Table Body */}
                  {loading ? (
                    <div className="p-4 space-y-4">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                          <Skeleton className="h-8 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : gappers.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No significant pre-market movers found.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {gappers.map((gapper) => {
                        const isUp = parseFloat(gapper.changePct) > 0;
                        return (
                          <div key={gapper.symbol} className="grid grid-cols-[100px_100px_100px_80px_80px_100px_100px_80px_80px_140px_140px_100px_80px_120px_120px_minmax(300px,_1fr)] p-4 items-center hover:bg-secondary/30 transition-colors gap-2 text-sm">
                            <div className="font-bold text-blue-400 flex items-center gap-1">
                              {gapper.symbol} <ArrowUpRight className="w-3 h-3 opacity-50" />
                            </div>
                            <div className={`text-right font-mono flex items-center justify-end gap-1 ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {Math.abs(parseFloat(gapper.changePct))}%
                            </div>
                            <div className="text-right font-mono text-muted-foreground">{formatVolume(gapper.volume)}</div>
                            <div className="text-right font-mono">${gapper.price.toFixed(2)}</div>
                            <div className="text-right font-mono text-muted-foreground">${gapper.prevClose.toFixed(2)}</div>
                            <div className="text-right font-mono">{gapper.mktCap || '-'}</div>
                            <div className="text-center text-indigo-400 font-medium text-xs">{gapper.capSize || '-'}</div>
                            <div className="text-right font-mono text-muted-foreground">{gapper.float || '-'}</div>
                            <div className="text-right font-mono text-muted-foreground">{gapper.shortPct || '-'}</div>
                            <div className="text-xs text-cyan-400 leading-tight">{gapper.theme || '-'}</div>
                            <div className="text-xs text-muted-foreground leading-tight">{gapper.industry || '-'}</div>
                            <div className="text-center">
                              {gapper.category ? (
                                <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10 text-[10px]">
                                  {gapper.category}
                                </Badge>
                              ) : '-'}
                            </div>
                            <div className="text-center">
                              <Badge variant="outline" className={`grade-${gapper.grade.toLowerCase()}`}>
                                {gapper.grade}
                              </Badge>
                            </div>
                            <div className={`text-right font-mono ${gapper.revGrowth?.startsWith('-') ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {gapper.revGrowth || '-'}
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              {gapper.epsGrowth || '-'}
                            </div>
                            <div className="text-xs text-muted-foreground leading-snug pr-4">
                              {gapper.catalyst || '-'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* News & Catalysts Section */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-purple-500" />
                Live Catalysts & News
              </h2>
              <Button size="sm" variant="secondary" onClick={handleSummarize} className="gap-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 cursor-pointer">
                <BrainCircuit className="w-4 h-4" />
                Summarize Day
              </Button>
            </div>

            <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-xl">
              <ScrollArea className="h-[400px]">
                <CardContent className="p-0">
                  {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="space-y-2 border border-border/40 p-4 rounded-xl">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-10 w-full" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      ))}
                    </div>
                  ) : news.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No recent news found.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                      {news.map((item) => (
                        <a 
                          key={item.id} 
                          href={item.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="block p-4 border border-border/40 rounded-xl hover:bg-secondary/30 hover:border-border transition-colors group"
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Badge variant="outline" className={item.categoryClass}>
                              {item.category}
                            </Badge>
                            <Badge variant="outline" className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground border-border/40">
                              {item.source || 'Alpaca'}
                            </Badge>
                          </div>
                          <h3 className="font-medium text-sm leading-snug group-hover:text-primary transition-colors mb-3 line-clamp-3">
                            {item.headline}
                          </h3>
                          <div className="flex items-center justify-between mt-auto">
                            <div className="flex flex-wrap gap-1">
                              {item.symbols?.slice(0, 3).map(sym => (
                                <span key={sym} className="text-xs font-mono text-muted-foreground bg-background px-1.5 rounded">
                                  {sym}
                                </span>
                              ))}
                              {item.symbols && item.symbols.length > 3 && (
                                <span className="text-xs text-muted-foreground px-1">+{item.symbols.length - 3}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                              <Clock className="w-3 h-3" />
                              {getTimeAgo(item.createdAt)}
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </ScrollArea>
            </Card>
          </div>
          
        </div>
      </div>

      {/* AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-2xl bg-card border-border/50 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 pb-4">
              <CardTitle className="flex items-center gap-2 text-xl text-indigo-400">
                <BrainCircuit className="w-6 h-6" />
                AI Market Summary
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowSummaryModal(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </Button>
            </CardHeader>
            <CardContent className="p-6">
              <ScrollArea className="h-[400px] pr-4">
                {isSummarizing ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-full"></div>
                    <div className="h-4 bg-muted rounded w-5/6"></div>
                    <div className="h-4 bg-muted rounded w-2/3"></div>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                    {aiSummary}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
