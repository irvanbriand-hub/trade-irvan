import React, { useState, useMemo, useEffect } from "react";
import { format, subYears } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Loader2, TrendingUp, TrendingDown, Trophy, Calendar, BarChart3, Zap, Target, Activity, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

// ========== INDICATOR HELPERS ==========

function calcSMA(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += arr[i];
  return sum / period;
}

function calcEMA(arr: number[], period: number): number[] {
  const ema: number[] = new Array(arr.length).fill(NaN);
  if (arr.length < period) return ema;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  ema[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < arr.length; i++) {
    ema[i] = arr[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

function calcBB(closes: number[], period: number, mult: number, idx: number) {
  if (idx < period - 1) return { mean: NaN, top: NaN, bottom: NaN, bandwidth: NaN };
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += closes[i];
  const mean = sum / period;
  let sqSum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sqSum += (closes[i] - mean) ** 2;
  const std = Math.sqrt(sqSum / period);
  const top = mean + mult * std;
  const bottom = mean - mult * std;
  const bandwidth = mean > 0 ? (top - bottom) / mean : 0;
  return { mean, top, bottom, bandwidth };
}

function calcLLV(lows: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let min = Infinity;
  for (let i = idx - period + 1; i <= idx; i++) {
    if (lows[i] < min) min = lows[i];
  }
  return min;
}

// ========== TYPES ==========

interface Signal {
  date: string;
  dateNextDay: string | null;
  dateTs: number;
  screener: string;
  close: number;
  openNextDay: number | null;
  highNextDay: number | null;
  lowNextDay: number | null;
  pctCloseToHigh: number | null;
  result: "WIN" | "LOSE" | "N/A";
  gap: number | null;
  gapPct: number | null;
  kenaikanPct: number | null;
  drawdownPct: number | null;
  bias: string;
  biasEmoji: string;
  biasColor: string;
}

interface ScreenerStats {
  name: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGainWin: number;
  bestTrade: number;
  worstTrade: number;
  equityCurve: { idx: number; value: number }[];
  // Bias stats
  gapUpPct: number;
  gapDownPct: number;
  pctLangsungNaik: number;
  pctNaikSetelahnya: number;
  pctLangsungTurun: number;
}

function classifyBias(close: number, openNext: number | null, highNext: number | null): { bias: string; biasEmoji: string; biasColor: string } {
  if (openNext == null || highNext == null) return { bias: "N/A", biasEmoji: "—", biasColor: "" };

  const isWin = highNext >= close * 1.02;
  const flatLo = close * 0.995;
  const flatHi = close * 1.005;
  const isFlat = openNext >= flatLo && openNext <= flatHi;
  const isGapUp = !isFlat && openNext > close;
  const isGapDown = !isFlat && openNext < close;

  if (isFlat && isWin) return { bias: "Flat - Naik Perlahan", biasEmoji: "📊", biasColor: "text-green-400" };
  if (isFlat && !isWin) return { bias: "Flat - Tidak Bergerak", biasEmoji: "➡️", biasColor: "text-muted-foreground" };
  if (isGapUp && isWin) return { bias: "Gap Up - Langsung Naik", biasEmoji: "🚀", biasColor: "text-green-500" };
  if (isGapUp && !isWin) return { bias: "Gap Up - Gagal Naik", biasEmoji: "⚠️", biasColor: "text-yellow-500" };
  if (isGapDown && isWin) return { bias: "Gap Down - Naik Setelahnya", biasEmoji: "📈", biasColor: "text-green-400" };
  if (isGapDown && !isWin) return { bias: "Gap Down - Langsung Turun", biasEmoji: "❌", biasColor: "text-red-500" };

  return { bias: "N/A", biasEmoji: "—", biasColor: "" };
}

const SCREENER_NAMES = [
  "BB MID BOUNCE",
  "BB BOTTOM REVERSAL",
  "MA50 BOUNCE",
  "MA200 BOUNCE",
  "V1 — Volume Breakout",
  "V1.2 — Pullback After Spike",
  "V2 — Big Move Breakout",
];

// ========== MAIN COMPONENT ==========

const HistoricalBacktest = () => {
  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get("ticker") || "");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [totalTradingDays, setTotalTradingDays] = useState(0);
  const [hasResult, setHasResult] = useState(false);
  const [filterScreener, setFilterScreener] = useState("all");
  const [filterResult, setFilterResult] = useState("all");
  const [screenerSort, setScreenerSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "winRate", dir: "desc" });
  const [expandedScreeners, setExpandedScreeners] = useState<Set<string>>(new Set());

  const autoRunRef = React.useRef(false);
  useEffect(() => {
    const urlTicker = searchParams.get("ticker");
    if (urlTicker && !autoRunRef.current) {
      autoRunRef.current = true;
      setTicker(urlTicker.toUpperCase());
      setTimeout(() => runBacktest(urlTicker.toUpperCase()), 100);
    }
  }, [searchParams]);

  const toggleExpand = (name: string) => {
    setExpandedScreeners(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const runBacktest = async (overrideTicker?: string) => {
    const t = (overrideTicker || ticker).trim().toUpperCase();
    if (!t) return;

    setLoading(true);
    setProgress(10);
    setHasResult(false);
    setSignals([]);
    setExpandedScreeners(new Set());

    try {
      setProgress(20);
      const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
        body: { ticker: t, count: 600 },
      });

      if (error || !data?.candles?.length) {
        throw new Error("Gagal mengambil data historis untuk " + t);
      }

      setCompanyName(data.companyName || t);
      setProgress(40);

      const candles = data.candles as { time: number; open: number; high: number; low: number; close: number; volume: number }[];
      candles.sort((a, b) => a.time - b.time);

      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const opens = candles.map(c => c.open);
      const volumes = candles.map(c => c.volume);
      const values = candles.map(c => c.close * c.volume);

      const ema10 = calcEMA(closes, 10);
      const ema20 = calcEMA(closes, 20);
      const ema50 = calcEMA(closes, 50);

      const now = new Date();
      const oneYearAgo = subYears(now, 1);
      const oneYearAgoTs = Math.floor(oneYearAgo.getTime() / 1000);

      let startIdx = candles.findIndex(c => c.time >= oneYearAgoTs);
      if (startIdx < 0) startIdx = 0;
      startIdx = Math.max(startIdx, 200);

      const periodStartDate = new Date(candles[startIdx].time * 1000);
      const periodEndDate = new Date(candles[candles.length - 1].time * 1000);
      setPeriodStart(format(periodStartDate, "dd MMM yyyy", { locale: idLocale }));
      setPeriodEnd(format(periodEndDate, "dd MMM yyyy", { locale: idLocale }));
      setTotalTradingDays(candles.length - startIdx);

      setProgress(60);

      const allSignals: Signal[] = [];

      for (let i = startIdx; i < candles.length; i++) {
        const c = closes[i];
        const h = highs[i];
        const l = lows[i];
        const v = volumes[i];
        const val = values[i];
        const prevC = closes[i - 1];
        const prevH = highs[i - 1];
        const prevL = lows[i - 1];
        const prevV = volumes[i - 1];
        const prev2C = closes[i - 2];
        const prev2H = highs[i - 2];
        const prev3C = closes[i - 3];

        const sma5 = calcSMA(closes, 5, i);
        const sma50 = calcSMA(closes, 50, i);
        const sma200 = calcSMA(closes, 200, i);
        const bb = calcBB(closes, 20, 2, i);
        const prevBb = calcBB(closes, 20, 2, i - 1);
        const llvLow5 = calcLLV(lows, 5, i);

        const e10 = ema10[i];
        const e20 = ema20[i];
        const e50 = ema50[i];

        const screenerHits: string[] = [];

        if (!isNaN(bb.mean) && !isNaN(e10) && !isNaN(e20) && !isNaN(e50) &&
          c >= bb.mean * 0.98 && c <= bb.mean * 1.02 &&
          e10 > e20 && e20 > e50 && bb.bandwidth >= 0.1 && c > bb.mean)
          screenerHits.push("BB MID BOUNCE");

        if (!isNaN(prevBb.bottom) && prevL < prevBb.bottom && prevC < prevBb.bottom &&
          c > bb.bottom && v > prevV && h > prevH && c > prevC)
          screenerHits.push("BB BOTTOM REVERSAL");

        if (!isNaN(sma50) && !isNaN(llvLow5) && llvLow5 > sma50 && c >= sma50 * 0.99 && c <= sma50 * 1.02)
          screenerHits.push("MA50 BOUNCE");

        if (!isNaN(sma200) && !isNaN(llvLow5) && llvLow5 > sma200 && c >= sma200 * 0.99 && c <= sma200 * 1.02)
          screenerHits.push("MA200 BOUNCE");

        if (v > prevV && c > prevC && c > sma5 && val > 5_000_000_000)
          screenerHits.push("V1 — Volume Breakout");

        if (!isNaN(sma5) && c > sma5 && prevC > calcSMA(closes, 5, i - 1) &&
          prev2C > calcSMA(closes, 5, i - 2) && prev2H / prev3C >= 1.1 &&
          prevC < prev2C && c < prevC && val > 1_000_000_000)
          screenerHits.push("V1.2 — Pullback After Spike");

        if (v > prevV && c > prevC && c > sma5 && h / prevC >= 1.10 && val > 5_000_000_000)
          screenerHits.push("V2 — Big Move Breakout");

        for (const screener of screenerHits) {
          const hasNext = i + 1 < candles.length;
          const openNext = hasNext ? opens[i + 1] : null;
          const highNext = hasNext ? highs[i + 1] : null;
          const lowNext = hasNext ? lows[i + 1] : null;
          const dateNext = hasNext ? format(new Date(candles[i + 1].time * 1000), "yyyy-MM-dd") : null;

          const pct = highNext != null ? ((highNext - c) / c) * 100 : null;
          const result: Signal["result"] = highNext == null ? "N/A" : highNext >= c * 1.02 ? "WIN" : "LOSE";

          const gap = openNext != null ? openNext - c : null;
          const gapPct = openNext != null ? ((openNext - c) / c) * 100 : null;
          const kenaikanPct = highNext != null ? ((highNext - c) / c) * 100 : null;
          const drawdownPct = lowNext != null ? ((lowNext - c) / c) * 100 : null;

          const { bias, biasEmoji, biasColor } = classifyBias(c, openNext, highNext);

          allSignals.push({
            date: format(new Date(candles[i].time * 1000), "yyyy-MM-dd"),
            dateNextDay: dateNext,
            dateTs: candles[i].time,
            screener,
            close: c,
            openNextDay: openNext,
            highNextDay: highNext,
            lowNextDay: lowNext,
            pctCloseToHigh: pct,
            result,
            gap,
            gapPct,
            kenaikanPct,
            drawdownPct,
            bias,
            biasEmoji,
            biasColor,
          });
        }
      }

      setProgress(90);
      setSignals(allSignals);
      setHasResult(true);
      setProgress(100);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  // ========== COMPUTED STATS ==========

  const screenerStats = useMemo<ScreenerStats[]>(() => {
    return SCREENER_NAMES.map(name => {
      const s = signals.filter(sig => sig.screener === name && sig.result !== "N/A");
      const wins = s.filter(x => x.result === "WIN");
      const losses = s.filter(x => x.result === "LOSE");
      const winPcts = wins.map(x => x.pctCloseToHigh!);
      const allPcts = s.map(x => x.pctCloseToHigh!);

      let equity = 0;
      const equityCurve = s.map((sig, idx) => {
        equity += sig.result === "WIN" ? 1 : -1;
        return { idx: idx + 1, value: equity };
      });

      // Bias statistics
      const gapUpCount = s.filter(x => x.openNextDay != null && !(x.openNextDay >= x.close * 0.995 && x.openNextDay <= x.close * 1.005) && x.openNextDay > x.close).length;
      const gapDownCount = s.filter(x => x.openNextDay != null && !(x.openNextDay >= x.close * 0.995 && x.openNextDay <= x.close * 1.005) && x.openNextDay < x.close).length;
      const langsungNaikCount = s.filter(x => x.bias === "Gap Up - Langsung Naik").length;
      const naikSetelahnyaCount = s.filter(x => x.bias === "Gap Down - Naik Setelahnya").length;
      const langsungTurunCount = s.filter(x => x.bias === "Gap Down - Langsung Turun").length;

      return {
        name,
        total: s.length,
        wins: wins.length,
        losses: losses.length,
        winRate: s.length > 0 ? (wins.length / s.length) * 100 : 0,
        avgGainWin: winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0,
        bestTrade: allPcts.length > 0 ? Math.max(...allPcts) : 0,
        worstTrade: allPcts.length > 0 ? Math.min(...allPcts) : 0,
        equityCurve,
        gapUpPct: s.length > 0 ? (gapUpCount / s.length) * 100 : 0,
        gapDownPct: s.length > 0 ? (gapDownCount / s.length) * 100 : 0,
        pctLangsungNaik: s.length > 0 ? (langsungNaikCount / s.length) * 100 : 0,
        pctNaikSetelahnya: s.length > 0 ? (naikSetelahnyaCount / s.length) * 100 : 0,
        pctLangsungTurun: s.length > 0 ? (langsungTurunCount / s.length) * 100 : 0,
      };
    });
  }, [signals]);

  const sortedScreenerStats = useMemo(() => {
    return [...screenerStats].sort((a, b) => {
      const aVal = (a as any)[screenerSort.key];
      const bVal = (b as any)[screenerSort.key];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return screenerSort.dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return screenerSort.dir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [screenerStats, screenerSort]);

  const overallStats = useMemo(() => {
    const valid = signals.filter(s => s.result !== "N/A");
    const wins = valid.filter(s => s.result === "WIN");
    const allPcts = valid.map(s => s.pctCloseToHigh!);
    let equity = 0;
    const equityCurve = valid
      .sort((a, b) => a.dateTs - b.dateTs)
      .map((sig, idx) => {
        equity += sig.result === "WIN" ? 1 : -1;
        return { idx: idx + 1, value: equity };
      });
    return {
      total: valid.length,
      wins: wins.length,
      losses: valid.length - wins.length,
      winRate: valid.length > 0 ? (wins.length / valid.length) * 100 : 0,
      avgGain: allPcts.length > 0 ? allPcts.reduce((a, b) => a + b, 0) / allPcts.length : 0,
      equityCurve,
    };
  }, [signals]);

  // ========== INSIGHTS ==========

  const insights = useMemo(() => {
    const bestScreener = screenerStats
      .filter(s => s.total >= 3)
      .sort((a, b) => b.winRate - a.winRate)[0];

    const mostFrequent = [...screenerStats].sort((a, b) => b.total - a.total)[0];

    const dateMap = new Map<string, Signal[]>();
    signals.forEach(sig => {
      if (!dateMap.has(sig.date)) dateMap.set(sig.date, []);
      dateMap.get(sig.date)!.push(sig);
    });
    const comboDays = Array.from(dateMap.entries())
      .filter(([, sigs]) => new Set(sigs.map(s => s.screener)).size >= 2)
      .map(([date, sigs]) => {
        const validSigs = sigs.filter(s => s.result !== "N/A");
        const wins = validSigs.filter(s => s.result === "WIN").length;
        return {
          date,
          screeners: [...new Set(sigs.map(s => s.screener))],
          winRate: validSigs.length > 0 ? (wins / validSigs.length) * 100 : 0,
          total: validSigs.length,
        };
      });
    const comboWins = comboDays.filter(d => d.total > 0);
    const comboWR = comboWins.length > 0 ? comboWins.reduce((s, d) => s + d.winRate, 0) / comboWins.length : 0;

    const monthMap = new Map<string, { wins: number; total: number }>();
    signals.filter(s => s.result !== "N/A").forEach(sig => {
      const m = sig.date.substring(0, 7);
      if (!monthMap.has(m)) monthMap.set(m, { wins: 0, total: 0 });
      const entry = monthMap.get(m)!;
      entry.total++;
      if (sig.result === "WIN") entry.wins++;
    });
    let bestMonth = { month: "", winRate: 0, total: 0 };
    monthMap.forEach((v, k) => {
      const wr = v.total >= 2 ? (v.wins / v.total) * 100 : 0;
      if (wr > bestMonth.winRate) bestMonth = { month: k, winRate: wr, total: v.total };
    });

    return { bestScreener, mostFrequent, comboDays, comboWR, bestMonth };
  }, [signals, screenerStats]);

  // ========== FILTERED TABLE ==========

  const filteredSignals = useMemo(() => {
    return signals
      .filter(s => filterScreener === "all" || s.screener === filterScreener)
      .filter(s => filterResult === "all" || s.result === filterResult)
      .sort((a, b) => b.dateTs - a.dateTs);
  }, [signals, filterScreener, filterResult]);

  // Get signals for a specific screener (for dropdown detail)
  const getScreenerSignals = (screenerName: string) => {
    return signals
      .filter(s => s.screener === screenerName && s.result !== "N/A")
      .sort((a, b) => b.dateTs - a.dateTs);
  };

  const screenerTableCols = [
    { key: "name", label: "Screener" },
    { key: "total", label: "Total Sinyal" },
    { key: "wins", label: "WIN" },
    { key: "losses", label: "LOSE" },
    { key: "winRate", label: "Win Rate %" },
    { key: "avgGainWin", label: "Avg % (WIN)" },
    { key: "bestTrade", label: "Best %" },
    { key: "worstTrade", label: "Worst %" },
    { key: "gapUpPct", label: "Gap Up %" },
    { key: "gapDownPct", label: "Gap Down %" },
    { key: "pctLangsungNaik", label: "% 🚀 Naik" },
    { key: "pctNaikSetelahnya", label: "% 📈 Setelahnya" },
    { key: "pctLangsungTurun", label: "% ❌ Turun" },
  ];

  const navigate = useNavigate();
  const fromScreener = searchParams.get("from") === "screener";
  const currentTicker = searchParams.get("ticker") || ticker;

  return (
    <div className="space-y-6">
      {/* Back button when coming from Screener */}
      {fromScreener && (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground -mb-4"
          onClick={() => navigate("/screener", { state: { tab: "analisa-historis", scrollToTicker: currentTicker } })}
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Analisa Historis
        </Button>
      )}
      {/* INPUT SECTION */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-primary" />
            Historical Backtest — BSJP Emiten
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Masukkan ticker (contoh: BBCA)"
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && !loading && runBacktest()}
                className="pl-9"
              />
            </div>
            <Button onClick={() => runBacktest()} disabled={loading || !ticker.trim()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Menganalisa...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Jalankan Backtest
                </>
              )}
            </Button>
          </div>
          {loading && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Menganalisa 1 tahun data historis...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {hasResult && (
        <>
          {/* SECTION A: HEADER */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <h2 className="text-xl font-bold text-foreground">{ticker.toUpperCase()}</h2>
                  <p className="text-sm text-muted-foreground">{companyName}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>{periodStart} — {periodEnd}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {totalTradingDays} hari trading
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* SECTION B: TABEL PER SCREENER (with expandable dropdown) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Performa Per Screener <span className="text-muted-foreground font-normal">(klik baris untuk detail sinyal)</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      {screenerTableCols.map(col => (
                        <TableHead
                          key={col.key}
                          className="cursor-pointer select-none hover:text-foreground text-xs whitespace-nowrap"
                          onClick={() =>
                            setScreenerSort(prev =>
                              prev.key === col.key
                                ? { key: col.key, dir: prev.dir === "desc" ? "asc" : "desc" }
                                : { key: col.key, dir: "desc" }
                            )
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {screenerSort.key === col.key && (
                              <span className="text-[10px]">{screenerSort.dir === "desc" ? "▼" : "▲"}</span>
                            )}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedScreenerStats.map(st => {
                      const isExpanded = expandedScreeners.has(st.name);
                      const detailSignals = isExpanded ? getScreenerSignals(st.name) : [];
                      return (
                        <React.Fragment key={st.name}>
                          <TableRow
                            className="cursor-pointer hover:bg-muted/70"
                            onClick={() => toggleExpand(st.name)}
                          >
                            <TableCell className="w-6 px-2">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </TableCell>
                            <TableCell className="font-medium text-xs whitespace-nowrap">{st.name}</TableCell>
                            <TableCell className="text-center font-mono text-xs">{st.total}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-green-500">{st.wins}</TableCell>
                            <TableCell className="text-center font-mono text-xs text-red-500">{st.losses}</TableCell>
                            <TableCell className="text-center">
                              <span className={cn("font-bold font-mono text-xs", st.winRate >= 50 ? "text-green-500" : "text-red-500")}>
                                {st.winRate.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">{st.avgGainWin.toFixed(2)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs text-green-500">{st.bestTrade.toFixed(2)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs text-red-500">{st.worstTrade.toFixed(2)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs">{st.gapUpPct.toFixed(1)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs">{st.gapDownPct.toFixed(1)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs text-green-500">{st.pctLangsungNaik.toFixed(1)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs text-green-400">{st.pctNaikSetelahnya.toFixed(1)}%</TableCell>
                            <TableCell className="text-center font-mono text-xs text-red-500">{st.pctLangsungTurun.toFixed(1)}%</TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow>
                              <TableCell colSpan={14} className="p-0 bg-muted/30">
                                <div className="p-3 max-h-[400px] overflow-auto">
                                  <p className="text-xs text-muted-foreground mb-2 font-semibold">
                                    Detail {detailSignals.length} sinyal — {st.name}
                                  </p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-[10px]">Tgl Beli (Sore)</TableHead>
                                        <TableHead className="text-[10px]">Tgl Jual (Besok)</TableHead>
                                        <TableHead className="text-[10px] text-right">Close</TableHead>
                                        <TableHead className="text-[10px] text-right">Open Besok</TableHead>
                                        <TableHead className="text-[10px] text-right">High Besok</TableHead>
                                        <TableHead className="text-[10px] text-right">Low Besok</TableHead>
                                        <TableHead className="text-[10px] text-right">Gap</TableHead>
                                        <TableHead className="text-[10px] text-right">Gap %</TableHead>
                                        <TableHead className="text-[10px] text-right">Kenaikan %</TableHead>
                                        <TableHead className="text-[10px] text-right">Drawdown %</TableHead>
                                        <TableHead className="text-[10px] text-center">Result</TableHead>
                                        <TableHead className="text-[10px]">Bias Besok</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {detailSignals.map((sig, idx) => (
                                        <TableRow key={`${sig.date}-${idx}`}>
                                          <TableCell className="text-[10px] font-mono py-1.5">{sig.date}</TableCell>
                                          <TableCell className="text-[10px] font-mono py-1.5">{sig.dateNextDay || "—"}</TableCell>
                                          <TableCell className="text-[10px] font-mono text-right py-1.5">{sig.close.toLocaleString("id-ID")}</TableCell>
                                          <TableCell className="text-[10px] font-mono text-right py-1.5">
                                            {sig.openNextDay != null ? sig.openNextDay.toLocaleString("id-ID") : "—"}
                                          </TableCell>
                                          <TableCell className="text-[10px] font-mono text-right py-1.5">
                                            {sig.highNextDay != null ? sig.highNextDay.toLocaleString("id-ID") : "—"}
                                          </TableCell>
                                          <TableCell className="text-[10px] font-mono text-right py-1.5">
                                            {sig.lowNextDay != null ? sig.lowNextDay.toLocaleString("id-ID") : "—"}
                                          </TableCell>
                                          <TableCell className={cn("text-[10px] font-mono text-right py-1.5", sig.gap != null && sig.gap >= 0 ? "text-green-500" : "text-red-500")}>
                                            {sig.gap != null ? sig.gap.toLocaleString("id-ID") : "—"}
                                          </TableCell>
                                          <TableCell className={cn("text-[10px] font-mono text-right py-1.5", sig.gapPct != null && sig.gapPct >= 0 ? "text-green-500" : "text-red-500")}>
                                            {sig.gapPct != null ? `${sig.gapPct.toFixed(2)}%` : "—"}
                                          </TableCell>
                                          <TableCell className={cn("text-[10px] font-mono text-right py-1.5", sig.kenaikanPct != null && sig.kenaikanPct >= 0 ? "text-green-500" : "text-red-500")}>
                                            {sig.kenaikanPct != null ? `${sig.kenaikanPct.toFixed(2)}%` : "—"}
                                          </TableCell>
                                          <TableCell className={cn("text-[10px] font-mono text-right py-1.5", sig.drawdownPct != null && sig.drawdownPct < 0 ? "text-red-500" : "text-green-500")}>
                                            {sig.drawdownPct != null ? `${sig.drawdownPct.toFixed(2)}%` : "—"}
                                          </TableCell>
                                          <TableCell className="text-center py-1.5">
                                            {sig.result === "WIN" ? (
                                              <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-[9px] px-1.5 py-0">WIN</Badge>
                                            ) : (
                                              <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[9px] px-1.5 py-0">LOSE</Badge>
                                            )}
                                          </TableCell>
                                          <TableCell className="py-1.5">
                                            <span className={cn("text-[10px] whitespace-nowrap", sig.biasColor)}>
                                              {sig.biasEmoji} {sig.bias}
                                            </span>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* SECTION C: OVERALL */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Overall Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{overallStats.total}</div>
                  <div className="text-xs text-muted-foreground">Total Sinyal</div>
                </div>
                <div className="text-center">
                  <div className={cn("text-2xl font-bold", overallStats.winRate >= 50 ? "text-green-500" : "text-red-500")}>
                    {overallStats.winRate.toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{overallStats.avgGain.toFixed(2)}%</div>
                  <div className="text-xs text-muted-foreground">Avg % Gain</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">{overallStats.wins}</div>
                  <div className="text-xs text-muted-foreground">WIN / {overallStats.losses} LOSE</div>
                </div>
              </div>
              {overallStats.equityCurve.length > 0 && (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={overallStats.equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="idx" tick={false} />
                      <YAxis tick={{ fontSize: 10 }} width={30} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                        labelFormatter={v => `Signal #${v}`}
                      />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION E: INSIGHTS */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">💡 Insight Otomatis</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {insights.bestScreener && (
                <Card className="border-green-500/30 bg-green-500/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="h-4 w-4 text-green-500" />
                      <span className="text-xs font-semibold text-green-500">Screener Terbaik</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.bestScreener.name}</p>
                    <p className="text-xs text-muted-foreground">
                      WR {insights.bestScreener.winRate.toFixed(1)}% dari {insights.bestScreener.total} sinyal
                    </p>
                  </CardContent>
                </Card>
              )}
              {insights.mostFrequent && insights.mostFrequent.total > 0 && (
                <Card className="border-blue-500/30 bg-blue-500/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-500">Paling Sering Muncul</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.mostFrequent.name}</p>
                    <p className="text-xs text-muted-foreground">{insights.mostFrequent.total} sinyal</p>
                  </CardContent>
                </Card>
              )}
              <Card className="border-purple-500/30 bg-purple-500/5">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-4 w-4 text-purple-500" />
                    <span className="text-xs font-semibold text-purple-500">Kombinasi (2+ Screener)</span>
                  </div>
                  <p className="text-sm font-bold text-foreground">
                    {insights.comboDays.length} hari
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg WR {insights.comboWR.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              {insights.bestMonth.month && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="h-4 w-4 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-500">Bulan Terbaik</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.bestMonth.month}</p>
                    <p className="text-xs text-muted-foreground">
                      WR {insights.bestMonth.winRate.toFixed(1)}% ({insights.bestMonth.total} sinyal)
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* SECTION D: TABEL DETAIL */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detail Sinyal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-4">
                <Select value={filterScreener} onValueChange={setFilterScreener}>
                  <SelectTrigger className="w-48 h-8 text-xs">
                    <SelectValue placeholder="Filter Screener" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Screener</SelectItem>
                    {SCREENER_NAMES.map(n => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterResult} onValueChange={setFilterResult}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue placeholder="Filter Result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="WIN">WIN</SelectItem>
                    <SelectItem value="LOSE">LOSE</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground self-center">
                  {filteredSignals.length} sinyal
                </span>
              </div>
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Tanggal</TableHead>
                      <TableHead className="text-xs">Screener</TableHead>
                      <TableHead className="text-xs text-right">Close (Entry)</TableHead>
                      <TableHead className="text-xs text-right">High Besok</TableHead>
                      <TableHead className="text-xs text-right">% C→H</TableHead>
                      <TableHead className="text-xs text-center">Result</TableHead>
                      <TableHead className="text-xs">Bias</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSignals.slice(0, 200).map((sig, idx) => (
                      <TableRow key={`${sig.date}-${sig.screener}-${idx}`}>
                        <TableCell className="text-xs font-mono">{sig.date}</TableCell>
                        <TableCell className="text-xs">{sig.screener}</TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {sig.close.toLocaleString("id-ID")}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono">
                          {sig.highNextDay != null ? sig.highNextDay.toLocaleString("id-ID") : "—"}
                        </TableCell>
                        <TableCell className={cn(
                          "text-xs text-right font-mono",
                          sig.pctCloseToHigh != null && sig.pctCloseToHigh >= 0 ? "text-green-500" : "text-red-500"
                        )}>
                          {sig.pctCloseToHigh != null ? `${sig.pctCloseToHigh.toFixed(2)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {sig.result === "WIN" ? (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-[10px]">
                              <TrendingUp className="h-3 w-3 mr-1" />WIN
                            </Badge>
                          ) : sig.result === "LOSE" ? (
                            <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[10px]">
                              <TrendingDown className="h-3 w-3 mr-1" />LOSE
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">N/A</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn("text-[10px] whitespace-nowrap", sig.biasColor)}>
                            {sig.biasEmoji} {sig.bias}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredSignals.length > 200 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Menampilkan 200 dari {filteredSignals.length} sinyal
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default HistoricalBacktest;
