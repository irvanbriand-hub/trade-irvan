import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { format } from "date-fns";
import { screeningModules, type Stock } from "@/data/mockStocks";
import { ScreeningModuleCard } from "@/components/ScreeningModuleCard";
import { StockTradeStatsModal } from "@/components/StockTradeStatsModal";
import { StockChartPopup } from "@/components/StockChartPopup";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUp, ArrowDown, Loader2, ScanSearch, AlertCircle, Layers, Star, Download, CandlestickChart, Trophy, TrendingUp, Flame, ExternalLink, Zap, Clock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useWatchlistRekomendasi } from "@/hooks/useWatchlistRekomendasi";
import { useCategories } from "@/hooks/useCategories";
import { useImportToWrScanner, useWrScanner, useDeleteWrScannerByDate } from "@/hooks/useWrScanner";
import { WrHistorisBadges, useWrComboStats } from "@/components/WrHistorisBadges";
import { TickerBacktestPopup } from "@/components/TickerBacktestPopup";
import { runBacktestForTicker, calcScreenerStats, SCREENER_NAMES, type BacktestScreenerStats } from "@/lib/backtestEngine";
import { InlineStockChart } from "@/components/InlineStockChart";
import { useNavigate, useLocation } from "react-router-dom";
import { getScreenerStore, updateScreenerStore, type ScreenerStockData, type AnalisisRow } from "@/lib/screenerStore";
import { SuperketatAnalysis } from "@/components/SuperketatAnalysis";
import { SuperketatScreener } from "@/components/SuperketatScreener";
import { SwingScreener } from "@/components/SwingScreener";
import { AiInsightButton, AiInsightPanel } from "@/components/AiInsightRow";
import { ParameterBadge, ParameterChecklist } from "@/components/ParameterBadge";
import { calcParams } from "@/lib/paramCalculator";
import { useAraWatchScores } from "@/hooks/useAraWatchScore";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useAkSmartMoney } from "@/hooks/useAkSmartMoney";
import { AkSmartMoneyBadgeComponent } from "@/components/AkSmartMoneyBadge";
import { useBandarmology } from "@/hooks/useBandarmology";




function toStock(s: ScreenerStockData): Stock {
  return {
    ticker: s.ticker,
    name: s.name || s.ticker,
    sector: "",
    price: s.close,
    high: s.high,
    low: s.low,
    open: s.open,
    change: s.close - s.prevClose,
    changePct: s.prevClose > 0 ? ((s.close - s.prevClose) / s.prevClose) * 100 : 0,
    volume: s.volume,
    marketCap: 0, per: 0, pbv: 0, roe: 0, dividendYield: 0, debtToEquity: 0,
    eps: 0, revenueGrowth: 0, netProfitMargin: 0, beta: 0, rsi: 0,
    ma50: s.sma50,
    ma200: s.sma200,
    sma3: s.sma3 || 0,
    sma5: s.sma5,
    sma10: s.sma10 || 0,
    sma20: s.sma20 || 0,
    sma50: s.sma50,
    sma200: s.sma200,
    ema10: s.ema10,
    ema20: s.ema20,
    ema50: s.ema50,
    bollingerMean: s.bbMean,
    bollingerBottom: s.bbBottom,
    bollingerTop: s.bbTop,
    bollingerBandwidth: s.bbWidth,
    value: s.value,
    prevClose: s.prevClose,
    prevHigh: s.prevHigh,
    prevLow: s.prevLow,
    prevVolume: s.prevVolume,
    prevOpen: s.prevOpen,
    prev2Close: s.prev2Close,
    prev2High: s.prev2High,
    prev3Close: s.prev3Close,
    prevLlvLow5: s.prevLlvLow5,
    prevBollingerBottom: s.prevBbBottom,
    prevClose2BollingerBottom: s.prevCloseBelowBbBottom,
    smaVol20: s.smaVol20 || 0,
  };
}

type SortKey = "ticker" | "close" | "volume" | "value" | "sma5" | "sma50" | "sma200" | "bbMean" | "bbBottom";
type SortDir = "asc" | "desc";

const BATCH_SIZE = 100;


type AnalisisSortKey = keyof AnalisisRow;

const _store = getScreenerStore();

