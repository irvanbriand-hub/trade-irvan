import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { sma, bollingerBands, calcMACD } from "@/lib/chartIndicators";
import { ChevronDown, ChevronRight, RefreshCw, Flame, TrendingUp, ArrowUp, ArrowDown, Minus, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// RSI calc
function calcRSI(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

const PARAM_LABELS = [
  "Candle Color", "Volume Spike", "Gap Type",
  "Close vs SMA5", "Close vs SMA20", "Close vs SMA50",
  "RSI Zone", "MACD Status", "Value Trans"
];

const DAY_WEIGHTS = [0.40, 0.25, 0.15, 0.08, 0.05, 0.04, 0.03];

interface WatchItem {
  ticker: string;
  tanggal_ara_terakhir: string | null;
  pct_ara_terakhir: number | null;
  total_ara_count: number;
  last_score: number;
  last_score_date: string | null;
  scores: number[]; // d1-d7
  paramDetails: Record<string, { match: boolean; actual: string }[]>; // d1-d7 param details
  scoreTotal: number;
  prevScoreTotal: number | null;
  araHistory: { tanggal: string; pct: number; volume: number }[];
}

type SortKey = "ticker" | "scoreTotal" | "total_ara_count" | "tanggal_ara_terakhir" | "score_d1" | "score_d2" | "score_d3";

export default function AraWatchList() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [refreshTotal, setRefreshTotal] = useState(0);
  const [noData, setNoData] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState("d1");
  const [minScore, setMinScore] = useState(40);
  const [periode, setPeriode] = useState("3m");
  const [sortKey, setSortKey] = useState<SortKey>("scoreTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cancelRef = useRef(false);

  useEffect(() => { loadWatchlist(); }, [periode]);

  async function loadWatchlist() {
    setLoading(true);
    // Get ara_events based on periode filter
    const now = new Date();
    let fromDate = new Date();
    if (periode === "1m") fromDate.setMonth(now.getMonth() - 1);
    else if (periode === "3m") fromDate.setMonth(now.getMonth() - 3);
    else if (periode === "6m") fromDate.setMonth(now.getMonth() - 6);
    else fromDate.setFullYear(now.getFullYear() - 1);

    const fromStr = fromDate.toISOString().slice(0, 10);

    const { data: events, error } = await supabase
      .from("ara_events")
      .select("ticker, tanggal_ara, pct_change, volume")
      .gte("tanggal_ara", fromStr)
      .order("tanggal_ara", { ascending: false });

    if (error || !events || events.length === 0) {
      setNoData(true);
      setLoading(false);
      return;
    }

    setNoData(false);

    // Group by ticker
    const tickerMap = new Map<string, typeof events>();
    for (const e of events) {
      if (!tickerMap.has(e.ticker)) tickerMap.set(e.ticker, []);
      tickerMap.get(e.ticker)!.push(e);
    }

    // Load existing scores
    const today = new Date().toISOString().slice(0, 10);
    const tickers = Array.from(tickerMap.keys());
    const { data: existingScores } = await supabase
      .from("ara_watchlist_scores")
      .select("*")
      .in("ticker", tickers)
      .eq("tanggal_score", today);

    const scoreMap = new Map<string, any>();
    if (existingScores) {
      for (const s of existingScores) scoreMap.set(s.ticker, s);
    }

    // Load yesterday scores for trend
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    const { data: prevScores } = await supabase
      .from("ara_watchlist_scores")
      .select("ticker, score_total")
      .in("ticker", tickers)
      .eq("tanggal_score", yStr);

    const prevMap = new Map<string, number>();
    if (prevScores) {
      for (const s of prevScores) prevMap.set(s.ticker, Number(s.score_total));
    }

    const watchItems: WatchItem[] = [];
    for (const [ticker, evts] of tickerMap) {
      const sorted = evts.sort((a, b) => b.tanggal_ara.localeCompare(a.tanggal_ara));
      const sc = scoreMap.get(ticker);
      const scores = sc
        ? [sc.score_d1, sc.score_d2, sc.score_d3, sc.score_d4, sc.score_d5, sc.score_d6, sc.score_d7].map(Number)
        : [0, 0, 0, 0, 0, 0, 0];
      const scoreTotal = sc ? Number(sc.score_total) : 0;

      // Build param details from score record
      const paramDetails: Record<string, { match: boolean; actual: string }[]> = {};
      for (let d = 1; d <= 7; d++) {
        const key = `d${d}`;
        if (sc) {
          paramDetails[key] = [
            { match: !!sc[`${key}_candle`], actual: sc[`${key}_candle`] ? "Green" : "Red" },
            { match: !!sc[`${key}_volume_spike`], actual: sc[`${key}_volume_spike`] ? "Spike ✅" : "Normal" },
            { match: sc[`${key}_gap_type`] === "UP", actual: sc[`${key}_gap_type`] || "-" },
            { match: sc[`${key}_close_vs_sma5`] === "ABOVE", actual: sc[`${key}_close_vs_sma5`] || "-" },
            { match: sc[`${key}_close_vs_sma20`] === "ABOVE", actual: sc[`${key}_close_vs_sma20`] || "-" },
            { match: sc[`${key}_close_vs_sma50`] === "ABOVE", actual: sc[`${key}_close_vs_sma50`] || "-" },
            { match: ["40-60"].includes(sc[`${key}_rsi_zone`] || ""), actual: sc[`${key}_rsi_zone`] || "-" },
            { match: ["BULLISH_CROSS", "BULLISH"].includes(sc[`${key}_macd_status`] || ""), actual: sc[`${key}_macd_status`] || "-" },
            { match: !!sc[`${key}_value_ok`], actual: sc[`${key}_value_ok`] ? "Above Avg" : "Below Avg" },
          ];
        } else {
          paramDetails[key] = PARAM_LABELS.map(() => ({ match: false, actual: "-" }));
        }
      }

      watchItems.push({
        ticker,
        tanggal_ara_terakhir: sorted[0]?.tanggal_ara || null,
        pct_ara_terakhir: sorted[0]?.pct_change ? Number(sorted[0].pct_change) : null,
        total_ara_count: sorted.length,
        last_score: scoreTotal,
        last_score_date: sc?.tanggal_score || null,
        scores,
        paramDetails,
        scoreTotal,
        prevScoreTotal: prevMap.get(ticker) ?? null,
        araHistory: sorted.slice(0, 10).map(e => ({
          tanggal: e.tanggal_ara,
          pct: Number(e.pct_change),
          volume: Number(e.volume),
        })),
      });
    }

    setItems(watchItems);
    setLoading(false);
  }

  async function refreshScores() {
    setRefreshing(true);
    cancelRef.current = false;
    const tickers = items.map(i => i.ticker);
    setRefreshTotal(tickers.length);
    setRefreshProgress(0);

    const today = new Date().toISOString().slice(0, 10);

    // Delete today's scores first
    await supabase.from("ara_watchlist_scores").delete().eq("tanggal_score", today);

    const batchSize = 5;
    const allScores: any[] = [];

    for (let i = 0; i < tickers.length; i += batchSize) {
      if (cancelRef.current) break;
      const batch = tickers.slice(i, i + batchSize);

      const promises = batch.map(async (ticker) => {
        try {
          const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
            body: { ticker: ticker + ".JK", count: 100 },
          });
          if (error || !data?.candles?.length) return null;

          const candles = data.candles
            .filter((c: any) => c.open > 0 && c.close > 0)
            .sort((a: any, b: any) => a.time - b.time);

          if (candles.length < 30) return null;

          const closes = candles.map((c: any) => c.close);
          const opens = candles.map((c: any) => c.open);
          const volumes = candles.map((c: any) => c.volume);
          const values = candles.map((c: any) => c.close * c.volume);

          const sma5 = sma(closes, 5);
          const sma20 = sma(closes, 20);
          const sma50 = sma(closes, 50);
          const volSma20 = sma(volumes, 20);
          const valAvg30 = sma(values, 30);
          const rsiArr = calcRSI(closes, 14);
          const macdData = calcMACD(closes);
          const bb = bollingerBands(closes, 20, 2);

          const scoreRecord: any = { ticker, tanggal_score: today };
          const dayScores: number[] = [];

          // Last 7 trading days
          for (let d = 1; d <= 7; d++) {
            const idx = candles.length - d;
            if (idx < 1) { dayScores.push(0); continue; }

            const c = candles[idx];
            const prev = candles[idx - 1];
            const prefix = `d${d}`;

            const isGreen = c.close > c.open;
            const isVolSpike = volSma20[idx] != null && volSma20[idx]! > 0 && c.volume > volSma20[idx]! * 2;
            const gapType = c.open > prev.close * 1.005 ? "UP" : c.open < prev.close * 0.995 ? "DOWN" : "FLAT";
            const cSma5 = sma5[idx] != null && c.close >= sma5[idx]! ? "ABOVE" : "BELOW";
            const cSma20 = sma20[idx] != null && c.close >= sma20[idx]! ? "ABOVE" : "BELOW";
            const cSma50 = sma50[idx] != null && c.close >= sma50[idx]! ? "ABOVE" : "BELOW";

            const rsi = rsiArr[idx];
            let rsiZone = "<40";
            if (rsi >= 40 && rsi <= 60) rsiZone = "40-60";
            else if (rsi > 60 && rsi <= 70) rsiZone = "60-70";
            else if (rsi > 70) rsiZone = "OVERBOUGHT";
            else rsiZone = "OVERSOLD";

            const ml = macdData.macdLine[idx];
            const ms = macdData.signalLine[idx];
            const mlPrev = idx > 0 ? macdData.macdLine[idx - 1] : null;
            const msPrev = idx > 0 ? macdData.signalLine[idx - 1] : null;
            let macdStatus = "BEARISH";
            if (ml != null && ms != null) {
              if (ml > ms && mlPrev != null && msPrev != null && mlPrev <= msPrev) macdStatus = "BULLISH_CROSS";
              else if (ml > ms) macdStatus = "BULLISH";
              else if (ml < ms && mlPrev != null && msPrev != null && mlPrev >= msPrev) macdStatus = "BEARISH_CROSS";
            }

            const valOk = valAvg30[idx] != null && valAvg30[idx]! > 0 && (c.close * c.volume) > valAvg30[idx]!;

            // Score: count matches out of 9
            let matchCount = 0;
            if (isGreen) matchCount++;
            if (isVolSpike) matchCount++;
            if (gapType === "UP") matchCount++;
            if (cSma5 === "ABOVE") matchCount++;
            if (cSma20 === "ABOVE") matchCount++;
            if (cSma50 === "ABOVE") matchCount++;
            if (rsiZone === "40-60") matchCount++;
            if (macdStatus === "BULLISH_CROSS" || macdStatus === "BULLISH") matchCount++;
            if (valOk) matchCount++;

            const rawScore = (matchCount / 9) * 100;
            dayScores.push(rawScore);

            scoreRecord[`${prefix}_candle`] = isGreen;
            scoreRecord[`${prefix}_volume_spike`] = isVolSpike;
            scoreRecord[`${prefix}_gap_type`] = gapType;
            scoreRecord[`${prefix}_close_vs_sma5`] = cSma5;
            scoreRecord[`${prefix}_close_vs_sma20`] = cSma20;
            scoreRecord[`${prefix}_close_vs_sma50`] = cSma50;
            scoreRecord[`${prefix}_rsi_zone`] = rsiZone;
            scoreRecord[`${prefix}_macd_status`] = macdStatus;
            scoreRecord[`${prefix}_value_ok`] = valOk;
            scoreRecord[`score_${prefix}`] = rawScore;
          }

          // Weighted total
          let total = 0;
          for (let d = 0; d < 7; d++) total += (dayScores[d] || 0) * DAY_WEIGHTS[d];
          scoreRecord.score_total = total;

          return scoreRecord;
        } catch {
          return null;
        }
      });

      const results = await Promise.all(promises);
      for (const r of results) if (r) allScores.push(r);
      setRefreshProgress(Math.min(i + batchSize, tickers.length));
    }

    // Insert scores
    for (let i = 0; i < allScores.length; i += 50) {
      await supabase.from("ara_watchlist_scores").insert(allScores.slice(i, i + 50));
    }

    // Update ara_watchlist records
    for (const sc of allScores) {
      await supabase.from("ara_watchlist").upsert({
        ticker: sc.ticker,
        last_score: sc.score_total,
        last_score_date: today,
        updated_at: new Date().toISOString(),
      }, { onConflict: "ticker" });
    }

    setRefreshing(false);
    toast({ title: "Score updated", description: `${allScores.length} saham di-update` });
    loadWatchlist();
  }

  const filtered = useMemo(() => {
    let list = items.filter(i => i.scoreTotal >= minScore);
    list.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "ticker": va = a.ticker; vb = b.ticker; break;
        case "total_ara_count": va = a.total_ara_count; vb = b.total_ara_count; break;
        case "tanggal_ara_terakhir": va = a.tanggal_ara_terakhir || ""; vb = b.tanggal_ara_terakhir || ""; break;
        case "score_d1": va = a.scores[0]; vb = b.scores[0]; break;
        case "score_d2": va = a.scores[1]; vb = b.scores[1]; break;
        case "score_d3": va = a.scores[2]; vb = b.scores[2]; break;
        default: va = a.scoreTotal; vb = b.scoreTotal;
      }
      if (sortDir === "asc") return va > vb ? 1 : -1;
      return va < vb ? 1 : -1;
    });
    return list;
  }, [items, minScore, sortKey, sortDir]);

  const strongCandidates = items.filter(i => i.scoreTotal >= 75);
  const scoreUpCount = items.filter(i => i.prevScoreTotal !== null && i.scoreTotal > i.prevScoreTotal).length;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === "desc" ? <ChevronDown className="h-3 w-3 inline" /> : <ArrowUp className="h-3 w-3 inline" />;
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 75) return "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    if (score >= 60) return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
    if (score >= 40) return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500 border-yellow-500/20";
    return "bg-muted text-muted-foreground";
  };

  const getRowBg = (score: number) => {
    if (score >= 75) return "bg-yellow-500/5 border-l-2 border-l-yellow-500";
    if (score >= 60) return "bg-green-500/5 border-l-2 border-l-green-500";
    if (score >= 40) return "bg-yellow-500/5 border-l-2 border-l-yellow-600/30";
    return "";
  };

  const getTrend = (item: WatchItem) => {
    if (item.prevScoreTotal === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
    if (item.scoreTotal > item.prevScoreTotal) return <ArrowUp className="h-3 w-3 text-green-500" />;
    if (item.scoreTotal < item.prevScoreTotal) return <ArrowDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  if (loading) {
    return (
      <Card><CardContent className="p-6 text-center text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
        Memuat ARA Watch List...
      </CardContent></Card>
    );
  }

  if (noData) {
    return (
      <Card><CardContent className="p-6 text-center space-y-3">
        <AlertCircle className="h-8 w-8 mx-auto text-yellow-500" />
        <p className="font-medium">Belum ada data ARA</p>
        <p className="text-sm text-muted-foreground">
          Jalankan Scan ARA Historis di tab Phase 1 terlebih dahulu.
        </p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">🎯 ARA Watch List</h2>
          <p className="text-xs text-muted-foreground">Monitor saham yang pernah ARA — deteksi pola pre-ARA ulang</p>
        </div>
        <Button onClick={refreshScores} disabled={refreshing} size="sm" variant="outline">
          <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? `${refreshProgress}/${refreshTotal}` : "🔄 Refresh Score"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Periode:</span>
          {["1m", "3m", "6m", "1y"].map(p => (
            <Badge
              key={p}
              variant={periode === p ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setPeriode(p)}
            >
              {p === "1m" ? "1 Bulan" : p === "3m" ? "3 Bulan" : p === "6m" ? "6 Bulan" : "1 Tahun"}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Min Score: {minScore}%</span>
          <Slider value={[minScore]} onValueChange={([v]) => setMinScore(v)} min={0} max={100} step={5} className="w-[120px]" />
        </div>
      </div>

      {/* Refresh Progress */}
      {refreshing && (
        <Card><CardContent className="p-3 space-y-1">
          <Progress value={(refreshProgress / refreshTotal) * 100} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">Menghitung score: {refreshProgress} / {refreshTotal}</p>
        </CardContent></Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold">{items.length}</div>
          <div className="text-xs text-muted-foreground">Total Watch</div>
        </CardContent></Card>
        <Card className="border-yellow-500/30"><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold text-yellow-500">{strongCandidates.length}</div>
          <div className="text-xs text-muted-foreground">Score ≥75% 🔥</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold text-green-500">{scoreUpCount}</div>
          <div className="text-xs text-muted-foreground">Score Naik ↑</div>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <div className="text-2xl font-bold">{filtered.length}</div>
          <div className="text-xs text-muted-foreground">Filtered</div>
        </CardContent></Card>
      </div>

      {/* Strong Candidates Alert */}
      {strongCandidates.length > 0 && (
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2 font-bold text-yellow-600 dark:text-yellow-400">
              <Flame className="h-4 w-4" /> ARA KANDIDAT KUAT HARI INI!
            </div>
            <div className="space-y-1">
              {strongCandidates.slice(0, 5).map(c => (
                <div key={c.ticker} className="flex items-center gap-3 text-sm">
                  <span className="font-bold">{c.ticker}</span>
                  <Badge className={getScoreBadgeClass(c.scoreTotal)}>{c.scoreTotal.toFixed(0)}%</Badge>
                  <span className="text-xs text-muted-foreground">
                    D-1: {c.scores[0].toFixed(0)}% | D-2: {c.scores[1].toFixed(0)}% | D-3: {c.scores[2].toFixed(0)}%
                  </span>
                  {c.tanggal_ara_terakhir && (
                    <span className="text-xs text-muted-foreground">
                      ARA: {c.tanggal_ara_terakhir} (+{c.pct_ara_terakhir?.toFixed(0)}%)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("ticker")}>Ticker <SortIcon k="ticker" /></TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("tanggal_ara_terakhir")}>Last ARA <SortIcon k="tanggal_ara_terakhir" /></TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("total_ara_count")}>Count <SortIcon k="total_ara_count" /></TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("scoreTotal")}>Score <SortIcon k="scoreTotal" /></TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("score_d1")}>D-1 <SortIcon k="score_d1" /></TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("score_d2")}>D-2 <SortIcon k="score_d2" /></TableHead>
                <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("score_d3")}>D-3 <SortIcon k="score_d3" /></TableHead>
                <TableHead className="text-center">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Tidak ada saham dengan score ≥ {minScore}%
                </TableCell></TableRow>
              )}
              {filtered.map(item => (
                <Collapsible key={item.ticker} open={expandedRow === item.ticker} onOpenChange={o => setExpandedRow(o ? item.ticker : null)} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow className={`cursor-pointer ${getRowBg(item.scoreTotal)}`}>
                        <TableCell>{expandedRow === item.ticker ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                        <TableCell className="font-bold">{item.ticker}</TableCell>
                        <TableCell className="text-center text-xs">
                          {item.tanggal_ara_terakhir || "-"}
                          {item.pct_ara_terakhir != null && <span className="text-green-500 ml-1">+{item.pct_ara_terakhir.toFixed(0)}%</span>}
                        </TableCell>
                        <TableCell className="text-center">{item.total_ara_count}x</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-1 justify-center">
                            <Progress value={item.scoreTotal} className="h-2 w-12" />
                            <Badge className={`text-xs ${getScoreBadgeClass(item.scoreTotal)}`}>{item.scoreTotal.toFixed(0)}%</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className="text-xs">{item.scores[0].toFixed(0)}%</Badge></TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className="text-xs">{item.scores[1].toFixed(0)}%</Badge></TableCell>
                        <TableCell className="text-center"><Badge variant="outline" className="text-xs">{item.scores[2].toFixed(0)}%</Badge></TableCell>
                        <TableCell className="text-center">{getTrend(item)}</TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <TableRow>
                        <TableCell colSpan={9} className="p-0">
                          <div className="p-4 bg-muted/30 space-y-4">
                            {/* Section A: Score Timeline */}
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Score Breakdown D-7 → D-1</h4>
                              <div className="flex items-end gap-1 h-16">
                                {[...item.scores].reverse().map((s, i) => (
                                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">{s.toFixed(0)}%</span>
                                    <div
                                      className={`w-full rounded-t ${s >= 75 ? "bg-yellow-500" : s >= 60 ? "bg-green-500" : s >= 40 ? "bg-yellow-600/60" : "bg-muted-foreground/30"}`}
                                      style={{ height: `${Math.max(s * 0.5, 4)}px` }}
                                    />
                                    <span className="text-[10px] text-muted-foreground">D-{7 - i}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Section B: Parameter Detail */}
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Parameter Detail</h4>
                              <Tabs value={detailTab} onValueChange={setDetailTab}>
                                <TabsList className="h-8">
                                  {[1, 2, 3, 4, 5, 6, 7].map(d => (
                                    <TabsTrigger key={d} value={`d${d}`} className="text-xs px-2 py-1">D-{d}</TabsTrigger>
                                  ))}
                                </TabsList>
                                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                                  <TabsContent key={d} value={`d${d}`}>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Parameter</TableHead>
                                          <TableHead className="text-xs text-center">Status</TableHead>
                                          <TableHead className="text-xs">Nilai</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {PARAM_LABELS.map((label, pi) => {
                                          const p = item.paramDetails[`d${d}`]?.[pi];
                                          return (
                                            <TableRow key={label}>
                                              <TableCell className="text-xs py-1">{label}</TableCell>
                                              <TableCell className="text-center text-xs py-1">{p?.match ? "✅" : "❌"}</TableCell>
                                              <TableCell className="text-xs py-1 text-muted-foreground">{p?.actual || "-"}</TableCell>
                                            </TableRow>
                                          );
                                        })}
                                        <TableRow className="font-semibold">
                                          <TableCell className="text-xs py-1">SCORE D-{d}</TableCell>
                                          <TableCell className="text-center text-xs py-1">
                                            {item.paramDetails[`d${d}`]?.filter(p => p.match).length || 0}/9
                                          </TableCell>
                                          <TableCell className="text-xs py-1">
                                            <Badge className={getScoreBadgeClass(item.scores[d - 1])}>{item.scores[d - 1].toFixed(1)}%</Badge>
                                          </TableCell>
                                        </TableRow>
                                      </TableBody>
                                    </Table>
                                  </TabsContent>
                                ))}
                              </Tabs>
                            </div>

                            {/* Section C: ARA History */}
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Riwayat ARA</h4>
                              {item.araHistory.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Tidak ada riwayat</p>
                              ) : (
                                <div className="space-y-1">
                                  {item.araHistory.map((h, i) => (
                                    <div key={i} className="flex items-center gap-3 text-xs">
                                      <span className="text-muted-foreground w-20">{h.tanggal}</span>
                                      <Badge variant="outline" className="text-green-500">+{h.pct.toFixed(1)}%</Badge>
                                      <span className="text-muted-foreground">Vol: {(h.volume / 1e6).toFixed(1)}M</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
