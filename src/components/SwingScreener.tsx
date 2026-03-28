import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, ScanSearch, AlertCircle, Clock, ArrowUp, ArrowDown, CandlestickChart, Flame, Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getScreenerStore, updateScreenerStore, type SwingStockData } from "@/lib/screenerStore";
import { SwingAnalysis } from "@/components/SwingAnalysis";
import { AiInsightButton, AiInsightPanel } from "@/components/AiInsightRow";
import { StockChartPopup } from "@/components/StockChartPopup";
import { format } from "date-fns";
import { useBandarmology } from "@/hooks/useBandarmology";
import { useAkSmartMoney } from "@/hooks/useAkSmartMoney";
import { AkSmartMoneyBadgeComponent } from "@/components/AkSmartMoneyBadge";

type SwingType = "ketat_allma" | "ketat_pertama" | "bottom_fishing";
type SortKey = "ticker" | "close" | "value" | "ii" | "tma20" | "changePct" | "actionScore";
type SortDir = "asc" | "desc";
const BATCH_SIZE = 100;
const ANALYSIS_DELAY_MS = 500;
const MAX_AUTO_ANALYZE = 30;

const SWING_LABELS: Record<SwingType, { name: string; btn: string; desc: string }> = {
  ketat_allma: { name: "Ketat + Above All MA", btn: "Scan Ketat + All MA", desc: "VOK + Bullish/MSP + harga di atas semua MA (MA3-400) & BB Bottom" },
  ketat_pertama: { name: "Ketat Pertama", btn: "Scan Ketat Pertama", desc: "Hari PERTAMA masuk Ketat — kemarin tidak Ketat, hari ini Ketat" },
  bottom_fishing: { name: "Big MA Bottom Fishing", btn: "Scan Bottom Fishing", desc: "VOK + is≥0 + harga tepat di bawah MA besar (jarak maks 2%)" },
};

export interface CachedAnalysis {
  ticker: string;
  bestDay: { day: number; winPct: number; avgPct: number; gapUpPct: number; score: number } | null;
  altDay: { day: number; winPct: number; avgPct: number; gapUpPct: number; score: number } | null;
  totalEvents: number;
  actionScore: number;
}

const _store = getScreenerStore();

