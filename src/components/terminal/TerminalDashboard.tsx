'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity, Newspaper, BrainCircuit, Filter, Clock, Globe, X,
  Star, Download, SlidersHorizontal, TrendingUp, ChevronDown,
  Search, BarChart2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NewsItem, formatNewsTime, getSentiment } from '@/lib/news';

interface Gapper {
  symbol: string;
  logo?: string;
  price: number;
  prevClose: number;
  changePct: string;
  premktChgPct?: string;
  premktVol?: number;
  volume: number;
  trade_count?: number;
  sparkline?: number[];
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

interface TerminalDashboardProps {
  categorySlug?: string;
}

// All toggleable columns (ticker always visible)
const ALL_COLUMNS = [
  { key: 'premkt', label: 'PREMKT %' },
  { key: 'premktVol', label: 'PREMKT VOL' },
  { key: 'chg', label: 'CHG %' },
  { key: 'sparkline', label: 'SPARK' },
  { key: 'vol', label: 'VOL (1D)' },
  { key: 'price', label: 'PRICE' },
  { key: 'prevClose', label: 'PREV CLOSE' },
  { key: 'mktCap', label: 'MKT CAP' },
  { key: 'capSize', label: 'CAP SIZE' },
  { key: 'float', label: 'FLOAT' },
  { key: 'shortPct', label: 'SHORT %' },
  { key: 'theme', label: 'THEME' },
  { key: 'industry', label: 'INDUSTRY' },
  { key: 'category', label: 'CATEGORY' },
  { key: 'grade', label: 'GRADE' },
  { key: 'revGrowth', label: 'REV GROWTH' },
  { key: 'epsGrowth', label: 'EPS GROWTH' },
  { key: 'catalyst', label: 'CATALYST' },
] as const;

type ColKey = typeof ALL_COLUMNS[number]['key'];

function Sparkline({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (!data || data.length < 2) return <div className="w-14" />;
  const W = 56, H = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 2) - 1;
    return `${x},${y}`;
  });
  const color = isUp ? '#10b981' : '#f43f5e';
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function TradingViewWidget({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: '60',
      timezone: 'Asia/Kolkata',
      theme: 'dark',
      style: '1',
      locale: 'en',
      hide_top_toolbar: false,
      hide_legend: true,
      allow_symbol_change: false,
      support_host: 'https://www.tradingview.com',
    });
    ref.current.appendChild(script);
  }, [symbol]);
  return (
    <div className="tradingview-widget-container" style={{ height: '300px' }} ref={ref}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%' }} />
    </div>
  );
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

  // Column chooser
  const [hiddenCols, setHiddenCols] = useState<Set<ColKey>>(new Set());
  const [showColChooser, setShowColChooser] = useState(false);
  const colChooserRef = useRef<HTMLDivElement>(null);

  // Filters
  const [filterCapSize, setFilterCapSize] = useState('all');
  const [filterMinVol, setFilterMinVol] = useState(0);
  const [filterTicker, setFilterTicker] = useState('');
  const [filterGrade, setFilterGrade] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Watchlist
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // Close col-chooser on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colChooserRef.current && !colChooserRef.current.contains(e.target as Node)) {
        setShowColChooser(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load watchlist from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('stonks_watchlist');
      if (stored) setWatchlist(new Set(JSON.parse(stored)));
    } catch { /* ignore */ }
  }, []);

  const toggleWatchlist = useCallback((symbol: string) => {
    setWatchlist(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      try { localStorage.setItem('stonks_watchlist', JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    const fetchData = async () => {
      try {
        const marketUrl = categorySlug ? `/api/market/sector?sector=${categorySlug}` : '/api/market';
        const newsUrl = categorySlug ? `/api/news/sector?sector=${categorySlug}` : '/api/news/all';

        const [marketRes, newsRes] = await Promise.all([fetch(marketUrl), fetch(newsUrl)]);
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
        console.error('Error fetching data', error);
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
        body: JSON.stringify({ articles: filteredNews.slice(0, 10) }),
      });
      const data = await res.json();
      setAiSummary(data.data || 'Failed to generate summary.');
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

  // Filtered gappers
  const filteredGappers = useMemo(() => {
    return gappers.filter(g => {
      if (filterTicker && !g.symbol.toUpperCase().includes(filterTicker.toUpperCase())) return false;
      if (filterCapSize !== 'all' && g.capSize !== filterCapSize) return false;
      if (filterGrade !== 'all' && g.grade !== filterGrade) return false;
      if (filterMinVol > 0 && g.volume < filterMinVol) return false;
      return true;
    });
  }, [gappers, filterTicker, filterCapSize, filterGrade, filterMinVol]);

  // Filtered news
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

  const isColVisible = (key: ColKey) => !hiddenCols.has(key);
  const toggleCol = (key: ColKey) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const exportCSV = useCallback(() => {
    const headers = ['Symbol', 'Premkt%', 'PremktVol', 'Chg%', 'Volume', 'Price', 'PrevClose', 'MktCap', 'CapSize', 'Float', 'Short%', 'Theme', 'Industry', 'Category', 'Grade', 'RevGrowth', 'EpsGrowth', 'Catalyst'];
    const rows = filteredGappers.map(g => [
      g.symbol, g.premktChgPct || '', g.premktVol || '', g.changePct, g.volume, g.price.toFixed(2),
      g.prevClose.toFixed(2), g.mktCap || '', g.capSize || '', g.float || '', g.shortPct || '',
      g.theme || '', g.industry || '', g.category || '', g.grade,
      g.revGrowth || '', g.epsGrowth || '', (g.catalyst || '').replace(/,/g, ';'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `market-movers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredGappers]);

  const sentimentColor = (s: string) =>
    s === 'bullish' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
    : s === 'bearish' ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
    : 'border-slate-500/30 text-slate-400 bg-slate-500/10';

  return (
    <div className="flex h-full flex-col p-2 sm:p-4 font-mono text-xs sm:text-sm tracking-tight text-slate-300">

      {/* Header */}
      <header className="mb-2 sm:mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2 gap-2 border-b border-border/60">
        <div>
          <h1 className="text-sm sm:text-lg font-black uppercase tracking-widest text-primary">
            {categorySlug ? `${categorySlug} Dashboard` : 'Global Overview'}
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block">
            {filteredGappers.length} movers · {filteredNews.length} signals · Auto-refresh 60s
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-emerald-500/30 bg-emerald-500/10">
            <Activity className="h-3 w-3 animate-pulse text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400">LIVE</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[10px] border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary gap-1"
            onClick={() => setShowFilters(f => !f)}>
            <Filter className="h-3 w-3" /> Filters {showFilters && '▲' || '▼'}
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] border-border/40 gap-1" onClick={exportCSV}>
            <Download className="h-3 w-3" /> <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-[10px] border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary gap-1"
            onClick={handleSummarize} disabled={isSummarizing || filteredNews.length === 0}>
            <BrainCircuit className="h-3 w-3" />
            <span className="hidden sm:inline">{isSummarizing ? 'Analyzing…' : 'Intelligence Brief'}</span>
          </Button>
        </div>
      </header>

      {/* Filter Bar */}
      {showFilters && (
        <div className="mb-2 flex flex-wrap gap-2 items-center rounded border border-border/40 bg-muted/10 px-3 py-2">
          <div className="flex items-center gap-1">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              className="bg-transparent outline-none text-xs w-20 placeholder:text-muted-foreground/50"
              placeholder="Ticker…"
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value)}
            />
          </div>
          <select className="bg-transparent text-xs outline-none border border-border/40 rounded px-1.5 py-0.5 text-muted-foreground"
            value={filterCapSize} onChange={e => setFilterCapSize(e.target.value)}>
            <option value="all">All Sizes</option>
            {['Mega', 'Large', 'Mid', 'Small', 'Micro'].map(s => <option key={s} value={s}>{s} Cap</option>)}
          </select>
          <select className="bg-transparent text-xs outline-none border border-border/40 rounded px-1.5 py-0.5 text-muted-foreground"
            value={filterGrade} onChange={e => setFilterGrade(e.target.value)}>
            <option value="all">All Grades</option>
            {['A', 'B', 'C', 'D'].map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
          <select className="bg-transparent text-xs outline-none border border-border/40 rounded px-1.5 py-0.5 text-muted-foreground"
            value={filterMinVol.toString()} onChange={e => setFilterMinVol(Number(e.target.value))}>
            <option value="0">Any Volume</option>
            <option value="100000">100K+</option>
            <option value="500000">500K+</option>
            <option value="1000000">1M+</option>
            <option value="5000000">5M+</option>
          </select>
          <button className="text-[10px] text-muted-foreground hover:text-primary ml-auto"
            onClick={() => { setFilterTicker(''); setFilterCapSize('all'); setFilterGrade('all'); setFilterMinVol(0); }}>
            Reset
          </button>
        </div>
      )}

      {/* Stacked Layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">

        {/* ── Market Movers Table ── */}
        <div className="flex min-h-[200px] h-[46%] flex-col rounded-lg border border-border/60 bg-card/20">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/15 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-3.5 w-3.5 text-primary" />
              <span className="font-bold text-xs uppercase tracking-widest text-foreground">
                Market Movers {categorySlug ? `· ${categorySlug}` : ''}
              </span>
              <span className="text-[10px] text-muted-foreground">({filteredGappers.length})</span>
            </div>
            <div className="relative" ref={colChooserRef}>
              <button onClick={() => setShowColChooser(s => !s)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary px-2 py-1 rounded border border-border/40 hover:border-primary/40">
                <SlidersHorizontal className="h-3 w-3" /> Columns <ChevronDown className="h-2.5 w-2.5" />
              </button>
              {showColChooser && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-2xl p-3 grid grid-cols-2 gap-1.5 w-64">
                  {ALL_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:text-primary">
                      <input type="checkbox" checked={isColVisible(col.key)} onChange={() => toggleCol(col.key)}
                        className="accent-primary h-3 w-3" />
                      {col.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="min-w-max">
              {/* Header row */}
              <div className="sticky top-0 z-20 flex bg-slate-900/95 border-b border-border/60 text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                {/* Sticky ticker header */}
                <div className="sticky left-0 z-30 bg-slate-900 flex items-center px-3 py-2 w-28 shrink-0 border-r border-border/30">
                  <Star className="h-3 w-3 mr-1.5 text-muted-foreground/40" /> TICKER
                </div>
                {isColVisible('premkt') && <div className="w-24 shrink-0 text-right px-2 py-2">PREMKT %</div>}
                {isColVisible('premktVol') && <div className="w-24 shrink-0 text-right px-2 py-2">PREMKT VOL</div>}
                {isColVisible('chg') && <div className="w-20 shrink-0 text-right px-2 py-2">CHG %</div>}
                {isColVisible('sparkline') && <div className="w-16 shrink-0 text-center px-2 py-2">SPARK</div>}
                {isColVisible('vol') && <div className="w-24 shrink-0 text-right px-2 py-2">VOL (1D)</div>}
                {isColVisible('price') && <div className="w-20 shrink-0 text-right px-2 py-2">PRICE</div>}
                {isColVisible('prevClose') && <div className="w-24 shrink-0 text-right px-2 py-2">PREV CLOSE</div>}
                {isColVisible('mktCap') && <div className="w-20 shrink-0 text-right px-2 py-2">MKT CAP</div>}
                {isColVisible('capSize') && <div className="w-16 shrink-0 text-center px-2 py-2">CAP SIZE</div>}
                {isColVisible('float') && <div className="w-20 shrink-0 text-right px-2 py-2">FLOAT</div>}
                {isColVisible('shortPct') && <div className="w-20 shrink-0 text-right px-2 py-2">SHORT %</div>}
                {isColVisible('theme') && <div className="w-28 shrink-0 px-2 py-2">THEME</div>}
                {isColVisible('industry') && <div className="w-28 shrink-0 px-2 py-2">INDUSTRY</div>}
                {isColVisible('category') && <div className="w-20 shrink-0 text-center px-2 py-2">CATEGORY</div>}
                {isColVisible('grade') && <div className="w-16 shrink-0 text-center px-2 py-2">GRADE</div>}
                {isColVisible('revGrowth') && <div className="w-24 shrink-0 text-right px-2 py-2">REV GROWTH</div>}
                {isColVisible('epsGrowth') && <div className="w-24 shrink-0 text-right px-2 py-2">EPS GROWTH</div>}
                {isColVisible('catalyst') && <div className="flex-1 min-w-[400px] px-4 py-2">CATALYST / KEY DEVELOPMENTS</div>}
              </div>

              {/* Rows */}
              <div className="flex flex-col divide-y divide-border/20">
                {loading ? (
                  Array(8).fill(0).map((_, i) => (
                    <div key={i} className="flex px-3 py-2">
                      <Skeleton className="h-4 w-full bg-muted/30" />
                    </div>
                  ))
                ) : filteredGappers.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-xs">
                    No movers{categorySlug ? ` for ${categorySlug}` : ''} match current filters.
                  </div>
                ) : (
                  filteredGappers.map((g, idx) => {
                    const isUp = parseFloat(g.changePct) >= 0;
                    const isPremktUp = g.premktChgPct && g.premktChgPct !== '--' && g.premktChgPct.startsWith('+');
                    const isPremktDown = g.premktChgPct && g.premktChgPct !== '--' && !g.premktChgPct.startsWith('+');
                    const isWatched = watchlist.has(g.symbol);

                    return (
                      <div
                        key={g.symbol}
                        className={cn(
                          'flex items-center text-[11px] cursor-pointer border-l-2 border-transparent transition-colors',
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/5',
                          'hover:bg-primary/8 hover:border-primary/50',
                          selectedStock?.symbol === g.symbol && 'bg-primary/12 border-primary'
                        )}
                        onClick={() => setSelectedStock(g)}
                      >
                        {/* Sticky TICKER cell */}
                        <div className={cn(
                          'sticky left-0 z-10 flex items-center gap-1.5 px-3 py-2.5 w-28 shrink-0 border-r border-border/20 font-bold text-slate-100',
                          idx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-950/90',
                          selectedStock?.symbol === g.symbol && 'bg-primary/10'
                        )}>
                          <button
                            onClick={e => { e.stopPropagation(); toggleWatchlist(g.symbol); }}
                            className="shrink-0"
                          >
                            <Star className={cn('h-3 w-3', isWatched ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400')} />
                          </button>
                          {g.logo && (
                            <img src={g.logo} alt="" className="h-4 w-4 rounded-sm shrink-0"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          )}
                          <span className="truncate">{g.symbol}</span>
                        </div>

                        {isColVisible('premkt') && (
                          <div className={cn('w-24 shrink-0 text-right px-2 py-2.5 font-semibold',
                            isPremktUp ? 'text-emerald-400' : isPremktDown ? 'text-rose-400' : 'text-slate-500')}>
                            {g.premktChgPct || '--'}
                          </div>
                        )}
                        {isColVisible('premktVol') && (
                          <div className="w-24 shrink-0 text-right px-2 py-2.5 text-slate-400">
                            {g.premktVol ? formatVolume(g.premktVol) : '--'}
                          </div>
                        )}
                        {isColVisible('chg') && (
                          <div className={cn('w-20 shrink-0 text-right px-2 py-2.5 font-semibold', isUp ? 'text-emerald-400' : 'text-rose-400')}>
                            {isUp ? '+' : ''}{g.changePct}%
                          </div>
                        )}
                        {isColVisible('sparkline') && (
                          <div className="w-16 shrink-0 flex justify-center items-center py-1">
                            <Sparkline data={g.sparkline || []} isUp={isUp} />
                          </div>
                        )}
                        {isColVisible('vol') && (
                          <div className="w-24 shrink-0 text-right px-2 py-2.5 text-slate-400">{formatVolume(g.volume)}</div>
                        )}
                        {isColVisible('price') && (
                          <div className="w-20 shrink-0 text-right px-2 py-2.5 text-slate-200 font-semibold">${g.price.toFixed(2)}</div>
                        )}
                        {isColVisible('prevClose') && (
                          <div className="w-24 shrink-0 text-right px-2 py-2.5 text-slate-400">${g.prevClose.toFixed(2)}</div>
                        )}
                        {isColVisible('mktCap') && (
                          <div className="w-20 shrink-0 text-right px-2 py-2.5 text-slate-300">{g.mktCap || '--'}</div>
                        )}
                        {isColVisible('capSize') && (
                          <div className="w-16 shrink-0 text-center px-2 py-2.5 text-slate-400">{g.capSize || '--'}</div>
                        )}
                        {isColVisible('float') && (
                          <div className="w-20 shrink-0 text-right px-2 py-2.5 text-slate-300">{g.float || '--'}</div>
                        )}
                        {isColVisible('shortPct') && (
                          <div className="w-20 shrink-0 text-right px-2 py-2.5 text-slate-300">{g.shortPct || '--'}</div>
                        )}
                        {isColVisible('theme') && (
                          <div className="w-28 shrink-0 px-2 py-2.5 text-slate-400 truncate">{g.theme || '--'}</div>
                        )}
                        {isColVisible('industry') && (
                          <div className="w-28 shrink-0 px-2 py-2.5 text-muted-foreground truncate">{g.industry || '--'}</div>
                        )}
                        {isColVisible('category') && (
                          <div className="w-20 shrink-0 text-center px-2 py-2.5 text-muted-foreground">{g.category || '--'}</div>
                        )}
                        {isColVisible('grade') && (
                          <div className="w-16 shrink-0 flex justify-center items-center py-2">
                            <Badge variant="outline" className={cn('px-1.5 py-0 h-4 text-[9px] font-bold',
                              g.grade === 'A' ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' :
                              g.grade === 'B' ? 'border-blue-500/40 text-blue-400 bg-blue-500/10' :
                              g.grade === 'C' ? 'border-amber-500/40 text-amber-400 bg-amber-500/10' :
                              'border-red-500/30 text-red-400 bg-red-500/5')}>
                              {g.grade}
                            </Badge>
                          </div>
                        )}
                        {isColVisible('revGrowth') && (
                          <div className={cn('w-24 shrink-0 text-right px-2 py-2.5',
                            g.revGrowth === '--' ? 'text-slate-500' :
                            g.revGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400')}>
                            {g.revGrowth || '--'}
                          </div>
                        )}
                        {isColVisible('epsGrowth') && (
                          <div className={cn('w-24 shrink-0 text-right px-2 py-2.5',
                            g.epsGrowth === '--' ? 'text-slate-500' :
                            g.epsGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400')}>
                            {g.epsGrowth || '--'}
                          </div>
                        )}
                        {isColVisible('catalyst') && (
                          <div className="flex-1 min-w-[400px] px-4 py-2.5 text-slate-300 leading-relaxed text-left group relative"
                            title={g.catalyst}>
                            <span className="line-clamp-2">{g.catalyst || '--'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Unified Intelligence Feed ── */}
        <div className="flex min-h-[200px] h-[54%] flex-col rounded-lg border border-border/60 bg-card/20">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/15 px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Newspaper className="h-3.5 w-3.5 text-primary" />
              <span className="font-bold text-xs uppercase tracking-widest text-foreground">
                Unified Intelligence Feed
              </span>
              <span className="text-[10px] text-muted-foreground">({filteredNews.length})</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="flex items-center gap-1 border border-border/40 rounded px-2 py-0.5 bg-background/50">
                <Filter className="h-3 w-3 hidden sm:block text-muted-foreground" />
                <select className="bg-transparent outline-none text-muted-foreground max-w-[80px] sm:max-w-none"
                  value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                  <option value="all">All Sources</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 border border-border/40 rounded px-2 py-0.5 bg-background/50">
                <Clock className="h-3 w-3 hidden sm:block text-muted-foreground" />
                <select className="bg-transparent outline-none text-muted-foreground"
                  value={sortBy} onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                </select>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="flex flex-col divide-y divide-border/20">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <div key={i} className="p-3">
                    <Skeleton className="h-4 w-3/4 mb-2 bg-muted/30" />
                    <Skeleton className="h-3 w-1/2 bg-muted/30" />
                  </div>
                ))
              ) : filteredNews.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-xs">No news matching criteria.</div>
              ) : (
                filteredNews.map((item) => {
                  const sentiment = getSentiment(item.headline, item.summary);
                  return (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex gap-3 p-2 sm:p-3 hover:bg-muted/10 transition-colors group"
                    >
                      {/* Thumbnail */}
                      <div className="hidden sm:block shrink-0 w-24 h-16 rounded overflow-hidden bg-muted/20 border border-white/5">
                        <img
                          src={item.imageUrl || '/images/news-placeholder.png'}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          onError={e => {
                            const t = e.target as HTMLImageElement;
                            if (t.src !== '/images/news-placeholder.png') t.src = '/images/news-placeholder.png';
                          }}
                        />
                      </div>

                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                            <Globe className="h-3 w-3 hidden sm:block" />
                            {item.source || 'News'} · {formatNewsTime(item.createdAt)}
                          </span>
                          <div className="flex items-center gap-1 flex-wrap">
                            {/* Sentiment badge */}
                            <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 rounded-sm font-semibold', sentimentColor(sentiment))}>
                              {sentiment === 'bullish' ? '▲ Bullish' : sentiment === 'bearish' ? '▼ Bearish' : '— Neutral'}
                            </Badge>
                            {/* Ticker badges */}
                            {item.symbols && item.symbols.length > 0 && (
                              <div className="flex gap-0.5">
                                {item.symbols.slice(0, 3).map(sym => (
                                  <Badge key={sym} variant="outline" className="text-[9px] h-4 px-1 rounded-sm border-muted-foreground/30">
                                    {sym}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {/* Category badge */}
                            <Badge variant="outline" className={cn('text-[9px] h-4 px-1 rounded-sm', item.categoryClass)}>
                              {item.category}
                            </Badge>
                          </div>
                        </div>
                        <div className="font-semibold text-slate-200 group-hover:text-primary transition-colors text-xs sm:text-sm leading-snug">
                          {item.headline}
                        </div>
                        {item.summary && (
                          <div className="text-[10px] sm:text-xs text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                            {item.summary}
                          </div>
                        )}
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* AI Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-primary/20 bg-card p-4 sm:p-6 shadow-2xl shadow-primary/10">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h2 className="text-base sm:text-lg font-bold">AI Intelligence Brief</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowSummaryModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="max-h-[60vh]">
              {isSummarizing ? (
                <div className="space-y-3 py-4">
                  {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-4 bg-muted/40" style={{ width: `${85 - i * 10}%` }} />)}
                  <div className="flex justify-center py-6">
                    <Activity className="h-8 w-8 animate-pulse text-primary/50" />
                  </div>
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none space-y-3 text-muted-foreground font-sans">
                  {aiSummary?.split('\n\n').map((p, i) => <p key={i} className="leading-relaxed">{p}</p>)}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Stock Detail Side Panel */}
      {selectedStock && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-slate-950 border-l border-primary/30 shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col font-sans">
          {/* Panel header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              {selectedStock.logo && (
                <img src={selectedStock.logo} alt="" className="h-9 w-9 rounded bg-white p-0.5 shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-primary">{selectedStock.symbol}</h2>
                  <button onClick={() => toggleWatchlist(selectedStock.symbol)}>
                    <Star className={cn('h-4 w-4', watchlist.has(selectedStock.symbol) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground hover:text-amber-400')} />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{selectedStock.industry} · {selectedStock.category}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedStock(null)}
              className="hover:bg-rose-500/10 hover:text-rose-500">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-5 space-y-6">

              {/* TradingView Chart */}
              <section className="rounded-lg overflow-hidden border border-border/40">
                <TradingViewWidget symbol={selectedStock.symbol} />
              </section>

              {/* Price performance */}
              <section className="bg-gradient-to-br from-card to-slate-900 p-4 rounded-xl border border-border/50 shadow-inner">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground mb-1">Current Price</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-slate-100">${selectedStock.price.toFixed(2)}</span>
                      <span className={cn('text-sm font-bold', parseFloat(selectedStock.changePct) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {parseFloat(selectedStock.changePct) >= 0 ? '▲' : '▼'} {selectedStock.changePct}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-[10px] text-muted-foreground">Pre-Market</div>
                    <div className={cn('text-sm font-bold',
                      selectedStock.premktChgPct === '--' || !selectedStock.premktChgPct ? 'text-slate-500' :
                      selectedStock.premktChgPct.startsWith('+') ? 'text-emerald-400' : 'text-rose-400')}>
                      {selectedStock.premktChgPct || '--'}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground mb-1">Grade</p>
                    <Badge className={cn('text-lg font-black px-3',
                      selectedStock.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' :
                      selectedStock.grade === 'B' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' :
                      'bg-amber-500/20 text-amber-400 border-amber-500/50')}>
                      {selectedStock.grade}
                    </Badge>
                  </div>
                </div>
              </section>

              {/* Catalyst */}
              <section>
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest mb-2">
                  <BrainCircuit className="h-3.5 w-3.5" /> Primary Catalyst
                </div>
                <div className="bg-primary/5 border border-primary/15 rounded-lg p-3 text-slate-200 text-xs leading-relaxed">
                  {selectedStock.catalyst || 'No specific catalyst detected.'}
                </div>
              </section>

              {/* Market Intelligence grid */}
              <section>
                <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Market Intelligence</h3>
                <div className="grid grid-cols-2 gap-px bg-border/30 border border-border/30 rounded-xl overflow-hidden">
                  {[
                    { label: 'Market Cap', value: selectedStock.mktCap },
                    { label: 'Float', value: selectedStock.float },
                    { label: 'Short Interest', value: selectedStock.shortPct },
                    { label: 'Volume (1D)', value: formatVolume(selectedStock.volume) },
                    { label: 'Pre-Mkt Vol', value: selectedStock.premktVol ? formatVolume(selectedStock.premktVol) : '--' },
                    { label: 'Prev Close', value: `$${selectedStock.prevClose.toFixed(2)}` },
                    { label: 'Rev Growth', value: selectedStock.revGrowth, color: selectedStock.revGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400' },
                    { label: 'EPS Growth', value: selectedStock.epsGrowth, color: selectedStock.epsGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400' },
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-900/60 p-3">
                      <p className="text-[9px] uppercase text-muted-foreground mb-1">{item.label}</p>
                      <p className={cn('text-sm font-bold', item.color || 'text-slate-200')}>{item.value || '--'}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Sparkline */}
              {selectedStock.sparkline && selectedStock.sparkline.length >= 2 && (
                <section>
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                    <TrendingUp className="inline h-3 w-3 mr-1" /> 7-Day Price Trend
                  </h3>
                  <div className="bg-card/50 border border-border/30 rounded-lg p-3 flex items-center justify-center">
                    <Sparkline data={selectedStock.sparkline} isUp={parseFloat(selectedStock.changePct) >= 0} />
                  </div>
                </section>
              )}

              {/* Live Mentions */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Live Mentions</h3>
                  <Badge variant="outline" className="text-[9px] border-primary/20 text-primary">REAL-TIME</Badge>
                </div>
                <div className="space-y-2">
                  {filteredNews.filter(n => n.symbols.includes(selectedStock.symbol)).slice(0, 5).map((item, i) => {
                    const sentiment = getSentiment(item.headline, item.summary);
                    return (
                      <a key={i} href={item.url} target="_blank" rel="noreferrer"
                        className="block p-3 rounded-lg border border-border/40 hover:border-primary/40 bg-muted/5 transition-all group">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[9px] text-muted-foreground">{item.source} · {formatNewsTime(item.createdAt)}</span>
                          <Badge variant="outline" className={cn('text-[8px] h-3.5 px-1', sentimentColor(sentiment))}>
                            {sentiment}
                          </Badge>
                        </div>
                        <p className="text-xs font-medium text-slate-300 group-hover:text-primary transition-colors line-clamp-2">{item.headline}</p>
                      </a>
                    );
                  })}
                  {filteredNews.filter(n => n.symbols.includes(selectedStock.symbol)).length === 0 && (
                    <div className="text-center py-6 border border-dashed border-border/40 rounded-lg">
                      <p className="text-xs text-muted-foreground">No mentions for {selectedStock.symbol}</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border bg-card/30 flex gap-2">
            <Button className="flex-1 bg-primary text-primary-foreground font-bold text-xs"
              onClick={() => window.open(`https://seekingalpha.com/symbol/${selectedStock.symbol}`, '_blank')}>
              SeekingAlpha
            </Button>
            <Button variant="outline" className="flex-1 border-primary/20 hover:bg-primary/10 text-xs"
              onClick={() => window.open(`https://finance.yahoo.com/quote/${selectedStock.symbol}`, '_blank')}>
              Yahoo Finance
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
