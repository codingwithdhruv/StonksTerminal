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
  logo?: string;
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
  imageUrl?: string;
}

interface TerminalDashboardProps {
  categorySlug?: string;
}

export function TerminalDashboard({ categorySlug }: TerminalDashboardProps) {
  const [gappers, setGappers] = useState<Gapper[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<Gapper | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const fetchData = async () => {
      try {
        // Use sector-specific endpoints for category pages, global for overview
        const marketUrl = categorySlug
          ? `/api/market/sector?sector=${categorySlug}`
          : '/api/market';
        const newsUrl = categorySlug
          ? `/api/news/sector?sector=${categorySlug}`
          : '/api/news/all';

        const [marketRes, newsRes] = await Promise.all([
          fetch(marketUrl),
          fetch(newsUrl)
        ]);
        const marketData = await marketRes.json();
        const incomingNewsData = await newsRes.json();

        setGappers(marketData.data || []);

        const incomingNews: NewsItem[] = incomingNewsData.data || [];
        setNews(prevNews => {
          const newMap = new Map(prevNews.map(n => [n.id.toString(), n]));
          incomingNews.forEach((n: NewsItem) => {
            if (!newMap.has(n.id.toString())) newMap.set(n.id.toString(), n);
          });
          return Array.from(newMap.values());
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

  const handleSummarize = async () => {
    setShowSummaryModal(true);
    if (aiSummary) return;
    setIsSummarizing(true);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: filteredNews.slice(0, 10) })
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

  let filteredNews = [...news];
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
    <div className="flex h-full flex-col p-2 sm:p-4 font-mono text-xs sm:text-sm tracking-tight text-slate-300">
      {/* Header */}
      <header className="mb-2 sm:mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border pb-2 gap-2">
        <h1 className="text-base sm:text-xl font-bold uppercase text-primary">
          {categorySlug ? `${categorySlug} Dashboard` : 'Global Overview'}
        </h1>
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="h-3 w-3 sm:h-4 sm:w-4 animate-pulse text-emerald-500" />
            <span className="text-[10px] sm:text-xs text-muted-foreground">LIVE</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 sm:h-8 text-[10px] sm:text-xs border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
            onClick={handleSummarize}
            disabled={isSummarizing || filteredNews.length === 0}
          >
            <BrainCircuit className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">{isSummarizing ? 'Analyzing...' : 'Intelligence Brief'}</span>
            <span className="sm:hidden">{isSummarizing ? '...' : 'Brief'}</span>
          </Button>
        </div>
      </header>

      {/* Stacked Layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-4">

        {/* Market Movers Table */}
        <div className="flex min-h-[200px] h-[45%] flex-col rounded-md border border-border bg-card/30">
          <div className="border-b border-border bg-muted/20 px-3 py-1.5 sm:py-2 font-semibold uppercase text-xs">
            Market Movers {categorySlug ? `(${categorySlug})` : ''}
            <span className="ml-2 text-muted-foreground font-normal">({gappers.length})</span>
          </div>
          <div className="flex-1 overflow-auto">
            {/* Wide table with horizontal scroll */}
            <div className="min-w-[1800px]">
              <div className="sticky top-0 z-10 flex bg-muted/20 px-3 py-1.5 text-[10px] font-semibold text-muted-foreground border-b border-border">
                <div className="w-16 shrink-0">TICKER</div>
                <div className="w-20 shrink-0 text-right">CHG %</div>
                <div className="w-20 shrink-0 text-right">VOL</div>
                <div className="w-20 shrink-0 text-right">TRADES</div>
                <div className="w-20 shrink-0 text-right">PRICE</div>
                <div className="w-20 shrink-0 text-right">PREV CL</div>
                <div className="w-20 shrink-0 text-right">MKT CAP</div>
                <div className="w-16 shrink-0 text-center">SIZE</div>
                <div className="w-20 shrink-0 text-right">FLOAT</div>
                <div className="w-16 shrink-0 text-right">SI %</div>
                <div className="w-28 shrink-0 px-1">THEME</div>
                <div className="w-28 shrink-0 px-1">INDUSTRY</div>
                <div className="w-16 shrink-0 text-center">TYPE</div>
                <div className="w-14 shrink-0 text-center">GRD</div>
                <div className="w-20 shrink-0 text-right">REV G</div>
                <div className="w-20 shrink-0 text-right">EPS G</div>
                <div className="flex-1 min-w-[500px] px-4">CATALYST / KEY DEVELOPMENTS</div>
              </div>
              <div className="flex flex-col divide-y divide-border/30">
                {loading ? (
                  Array(8).fill(0).map((_, i) => (
                    <div key={i} className="flex px-3 py-1.5">
                      <Skeleton className="h-4 w-full bg-muted/50" />
                    </div>
                  ))
                ) : gappers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-xs">No active movers found{categorySlug ? ` for ${categorySlug}` : ''}.</div>
                ) : (
                  gappers.map((g, idx) => {
                    const isUp = parseFloat(g.changePct) >= 0;
                    return (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex items-center px-3 py-2 hover:bg-primary/10 transition-colors text-[11px] cursor-pointer border-l-2 border-transparent",
                          selectedStock?.symbol === g.symbol && "bg-primary/10 border-primary"
                        )}
                        onClick={() => setSelectedStock(g)}
                      >
                        <div className="w-16 shrink-0 font-bold text-slate-200 flex items-center gap-1">
                          {g.logo && (
                            <img src={g.logo} alt="" className="h-3.5 w-3.5 rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          {g.symbol}
                        </div>
                        <div className={cn("w-20 shrink-0 text-right font-semibold", isUp ? "text-emerald-400" : "text-rose-400")}>
                          {isUp ? '+' : ''}{g.changePct}%
                        </div>
                        <div className="w-20 shrink-0 text-right text-slate-400">{formatVolume(g.volume)}</div>
                        <div className="w-20 shrink-0 text-right text-slate-400">{formatVolume(g.trade_count || 0)}</div>
                        <div className="w-20 shrink-0 text-right">${g.price.toFixed(2)}</div>
                        <div className="w-20 shrink-0 text-right text-slate-400">${g.prevClose.toFixed(2)}</div>
                        <div className="w-20 shrink-0 text-right text-slate-300">{g.mktCap || '--'}</div>
                        <div className="w-16 shrink-0 text-center text-slate-400">{g.capSize || '--'}</div>
                        <div className="w-20 shrink-0 text-right text-slate-300">{g.float || '--'}</div>
                        <div className="w-16 shrink-0 text-right text-slate-300">{g.shortPct || '--'}</div>
                        <div className="w-28 shrink-0 px-1 text-muted-foreground truncate">{g.theme || '--'}</div>
                        <div className="w-28 shrink-0 px-1 text-muted-foreground truncate">{g.industry || '--'}</div>
                        <div className="w-16 shrink-0 text-center text-muted-foreground">{g.category || '--'}</div>
                        <div className="w-14 shrink-0 flex justify-center">
                          <Badge variant="outline" className={cn("px-1 py-0 h-4 text-[9px]",
                            g.grade === 'A' ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" :
                            g.grade === 'B' ? "border-blue-500/30 text-blue-400 bg-blue-500/10" :
                            g.grade === 'C' ? "border-amber-500/30 text-amber-400 bg-amber-500/10" :
                            "border-red-500/30 text-red-400 bg-red-500/10"
                          )}>
                            {g.grade}
                          </Badge>
                        </div>
                        <div className={cn("w-20 shrink-0 text-right",
                          g.revGrowth === '--' ? "text-slate-500" :
                          g.revGrowth?.startsWith('+') ? "text-emerald-400" : "text-rose-400"
                        )}>{g.revGrowth || '--'}</div>
                        <div className={cn("w-20 shrink-0 text-right",
                          g.epsGrowth === '--' ? "text-slate-500" :
                          g.epsGrowth?.startsWith('+') ? "text-emerald-400" : "text-rose-400"
                        )}>{g.epsGrowth || '--'}</div>
                        <div className="flex-1 min-w-[500px] px-4 text-slate-300 leading-relaxed py-2 break-words text-left" title={g.catalyst}>
                          {g.catalyst || '--'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* News Feed */}
        <div className="flex min-h-[200px] h-[55%] flex-col rounded-md border border-border bg-card/30">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5 sm:py-2">
            <div className="font-semibold uppercase flex items-center gap-2 text-xs">
              <Newspaper className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Unified Intelligence Feed</span>
              <span className="sm:hidden">News Feed</span>
              <span className="text-muted-foreground font-normal">({filteredNews.length})</span>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs">
              <div className="flex items-center gap-1 border border-border rounded px-1.5 sm:px-2 py-0.5 sm:py-1 bg-background">
                <Filter className="h-3 w-3 hidden sm:block" />
                <select
                  className="bg-transparent outline-none text-muted-foreground max-w-[80px] sm:max-w-none"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                >
                  <option value="all">All Sources</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 border border-border rounded px-1.5 sm:px-2 py-0.5 sm:py-1 bg-background">
                <Clock className="h-3 w-3 hidden sm:block" />
                <select
                  className="bg-transparent outline-none text-muted-foreground"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col divide-y divide-border/30">
              {loading ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="p-3">
                    <Skeleton className="h-4 w-3/4 mb-2 bg-muted/50" />
                    <Skeleton className="h-3 w-1/2 bg-muted/50" />
                  </div>
                ))
              ) : filteredNews.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">No news matching criteria.</div>
              ) : (
                filteredNews.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex gap-3 p-2 sm:p-3 hover:bg-muted/10 transition-colors group"
                  >
                    {/* News thumbnail */}
                    <div className="hidden sm:block shrink-0 w-24 h-16 rounded overflow-hidden bg-muted/20 border border-white/5 shadow-inner">
                      <img
                        src={item.imageUrl || '/images/news-placeholder.png'}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        onError={(e) => { 
                          const target = e.target as HTMLImageElement;
                          if (target.src !== '/images/news-placeholder.png') {
                            target.src = '/images/news-placeholder.png';
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 sm:gap-2 shrink-0">
                          <Globe className="h-3 w-3 hidden sm:block" />
                          {item.source || 'News'} • {new Date(item.createdAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
                          {item.symbols && item.symbols.length > 0 && (
                            <div className="flex gap-0.5 sm:gap-1">
                              {item.symbols.slice(0, 3).map(sym => (
                                <Badge key={sym} variant="outline" className="text-[9px] sm:text-[10px] h-4 px-1 rounded-sm border-muted-foreground/30">
                                  {sym}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <Badge variant="outline" className={cn("text-[9px] sm:text-[10px] h-4 px-1 rounded-sm", item.categoryClass)}>
                            {item.category}
                          </Badge>
                        </div>
                      </div>
                      <div className="font-medium text-slate-200 group-hover:text-primary transition-colors text-xs sm:text-sm">
                        {item.headline}
                      </div>
                      {item.summary && (
                        <div className="text-[10px] sm:text-xs text-slate-400 line-clamp-2 mt-0.5">
                          {item.summary}
                        </div>
                      )}
                    </div>
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
          <div className="w-full max-w-2xl rounded-lg border border-primary/20 bg-card p-4 sm:p-6 shadow-2xl shadow-primary/10">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h2 className="text-base sm:text-lg font-bold text-foreground">AI Intelligence Brief</h2>
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

      {/* Stock Detail Side Panel */}
      {selectedStock && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[500px] bg-slate-950 border-l border-primary/30 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col font-sans">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              {selectedStock.logo && (
                <img src={selectedStock.logo} alt="" className="h-8 w-8 rounded bg-white p-0.5" />
              )}
              <div>
                <h2 className="text-lg font-bold text-primary leading-tight">{selectedStock.symbol}</h2>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{selectedStock.industry} • {selectedStock.category}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedStock(null)} className="hover:bg-rose-500/10 hover:text-rose-500">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-8">
              {/* Key Catalyst Section */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-tighter">
                  <BrainCircuit className="h-4 w-4" />
                  Primary Catalyst & Intelligence
                </div>
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedStock.catalyst || 'No specific catalyst detected for this period.'}
                </div>
              </section>

              {/* Fundamental Grid */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Market Intelligence</h3>
                <div className="grid grid-cols-2 gap-px bg-border/50 border border-border rounded-lg overflow-hidden">
                  {[
                    { label: 'Market Cap', value: selectedStock.mktCap },
                    { label: 'Float', value: selectedStock.float },
                    { label: 'Short Interest', value: selectedStock.shortPct },
                    { label: 'Rel. Volume', value: formatVolume(selectedStock.volume) },
                    { label: 'Revenue Growth', value: selectedStock.revGrowth, color: selectedStock.revGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400' },
                    { label: 'EPS Growth', value: selectedStock.epsGrowth, color: selectedStock.epsGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400' },
                    { label: 'Industry', value: selectedStock.industry },
                    { label: 'Theme', value: selectedStock.theme },
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-900/50 p-3">
                      <p className="text-[9px] uppercase text-muted-foreground mb-1">{item.label}</p>
                      <p className={cn("text-sm font-bold", item.color || "text-slate-200")}>{item.value || '--'}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Performance Card */}
              <section className="bg-gradient-to-br from-card to-slate-900 p-4 rounded-lg border border-border shadow-inner">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Current Price</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-100">${selectedStock.price.toFixed(2)}</span>
                      <span className={cn("text-sm font-bold", parseFloat(selectedStock.changePct) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                        {parseFloat(selectedStock.changePct) >= 0 ? '▲' : '▼'} {selectedStock.changePct}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Grade</p>
                    <Badge className={cn("text-lg font-black px-3", 
                      selectedStock.grade === 'A' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" :
                      selectedStock.grade === 'B' ? "bg-blue-500/20 text-blue-400 border-blue-500/50" :
                      "bg-amber-500/20 text-amber-400 border-amber-500/50"
                    )}>
                      {selectedStock.grade}
                    </Badge>
                  </div>
                </div>
              </section>

              {/* Ticker Specific News */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">Live Mentions</h3>
                  <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">REAL-TIME</Badge>
                </div>
                <div className="space-y-3">
                  {filteredNews
                    .filter(n => n.symbols.includes(selectedStock.symbol))
                    .slice(0, 5)
                    .map((item, i) => (
                      <a key={i} href={item.url} target="_blank" rel="noreferrer" className="block p-3 rounded border border-border/50 hover:border-primary/50 bg-muted/5 transition-all group">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[9px] text-muted-foreground">{item.source} • {new Date(item.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-300 group-hover:text-primary transition-colors line-clamp-2">{item.headline}</p>
                      </a>
                    ))}
                  {filteredNews.filter(n => n.symbols.includes(selectedStock.symbol)).length === 0 && (
                    <div className="text-center py-8 border border-dashed border-border rounded-lg">
                      <p className="text-xs text-muted-foreground">No additional news found for {selectedStock.symbol}</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border bg-card/30 flex gap-2">
            <Button className="flex-1 bg-primary text-primary-foreground font-bold" onClick={() => window.open(`https://seekingalpha.com/symbol/${selectedStock.symbol}`, '_blank')}>
              View on SeekingAlpha
            </Button>
            <Button variant="outline" className="flex-1 border-primary/20 hover:bg-primary/10" onClick={() => window.open(`https://finance.yahoo.com/quote/${selectedStock.symbol}`, '_blank')}>
              Yahoo Finance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