// Module-level cache for analysis results
const analysisCache: Record<string, Record<string, CachedAnalysis>> = {
  ketat_allma: {},
  ketat_pertama: {},
  bottom_fishing: {},
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SwingScreener() {
  const [activeSwing, setActiveSwing] = useState<SwingType>("ketat_allma");
  const [stocks, setStocks] = useState<Record<SwingType, SwingStockData[]>>({ ..._store.swingStocks });
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Record<SwingType, Date | null>>({ ..._store.swingLastScanTime });
  const [hasScanRun, setHasScanRun] = useState<Record<SwingType, boolean>>({ ..._store.swingHasScanRun });
  const [scanProgress, setScanProgress] = useState("");
  const [scanProgressPct, setScanProgressPct] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [searchTicker, setSearchTicker] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("actionScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [analysisTicker, setAnalysisTicker] = useState<string | null>(null);
  const [chartTicker, setChartTicker] = useState<SwingStockData | null>(null);
  const [, forceUpdate] = useState(0);
  const abortRef = useRef(false);
  const [aiExpandedTickers, setAiExpandedTickers] = useState<Set<string>>(new Set());
  const toggleAiExpand = (ticker: string) => setAiExpandedTickers(prev => {
    const next = new Set(prev);
    next.has(ticker) ? next.delete(ticker) : next.add(ticker);
    return next;
  });

  const { items: bandarItems } = useBandarmology();
  const { getBadge: getAkBadge } = useAkSmartMoney(bandarItems);

  // Auto-analysis state
  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
  const [autoAnalyzeProgress, setAutoAnalyzeProgress] = useState({ done: 0, total: 0 });
  const autoAnalyzeAbortRef = useRef(false);

  const handleAnalysisData = useCallback((ticker: string, data: any) => {
    if (!data) return;
    const score = data.bestDay?.score || 0;
    analysisCache[activeSwing][ticker] = {
      ticker,
      bestDay: data.bestDay || null,
      altDay: data.altDay || null,
      totalEvents: data.totalEvents || 0,
      actionScore: score,
    };
    forceUpdate(n => n + 1);
  }, [activeSwing]);

  // Load from DB cache
  const loadCacheFromDB = useCallback(async (screenerType: SwingType, tickers: string[]): Promise<Set<string>> => {
    const today = todayStr();
    const cached = new Set<string>();
    try {
      const { data, error } = await supabase
        .from("swing_analysis_cache" as any)
        .select("*")
        .eq("screener_name", screenerType)
        .eq("tanggal_cache", today)
        .in("ticker", tickers);
      if (error || !data) return cached;
      for (const row of data as any[]) {
        cached.add(row.ticker);
        analysisCache[screenerType][row.ticker] = {
          ticker: row.ticker,
          bestDay: row.best_day || null,
          altDay: row.alt_day || null,
          totalEvents: row.total_events || 0,
          actionScore: row.action_score || 0,
        };
      }
      forceUpdate(n => n + 1);
    } catch { /* ignore */ }
    return cached;
  }, []);

  // Save to DB cache
  const saveToCacheDB = useCallback(async (ticker: string, screenerType: SwingType, data: any) => {
    const today = todayStr();
    const bestDay = data.bestDay || null;
    const altDay = data.altDay || null;
    const ranking = data.ranking || [];
    const summary = data.summary || [];
    try {
      await supabase.from("swing_analysis_cache" as any).upsert({
        ticker,
        screener_name: screenerType,
        tanggal_cache: today,
        entry_day_rekom: bestDay?.day || null,
        win_pct_per_day: summary.map((s: any) => ({ day: s.day, winPct: s.winPct })),
        avg_pct_per_day: summary.map((s: any) => ({ day: s.day, avgPct: s.avgPct })),
        gap_up_rate: summary.map((s: any) => ({ day: s.day, gapUpPct: s.pctGapUp })),
        action_score: bestDay?.score || 0,
        total_events: data.totalEvents || 0,
        best_day: bestDay,
        alt_day: altDay,
        ranking,
      } as any, { onConflict: "ticker,screener_name,tanggal_cache" });
    } catch { /* ignore cache save errors */ }
  }, []);

  // Auto-analyze all passed stocks
  const runAutoAnalysis = useCallback(async (screenerType: SwingType, passedStocks: SwingStockData[]) => {
    const tickers = passedStocks.slice(0, MAX_AUTO_ANALYZE).map(s => s.ticker);
    if (tickers.length === 0) return;

    setIsAutoAnalyzing(true);
    autoAnalyzeAbortRef.current = false;
    setAutoAnalyzeProgress({ done: 0, total: tickers.length });

    // Step 1: Load from DB cache
    const alreadyCached = await loadCacheFromDB(screenerType, tickers);
    const needAnalysis = tickers.filter(t => !alreadyCached.has(t));

    let done = alreadyCached.size;
    setAutoAnalyzeProgress({ done, total: tickers.length });

    // Step 2: Sequentially analyze uncached tickers
    for (const ticker of needAnalysis) {
      if (autoAnalyzeAbortRef.current) break;
      try {
        const { data, error } = await supabase.functions.invoke("yahoo-finance-swing-analysis", {
          body: { ticker, screenerType },
        });
        if (!error && data) {
          const score = data.bestDay?.score || 0;
          analysisCache[screenerType][ticker] = {
            ticker,
            bestDay: data.bestDay || null,
            altDay: data.altDay || null,
            totalEvents: data.totalEvents || 0,
            actionScore: score,
          };
          // Save to DB cache in background
          saveToCacheDB(ticker, screenerType, data);
          forceUpdate(n => n + 1);
        }
      } catch { /* continue on error */ }
      done++;
      setAutoAnalyzeProgress({ done, total: tickers.length });
      // Delay between requests
      if (done < tickers.length) {
        await new Promise(r => setTimeout(r, ANALYSIS_DELAY_MS));
      }
    }

    setIsAutoAnalyzing(false);
  }, [loadCacheFromDB, saveToCacheDB]);

  const handleScan = useCallback(async (swingType: SwingType) => {
    setIsScanning(true);
    setScanError(null);
    setHasScanRun(prev => ({ ...prev, [swingType]: true }));
    setScanProgress("Menghubungi server...");
    setScanProgressPct(0);
    abortRef.current = false;
    // Clear previous analysis cache for this screener
    analysisCache[swingType] = {};

    const accumulated: SwingStockData[] = [];
    try {
      const firstResp = await supabase.functions.invoke("yahoo-finance-swing-screener", {
        body: { batchIndex: 0, batchSize: BATCH_SIZE, screenerType: swingType },
      });
      if (firstResp.error) throw new Error(firstResp.error.message);

      const totalBatches = firstResp.data?.totalBatches || 1;
      const totalTickers = firstResp.data?.totalTickers || 0;
      if (firstResp.data?.stocks) accumulated.push(...firstResp.data.stocks);
      setStocks(prev => ({ ...prev, [swingType]: [...accumulated] }));
      setScanProgress(`Batch 1/${totalBatches} (${accumulated.length} lolos)`);
      setScanProgressPct(Math.round((1 / totalBatches) * 100));

      for (let i = 1; i < totalBatches; i += 2) {
        if (abortRef.current) break;
        const promises = [];
        for (let j = i; j < Math.min(i + 2, totalBatches); j++) {
          promises.push(supabase.functions.invoke("yahoo-finance-swing-screener", {
            body: { batchIndex: j, batchSize: BATCH_SIZE, screenerType: swingType },
          }));
        }
        const results = await Promise.all(promises);
        for (const r of results) { if (r.data?.stocks) accumulated.push(...r.data.stocks); }
        setStocks(prev => ({ ...prev, [swingType]: [...accumulated] }));
        const done = Math.min(i + 2, totalBatches);
        setScanProgress(`Batch ${done}/${totalBatches} (${accumulated.length} lolos)`);
        setScanProgressPct(Math.round((done / totalBatches) * 100));
      }

      const scanTime = new Date();
      setLastScanTime(prev => ({ ...prev, [swingType]: scanTime }));
      const newSwingStocks = { ...getScreenerStore().swingStocks, [swingType]: [...accumulated] };
      const newTimes = { ...getScreenerStore().swingLastScanTime, [swingType]: scanTime };
      const newRun = { ...getScreenerStore().swingHasScanRun, [swingType]: true };
      updateScreenerStore({ swingStocks: newSwingStocks, swingLastScanTime: newTimes, swingHasScanRun: newRun });
      toast({ title: `Scan ${SWING_LABELS[swingType].name} selesai!`, description: `${accumulated.length} saham lolos dari ${totalTickers} total` });

      // Auto-trigger analysis
      if (accumulated.length > 0) {
        runAutoAnalysis(swingType, accumulated);
      }
    } catch (err: any) {
      setScanError(err.message);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false); setScanProgress(""); setScanProgressPct(0);
    }
  }, [runAutoAnalysis]);

  // Refresh analysis (force clear cache)
  const handleRefreshAnalysis = useCallback(async () => {
    const currentStocksArr = stocks[activeSwing] || [];
    if (currentStocksArr.length === 0) return;
    // Clear DB cache for today
    const today = todayStr();
    const tickers = currentStocksArr.slice(0, MAX_AUTO_ANALYZE).map(s => s.ticker);
    try {
      await supabase.from("swing_analysis_cache" as any)
        .delete()
        .eq("screener_name", activeSwing)
        .eq("tanggal_cache", today)
        .in("ticker", tickers);
    } catch { /* ignore */ }
    analysisCache[activeSwing] = {};
    forceUpdate(n => n + 1);
    runAutoAnalysis(activeSwing, currentStocksArr);
  }, [activeSwing, stocks, runAutoAnalysis]);

  const currentStocks = stocks[activeSwing] || [];
  const currentScanTime = lastScanTime[activeSwing];
  const currentHasScan = hasScanRun[activeSwing];

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const displayData = useMemo(() => {
    let data = currentStocks;
    if (searchTicker) data = data.filter(r => r.ticker.includes(searchTicker.toUpperCase()));
    return [...data].sort((a, b) => {
      if (sortKey === "actionScore") {
        const aScore = analysisCache[activeSwing]?.[a.ticker]?.actionScore || 0;
        const bScore = analysisCache[activeSwing]?.[b.ticker]?.actionScore || 0;
        return sortDir === "asc" ? aScore - bScore : bScore - aScore;
      }
      const av = a[sortKey as keyof SwingStockData];
      const bv = b[sortKey as keyof SwingStockData];
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [currentStocks, searchTicker, sortKey, sortDir, activeSwing]);

  // Actionable tickers from cache
  const actionableEntries = useMemo(() => {
    const cache = analysisCache[activeSwing] || {};
    return currentStocks
      .filter(s => cache[s.ticker]?.bestDay)
      .map(s => ({ ticker: s.ticker, ...cache[s.ticker] }))
      .sort((a, b) => (b.bestDay?.score || 0) - (a.bestDay?.score || 0));
  }, [currentStocks, activeSwing]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5" /> : <ArrowDown className="h-3 w-3 inline ml-0.5" />;
  };

  const formatNum = (n: number) => n.toLocaleString("id-ID");
  const formatVol = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    return n.toLocaleString("id-ID");
  };

  return (
    <div className="space-y-4">
      {/* Sub-screener tabs */}
      <Tabs value={activeSwing} onValueChange={v => setActiveSwing(v as SwingType)}>
        <TabsList className="grid grid-cols-3 w-full">
          {(Object.keys(SWING_LABELS) as SwingType[]).map(k => (
            <TabsTrigger key={k} value={k} className="text-[10px] sm:text-xs">{SWING_LABELS[k].name}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p className="text-[10px] text-muted-foreground">{SWING_LABELS[activeSwing].desc}</p>

      {/* Scan button */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {currentScanTime && !isScanning && (
          <span className="text-[10px] text-muted-foreground">
            Scanned: {currentScanTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} • {currentStocks.length} lolos
          </span>
        )}
        <Button onClick={() => handleScan(activeSwing)} disabled={isScanning} size="sm" className="text-xs sm:text-sm">
          {isScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
          {isScanning ? "Scanning..." : SWING_LABELS[activeSwing].btn}
        </Button>
      </div>

      {/* Scan Progress */}
      {isScanning && scanProgressPct > 0 && (
        <div className="space-y-1">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${scanProgressPct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">{scanProgress}</p>
        </div>
      )}

      {isScanning && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-10 w-10 mb-3 animate-spin text-primary" />
          <p className="text-lg font-medium">Scanning {SWING_LABELS[activeSwing].name}...</p>
          <p className="text-sm mt-1">{scanProgress || "Memulai..."}</p>
        </div>
      )}

      {!isScanning && scanError && currentStocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-10 w-10 mb-3 opacity-60" />
          <p className="text-sm">{scanError}</p>
          <Button variant="outline" className="mt-4" onClick={() => handleScan(activeSwing)}>Coba Lagi</Button>
        </div>
      )}

      {!isScanning && !currentHasScan && currentStocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ScanSearch className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-lg font-medium">Belum ada hasil scan</p>
          <p className="text-sm mt-1">Klik "{SWING_LABELS[activeSwing].btn}" untuk memulai</p>
        </div>
      )}

      {/* Banner */}
      {!isScanning && currentHasScan && currentStocks.length > 0 && currentScanTime && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Scan terakhir:{" "}
            <span className="font-medium text-foreground">
              {(() => {
                const now = new Date();
                const isToday = currentScanTime.toDateString() === now.toDateString();
                const timeStr = currentScanTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                return isToday ? `Hari ini ${timeStr} WIB` : `${format(currentScanTime, "dd/MM/yyyy")} ${timeStr} WIB`;
              })()}
            </span>
            {" • "}<span className="font-bold text-primary">{currentStocks.length}</span> saham lolos
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-6 text-[10px] px-2" onClick={() => handleScan(activeSwing)}>
            <ScanSearch className="h-3 w-3 mr-1" />Scan Ulang
          </Button>
        </div>
      )}

      {/* Auto-analysis progress */}
      {isAutoAnalyzing && (
        <div className="space-y-2 px-3 py-3 rounded-md bg-yellow-500/5 border border-yellow-500/20">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />
            <span className="text-yellow-500 font-medium">
              Menganalisa historis... [{autoAnalyzeProgress.done}/{autoAnalyzeProgress.total} saham selesai]
            </span>
          </div>
          <Progress value={(autoAnalyzeProgress.done / Math.max(autoAnalyzeProgress.total, 1)) * 100} className="h-2" />
        </div>
      )}

      {/* 🔥 Actionable Card */}
      {!isScanning && currentStocks.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-4 w-4 text-orange-500" />
              <span className="text-xs font-semibold text-orange-500">🔥 Paling Actionable Hari Ini</span>
              {isAutoAnalyzing && (
                <span className="text-[9px] text-muted-foreground ml-auto">Memperbarui data...</span>
              )}
            </div>
            {actionableEntries.length > 0 ? (
              <div className="space-y-2">
                {actionableEntries.slice(0, 5).map(entry => (
                  <div key={entry.ticker} className="flex items-center gap-3 text-xs p-2 rounded bg-card/50 border border-border/50">
                    <button onClick={() => setAnalysisTicker(entry.ticker)} className="font-mono font-bold text-primary hover:underline cursor-pointer">
                      {entry.ticker}
                    </button>
                    {entry.bestDay && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-[9px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                          <Calendar className="h-2.5 w-2.5 mr-0.5" />
                          Entry Day {entry.bestDay.day}
                        </Badge>
                        <span className="font-mono text-green-500">WIN {entry.bestDay.winPct.toFixed(0)}%</span>
                        <span className={cn("font-mono", entry.bestDay.avgPct >= 0 ? "text-green-500" : "text-red-500")}>
                          Avg {entry.bestDay.avgPct.toFixed(2)}%
                        </span>
                        <span className="font-mono text-muted-foreground">
                          Gap Up {entry.bestDay.gapUpPct.toFixed(0)}%
                        </span>
                        <Badge variant="outline" className="text-[8px]">
                          Score {entry.bestDay.score}/9
                        </Badge>
                        {entry.altDay && (
                          <span className="text-[9px] text-muted-foreground">
                            (alt: Day {entry.altDay.day})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isAutoAnalyzing
                  ? "⏳ Sedang menganalisa historis secara otomatis..."
                  : "📅 Belum ada data historis — akan otomatis dianalisa setelah scan"}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {!isScanning && currentStocks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-base font-bold text-foreground">{displayData.length} Saham Lolos</h2>
            <div className="flex items-center gap-2">
              <Switch id="swing-debug" checked={showDebug} onCheckedChange={setShowDebug} />
              <Label htmlFor="swing-debug" className="text-[10px] text-muted-foreground cursor-pointer">Debug</Label>
            </div>
            {!isAutoAnalyzing && Object.keys(analysisCache[activeSwing] || {}).length > 0 && (
              <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={handleRefreshAnalysis}>
                <RefreshCw className="h-3 w-3 mr-1" />Refresh Analisa
              </Button>
            )}
            <Input placeholder="Cari ticker..." value={searchTicker} onChange={e => setSearchTicker(e.target.value)}
              className="h-7 text-[10px] w-28 sm:w-40 ml-auto" />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs" style={{ minWidth: showDebug ? "1400px" : "850px" }}>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-1.5 py-2 text-left text-[10px] font-semibold text-muted-foreground cursor-pointer" onClick={() => handleSort("ticker")}>
                    Ticker<SortIcon col="ticker" />
                  </th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-semibold text-muted-foreground cursor-pointer" onClick={() => handleSort("close")}>
                    Harga<SortIcon col="close" />
                  </th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-semibold text-muted-foreground cursor-pointer" onClick={() => handleSort("changePct")}>
                    Chg%<SortIcon col="changePct" />
                  </th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-semibold text-muted-foreground cursor-pointer" onClick={() => handleSort("value")}>
                    Value<SortIcon col="value" />
                  </th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-semibold text-muted-foreground cursor-pointer" onClick={() => handleSort("ii")}>
                    ii<SortIcon col="ii" />
                  </th>
                  <th className="px-1.5 py-2 text-right text-[10px] font-semibold text-muted-foreground cursor-pointer" onClick={() => handleSort("tma20")}>
                    TMA20<SortIcon col="tma20" />
                  </th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">MACD</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">Stoch</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">ADX</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center cursor-pointer" onClick={() => handleSort("actionScore")}>
                    📅 Entry<SortIcon col="actionScore" />
                  </th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">🐋 SM</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">AI</th>
                  {activeSwing === "ketat_allma" && (
                    <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">MA Aligned</th>
                  )}
                  {activeSwing === "bottom_fishing" && (
                    <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">Nearest MA</th>
                  )}
                  {showDebug && (
                    <>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-center">VOK</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d20%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d50%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d100%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d200%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d400%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">clrBBB</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">is</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayData.map((r, idx) => {
                  const isUp = r.changePct > 0, isDown = r.changePct < 0;
                  const cached = analysisCache[activeSwing]?.[r.ticker];
                  const isAnalyzing = isAutoAnalyzing && !cached;
                  return (
                    <React.Fragment key={r.ticker}>
                    <tr className={cn("border-b border-border/50 transition-colors hover:bg-accent/50", idx % 2 === 0 ? "bg-card" : "bg-card/50")}>
                      <td className="px-1.5 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setAnalysisTicker(r.ticker)} className="font-bold font-mono text-xs text-primary hover:underline cursor-pointer">
                            {r.ticker}
                          </button>
                          <button onClick={() => setChartTicker(r)} className="text-muted-foreground hover:text-primary">
                            <CandlestickChart className="h-3 w-3" />
                          </button>
                        </div>
                        {r.name && r.name !== r.ticker && (
                          <span className="block text-[9px] text-muted-foreground truncate max-w-[120px]">{r.name}</span>
                        )}
                      </td>
                      <td className={cn("px-1.5 py-2 text-right font-mono text-xs", isUp ? "text-green-500" : isDown ? "text-red-500" : "text-foreground")}>{formatNum(r.close)}</td>
                      <td className={cn("px-1.5 py-2 text-right font-mono text-[10px]", isUp ? "text-green-500" : isDown ? "text-red-500" : "text-foreground")}>
                        {r.changePct >= 0 ? "+" : ""}{r.changePct.toFixed(1)}%
                      </td>
                      <td className="px-1.5 py-2 text-right font-mono text-[10px] text-muted-foreground">{formatVol(r.value)}</td>
                      <td className={cn("px-1.5 py-2 text-right font-mono text-xs font-bold", r.ii > 0 ? "text-green-500" : r.ii < 0 ? "text-red-500" : "text-foreground")}>{r.ii.toFixed(1)}</td>
                      <td className={cn("px-1.5 py-2 text-right font-mono text-[10px]", r.tma20 > 0 ? "text-red-500" : "text-green-500")}>{r.tma20.toFixed(2)}</td>
                      <td className="px-1.5 py-2 text-center">
                        <Badge variant="outline" className={cn("text-[8px]",
                          r.macdKondisi.includes("Cross") ? "border-green-500/50 text-green-400" :
                          r.macdKondisi === "Bullish" ? "border-green-500/30 text-green-500" :
                          r.macdKondisi === "Weakening" ? "border-yellow-500/30 text-yellow-500" :
                          "border-red-500/30 text-red-500"
                        )}>{r.macdKondisi}</Badge>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <Badge variant="outline" className={cn("text-[8px]",
                          r.stochKondisi.includes("Cross") ? "border-green-500/50 text-green-400" :
                          r.stochKondisi === "Overbought" ? "border-red-500/30 text-red-500" :
                          r.stochKondisi === "Bullish" ? "border-green-500/30 text-green-500" :
                          "border-red-500/30 text-red-500"
                        )}>{r.stochKondisi}</Badge>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <Badge variant="outline" className={cn("text-[8px]",
                          r.adxKondisi === "Strong Trend" ? "border-green-500/50 text-green-400" :
                          r.adxKondisi === "Building" ? "border-yellow-500/30 text-yellow-500" :
                          "border-muted-foreground/30 text-muted-foreground"
                        )}>{r.adxKondisi}</Badge>
                      </td>
                      {/* Entry Day column */}
                      <td className="px-1.5 py-2 text-center">
                        {isAnalyzing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mx-auto" />
                        ) : cached?.bestDay ? (
                          <div className="space-y-0.5">
                            <Badge className={cn("text-[8px]",
                              cached.bestDay.score >= 7 ? "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" :
                              cached.bestDay.score >= 5 ? "bg-green-500/10 text-green-500 border-green-500/30" :
                              "bg-muted text-muted-foreground border-border"
                            )}>
                              {cached.bestDay.score >= 7 ? "⭐" : cached.bestDay.score >= 5 ? "✅" : "⚠️"} D{cached.bestDay.day}
                            </Badge>
                            <div className="text-[8px] text-muted-foreground">
                              W{cached.bestDay.winPct.toFixed(0)}% A{cached.bestDay.avgPct.toFixed(1)}%
                            </div>
                          </div>
                        ) : cached ? (
                          <span className="text-[8px] text-muted-foreground">—</span>
                        ) : (
                          <span className="text-[8px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <AkSmartMoneyBadgeComponent data={getAkBadge(r.ticker)} />
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <AiInsightButton
                          ticker={r.ticker} price={r.close} changePct={r.changePct} volume={r.value}
                          technical={{ ma5: r.ma5, ma20: r.ma20, ma50: r.ma50, macd: r.macdKondisi }}
                          isExpanded={aiExpandedTickers.has(r.ticker)} onToggle={() => toggleAiExpand(r.ticker)}
                        />
                      </td>
                      {activeSwing === "ketat_allma" && (
                        <td className="px-1.5 py-2 text-center font-mono text-[10px]">
                          <Badge variant="outline" className="text-[8px] border-green-500/30 text-green-400">{r.maAboveCount}/8 MA</Badge>
                        </td>
                      )}
                      {activeSwing === "bottom_fishing" && (
                        <td className="px-1.5 py-2 text-center">
                          <Badge variant="outline" className="text-[8px] border-blue-500/30 text-blue-400">
                            {r.nearestMA} ({r.nearestMADist?.toFixed(1)}%)
                          </Badge>
                        </td>
                      )}
                      {showDebug && (
                        <>
                          <td className="px-1 py-2 text-center text-[9px] font-mono">{r.vok ? "✅" : "❌"}</td>
                          <td className="px-1 py-2 text-right text-[9px] font-mono text-muted-foreground">{r.dma20.toFixed(1)}</td>
                          <td className="px-1 py-2 text-right text-[9px] font-mono text-muted-foreground">{r.dma50.toFixed(1)}</td>
                          <td className="px-1 py-2 text-right text-[9px] font-mono text-muted-foreground">{r.dma100.toFixed(1)}</td>
                          <td className="px-1 py-2 text-right text-[9px] font-mono text-muted-foreground">{r.dma200.toFixed(1)}</td>
                          <td className="px-1 py-2 text-right text-[9px] font-mono text-muted-foreground">{r.dma400.toFixed(1)}</td>
                          <td className="px-1 py-2 text-right text-[9px] font-mono text-muted-foreground">{r.clrbbb.toFixed(1)}</td>
                          <td className={cn("px-1 py-2 text-right text-[9px] font-mono", r.is_val >= 0 ? "text-green-500" : "text-red-500")}>{r.is_val.toFixed(1)}</td>
                        </>
                      )}
                    </tr>
                    {aiExpandedTickers.has(r.ticker) && (
                      <tr><td colSpan={99} className="p-0">
                        <AiInsightPanel onClose={() => setAiExpandedTickers(prev => { const n = new Set(prev); n.delete(r.ticker); return n; })} ticker={r.ticker} price={r.close} changePct={r.changePct} volume={r.value}
                          technical={{ ma5: r.ma5, ma20: r.ma20, ma50: r.ma50, macd: r.macdKondisi }} />
                      </td></tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analysis popup */}
      {analysisTicker && (
        <SwingAnalysis
          ticker={analysisTicker}
          screenerType={activeSwing}
          onClose={() => setAnalysisTicker(null)}
          onAnalysisData={handleAnalysisData}
        />
      )}

      {/* Chart popup */}
      {chartTicker && (
        <StockChartPopup
          ticker={chartTicker.ticker}
          stockName={chartTicker.name || chartTicker.ticker}
          price={chartTicker.close}
          changePct={chartTicker.changePct}
          open={!!chartTicker}
          onClose={() => setChartTicker(null)}
        />
      )}
    </div>
  );
}
