import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ScanSearch, AlertCircle, Clock, ArrowUp, ArrowDown, CandlestickChart, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getScreenerStore, updateScreenerStore } from "@/lib/screenerStore";
import { SuperketatAnalysis } from "@/components/SuperketatAnalysis";
import { AiInsightButton, AiInsightPanel } from "@/components/AiInsightRow";
import { StockChartPopup } from "@/components/StockChartPopup";
import { format } from "date-fns";
import { useBandarmology, type BandarmologyRow } from "@/hooks/useBandarmology";
import { useAccumWatch } from "@/hooks/useAccumWatch";
import { useAkSmartMoney } from "@/hooks/useAkSmartMoney";
import { AkSmartMoneyBadgeComponent } from "@/components/AkSmartMoneyBadge";

export interface SKStockData {
  ticker: string;
  name: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  value: number;
  prevClose: number;
  changePct: number;
  vv1: number;
  vv0: number;
  vm60: number;
  vma60: number;
  v3ma60: number;
  v5ma60: number;
  v10ma60: number;
  v30ma90: number;
  vok: boolean;
  vokTipe: string;
  rp: number;
  ma3: number;
  ma5: number;
  ma10: number;
  ma20: number;
  ma50: number;
  dma3: number;
  dma5: number;
  dma10: number;
  dma20: number;
  dma50: number;
  tma20: number;
  tma50: number;
  ii: number;
  iiy: number;
  is_val: number;
  k5: number;
  d5: number;
  adx13: number;
  safebull: boolean;
  safemsp: boolean;
  jalur: string;
  macdKondisi: string;
  stochKondisi: string;
  adxKondisi: string;
  isConfluence: boolean;
}

type SortKey = "ticker" | "close" | "value" | "ii" | "tma20" | "jalur" | "changePct";
type SortDir = "asc" | "desc";
const BATCH_SIZE = 100;

const _store = getScreenerStore();

