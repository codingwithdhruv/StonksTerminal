'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity, Newspaper, BrainCircuit, Filter, Clock, Globe, X,
  Star, Download, SlidersHorizontal, TrendingUp, ChevronDown,
  Search, BarChart2, Zap
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
  mktCapRaw?: number;
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

function SparklineLarge({ data, isUp }: { data: number[]; isUp: boolean }) {
  if (!data || data.length < 2) return null;
  const W = 440, H = 60;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return `${x},${y}`;
  });
  const color = isUp ? '#10b981' : '#f43f5e';
  const fillColor = isUp ? 'rgba(16,185,129,0.08)' : 'rgba(244,63,94,0.08)';
  const fillPts = `0,${H} ${pts.join(' ')} ${W},${H}`;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polygon points={fillPts} fill={fillColor} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function TradingViewWidget({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'tradingview-widget-container__widget';
    container.style.height = '100%';
    ref.current.appendChild(container);
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
      hide_legend: false,
      allow_symbol_change: false,
      support_host: 'https://www.tradingview.com',
    });
    ref.current.appendChild(script);
  }, [symbol]);
  return (
    <div className="tradingview-widget-container" style={{ height: '420px' }} ref={ref} />
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
  const [filterTicker, setFilterTicker] = useState('');
  const [filterCapSize, setFilterCapSize] = useState('all');
  const [filterGrade, setFilterGrade] = useState('all');
  const [filterMinGap, setFilterMinGap] = useState(0);
  const [filterMinPrice, setFilterMinPrice] = useState(0);
  const [filterMaxPrice, setFilterMaxPrice] = useState(1000);
  const [filterMinMktCap, setFilterMinMktCap] = useState(0);
  const [filterMinVol, setFilterMinVol] = useState(0);
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

  const decodeHtml = (text: string): string => {
    if (!text) return text;
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;|&#34;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  };

  // Filtered gappers
  const filteredGappers = useMemo(() => {
    return gappers.filter(g => {
      // Ticker search
      if (filterTicker && !g.symbol.toLowerCase().includes(filterTicker.toLowerCase())) return false;
      
      // Cap Size
      if (filterCapSize !== 'all' && g.capSize !== filterCapSize) return false;
      
      // Grade
      if (filterGrade !== 'all' && g.grade !== filterGrade) return false;
      
      // Sliders
      const gap = parseFloat(g.premktChgPct || '0');
      if (filterMinGap !== 0 && gap < filterMinGap) return false;
      
      if (g.price < filterMinPrice || g.price > filterMaxPrice) return false;
      
      if (filterMinMktCap !== 0 && (g.mktCapRaw || 0) < filterMinMktCap) return false;
      
      if (filterMinVol !== 0 && g.volume < filterMinVol) return false;

      return true;
    });
  }, [gappers, filterTicker, filterCapSize, filterGrade, filterMinGap, filterMinPrice, filterMaxPrice, filterMinMktCap, filterMinVol]);

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
    <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8 relative">
      <div className="noise-overlay" />

      {/* Header section with refined typography and spacing */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-2xl sm:text-3xl font-unbounded font-black tracking-tighter uppercase text-white"
            >
              Market <span className="text-primary italic">Movers</span>
            </motion.h1>
            <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest px-2.5 h-6">
              Live Terminal
            </Badge>
          </div>
          <p className="text-[10px] sm:text-[11px] text-muted-foreground/60 uppercase font-bold tracking-[0.3em] mt-1">
            Real-time pre-market intelligence · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "h-10 px-4 rounded-xl font-unbounded text-[10px] font-black uppercase tracking-widest transition-all",
                showFilters ? "bg-primary text-slate-950 border-primary" : "bg-white/[0.03] border-white/10 hover:bg-white/[0.08]"
              )}
            >
              <Filter className={cn("mr-2 h-3.5 w-3.5", showFilters ? "fill-slate-950" : "")} />
              Filters
              {(filterMinGap > 0 || filterMinPrice > 0 || filterMaxPrice < 1000 || filterMinMktCap > 0 || filterMinVol > 0 || filterTicker) && (
                <span className="ml-2 h-2 w-2 rounded-full bg-slate-950 animate-pulse" />
              )}
            </Button>

            <AnimatePresence>
              {showFilters && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-3 z-[100] w-[320px] glass-panel border-white/10 p-6 rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]"
                >
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-unbounded text-[10px] font-black uppercase tracking-widest text-primary">Advanced Filters</h3>
                    <button 
                      onClick={() => {
                        setFilterTicker('');
                        setFilterMinGap(0);
                        setFilterMinPrice(0);
                        setFilterMaxPrice(1000);
                        setFilterMinMktCap(0);
                        setFilterMinVol(0);
                        setFilterCapSize('all');
                        setFilterGrade('all');
                      }}
                      className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-white transition-colors"
                    >
                      Reset All
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Symbol Search</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40" />
                        <input 
                          type="text" 
                          placeholder="AAPL, TSLA..."
                          value={filterTicker}
                          onChange={(e) => setFilterTicker(e.target.value)}
                          className="w-full h-10 bg-white/[0.03] border border-white/5 rounded-xl pl-10 pr-4 text-xs font-bold text-white focus:outline-none focus:border-primary/50 transition-all"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Min Gap (%)</label>
                        <span className="text-[10px] font-mono font-black text-primary">+{filterMinGap}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="50" step="1"
                        value={filterMinGap}
                        onChange={(e) => setFilterMinGap(Number(e.target.value))}
                        className="w-full accent-primary h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Price Range ($)</label>
                        <span className="text-[10px] font-mono font-black text-white">${filterMinPrice} - ${filterMaxPrice}</span>
                      </div>
                      <div className="flex flex-col gap-2">
                        <input 
                          type="range" min="0" max="1000" step="5"
                          value={filterMinPrice}
                          onChange={(e) => setFilterMinPrice(Number(e.target.value))}
                          className="w-full accent-primary h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                        />
                        <input 
                          type="range" min="0" max="1000" step="5"
                          value={filterMaxPrice}
                          onChange={(e) => setFilterMaxPrice(Number(e.target.value))}
                          className="w-full accent-primary h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Min Mkt Cap (M)</label>
                        <span className="text-[10px] font-mono font-black text-white">{filterMinMktCap >= 1000 ? (filterMinMktCap/1000).toFixed(1) + 'B' : filterMinMktCap + 'M'}</span>
                      </div>
                      <input 
                        type="range" min="0" max="10000" step="100"
                        value={filterMinMktCap}
                        onChange={(e) => setFilterMinMktCap(Number(e.target.value))}
                        className="w-full accent-primary h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Min Volume</label>
                        <span className="text-[10px] font-mono font-black text-white">{formatVolume(filterMinVol)}</span>
                      </div>
                      <input 
                        type="range" min="0" max="10000000" step="100000"
                        value={filterMinVol}
                        onChange={(e) => setFilterMinVol(Number(e.target.value))}
                        className="w-full accent-primary h-1.5 bg-white/5 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSummarize}
            disabled={isSummarizing || filteredNews.length === 0}
            className="h-10 px-4 rounded-xl font-unbounded text-[10px] font-black uppercase tracking-widest bg-white/[0.03] border-white/10 hover:bg-white/[0.08] hidden sm:flex"
          >
            <BrainCircuit className={cn("mr-2 h-3.5 w-3.5", isSummarizing ? "animate-pulse" : "")} />
            {isSummarizing ? 'Analyzing...' : 'Intel Summary'}
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.open('/api/market', '_blank')}
            className="h-10 w-10 p-0 rounded-xl bg-white/[0.03] border-white/10 hover:bg-white/[0.08]"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 relative z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex min-h-[300px] h-[48%] flex-col rounded-2xl glass-panel overflow-hidden shadow-2xl shadow-black/40"
        >
          <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <BarChart2 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="font-unbounded text-[10px] font-black uppercase tracking-widest text-foreground">
                  Market Movers {categorySlug ? `// ${categorySlug}` : ''}
                </span>
                <p className="text-[9px] text-muted-foreground/60 uppercase font-medium mt-0.5">
                  {filteredGappers.length} active symbols detected
                </p>
              </div>
            </div>
            <div className="relative" ref={colChooserRef}>
              <button onClick={() => setShowColChooser(s => !s)}
                className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground hover:text-primary px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.03] hover:bg-white/[0.08] transition-all">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Columns <ChevronDown className={cn("h-3 w-3 transition-transform", showColChooser && "rotate-180")} />
              </button>
              <AnimatePresence>
                {showColChooser && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 z-50 bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-4 grid grid-cols-2 gap-2 w-72 backdrop-blur-xl"
                  >
                    {ALL_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-2 text-[10px] font-medium cursor-pointer hover:text-primary transition-colors py-1">
                        <input type="checkbox" checked={isColVisible(col.key)} onChange={() => toggleCol(col.key)}
                          className="accent-primary h-3.5 w-3.5 rounded border-white/10" />
                        {col.label}
                      </label>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex-1 overflow-auto scrollbar-thin">
            <div className="min-w-max">
              {/* Header row */}
              <div className="sticky top-0 z-20 flex bg-slate-950/80 backdrop-blur-md border-b border-white/5 text-[9px] font-black text-muted-foreground uppercase tracking-[0.15em]">
                {/* Sticky ticker header */}
                <div className="sticky left-0 z-30 bg-slate-950/90 flex items-center px-4 py-3 w-32 shrink-0 border-r border-white/5">
                  TICKER
                </div>
                {isColVisible('premkt') && <div className="w-24 shrink-0 text-right px-3 py-3">PREMKT %</div>}
                {isColVisible('premktVol') && <div className="w-28 shrink-0 text-right px-3 py-3">PREMKT VOL</div>}
                {isColVisible('chg') && <div className="w-24 shrink-0 text-right px-3 py-3">CHG %</div>}
                {isColVisible('sparkline') && <div className="w-20 shrink-0 text-center px-3 py-3">SPARK</div>}
                {isColVisible('vol') && <div className="w-28 shrink-0 text-right px-3 py-3">VOL (1D)</div>}
                {isColVisible('price') && <div className="w-24 shrink-0 text-right px-3 py-3">PRICE</div>}
                {isColVisible('prevClose') && <div className="w-28 shrink-0 text-right px-3 py-3">PREV CLOSE</div>}
                {isColVisible('mktCap') && <div className="w-24 shrink-0 text-right px-3 py-3">MKT CAP</div>}
                {isColVisible('capSize') && <div className="w-20 shrink-0 text-center px-3 py-3">SIZE</div>}
                {isColVisible('float') && <div className="w-24 shrink-0 text-right px-3 py-3">FLOAT</div>}
                {isColVisible('shortPct') && <div className="w-24 shrink-0 text-right px-3 py-3">SHORT %</div>}
                {isColVisible('theme') && <div className="w-32 shrink-0 px-3 py-3">THEME</div>}
                {isColVisible('grade') && <div className="w-20 shrink-0 text-center px-3 py-3">GRADE</div>}
                {isColVisible('catalyst') && <div className="flex-1 min-w-[450px] px-6 py-3">INTELLIGENCE / CATALYST</div>}
              </div>

              {/* Rows */}
              <div className="flex flex-col">
                {loading ? (
                  Array(10).fill(0).map((_, i) => (
                    <div key={i} className="flex px-4 py-3 border-b border-white/[0.02]">
                      <Skeleton className="h-4 w-full bg-white/[0.03] rounded-full" />
                    </div>
                  ))
                ) : filteredGappers.length === 0 ? (
                  <div className="p-12 text-center">
                    <p className="text-muted-foreground/60 text-xs font-medium italic">
                      No movers detected matching these constraints.
                    </p>
                  </div>
                ) : (
                  filteredGappers.map((g, idx) => {
                    const isUp = parseFloat(g.changePct) >= 0;
                    const isPremktUp = g.premktChgPct && g.premktChgPct !== '--' && g.premktChgPct.startsWith('+');
                    const isPremktDown = g.premktChgPct && g.premktChgPct !== '--' && !g.premktChgPct.startsWith('+');
                    const isWatched = watchlist.has(g.symbol);

                    return (
                      <motion.div
                        key={g.symbol}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + idx * 0.02 }}
                        className={cn(
                          'flex items-center text-[11px] font-mono cursor-pointer border-l-2 border-transparent transition-all duration-300 group/row',
                          idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]',
                          'hover:bg-primary/5 hover:border-primary/40',
                          selectedStock?.symbol === g.symbol && 'bg-primary/10 border-primary shadow-[inset_4px_0_12px_rgba(112,255,155,0.05)]'
                        )}
                        onClick={() => setSelectedStock(g)}
                      >
                        {/* Sticky TICKER cell */}
                        <div className={cn(
                          'sticky left-0 z-10 flex items-center gap-2.5 px-4 py-3.5 w-32 shrink-0 font-black text-slate-100',
                          'border-r border-white/5 transition-colors',
                          idx % 2 === 0 ? 'bg-slate-950' : 'bg-slate-900/40',
                          selectedStock?.symbol === g.symbol && '!bg-slate-900',
                          'group-hover/row:bg-slate-900'
                        )}>
                          <button
                            onClick={e => { e.stopPropagation(); toggleWatchlist(g.symbol); }}
                            className="shrink-0 transition-transform active:scale-75"
                          >
                            <Star className={cn('h-3.5 w-3.5', isWatched ? 'fill-amber-400 text-amber-400' : 'text-white/10 hover:text-amber-400')} />
                          </button>
                          <span className="truncate tracking-tight font-unbounded text-[10px]">{g.symbol}</span>
                        </div>

                        {isColVisible('premkt') && (
                          <div className={cn('w-24 shrink-0 text-right px-3 py-3 font-bold',
                            isPremktUp ? 'text-emerald-400' : isPremktDown ? 'text-rose-400' : 'text-slate-500')}>
                            {g.premktChgPct || '--'}
                          </div>
                        )}
                        {isColVisible('premktVol') && (
                          <div className="w-28 shrink-0 text-right px-3 py-3 text-slate-400 tabular-nums">
                            {g.premktVol ? formatVolume(g.premktVol) : '--'}
                          </div>
                        )}
                        {isColVisible('chg') && (
                          <div className={cn('w-24 shrink-0 text-right px-3 py-3 font-bold', isUp ? 'text-emerald-400' : 'text-rose-400')}>
                            {isUp ? '+' : ''}{g.changePct}%
                          </div>
                        )}
                        {isColVisible('sparkline') && (
                          <div className="w-20 shrink-0 flex justify-center items-center py-2">
                            <Sparkline data={g.sparkline || []} isUp={isUp} />
                          </div>
                        )}
                        {isColVisible('vol') && (
                          <div className="w-28 shrink-0 text-right px-3 py-3 text-slate-400 tabular-nums">{formatVolume(g.volume)}</div>
                        )}
                        {isColVisible('price') && (
                          <div className="w-24 shrink-0 text-right px-3 py-3 text-slate-100 font-bold tabular-nums">${g.price.toFixed(2)}</div>
                        )}
                        {isColVisible('prevClose') && (
                          <div className="w-28 shrink-0 text-right px-3 py-3 text-slate-500 tabular-nums">${g.prevClose.toFixed(2)}</div>
                        )}
                        {isColVisible('mktCap') && (
                          <div className="w-24 shrink-0 text-right px-3 py-3 text-slate-300 tabular-nums">{g.mktCap || '--'}</div>
                        )}
                        {isColVisible('capSize') && (
                          <div className="w-20 shrink-0 text-center px-3 py-3">
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-slate-400 text-[9px] font-bold">
                              {g.capSize || '--'}
                            </span>
                          </div>
                        )}
                        {isColVisible('float') && (
                          <div className="w-24 shrink-0 text-right px-3 py-3 text-slate-400 tabular-nums">{g.float || '--'}</div>
                        )}
                        {isColVisible('shortPct') && (
                          <div className="w-24 shrink-0 text-right px-3 py-3 text-rose-400/80 font-medium tabular-nums">{g.shortPct || '--'}</div>
                        )}
                        {isColVisible('theme') && (
                          <div className="w-32 shrink-0 px-3 py-3 text-slate-400 truncate font-sans font-medium">{g.theme || '--'}</div>
                        )}
                        {isColVisible('grade') && (
                          <div className="w-20 shrink-0 flex justify-center items-center py-2">
                            <Badge variant="outline" className={cn('px-2 py-0 h-4 text-[9px] font-black border-none shadow-sm',
                              g.grade === 'A' ? 'text-emerald-400 bg-emerald-500/10' :
                              g.grade === 'B' ? 'text-blue-400 bg-blue-500/10' :
                              g.grade === 'C' ? 'text-amber-400 bg-amber-500/10' :
                              'text-rose-400 bg-rose-500/10')}>
                              {g.grade}
                            </Badge>
                          </div>
                        )}
                        {isColVisible('catalyst') && (
                          <div className="flex-1 min-w-[450px] px-6 py-3 text-slate-300 font-sans leading-relaxed text-left group relative"
                            title={g.catalyst}>
                            <span className="line-clamp-1 group-hover/row:line-clamp-none transition-all">{g.catalyst || '--'}</span>
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Unified Intelligence Feed ── */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="flex min-h-[300px] h-[52%] flex-col rounded-2xl glass-panel overflow-hidden shadow-2xl shadow-black/40"
        >
          <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
                <Newspaper className="h-4 w-4 text-primary" />
              </div>
              <div>
                <span className="font-unbounded text-[10px] font-black uppercase tracking-widest text-foreground">
                  Unified Intelligence Feed
                </span>
                <p className="text-[9px] text-muted-foreground/60 uppercase font-medium mt-0.5">
                  {filteredNews.length} high-confidence signals
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="flex items-center gap-2 border border-white/5 rounded-lg px-3 py-1.5 bg-white/[0.03]">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <select className="bg-transparent outline-none text-muted-foreground font-bold appearance-none cursor-pointer"
                  value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
                  <option value="all">Sources</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 border border-white/5 rounded-lg px-3 py-1.5 bg-white/[0.03]">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <select className="bg-transparent outline-none text-muted-foreground font-bold appearance-none cursor-pointer"
                  value={sortBy} onChange={e => setSortBy(e.target.value as 'newest' | 'oldest')}>
                  <option value="newest">Recent</option>
                  <option value="oldest">Historical</option>
                </select>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 scrollbar-thin">
            <div className="flex flex-col">
              {loading ? (
                Array(6).fill(0).map((_, i) => (
                  <div key={i} className="p-5 border-b border-white/[0.02]">
                    <Skeleton className="h-5 w-3/4 mb-3 bg-white/[0.03] rounded-full" />
                    <Skeleton className="h-4 w-1/2 bg-white/[0.03] rounded-full" />
                  </div>
                ))
              ) : filteredNews.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground/60 text-xs font-medium italic">
                  No signals detected for the current criteria.
                </div>
              ) : (
                filteredNews.map((item, idx) => {
                  const sentiment = getSentiment(item.headline, item.summary);
                  return (
                    <motion.a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.05 }}
                      className="flex gap-4 p-5 hover:bg-white/[0.02] transition-all border-b border-white/[0.02] group"
                    >
                      {/* Thumbnail with overlay */}
                      <div className="hidden sm:block shrink-0 w-32 h-20 rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 relative">
                        <img
                          src={item.imageUrl || '/images/news-placeholder.png'}
                          alt=""
                          className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-110"
                          onError={e => {
                            const t = e.target as HTMLImageElement;
                            if (t.src !== '/images/news-placeholder.png') t.src = '/images/news-placeholder.png';
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-primary/80 flex items-center gap-1.5">
                            <Globe className="h-3 w-3" />
                            {item.source || 'INTEL'}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatNewsTime(item.createdAt)}
                          </span>
                          <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 rounded font-black border-none shadow-sm', sentimentColor(sentiment))}>
                            {sentiment === 'bullish' ? '▲ BULL' : sentiment === 'bearish' ? '▼ BEAR' : '— NEUT'}
                          </Badge>
                          {item.symbols && item.symbols.length > 0 && item.symbols.slice(0, 3).map(sym => (
                            <Badge key={sym} variant="outline" className="text-[9px] h-4 px-1.5 rounded bg-white/5 border-white/5 text-slate-300 font-bold">
                              {sym}
                            </Badge>
                          ))}
                        </div>
                        <div className="font-bold text-slate-100 group-hover:text-primary transition-colors text-sm sm:text-base leading-tight tracking-tight">
                          {decodeHtml(item.headline)}
                        </div>
                        {item.summary && (
                          <div className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed font-medium">
                            {decodeHtml(item.summary)}
                          </div>
                        )}
                      </div>
                    </motion.a>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </motion.div>
      </div>

      {/* AI Summary Modal */}
      <AnimatePresence>
        {showSummaryModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
              onClick={() => setShowSummaryModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]"
            >
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                    <BrainCircuit className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-unbounded font-black uppercase tracking-tighter">Intelligence Brief</h2>
                    <p className="text-[10px] text-muted-foreground/60 uppercase font-bold tracking-widest">Powered by Antigravity OS</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSummaryModal(false)} className="rounded-full hover:bg-white/5">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <ScrollArea className="max-h-[60vh] pr-4">
                {isSummarizing ? (
                  <div className="space-y-4 py-4">
                    {Array(4).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-5 bg-white/[0.03] rounded-full" style={{ width: `${85 - i * 10}%` }} />
                    ))}
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                      <div className="relative">
                        <Activity className="h-10 w-10 animate-pulse text-primary/50" />
                        <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 scale-150" />
                      </div>
                      <span className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em]">Processing Signals…</span>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none space-y-4 text-slate-300 font-sans leading-relaxed">
                    {aiSummary?.split('\n\n').map((p, i) => (
                      <motion.p 
                        key={i} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="text-sm sm:text-base text-slate-200/90 font-medium"
                      >
                        {p}
                      </motion.p>
                    ))}
                  </div>
                )}
              </ScrollArea>
              
              {!isSummarizing && (
                <div className="mt-8 pt-6 border-t border-white/5 flex justify-end">
                  <Button onClick={() => setShowSummaryModal(false)} className="rounded-xl bg-white text-slate-950 font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all px-6 h-10">
                    Dismiss Brief
                  </Button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stock Detail Side Panel */}
      <AnimatePresence>
        {selectedStock && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-slate-950/40 backdrop-blur-sm sm:hidden"
              onClick={() => setSelectedStock(null)}
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-[120] w-full sm:w-[580px] bg-slate-950/95 backdrop-blur-3xl border-l border-white/10 shadow-[-32px_0_64px_-12px_rgba(0,0,0,0.5)] flex flex-col"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-white p-1.5 shrink-0 shadow-xl overflow-hidden">
                    {selectedStock.logo ? (
                      <img src={selectedStock.logo} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center font-black text-slate-950 text-sm">
                        {selectedStock.symbol[0]}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-unbounded font-black tracking-tighter text-white">{selectedStock.symbol}</h2>
                      <button onClick={() => toggleWatchlist(selectedStock.symbol)} className="transition-transform active:scale-75">
                        <Star className={cn('h-5 w-5', watchlist.has(selectedStock.symbol) ? 'fill-amber-400 text-amber-400' : 'text-white/10 hover:text-amber-400')} />
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                      {selectedStock.industry} · <span className="text-primary/60">{selectedStock.category}</span>
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedStock(null)}
                  className="rounded-full hover:bg-rose-500/10 hover:text-rose-500 transition-colors">
                  <X className="h-6 w-6" />
                </Button>
              </div>

              <ScrollArea className="flex-1 px-6">
                <div className="py-8 space-y-8">

                  {/* TradingView Chart Container */}
                  <section className="rounded-3xl overflow-hidden border border-white/10 bg-slate-900 shadow-2xl">
                    <TradingViewWidget symbol={selectedStock.symbol} />
                  </section>

                  {/* Price Performance Grid */}
                  <section className="grid grid-cols-2 gap-4">
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
                      <p className="text-[9px] uppercase text-muted-foreground font-black tracking-[0.2em] mb-3">Live Valuation</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-mono font-black text-white tabular-nums">${selectedStock.price.toFixed(2)}</span>
                        <span className={cn('text-xs font-bold font-mono', parseFloat(selectedStock.changePct) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {parseFloat(selectedStock.changePct) >= 0 ? '▲' : '▼'} {selectedStock.changePct}%
                        </span>
                      </div>
                    </div>
                    <div className="glass-panel p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
                      <p className="text-[9px] uppercase text-muted-foreground font-black tracking-[0.2em] mb-3">Pre-Market Chg</p>
                      <div className={cn('text-3xl font-mono font-black tabular-nums',
                        selectedStock.premktChgPct === '--' || !selectedStock.premktChgPct ? 'text-slate-600' :
                        selectedStock.premktChgPct.startsWith('+') ? 'text-emerald-400' : 'text-rose-400')}>
                        {selectedStock.premktChgPct || '--'}
                      </div>
                    </div>
                  </section>

                  {/* Catalyst Section */}
                  <section className="glass-panel p-6 rounded-3xl border border-white/5 bg-primary/5 shadow-[inset_0_0_24px_rgba(112,255,155,0.03)]">
                    <div className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-[0.3em] mb-4">
                      <BrainCircuit className="h-4 w-4" /> Intelligence Brief
                    </div>
                    <div className="text-slate-200 text-sm leading-relaxed font-medium">
                      {selectedStock.catalyst || 'No specific high-impact catalyst detected for this symbol.'}
                    </div>
                  </section>

                  {/* Market Intelligence Grid */}
                  <section>
                    <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5" /> Market Metrics
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Market Cap', value: selectedStock.mktCap },
                        { label: 'Float Size', value: selectedStock.float },
                        { label: 'Short Int %', value: selectedStock.shortPct, color: 'text-rose-400' },
                        { label: 'Avg Vol (1D)', value: formatVolume(selectedStock.volume) },
                        { label: 'Pre-Mkt Vol', value: selectedStock.premktVol ? formatVolume(selectedStock.premktVol) : '--' },
                        { label: 'Prev Close', value: `$${selectedStock.prevClose.toFixed(2)}` },
                        { label: 'Revenue Gr', value: selectedStock.revGrowth, color: selectedStock.revGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400' },
                        { label: 'EPS Growth', value: selectedStock.epsGrowth, color: selectedStock.epsGrowth?.startsWith('+') ? 'text-emerald-400' : 'text-rose-400' },
                      ].map((item, i) => (
                        <div key={i} className="bg-white/[0.03] border border-white/5 p-4 rounded-xl group hover:bg-white/[0.06] transition-colors">
                          <p className="text-[9px] uppercase text-muted-foreground font-bold tracking-widest mb-1 group-hover:text-primary/60 transition-colors">{item.label}</p>
                          <p className={cn('text-base font-mono font-black tabular-nums', item.color || 'text-slate-100')}>{item.value || '--'}</p>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Trend Visualization */}
                  {selectedStock.sparkline && selectedStock.sparkline.length >= 2 && (
                    <section>
                      <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">
                        <TrendingUp className="inline h-3.5 w-3.5 mr-2" /> 10-Day Delta
                      </h3>
                      <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-6 shadow-inner">
                        <SparklineLarge data={selectedStock.sparkline} isUp={parseFloat(selectedStock.changePct) >= 0} />
                      </div>
                    </section>
                  )}

                  {/* Live Feed Context */}
                  <section className="pb-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Contextual Signals</h3>
                      <Badge variant="outline" className="text-[9px] font-black bg-primary/10 border-none text-primary uppercase tracking-widest px-2">Live Sync</Badge>
                    </div>
                    <div className="space-y-3">
                      {filteredNews.filter(n => n.symbols.includes(selectedStock.symbol)).slice(0, 5).map((item, i) => {
                        const sentiment = getSentiment(item.headline, item.summary);
                        return (
                          <motion.a 
                            key={i} 
                            href={item.url} 
                            target="_blank" 
                            rel="noreferrer"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="block p-4 rounded-2xl border border-white/5 hover:border-primary/40 bg-white/[0.01] hover:bg-white/[0.03] transition-all group"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[9px] font-bold text-muted-foreground uppercase">{item.source} · {formatNewsTime(item.createdAt)}</span>
                              <Badge variant="outline" className={cn('text-[8px] font-black h-4 px-1.5 border-none', sentimentColor(sentiment))}>
                                {sentiment.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xs font-bold text-slate-200 group-hover:text-primary transition-colors line-clamp-2 leading-snug">{item.headline}</p>
                          </motion.a>
                        );
                      })}
                      {filteredNews.filter(n => n.symbols.includes(selectedStock.symbol)).length === 0 && (
                        <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl">
                          <p className="text-xs font-medium text-muted-foreground/60 italic">No historical signals for {selectedStock.symbol}</p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </ScrollArea>

              <div className="p-6 border-t border-white/5 bg-slate-900/50 backdrop-blur-xl flex gap-3">
                <Button className="flex-1 bg-primary text-slate-950 font-black text-[11px] uppercase tracking-widest rounded-xl h-12 shadow-lg shadow-primary/10 hover:opacity-90"
                  onClick={() => window.open(`https://seekingalpha.com/symbol/${selectedStock.symbol}`, '_blank')}>
                  SeekingAlpha
                </Button>
                <Button variant="outline" className="flex-1 border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-white font-black text-[11px] uppercase tracking-widest rounded-xl h-12"
                  onClick={() => window.open(`https://finance.yahoo.com/quote/${selectedStock.symbol}`, '_blank')}>
                  Yahoo Finance
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