export default function Screener() {
  const navigate = useNavigate();
  const location = useLocation();
  const locState = location.state as { tab?: string; scrollToTicker?: string } | null;
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [allStockData, setAllStockData] = useState<ScreenerStockData[]>(_store.allStockData);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(_store.lastScanTime);
  const [lastMarketDataTime, setLastMarketDataTime] = useState<Date | null>(_store.lastMarketDataTime);
  const [searchTicker, setSearchTicker] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ticker");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScanRun, setHasScanRun] = useState(_store.hasScanRun);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chartTicker, setChartTicker] = useState<ScreenerStockData | null>(null);
  const [backtestTicker, setBacktestTicker] = useState<string | null>(null);
  const [skAnalysisTicker, setSkAnalysisTicker] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState("");
  const [scanProgressPct, setScanProgressPct] = useState(0);
  const abortRef = useRef(false);
  const [showWlOnly, setShowWlOnly] = useState(false);
  const [activeTab, setActiveTab] = useState(locState?.tab || "hasil-scan");
  const [highlightTicker, setHighlightTicker] = useState<string | null>(locState?.scrollToTicker || null);
  const [expandedChartTickers, setExpandedChartTickers] = useState<Set<string>>(new Set());
  const [showSkDebug, setShowSkDebug] = useState(false);
  const [mainTab, setMainTab] = useState<"bpjs" | "superketat" | "swing">("bpjs");
  const [aiExpandedTickers, setAiExpandedTickers] = useState<Set<string>>(new Set());
  const toggleAiExpand = (ticker: string) => setAiExpandedTickers(prev => {
    const next = new Set(prev);
    next.has(ticker) ? next.delete(ticker) : next.add(ticker);
    return next;
  });
  const [paramExpandedTickers, setParamExpandedTickers] = useState<Set<string>>(new Set());
  const toggleParamExpand = (ticker: string) => setParamExpandedTickers(prev => {
    const next = new Set(prev);
    next.has(ticker) ? next.delete(ticker) : next.add(ticker);
    return next;
  });

  const { data: araScoreMap } = useAraWatchScores();
  const { items: bandarItems } = useBandarmology();
  const { getBadge: getAkBadge } = useAkSmartMoney(bandarItems);

  // Analisa Historis state
  const [analisisRows, setAnalisisRows] = useState<AnalisisRow[]>(_store.analisisRows);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(_store.analysisDone);
  const [analysisProgressCurrent, setAnalysisProgressCurrent] = useState(0);
  const [analysisProgressTotal, setAnalysisProgressTotal] = useState(0);
  const analysisAbortRef = useRef(false);

  // Analisa filters
  const [ahFilterScreener, setAhFilterScreener] = useState("all");
  const [ahFilterWrMin, setAhFilterWrMin] = useState("all");
  const [ahFilterSignalMin, setAhFilterSignalMin] = useState("all");
  const [ahSortKey, setAhSortKey] = useState<AnalisisSortKey>("winRate");
  const [ahSortDir, setAhSortDir] = useState<"asc" | "desc">("desc");

  const { data: wlItems = [] } = useWatchlistRekomendasi();
  const { data: categories = [] } = useCategories();
  const { data: wrItems = [] } = useWrScanner();
  const importMutation = useImportToWrScanner();
  const deleteByDateMutation = useDeleteWrScannerByDate();

  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importDuplicateWarning, setImportDuplicateWarning] = useState(false);

  const wlTickerMap = useMemo(() => {
    const map: Record<string, { categoryId: string | null; categoryName: string }[]> = {};
    for (const item of wlItems) {
      if (!map[item.ticker]) map[item.ticker] = [];
      const catName = item.category_id ? categories.find(c => c.id === item.category_id)?.name || "WL" : "WL";
      map[item.ticker].push({ categoryId: item.category_id, categoryName: catName });
    }
    return map;
  }, [wlItems, categories]);

  const wlTickers = useMemo(() => new Set(Object.keys(wlTickerMap)), [wlTickerMap]);
  const wrComboStats = useWrComboStats(wrItems);
  const allStocks = useMemo(() => allStockData.map(toStock), [allStockData]);

  const moduleCounts = useMemo(() => {
    if (allStocks.length === 0) return {};
    const counts: Record<string, number> = {};
    for (const mod of screeningModules) {
      counts[mod.id] = allStocks.filter(mod.filter).length;
    }
    return counts;
  }, [allStocks]);

  const multiCriteriaStocks = useMemo(() => {
    if (allStocks.length === 0) return new Set<string>();
    const tickerHits: Record<string, number> = {};
    for (const mod of screeningModules) {
      const matches = allStocks.filter(mod.filter);
      for (const s of matches) {
        tickerHits[s.ticker] = (tickerHits[s.ticker] || 0) + 1;
      }
    }
    return new Set(Object.entries(tickerHits).filter(([, count]) => count >= 2).map(([t]) => t));
  }, [allStocks]);

  const tickerModuleMap = useMemo(() => {
    if (allStocks.length === 0) return {};
    const map: Record<string, string[]> = {};
    for (const mod of screeningModules) {
      const matches = allStocks.filter(mod.filter);
      for (const s of matches) {
        if (!map[s.ticker]) map[s.ticker] = [];
        map[s.ticker].push(mod.title);
      }
    }
    return map;
  }, [allStocks]);

  // Get unique tickers that passed ANY screener (for analisa historis)
  const scannedTickers = useMemo(() => {
    return Object.keys(tickerModuleMap);
  }, [tickerModuleMap]);

  const moduleFilteredStocks = useMemo(() => {
    if (!activeModule || allStocks.length === 0) return allStockData;
    if (activeModule === "multi-criteria") {
      return allStockData.filter((s) => multiCriteriaStocks.has(s.ticker));
    }
    const mod = screeningModules.find((m) => m.id === activeModule);
    if (!mod) return allStockData;
    const matchingTickers = new Set(allStocks.filter(mod.filter).map((s) => s.ticker));
    return allStockData.filter((s) => matchingTickers.has(s.ticker));
  }, [activeModule, allStocks, allStockData, multiCriteriaStocks]);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setScanError(null);
    setHasScanRun(true);
    setScanProgress("Menghubungi server...");
    setScanProgressPct(0);
    abortRef.current = false;
    // Reset analisa
    setAnalisisRows([]);
    setAnalysisDone(false);
    updateScreenerStore({ analisisRows: [], analysisDone: false });

    const accumulated: ScreenerStockData[] = [];

    try {
      const firstResp = await supabase.functions.invoke("yahoo-finance-screener", {
        body: { batchIndex: 0, batchSize: BATCH_SIZE },
      });

      if (firstResp.error) throw new Error(firstResp.error.message);

      const totalBatches = firstResp.data?.totalBatches || 1;
      const totalTickers = firstResp.data?.totalTickers || firstResp.data?.total || 0;

      if (firstResp.data?.stocks) {
        accumulated.push(...firstResp.data.stocks);
        setAllStockData([...accumulated]);
      }
      if (firstResp.data?.latestMarketTime && firstResp.data.latestMarketTime > 0) {
        const mdt = new Date(firstResp.data.latestMarketTime * 1000);
        setLastMarketDataTime(mdt);
        updateScreenerStore({ lastMarketDataTime: mdt });
      }

      setScanProgress(`Batch 1/${totalBatches} selesai (${accumulated.length}/${totalTickers} saham)`);
      setScanProgressPct(Math.round((1 / totalBatches) * 100));

      for (let i = 1; i < totalBatches; i += 2) {
        if (abortRef.current) break;

        const batchPromises = [];
        for (let j = i; j < Math.min(i + 2, totalBatches); j++) {
          batchPromises.push(
            supabase.functions.invoke("yahoo-finance-screener", {
              body: { batchIndex: j, batchSize: BATCH_SIZE },
            })
          );
        }

        const results = await Promise.all(batchPromises);
        for (const r of results) {
          if (r.data?.stocks) {
            accumulated.push(...r.data.stocks);
          }
          if (r.data?.latestMarketTime && r.data.latestMarketTime > 0) {
            const marketTime = new Date(r.data.latestMarketTime * 1000);
            setLastMarketDataTime(prev => (!prev || marketTime > prev) ? marketTime : prev);
          }
        }

        setAllStockData([...accumulated]);
        const completedBatches = Math.min(i + 2, totalBatches);
        setScanProgress(`Batch ${completedBatches}/${totalBatches} selesai (${accumulated.length}/${totalTickers} saham)`);
        setScanProgressPct(Math.round((completedBatches / totalBatches) * 100));
      }

      const scanTime = new Date();
      setLastScanTime(scanTime);
      // Persist to store
      updateScreenerStore({
        allStockData: [...accumulated],
        lastScanTime: scanTime,
        hasScanRun: true,
      });
      toast({
        title: "Scan selesai!",
        description: `${accumulated.length} saham berhasil dianalisis dari ${totalTickers} total`,
      });
    } catch (err: any) {
      console.error("[Screener] Scan error:", err);
      setScanError(err.message || "Terjadi error saat melakukan scan");
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
      setScanProgress("");
      setScanProgressPct(0);
    }
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const getFilteredStockTickers = useCallback(() => {
    if (allStocks.length === 0) return [];
    const tickerScreenerMap: Record<string, string[]> = {};
    for (const mod of screeningModules) {
      const matches = allStocks.filter(mod.filter);
      for (const s of matches) {
        if (!tickerScreenerMap[s.ticker]) tickerScreenerMap[s.ticker] = [];
        tickerScreenerMap[s.ticker].push(mod.title);
      }
    }
    return Object.entries(tickerScreenerMap).map(([ticker, screeners]) => {
      const stockData = allStockData.find(s => s.ticker === ticker);
      const params = stockData ? calcParams(stockData) : null;
      return {
        ticker,
        screener_names: screeners,
        wl_kategori: wlTickerMap[ticker]?.[0]?.categoryName || null,
        ...(params ? {
          param_pr: params.pr,
          param_v_ma20: params.v_ma20,
          param_ma_plus: params.ma_plus,
          param_l_pl: params.l_pl,
          param_h_ph: params.h_ph,
          param_ol_hc: params.ol_hc,
          param_c_vwap: params.c_vwap,
          param_v_ma5: params.v_ma5,
          param_count: params.count,
        } : {}),
      };
    });
  }, [allStocks, allStockData, wlTickerMap]);

  const handleImportClick = () => {
    const items = getFilteredStockTickers();
    if (items.length === 0) {
      toast({ title: "Tidak ada saham yang lolos screener", variant: "destructive" });
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const hasDuplicate = wrItems.some(d => d.tanggal_import === today);
    if (hasDuplicate) {
      setImportDuplicateWarning(true);
    } else {
      setImportConfirmOpen(true);
    }
  };

  const handleImportConfirm = async (replaceDuplicates = false) => {
    setImportConfirmOpen(false);
    setImportDuplicateWarning(false);
    const items = getFilteredStockTickers();

    try {
      if (replaceDuplicates) {
        const today = new Date().toISOString().split("T")[0];
        await deleteByDateMutation.mutateAsync(today);
      }
      await importMutation.mutateAsync(items);
      toast({ title: "Import berhasil!", description: `${items.length} saham diimport ke WR Scanner` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const displayData = useMemo(() => {
    let data = moduleFilteredStocks;
    if (searchTicker) {
      data = data.filter((r) => r.ticker.includes(searchTicker.toUpperCase()));
    }
    if (showWlOnly) {
      data = data.filter((r) => wlTickers.has(r.ticker));
    }
    return [...data].sort((a, b) => {
      const aInWl = wlTickers.has(a.ticker) ? 0 : 1;
      const bInWl = wlTickers.has(b.ticker) ? 0 : 1;
      if (aInWl !== bInWl) return aInWl - bInWl;

      const aVal = a[sortKey as keyof ScreenerStockData];
      const bVal = b[sortKey as keyof ScreenerStockData];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [moduleFilteredStocks, searchTicker, sortKey, sortDir, showWlOnly, wlTickers]);

  // === ANALISA HISTORIS LOGIC ===
  const runAnalisis = useCallback(async () => {
    if (scannedTickers.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisDone(false);
    setAnalysisProgressTotal(scannedTickers.length);
    setAnalysisProgressCurrent(0);
    analysisAbortRef.current = false;

    const results: AnalisisRow[] = [];

    for (let i = 0; i < scannedTickers.length; i++) {
      if (analysisAbortRef.current) break;
      const ticker = scannedTickers[i];
      setAnalysisProgressCurrent(i + 1);

      try {
        const bt = await runBacktestForTicker(ticker);
        // Only include screeners that detected this ticker today
        const todayScreeners = tickerModuleMap[ticker] || [];
        const stats = calcScreenerStats(bt.signals, todayScreeners);

        for (const st of stats) {
          if (st.total === 0 && !todayScreeners.includes(st.name)) continue;
          results.push({
            ticker,
            screener: st.name,
            total: st.total,
            wins: st.wins,
            losses: st.losses,
            winRate: st.winRate,
            avgGainWin: st.avgGainWin,
            lastSignalDate: st.lastSignalDate,
          });
        }
      } catch (err) {
        console.error(`[AnalisaHistoris] Error for ${ticker}:`, err);
      }
    }

    setAnalisisRows(results);
    setAnalysisDone(true);
    setIsAnalyzing(false);
    // Persist to store
    updateScreenerStore({ analisisRows: results, analysisDone: true });
  }, [scannedTickers, tickerModuleMap]);

  // Auto-run analisa when scan completes and tab switches to analisa
  const hasTriggeredAnalysis = useRef(false);
  useEffect(() => {
    if (activeTab === "analisa-historis" && scannedTickers.length > 0 && !analysisDone && !isAnalyzing && !hasTriggeredAnalysis.current) {
      hasTriggeredAnalysis.current = true;
      runAnalisis();
    }
  }, [activeTab, scannedTickers.length, analysisDone, isAnalyzing, runAnalisis]);

  // Reset analysis trigger when new scan runs
  useEffect(() => {
    if (isScanning) {
      hasTriggeredAnalysis.current = false;
    }
  }, [isScanning]);

  // Analisa filtered + sorted
  const analisisDisplayData = useMemo(() => {
    let data = [...analisisRows];
    if (ahFilterScreener !== "all") {
      data = data.filter(r => r.screener === ahFilterScreener);
    }
    if (ahFilterWrMin !== "all") {
      const min = parseInt(ahFilterWrMin);
      data = data.filter(r => r.winRate >= min);
    }
    if (ahFilterSignalMin !== "all") {
      const min = parseInt(ahFilterSignalMin);
      data = data.filter(r => r.total >= min);
    }
    return data.sort((a, b) => {
      const aVal = a[ahSortKey];
      const bVal = b[ahSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return ahSortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return ahSortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [analisisRows, ahFilterScreener, ahFilterWrMin, ahFilterSignalMin, ahSortKey, ahSortDir]);

  const handleAhSort = (key: AnalisisSortKey) => {
    if (ahSortKey === key) {
      setAhSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setAhSortKey(key);
      setAhSortDir("desc");
    }
  };

  // Analisa insights
  const analisisInsights = useMemo(() => {
    if (!analysisDone || analisisRows.length === 0) return null;
    const actionable = analisisRows.filter(r => r.winRate >= 70 && r.total >= 5).sort((a, b) => b.winRate - a.winRate);
    const consistent = analisisRows.filter(r => r.winRate >= 70).sort((a, b) => b.total - a.total)[0] || null;
    return { actionable, consistent };
  }, [analisisRows, analysisDone]);

  // Scroll to ticker when returning from Historical Backtest
  useEffect(() => {
    if (highlightTicker && activeTab === "analisa-historis") {
      const timer = setTimeout(() => {
        const el = document.getElementById(`analisa-row-${highlightTicker}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      const clearTimer = setTimeout(() => setHighlightTicker(null), 4000);
      return () => { clearTimeout(timer); clearTimeout(clearTimer); };
    }
    if (highlightTicker) {
      const t = setTimeout(() => setHighlightTicker(null), 4000);
      return () => clearTimeout(t);
    }
  }, [highlightTicker, activeTab]);

  const activeModuleTitle = activeModule
    ? activeModule === "multi-criteria"
      ? "Multi-Kriteria (≥2 Screener)"
      : screeningModules.find((m) => m.id === activeModule)?.title || "Hasil Scan"
    : "Semua Saham";

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5" /> : <ArrowDown className="h-3 w-3 inline ml-0.5" />;
  };

  const AhSortIcon = ({ col }: { col: AnalisisSortKey }) => {
    if (ahSortKey !== col) return null;
    return ahSortDir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5" /> : <ArrowDown className="h-3 w-3 inline ml-0.5" />;
  };

  const formatNum = (n: number) => n.toLocaleString("id-ID");
  const formatVol = (n: number) => {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return n.toLocaleString("id-ID");
  };

  const columns: [SortKey, string][] = [
    ["ticker", "Ticker"],
    ["close", "Harga"],
    ["volume", "Volume"],
    ["value", "Value"],
    ["sma5", "SMA 5"],
    ["sma50", "SMA 50"],
    ["sma200", "SMA 200"],
    ["bbMean", "BB Mid"],
    ["bbBottom", "BB Bottom"],
  ];

  const isMultiCriteria = activeModule === "multi-criteria";

  const handlePopupGoToAnalisa = (ticker: string) => {
    setBacktestTicker(null);
    setActiveTab("analisa-historis");
    setHighlightTicker(ticker);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Stock Screener</h1>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button onClick={() => setMainTab("bpjs")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", mainTab === "bpjs" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            BPJS Screener
          </button>
          <button onClick={() => setMainTab("superketat")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", mainTab === "superketat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Superketat Screener
          </button>
          <button onClick={() => setMainTab("swing")} className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", mainTab === "swing" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            Swing Screener
          </button>
        </div>
      </div>

      {mainTab === "superketat" && <SuperketatScreener />}

      {mainTab === "swing" && <SwingScreener />}

      {mainTab === "bpjs" && (<>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
        <div />
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
          {lastScanTime && !isScanning && (
            <div className="text-right hidden sm:block">
              {lastMarketDataTime && (
                <span className="text-[10px] text-muted-foreground block">
                  Data per: {format(lastMarketDataTime, "dd/MM/yyyy HH:mm")}
                  {lastMarketDataTime.toDateString() !== new Date().toDateString() && (
                    <span className="text-yellow-500 ml-1">⚠️ Bursa tutup</span>
                  )}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                Scan: {format(lastScanTime, "dd/MM/yyyy HH:mm:ss")} • {allStockData.length} saham
              </span>
            </div>
          )}
          <Button onClick={handleScan} disabled={isScanning} size="sm" className="text-xs sm:text-sm flex-1 sm:flex-none">
            {isScanning ? <Loader2 className="h-4 w-4 mr-1 sm:mr-2 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1 sm:mr-2" />}
            {isScanning ? "Scanning..." : "SCAN IDX"}
          </Button>
          {allStockData.length > 0 && !isScanning && (
            <Button onClick={handleImportClick} disabled={importMutation.isPending} size="sm" variant="outline" className="text-xs sm:text-sm flex-1 sm:flex-none">
              <Download className="h-4 w-4 mr-1 sm:mr-2" />
              Import WR
            </Button>
          )}
        </div>
      </div>

      {/* Import Dialogs */}
      <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import ke WR Scanner</DialogTitle>
            <DialogDescription>
              Import {getFilteredStockTickers().length} saham hasil scan [{format(new Date(), "dd/MM/yyyy")}] ke WR Scanner?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportConfirmOpen(false)}>Batal</Button>
            <Button onClick={() => handleImportConfirm(false)}>Konfirmasi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importDuplicateWarning} onOpenChange={setImportDuplicateWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Data Sudah Ada</DialogTitle>
            <DialogDescription>
              Data tanggal hari ini sudah ada di WR Scanner. Replace atau Skip duplikat?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDuplicateWarning(false)}>Batal</Button>
            <Button variant="destructive" onClick={() => handleImportConfirm(true)}>Replace</Button>
            <Button onClick={() => handleImportConfirm(false)}>Tambah (Skip)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Progress bar */}
      {isScanning && scanProgressPct > 0 && (
        <div className="space-y-1">
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${scanProgressPct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground text-center">{scanProgress}</p>
        </div>
      )}

      {/* Screening module cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 sm:gap-2">
        <button
          onClick={() => setActiveModule(activeModule === "multi-criteria" ? null : "multi-criteria")}
          className={cn(
            "group relative w-full text-left rounded-lg border p-3 transition-all duration-200",
            "hover:border-primary/40",
            activeModule === "multi-criteria"
              ? "border-primary/60 bg-primary/5"
              : "border-border bg-card"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <Layers className={cn("h-4 w-4 shrink-0", activeModule === "multi-criteria" ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
            <span className={cn(
              "font-mono text-xs font-bold px-1.5 py-0.5 rounded-full ml-auto shrink-0",
              allStockData.length === 0 ? "bg-muted text-muted-foreground"
                : multiCriteriaStocks.size > 0 ? "bg-gain/10 text-gain" : "bg-muted text-muted-foreground"
            )}>
              {allStockData.length === 0 ? "—" : multiCriteriaStocks.size}
            </span>
          </div>
          <h3 className="font-semibold text-xs text-foreground truncate">Multi-Kriteria</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">Saham yang muncul di ≥2 screener sekaligus</p>
        </button>

        {screeningModules.map((mod) => (
          <ScreeningModuleCard
            key={mod.id}
            module={mod}
            isActive={activeModule === mod.id}
            onClick={() => setActiveModule(activeModule === mod.id ? null : mod.id)}
            matchCount={moduleCounts[mod.id]}
            isTechnical
            hasScanData={allStockData.length > 0}
          />
        ))}
      </div>

      {/* Pre-scan states */}
      {isScanning && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-10 w-10 mb-3 animate-spin text-primary" />
          <p className="text-lg font-medium">Sedang scan seluruh saham IDX...</p>
          <p className="text-sm mt-1">{scanProgress || "Memulai..."}</p>
          {allStockData.length > 0 && (
            <p className="text-xs mt-2 text-muted-foreground/80">{allStockData.length} saham sudah terambil</p>
          )}
        </div>
      )}

      {!isScanning && scanError && allStockData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-destructive">
          <AlertCircle className="h-10 w-10 mb-3 opacity-60" />
          <p className="text-lg font-medium">Error saat mengambil data</p>
          <p className="text-sm mt-1 text-center max-w-md text-muted-foreground">{scanError}</p>
          <Button variant="outline" className="mt-4" onClick={handleScan}>Coba Lagi</Button>
        </div>
      )}

      {!isScanning && !hasScanRun && allStockData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ScanSearch className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-lg font-medium">Belum ada hasil scan</p>
          <p className="text-sm mt-1">Klik "SCAN SELURUH SAHAM IDX" untuk menganalisis seluruh saham</p>
        </div>
      )}

      {/* Data scan terakhir banner */}
      {!isScanning && hasScanRun && allStockData.length > 0 && lastScanTime && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Data scan terakhir:{" "}
            <span className="font-medium text-foreground">
              {(() => {
                const now = new Date();
                const isToday = lastScanTime.toDateString() === now.toDateString();
                const timeStr = lastScanTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                return isToday
                  ? `Hari ini ${timeStr} WIB`
                  : `${format(lastScanTime, "dd/MM/yyyy")} ${timeStr} WIB`;
              })()}
            </span>
            {" • "}{allStockData.length} saham
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-6 text-[10px] px-2" onClick={handleScan}>
            <ScanSearch className="h-3 w-3 mr-1" />
            Scan Ulang
          </Button>
        </div>
      )}

      {/* TABS: Hasil Scan + Analisa Historis */}
      {!isScanning && hasScanRun && allStockData.length > 0 && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="hasil-scan">Hasil Scan</TabsTrigger>
            <TabsTrigger value="analisa-historis">
              Analisa Historis
              {isAnalyzing && <Loader2 className="h-3 w-3 ml-1.5 animate-spin" />}
              {analysisDone && <span className="ml-1.5 text-[10px]">✓</span>}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: HASIL SCAN */}
          <TabsContent value="hasil-scan" className="space-y-4">
            {/* Active module info + search */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-foreground">{activeModuleTitle}</h2>
                {allStockData.length > 0 && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {activeModule ? `${displayData.length} saham memenuhi kriteria` : `${displayData.length} saham teranalisis`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
                {allStockData.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Switch id="wl-filter" checked={showWlOnly} onCheckedChange={setShowWlOnly} />
                    <Label htmlFor="wl-filter" className="text-[10px] sm:text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                      <Star className="h-3 w-3" /> WL
                    </Label>
                  </div>
                )}

                {activeModule && (
                  <Button variant="outline" size="sm" className="text-[10px] sm:text-xs" onClick={() => setActiveModule(null)}>
                    Semua
                  </Button>
                )}
                {allStockData.length > 0 && (
                  <Input
                    placeholder="Cari ticker..."
                    value={searchTicker}
                    onChange={(e) => setSearchTicker(e.target.value)}
                    className="h-7 sm:h-8 text-[10px] sm:text-xs w-28 sm:w-40"
                  />
                )}
              </div>
            </div>

            {hasScanRun && !scanError && allStockData.length > 0 && displayData.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <ScanSearch className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-lg font-medium">Tidak ada saham memenuhi kriteria "{activeModuleTitle}"</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveModule(null)}>Tampilkan Semua</Button>
              </div>
            )}

            {displayData.length > 0 && (
              <div className="overflow-x-auto -mx-2 sm:mx-0 rounded-lg border border-border">
                <table className="w-full text-xs sm:text-sm" style={{ minWidth: '700px' }}>
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {columns.map(([key, label], idx) => (
                        <React.Fragment key={key}>
                          <th
                            onClick={() => handleSort(key)}
                            className={cn(
                              "px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer select-none hover:text-primary transition-colors whitespace-nowrap",
                              key === "ticker" ? "text-left" : "text-right",
                              sortKey === key ? "text-primary" : "text-muted-foreground"
                            )}
                          >
                            {label}
                            <SortIcon col={key} />
                          </th>
                          {idx === 0 && (
                            <>
                              <th className="px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-left text-muted-foreground whitespace-nowrap">
                                <Star className="h-3 w-3 inline mr-1" />WL
                              </th>
                              <th className="px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-left text-muted-foreground min-w-[120px] sm:min-w-[200px] whitespace-nowrap">
                                WR Historis
                              </th>
                            </>
                          )}
                        </React.Fragment>
                      ))}
                      {isMultiCriteria && (
                        <th className="px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-left text-muted-foreground">Kriteria</th>
                      )}
                      <th className="px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-center text-muted-foreground whitespace-nowrap">Param</th>
                      <th className="px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-center text-muted-foreground whitespace-nowrap">🐋 Smart Money</th>
                      <th className="px-1.5 py-2 sm:p-3 font-semibold text-[10px] sm:text-xs uppercase tracking-wider text-center text-muted-foreground">AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayData.map((r, i) => {
                      const changePct = r.prevClose > 0 ? ((r.close - r.prevClose) / r.prevClose) * 100 : 0;
                      const isUp = changePct > 0;
                      const isDown = changePct < 0;

                      return (
                        <React.Fragment key={r.ticker}>
                        <tr
                          className={cn(
                            "border-b border-border/50 transition-colors hover:bg-accent/50",
                            i % 2 === 0 ? "bg-card" : "bg-card/50"
                          )}
                        >
                          <td className="px-1.5 py-2 sm:p-3">
                            <div className="flex items-center gap-1 sm:gap-1.5">
                              <button
                              onClick={() => {
                                  setBacktestTicker(r.ticker);
                                }}
                                className="font-bold font-mono text-xs sm:text-sm text-primary hover:underline cursor-pointer"
                              >
                                {r.ticker}
                              </button>
                              <button
                                onClick={() => setChartTicker(r)}
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Lihat Chart"
                              >
                                <CandlestickChart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              </button>
                              <span className={cn(
                                "text-[9px] sm:text-[10px] px-1 py-0.5 rounded font-mono",
                                isUp && "bg-gain/10 text-gain",
                                isDown && "bg-loss/10 text-loss",
                                !isUp && !isDown && "bg-muted text-muted-foreground"
                              )}>
                                {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
                              </span>
                              {araScoreMap?.has(r.ticker) && (() => {
                                const ara = araScoreMap.get(r.ticker)!;
                                const sc = ara.score_total;
                                const badgeCls = sc >= 75 ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30" : sc >= 60 ? "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30" : sc >= 40 ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20" : "";
                                if (sc < 40) return null;
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className={cn("text-[8px] px-1 py-0.5 rounded border font-medium cursor-help", badgeCls)}>
                                          🎯 ARA {sc.toFixed(0)}%
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                                        <p>Pernah ARA {ara.total_ara_count}x</p>
                                        {ara.tanggal_ara_terakhir && <p>Terakhir: {ara.tanggal_ara_terakhir} +{ara.pct_ara_terakhir?.toFixed(0)}%</p>}
                                        <p>Score: {sc.toFixed(0)}%</p>
                                        <p>D-1: {ara.score_d1.toFixed(0)}% | D-2: {ara.score_d2.toFixed(0)}% | D-3: {ara.score_d3.toFixed(0)}%</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}
                            </div>
                            {r.name && r.name !== r.ticker && (
                              <span className="block text-[9px] sm:text-[10px] text-muted-foreground truncate max-w-[100px] sm:max-w-[150px]">{r.name}</span>
                            )}
                          </td>
                          <td className="px-1.5 py-2 sm:p-3">
                            <div className="flex flex-wrap gap-0.5 sm:gap-1">
                              {(wlTickerMap[r.ticker] || []).map((wl, idx) => (
                                <Badge key={idx} variant="secondary" className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 whitespace-nowrap">
                                  {wl.categoryName}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-1.5 py-2 sm:p-3">
                            <WrHistorisBadges
                              screenerNames={tickerModuleMap[r.ticker] || []}
                              comboStats={wrComboStats}
                            />
                          </td>
                          <td className={cn("px-1.5 py-2 sm:p-3 text-right font-mono font-semibold text-xs", isUp ? "text-gain" : isDown ? "text-loss" : "text-foreground")}>{formatNum(r.close)}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-muted-foreground text-[10px] sm:text-xs">{formatVol(r.volume)}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-muted-foreground text-[10px] sm:text-xs">{formatVol(r.value)}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-[10px] sm:text-xs text-foreground">{formatNum(r.sma5)}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-[10px] sm:text-xs text-foreground">{r.sma50 > 0 ? formatNum(r.sma50) : "—"}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-[10px] sm:text-xs text-foreground">{r.sma200 > 0 ? formatNum(r.sma200) : "—"}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-[10px] sm:text-xs text-foreground">{r.bbMean > 0 ? formatNum(r.bbMean) : "—"}</td>
                          <td className="px-1.5 py-2 sm:p-3 text-right font-mono text-[10px] sm:text-xs text-foreground">{r.bbBottom > 0 ? formatNum(r.bbBottom) : "—"}</td>
                          {isMultiCriteria && (
                            <td className="px-1.5 py-2 sm:p-3 text-left">
                              <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                {(tickerModuleMap[r.ticker] || []).map((name) => (
                                  <span key={name} className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </td>
                          )}
                          <td className="px-1.5 py-2 sm:p-3 text-center">
                            <ParameterBadge
                              stockData={r}
                              isExpanded={paramExpandedTickers.has(r.ticker)}
                              onToggle={() => toggleParamExpand(r.ticker)}
                            />
                          </td>
                          <td className="px-1.5 py-2 sm:p-3 text-center">
                            <AkSmartMoneyBadgeComponent data={getAkBadge(r.ticker)} />
                          </td>
                          <td className="px-1.5 py-2 sm:p-3 text-center">
                            <AiInsightButton
                              ticker={r.ticker}
                              price={r.close}
                              changePct={changePct}
                              volume={r.volume}
                              technical={{ ma5: r.sma5, ma20: r.sma20, ma50: r.sma50 }}
                              isExpanded={aiExpandedTickers.has(r.ticker)}
                              onToggle={() => toggleAiExpand(r.ticker)}
                            />
                          </td>
                        </tr>
                        {paramExpandedTickers.has(r.ticker) && (
                          <tr><td colSpan={99} className="p-0 px-2 py-2">
                            <ParameterChecklist stockData={r} />
                          </td></tr>
                        )}
                        {aiExpandedTickers.has(r.ticker) && (
                          <tr><td colSpan={99} className="p-0">
                            <AiInsightPanel onClose={() => setAiExpandedTickers(prev => { const n = new Set(prev); n.delete(r.ticker); return n; })}
                              ticker={r.ticker}
                              price={r.close}
                              changePct={changePct}
                              volume={r.volume}
                              technical={{ ma5: r.sma5, ma20: r.sma20, ma50: r.sma50 }}
                            />
                          </td></tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* TAB 2: ANALISA HISTORIS */}
          <TabsContent value="analisa-historis" className="space-y-4">
            {/* Progress */}
            {isAnalyzing && (
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Menganalisa historis {analysisProgressCurrent} dari {analysisProgressTotal} emiten yang lolos scan...</span>
                      <span>{analysisProgressTotal > 0 ? Math.round((analysisProgressCurrent / analysisProgressTotal) * 100) : 0}%</span>
                    </div>
                    <Progress value={analysisProgressTotal > 0 ? (analysisProgressCurrent / analysisProgressTotal) * 100 : 0} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            )}

            {analysisDone && analisisInsights && (
              <>
                {/* Insight cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Card className="border-orange-500/30 bg-orange-500/5">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Flame className="h-4 w-4 text-orange-500" />
                        <span className="text-xs font-semibold text-orange-500">🔥 Paling Actionable Hari Ini</span>
                      </div>
                      {analisisInsights.actionable.length > 0 ? (
                        <>
                          <div className="flex flex-wrap gap-1">
                            {analisisInsights.actionable.slice(0, 5).map(h => {
                              const sd = allStockData.find(s => s.ticker === h.ticker);
                              const pc = sd ? calcParams(sd).count : null;
                              return (
                                <Badge key={`${h.ticker}-${h.screener}`} className="text-[9px] bg-orange-500/10 text-orange-600 border-orange-500/30">
                                  {h.ticker} • {h.screener} ({h.winRate.toFixed(0)}%)
                                  {pc != null && <span className="ml-1 opacity-75">📊{pc}/8</span>}
                                </Badge>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            WR ≥70% dan minimal 5x sinyal dalam 1 tahun
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Tidak ada emiten dengan WR ≥70% dan min 5 sinyal</p>
                      )}
                    </CardContent>
                  </Card>

                  {analisisInsights.consistent && (
                    <Card className="border-blue-500/30 bg-blue-500/5">
                      <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingUp className="h-4 w-4 text-blue-500" />
                          <span className="text-xs font-semibold text-blue-500">📊 Paling Konsisten</span>
                        </div>
                        <p className="text-sm font-bold text-foreground">{analisisInsights.consistent.ticker} — {analisisInsights.consistent.screener}</p>
                        <p className="text-xs text-muted-foreground">WR {analisisInsights.consistent.winRate.toFixed(1)}% ({analisisInsights.consistent.total} sinyal)</p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Ranking table */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Ranking Emiten × Screener (Lolos Scan Hari Ini)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 mb-4 items-center">
                      <Select value={ahFilterScreener} onValueChange={setAhFilterScreener}>
                        <SelectTrigger className="w-52 h-8 text-xs">
                          <SelectValue placeholder="Filter Screener" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Screener</SelectItem>
                          {SCREENER_NAMES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={ahFilterWrMin} onValueChange={setAhFilterWrMin}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue placeholder="Win Rate Min" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">WR Semua</SelectItem>
                          <SelectItem value="50">&gt;50%</SelectItem>
                          <SelectItem value="60">&gt;60%</SelectItem>
                          <SelectItem value="70">&gt;70%</SelectItem>
                          <SelectItem value="80">&gt;80%</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={ahFilterSignalMin} onValueChange={setAhFilterSignalMin}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue placeholder="Min Sinyal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua</SelectItem>
                          <SelectItem value="3">&gt;3x</SelectItem>
                          <SelectItem value="5">&gt;5x</SelectItem>
                          <SelectItem value="10">&gt;10x</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground ml-auto">{analisisDisplayData.length} hasil</span>
                    </div>

                    <div className="max-h-[600px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {([
                              ["ticker", "Ticker"],
                              ["screener", "Screener"],
                              ["total", "Total Sinyal"],
                              ["wins", "WIN"],
                              ["losses", "LOSE"],
                              ["winRate", "Win Rate %"],
                              ["avgGainWin", "Avg % (WIN)"],
                              ["lastSignalDate", "Last Signal"],
                            ] as [AnalisisSortKey, string][]).map(([key, label]) => (
                              <TableHead
                                key={key}
                                className="text-xs cursor-pointer select-none hover:text-foreground"
                                onClick={() => handleAhSort(key)}
                              >
                                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                  {label}
                                  <AhSortIcon col={key} />
                                </span>
                              </TableHead>
                            ))}
                            <TableHead className="text-xs">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analisisDisplayData.slice(0, 300).map((r, idx) => {
                            const rowKey = `${r.ticker}-${r.screener}`;
                            const isExpanded = expandedChartTickers.has(rowKey);
                            const toggleExpand = () => {
                              setExpandedChartTickers(prev => {
                                const next = new Set(prev);
                                if (next.has(rowKey)) next.delete(rowKey);
                                else next.add(rowKey);
                                return next;
                              });
                            };
                            return (
                              <>
                                <TableRow
                                  id={`analisa-row-${r.ticker}`}
                                  key={rowKey}
                                  className={cn(
                                    "cursor-pointer transition-colors",
                                    highlightTicker === r.ticker && "ring-2 ring-primary/50 bg-primary/5",
                                    r.winRate >= 70 ? "bg-green-500/5" : r.winRate >= 50 ? "bg-yellow-500/5" : "bg-red-500/5",
                                    isExpanded && "border-b-0"
                                  )}
                                  onClick={toggleExpand}
                                >
                                  <TableCell className="text-xs font-mono font-bold">
                                    <div className="flex items-center gap-1">
                                      <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isExpanded && "rotate-180")} />
                                      {r.ticker}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs whitespace-nowrap">{r.screener}</TableCell>
                                  <TableCell className="text-center font-mono text-xs">{r.total}</TableCell>
                                  <TableCell className="text-center font-mono text-xs text-green-500">{r.wins}</TableCell>
                                  <TableCell className="text-center font-mono text-xs text-red-500">{r.losses}</TableCell>
                                  <TableCell className="text-center">
                                    <span className={cn("font-bold font-mono text-xs",
                                      r.winRate >= 70 ? "text-green-500" : r.winRate >= 50 ? "text-yellow-600" : "text-red-500"
                                    )}>
                                      {r.winRate.toFixed(1)}%
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center font-mono text-xs">{r.avgGainWin.toFixed(2)}%</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{r.lastSignalDate}</TableCell>
                                  <TableCell>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-[10px] px-2"
                                      onClick={(e) => { e.stopPropagation(); navigate(`/historical-backtest?ticker=${r.ticker}&from=screener`); }}
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />Detail
                                    </Button>
                                  </TableCell>
                                </TableRow>
                                {isExpanded && (
                                  <tr key={`${rowKey}-chart`}>
                                    <td colSpan={9} className="p-0 border-b border-border">
                                      <div className="animate-in slide-in-from-top-2 duration-300">
                                        <InlineStockChart ticker={r.ticker} />
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </TableBody>
                      </Table>
                      {analisisDisplayData.length > 300 && (
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          Menampilkan 300 dari {analisisDisplayData.length} hasil
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {!isAnalyzing && analysisDone && analisisRows.length === 0 && (
              <Card>
                <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
                  <p>Tidak ada data historis yang ditemukan untuk emiten yang lolos scan.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      <StockTradeStatsModal
        ticker={selectedTicker}
        currentPrice={selectedTicker ? allStockData.find(s => s.ticker === selectedTicker)?.close ?? null : null}
        onClose={() => setSelectedTicker(null)}
      />

      <TickerBacktestPopup
        ticker={backtestTicker}
        tickerName={backtestTicker ? allStockData.find(s => s.ticker === backtestTicker)?.name : undefined}
        screenerNames={backtestTicker ? (tickerModuleMap[backtestTicker] || []) : []}
        onClose={() => setBacktestTicker(null)}
        onGoToAnalisa={handlePopupGoToAnalisa}
      />

      {chartTicker && (
        <StockChartPopup
          ticker={chartTicker.ticker}
          stockName={chartTicker.name || chartTicker.ticker}
          price={chartTicker.close}
          changePct={chartTicker.prevClose > 0 ? ((chartTicker.close - chartTicker.prevClose) / chartTicker.prevClose) * 100 : 0}
          open={!!chartTicker}
          onClose={() => setChartTicker(null)}
        />
      )}

      <SuperketatAnalysis
        ticker={skAnalysisTicker}
        onClose={() => setSkAnalysisTicker(null)}
      />
      </>)}
    </div>
  );
}