export function SuperketatScreener() {
  const [stocks, setStocks] = useState<SKStockData[]>(_store.skStocks || []);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(_store.skLastScanTime || null);
  const [hasScanRun, setHasScanRun] = useState(_store.skHasScanRun || false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanProgressPct, setScanProgressPct] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [searchTicker, setSearchTicker] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ii");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [skAnalysisTicker, setSkAnalysisTicker] = useState<string | null>(null);
  const [chartTicker, setChartTicker] = useState<SKStockData | null>(null);
  const [onlyConfluence, setOnlyConfluence] = useState(false);
  const abortRef = useRef(false);
  const [aiExpandedTickers, setAiExpandedTickers] = useState<Set<string>>(new Set());
  const toggleAiExpand = (ticker: string) => setAiExpandedTickers(prev => {
    const next = new Set(prev);
    next.has(ticker) ? next.delete(ticker) : next.add(ticker);
    return next;
  });

  const { getTodayData, items: bandarItems } = useBandarmology();
  const { getWatching, confirmSuperketat } = useAccumWatch();
  const { getBadge: getAkBadge } = useAkSmartMoney(bandarItems);

  // Build accum data map for today
  const accumMap = useMemo(() => {
    const todayData = getTodayData();
    const map = new Map<string, BandarmologyRow>();
    for (const d of todayData) map.set(d.ticker, d);
    // Also check latest data if no today data
    if (todayData.length === 0) {
      const latestDate = bandarItems.length > 0 ? bandarItems[0]?.tanggal_data : null;
      if (latestDate) {
        for (const d of bandarItems.filter(b => b.tanggal_data === latestDate)) {
          if (!map.has(d.ticker)) map.set(d.ticker, d);
        }
      }
    }
    return map;
  }, [bandarItems, getTodayData]);

  const watchingTickers = useMemo(() => {
    return new Set(getWatching().map(w => w.ticker));
  }, [getWatching]);

  // Accum alert: tickers in watch that are now in SK scan
  const accumAlerts = useMemo(() => {
    if (stocks.length === 0) return [];
    return stocks.filter(s => watchingTickers.has(s.ticker)).map(s => {
      const bandar = accumMap.get(s.ticker);
      const watch = getWatching().find(w => w.ticker === s.ticker);
      return { stock: s, bandar, watch };
    });
  }, [stocks, watchingTickers, accumMap, getWatching]);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setScanError(null);
    setHasScanRun(true);
    setScanProgress("Menghubungi server...");
    setScanProgressPct(0);
    abortRef.current = false;

    const accumulated: SKStockData[] = [];

    try {
      const firstResp = await supabase.functions.invoke("yahoo-finance-sk-screener", {
        body: { batchIndex: 0, batchSize: BATCH_SIZE },
      });
      if (firstResp.error) throw new Error(firstResp.error.message);

      const totalBatches = firstResp.data?.totalBatches || 1;
      const totalTickers = firstResp.data?.totalTickers || 0;

      if (firstResp.data?.stocks) accumulated.push(...firstResp.data.stocks);
      setStocks([...accumulated]);
      setScanProgress(`Batch 1/${totalBatches} (${accumulated.length} lolos)`);
      setScanProgressPct(Math.round((1 / totalBatches) * 100));

      for (let i = 1; i < totalBatches; i += 2) {
        if (abortRef.current) break;
        const promises = [];
        for (let j = i; j < Math.min(i + 2, totalBatches); j++) {
          promises.push(supabase.functions.invoke("yahoo-finance-sk-screener", {
            body: { batchIndex: j, batchSize: BATCH_SIZE },
          }));
        }
        const results = await Promise.all(promises);
        for (const r of results) {
          if (r.data?.stocks) accumulated.push(...r.data.stocks);
        }
        setStocks([...accumulated]);
        const done = Math.min(i + 2, totalBatches);
        setScanProgress(`Batch ${done}/${totalBatches} (${accumulated.length} lolos)`);
        setScanProgressPct(Math.round((done / totalBatches) * 100));
      }

      const scanTime = new Date();
      setLastScanTime(scanTime);
      updateScreenerStore({ skStocks: [...accumulated], skLastScanTime: scanTime, skHasScanRun: true });
      toast({ title: "Scan Superketat selesai!", description: `${accumulated.length} saham lolos dari ${totalTickers} total` });
    } catch (err: any) {
      setScanError(err.message);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
      setScanProgress("");
      setScanProgressPct(0);
    }
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const displayData = useMemo(() => {
    let data = stocks;
    if (searchTicker) data = data.filter(r => r.ticker.includes(searchTicker.toUpperCase()));
    if (onlyConfluence) data = data.filter(r => r.isConfluence);
    // Confluence first, then sort
    return [...data].sort((a, b) => {
      // Confluence priority
      if (a.isConfluence && !b.isConfluence) return -1;
      if (!a.isConfluence && b.isConfluence) return 1;
      const av = a[sortKey as keyof SKStockData];
      const bv = b[sortKey as keyof SKStockData];
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [stocks, searchTicker, sortKey, sortDir, onlyConfluence]);

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

  const jalurBadge = (jalur: string) => {
    if (jalur === "KEDUANYA") return <Badge className="text-[8px] bg-purple-500/10 text-purple-400 border-purple-500/30">KEDUANYA</Badge>;
    if (jalur === "SAFEBULL") return <Badge className="text-[8px] bg-green-500/10 text-green-400 border-green-500/30">SAFEBULL</Badge>;
    return <Badge className="text-[8px] bg-blue-500/10 text-blue-400 border-blue-500/30">SAFEMSP</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Scan button area */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {lastScanTime && !isScanning && (
          <span className="text-[10px] text-muted-foreground">
            Scanned: {lastScanTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} • {stocks.length} lolos
          </span>
        )}
        <Button onClick={handleScan} disabled={isScanning} size="sm" className="text-xs sm:text-sm">
          {isScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ScanSearch className="h-4 w-4 mr-1" />}
          {isScanning ? "Scanning..." : "SCAN SUPERKETAT"}
        </Button>
      </div>

      {/* Progress */}
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
          <p className="text-lg font-medium">Scanning Superketat...</p>
          <p className="text-sm mt-1">{scanProgress || "Memulai..."}</p>
        </div>
      )}

      {!isScanning && scanError && stocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-10 w-10 mb-3 opacity-60" />
          <p className="text-sm">{scanError}</p>
          <Button variant="outline" className="mt-4" onClick={handleScan}>Coba Lagi</Button>
        </div>
      )}

      {!isScanning && !hasScanRun && stocks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ScanSearch className="h-10 w-10 mb-3 opacity-30" />
          <p className="text-lg font-medium">Belum ada hasil scan Superketat</p>
          <p className="text-sm mt-1">Klik "SCAN SUPERKETAT" untuk memulai</p>
        </div>
      )}

      {/* Data banner */}
      {!isScanning && hasScanRun && stocks.length > 0 && lastScanTime && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            Scan terakhir:{" "}
            <span className="font-medium text-foreground">
              {(() => {
                const now = new Date();
                const isToday = lastScanTime.toDateString() === now.toDateString();
                const timeStr = lastScanTime.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
                return isToday ? `Hari ini ${timeStr} WIB` : `${format(lastScanTime, "dd/MM/yyyy")} ${timeStr} WIB`;
              })()}
            </span>
            {" • "}<span className="font-bold text-primary">{stocks.length}</span> saham lolos Superketat
          </span>
          <Button variant="outline" size="sm" className="ml-auto h-6 text-[10px] px-2" onClick={handleScan}>
            <ScanSearch className="h-3 w-3 mr-1" />Scan Ulang
          </Button>
        </div>
      )}

      {/* Accum Alert Card */}
      {!isScanning && accumAlerts.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Landmark className="h-4 w-4 text-yellow-500" />
              🎯 BROKER CONFIRM HARI INI! ({accumAlerts.length} saham)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {accumAlerts.map(({ stock, bandar, watch }) => (
                <Tooltip key={stock.ticker}>
                  <TooltipTrigger>
                    <Badge className={cn("text-[10px] cursor-help",
                      (bandar?.tier === "S") ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
                      (bandar?.tier === "A") ? "bg-green-500/10 text-green-400 border-green-500/30" :
                      "bg-blue-500/10 text-blue-400 border-blue-500/30"
                    )}>
                      {stock.ticker} {bandar?.tier || "?"} | {bandar?.source_count ? "⭐".repeat(bandar.source_count) : "⭐"} | {bandar?.streak || 0}d↑
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs space-y-0.5">
                    <p>Tier: {bandar?.tier} | Composite: {bandar?.composite_pct?.toFixed(1)}%</p>
                    <p>Broker akumulasi {watch ? Math.floor((Date.now() - new Date(watch.tanggal_pertama_accum).getTime()) / 86400000) : "?"} hari lalu</p>
                    {bandar?.is_topv && <p>📊 TopV confirmed</p>}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results table */}
      {!isScanning && stocks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-base font-bold text-foreground">{displayData.length} Saham Lolos</h2>
            <div className="flex items-center gap-2">
              <Switch id="sk-confluence" checked={onlyConfluence} onCheckedChange={setOnlyConfluence} />
              <Label htmlFor="sk-confluence" className="text-[10px] text-muted-foreground cursor-pointer">🔥 Hanya Confluence</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="sk-debug2" checked={showDebug} onCheckedChange={setShowDebug} />
              <Label htmlFor="sk-debug2" className="text-[10px] text-muted-foreground cursor-pointer">Debug</Label>
            </div>
            <Input
              placeholder="Cari ticker..."
              value={searchTicker}
              onChange={e => setSearchTicker(e.target.value)}
              className="h-7 text-[10px] w-28 sm:w-40 ml-auto"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs" style={{ minWidth: showDebug ? "1400px" : "700px" }}>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <Th col="ticker" label="Ticker" sortKey={sortKey} onClick={handleSort}><SortIcon col="ticker" /></Th>
                  <Th col="close" label="Harga" sortKey={sortKey} onClick={handleSort} right><SortIcon col="close" /></Th>
                  <Th col="changePct" label="Chg%" sortKey={sortKey} onClick={handleSort} right><SortIcon col="changePct" /></Th>
                  <Th col="value" label="Value" sortKey={sortKey} onClick={handleSort} right><SortIcon col="value" /></Th>
                  <Th col="jalur" label="Jalur" sortKey={sortKey} onClick={handleSort}><SortIcon col="jalur" /></Th>
                  <Th col="ii" label="ii Score" sortKey={sortKey} onClick={handleSort} right><SortIcon col="ii" /></Th>
                  <Th col="tma20" label="TMA20" sortKey={sortKey} onClick={handleSort} right><SortIcon col="tma20" /></Th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">MACD</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">Stoch</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">ADX</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">Confluence</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">Accum</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">🐋 SM</th>
                  <th className="px-1.5 py-2 text-[10px] font-semibold text-muted-foreground text-center">AI</th>
                  {showDebug && (
                    <>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">vv1</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">Vma60</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">V3</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">V5</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">V10</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">V30/90</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-center">VOK</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d3%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d5%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d10%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">d20%</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">TMA50</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">iiy</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-right">is</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-center">SB</th>
                      <th className="px-1 py-2 text-[9px] font-semibold text-muted-foreground text-center">SM</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayData.map((r, idx) => {
                  const isUp = r.changePct > 0, isDown = r.changePct < 0;
                  return (
                    <React.Fragment key={r.ticker}>
                    <tr className={cn("border-b border-border/50 transition-colors hover:bg-accent/50", r.isConfluence ? "bg-yellow-500/10" : idx % 2 === 0 ? "bg-card" : "bg-card/50")}>
                      <td className="px-1.5 py-2">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setSkAnalysisTicker(r.ticker)} className="font-bold font-mono text-xs text-primary hover:underline cursor-pointer">
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
                      <td className="px-1.5 py-2">{jalurBadge(r.jalur)}</td>
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
                          r.stochKondisi === "Oversold" ? "border-blue-500/30 text-blue-500" :
                          r.stochKondisi === "Bullish" ? "border-green-500/30 text-green-500" :
                          "border-red-500/30 text-red-500"
                        )}>{r.stochKondisi}</Badge>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        <Badge variant="outline" className={cn("text-[8px]",
                          r.adxKondisi === "Strong Trend" ? "border-green-500/50 text-green-400" :
                          r.adxKondisi === "Building" ? "border-yellow-500/30 text-yellow-500" :
                          r.adxKondisi === "Weak Trend" ? "border-muted-foreground/30 text-muted-foreground" :
                          "border-red-500/30 text-red-500"
                        )}>{r.adxKondisi}</Badge>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        {r.isConfluence ? (
                          <Badge className="text-[8px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30 cursor-help" title={`vv0: ${(r.vv0 || 0).toFixed(2)}\nvv1: ${r.vv1.toFixed(2)}\nVm60: ${(r.vm60 || 0).toFixed(2)}\nrp: ${r.rp.toFixed(1)}jt`}>
                            🔥 SK+VOL
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[8px] text-muted-foreground">SK</Badge>
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
                      {showDebug && (
                        <>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.vv1 > 2 ? "text-green-500" : "text-muted-foreground")}>{r.vv1.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.vma60 > 2 ? "text-green-500" : "text-muted-foreground")}>{r.vma60.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.v3ma60 > 2 ? "text-green-500" : "text-muted-foreground")}>{r.v3ma60.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.v5ma60 > 2 ? "text-green-500" : "text-muted-foreground")}>{r.v5ma60.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.v10ma60 > 2 ? "text-green-500" : "text-muted-foreground")}>{r.v10ma60.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.v30ma90 > 2 ? "text-green-500" : "text-muted-foreground")}>{r.v30ma90.toFixed(2)}</td>
                          <td className="px-1 py-2 text-center text-[9px]">
                            <span className={r.vok ? "text-green-500 font-bold" : "text-red-500"}>
                              {r.vok ? "✓" : "✗"} <span className="text-[8px] text-muted-foreground">{r.vokTipe}</span>
                            </span>
                      </td>
                      <td className="px-1.5 py-2 text-center">
                        {(() => {
                          const acc = accumMap.get(r.ticker);
                          const inWatch = watchingTickers.has(r.ticker);
                          if (inWatch && acc) {
                            return (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className={cn("text-[8px]",
                                    acc.tier === "S" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
                                    acc.tier === "A" ? "bg-green-500/10 text-green-400 border-green-500/30" :
                                    "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                  )}>
                                    {acc.tier === "S" ? "🔥" : "⭐"} {acc.tier} | {"⭐".repeat(acc.source_count)} | {acc.streak || 0}d↑
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs space-y-0.5">
                                  <p>Tier: {acc.tier} | Composite: {acc.composite_pct?.toFixed(1)}%</p>
                                  <p>Daily: {acc.daily_pct?.toFixed(1)}% | Weekly: {acc.weekly_pct?.toFixed(1)}%</p>
                                  {acc.top1_pct && <p>Top1: {acc.top1_pct.toFixed(1)}% ({acc.top1_broker})</p>}
                                  {acc.is_topv && <p>📊 TopV</p>}
                                </TooltipContent>
                              </Tooltip>
                            );
                          } else if (acc) {
                            return <Badge variant="outline" className="text-[8px] text-muted-foreground">🏦 {acc.composite_pct?.toFixed(0)}%</Badge>;
                          }
                          return null;
                        })()}
                      </td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.dma3 < 0 ? "text-green-500" : "text-red-500")}>{r.dma3.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.dma5 < 0 ? "text-green-500" : "text-red-500")}>{r.dma5.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.dma10 < 0 ? "text-green-500" : "text-red-500")}>{r.dma10.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.dma20 < 0 ? "text-green-500" : "text-red-500")}>{r.dma20.toFixed(2)}</td>
                          <td className="px-1 py-2 text-right font-mono text-[9px] text-muted-foreground">{r.tma50.toFixed(2)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.iiy > 0 ? "text-green-500" : r.iiy < 0 ? "text-red-500" : "text-muted-foreground")}>{r.iiy.toFixed(1)}</td>
                          <td className={cn("px-1 py-2 text-right font-mono text-[9px]", r.is_val > 0 ? "text-green-500" : r.is_val < 0 ? "text-red-500" : "text-muted-foreground")}>{r.is_val.toFixed(1)}</td>
                          <td className="px-1 py-2 text-center text-[9px]">{r.safebull ? <span className="text-green-500">✓</span> : <span className="text-red-500">✗</span>}</td>
                          <td className="px-1 py-2 text-center text-[9px]">{r.safemsp ? <span className="text-green-500">✓</span> : <span className="text-red-500">✗</span>}</td>
                        </>
                      )}
                    </tr>
                    {aiExpandedTickers.has(r.ticker) && (
                      <tr><td colSpan={99} className="p-0">
                        <AiInsightPanel onClose={() => setAiExpandedTickers(prev => { const n = new Set(prev); n.delete(r.ticker); return n; })}
                          ticker={r.ticker} price={r.close} changePct={r.changePct} volume={r.value}
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

      {/* SK Analysis dialog */}
      <SuperketatAnalysis ticker={skAnalysisTicker} onClose={() => setSkAnalysisTicker(null)} />

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

// Helper column header component
function Th({ col, label, sortKey, onClick, right, children }: {
  col: SortKey; label: string; sortKey: SortKey; onClick: (k: SortKey) => void; right?: boolean; children?: React.ReactNode;
}) {
  return (
    <th
      onClick={() => onClick(col)}
      className={cn(
        "px-1.5 py-2 font-semibold text-[10px] uppercase tracking-wider cursor-pointer select-none hover:text-primary transition-colors whitespace-nowrap",
        right ? "text-right" : "text-left",
        sortKey === col ? "text-primary" : "text-muted-foreground"
      )}
    >
      {label}{children}
    </th>
  );
}
