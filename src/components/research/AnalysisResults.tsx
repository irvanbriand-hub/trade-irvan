import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compileFormula, type CandleData } from "@/lib/formulaEvaluator";
import { calcSMA } from "@/lib/backtestEngine";
import type { ScanResult } from "./ScanProgress";
import type { BacktestConfigData } from "./BacktestConfig";
import type { ParamItem } from "./ParameterConfig";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip } from "recharts";

// ========== TYPES ==========
interface TickerAnalysis {
  ticker: string;
  methods: Record<string, MethodResult>;
}

interface MethodResult {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGain: number;
  bestDay: number;
  events: EventDetail[];
  equityCurve: { idx: number; value: number }[];
}

interface EventDetail {
  date: string;
  closeDay0: number;
  dayPcts: number[];
  dayWins: boolean[];
  gapDay1: string;
  params: Record<string, boolean>;
  result: "WIN" | "LOSE";
}

interface ParamCorrelation {
  name: string;
  pctTrue: number;
  winTrue: number;
  winFalse: number;
  diff: number;
  impact: string;
}

// ========== COMPONENT ==========
interface AnalysisResultsProps {
  formula: string;
  scanResults: ScanResult[];
  config: BacktestConfigData;
  params: ParamItem[];
  onSave: (summary: any) => void;
  onBack: () => void;
}

export default function AnalysisResults({ formula, scanResults, config, params, onSave, onBack }: AnalysisResultsProps) {
  const [phase, setPhase] = useState<"running" | "done">("running");
  const [progress, setProgress] = useState({ current: 0, total: scanResults.length });
  const [analyses, setAnalyses] = useState<TickerAnalysis[]>([]);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>("winRate");
  const [sortAsc, setSortAsc] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    runAnalysis();
    return () => { cancelledRef.current = true; };
  }, []);

  async function runAnalysis() {
    const results: TickerAnalysis[] = [];

    for (let ti = 0; ti < scanResults.length; ti++) {
      if (cancelledRef.current) return;

      const sr = scanResults[ti];
      try {
        const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
          body: { ticker: sr.ticker + ".JK", count: 600 },
        });

        if (error || !data?.candles?.length) {
          setProgress(p => ({ ...p, current: ti + 1 }));
          continue;
        }

        const candles: CandleData[] = data.candles
          .filter((c: CandleData) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
          .sort((a: CandleData, b: CandleData) => a.time - b.time);

        if (candles.length < 100) {
          setProgress(p => ({ ...p, current: ti + 1 }));
          continue;
        }

        const evalFn = compileFormula(formula, candles);
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const volumes = candles.map(c => c.volume);
        const opens = candles.map(c => c.open);
        const lows = candles.map(c => c.low);

        // Find period start
        const now = Date.now() / 1000;
        let periodMonths = 12;
        if (config.period === "6m") periodMonths = 6;
        else if (config.period === "2y") periodMonths = 24;
        else if (config.period === "all") periodMonths = 999;
        
        const periodStart = now - periodMonths * 30 * 86400;
        let startIdx = candles.findIndex(c => c.time >= periodStart);
        if (startIdx < 0) startIdx = 0;
        startIdx = Math.max(startIdx, 50);

        const methodResults: Record<string, MethodResult> = {};

        for (const method of config.methods) {
          const events: EventDetail[] = [];
          const maxDays = method.id === "bsjp" ? 1 : method.id === "swing3" ? 3 : 5;
          const threshold = method.threshold / 100;

          for (let i = startIdx; i < candles.length - maxDays; i++) {
            if (!evalFn(i)) continue;

            const c0 = closes[i];
            const dayPcts: number[] = [];
            const dayWins: boolean[] = [];

            for (let d = 1; d <= maxDays; d++) {
              if (i + d < candles.length) {
                const pct = ((highs[i + d] - c0) / c0) * 100;
                dayPcts.push(pct);
                dayWins.push(highs[i + d] >= c0 * (1 + threshold));
              }
            }

            const gapPct = i + 1 < candles.length ? ((opens[i + 1] - c0) / c0) * 100 : 0;
            const gap = Math.abs(gapPct) < 0.5 ? "Flat" : gapPct > 0 ? "Gap Up" : "Gap Down";

            const isWin = dayWins.some(Boolean);

            // Compute params
            const paramValues: Record<string, boolean> = {};
            for (const p of params) {
              try {
                const pEval = compileFormula(p.formula, candles);
                paramValues[p.id] = pEval(i);
              } catch {
                paramValues[p.id] = false;
              }
            }

            events.push({
              date: new Date(candles[i].time * 1000).toISOString().slice(0, 10),
              closeDay0: c0,
              dayPcts,
              dayWins,
              gapDay1: gap,
              params: paramValues,
              result: isWin ? "WIN" : "LOSE",
            });
          }

          const wins = events.filter(e => e.result === "WIN");
          const avgGain = wins.length > 0
            ? wins.reduce((s, e) => s + Math.max(...e.dayPcts), 0) / wins.length
            : 0;

          // Best day
          const dayWinCounts = Array(maxDays).fill(0);
          events.forEach(e => e.dayWins.forEach((w, d) => { if (w) dayWinCounts[d]++; }));
          const bestDay = dayWinCounts.indexOf(Math.max(...dayWinCounts)) + 1;

          let eq = 0;
          const equityCurve = events.map((e, idx) => {
            eq += e.result === "WIN" ? 1 : -1;
            return { idx: idx + 1, value: eq };
          });

          methodResults[method.id] = {
            total: events.length,
            wins: wins.length,
            losses: events.length - wins.length,
            winRate: events.length > 0 ? (wins.length / events.length) * 100 : 0,
            avgGain,
            bestDay,
            events,
            equityCurve,
          };
        }

        results.push({ ticker: sr.ticker, methods: methodResults });
      } catch (err) {
        console.error(`Analysis error for ${sr.ticker}:`, err);
      }

      setProgress(p => ({ ...p, current: ti + 1 }));
    }

    setAnalyses(results);
    setPhase("done");
  }

  // ========== RENDERING ==========
  if (phase === "running") {
    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    return (
      <Card className="max-w-lg mx-auto">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="text-4xl">📊</div>
          <h3 className="text-lg font-bold text-foreground">Menganalisa historis...</h3>
          <Progress value={pct} className="h-3" />
          <p className="text-sm text-muted-foreground">
            Saham {progress.current}/{progress.total} selesai
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeMethodIds = config.methods.map(m => m.id);
  const methodLabels: Record<string, string> = { bsjp: "BSJP", swing3: "Swing 1-3", swing5: "Swing 1-5" };

  // Overall stats per method
  const overallStats = (methodId: string) => {
    let totalSignals = 0, totalWins = 0;
    const allPcts: number[] = [];
    const combined: { idx: number; value: number }[] = [];
    let eq = 0;

    analyses.forEach(a => {
      const mr = a.methods[methodId];
      if (!mr) return;
      totalSignals += mr.total;
      totalWins += mr.wins;
      mr.events.forEach(e => {
        if (e.result === "WIN") allPcts.push(Math.max(...e.dayPcts));
        eq += e.result === "WIN" ? 1 : -1;
        combined.push({ idx: combined.length + 1, value: eq });
      });
    });

    return {
      totalSignals,
      totalWins,
      totalLosses: totalSignals - totalWins,
      winRate: totalSignals > 0 ? (totalWins / totalSignals) * 100 : 0,
      avgGain: allPcts.length > 0 ? allPcts.reduce((a, b) => a + b, 0) / allPcts.length : 0,
      equityCurve: combined,
    };
  };

  // Param correlation for a method
  const paramCorrelation = (methodId: string): ParamCorrelation[] => {
    return params.map(p => {
      let trueCount = 0, trueWin = 0, falseCount = 0, falseWin = 0;
      analyses.forEach(a => {
        const mr = a.methods[methodId];
        if (!mr) return;
        mr.events.forEach(e => {
          if (e.params[p.id]) { trueCount++; if (e.result === "WIN") trueWin++; }
          else { falseCount++; if (e.result === "WIN") falseWin++; }
        });
      });
      const winTrue = trueCount > 0 ? (trueWin / trueCount) * 100 : 0;
      const winFalse = falseCount > 0 ? (falseWin / falseCount) * 100 : 0;
      const diff = winTrue - winFalse;
      const totalEvents = trueCount + falseCount;
      return {
        name: p.name,
        pctTrue: totalEvents > 0 ? (trueCount / totalEvents) * 100 : 0,
        winTrue,
        winFalse,
        diff,
        impact: Math.abs(diff) > 15 ? "🔥 Tinggi" : Math.abs(diff) > 5 ? "⚡ Sedang" : "➖ Rendah",
      };
    });
  };

  // Sort analyses for current tab
  const sortAnalyses = (methodId: string) => {
    return [...analyses].sort((a, b) => {
      const ma = a.methods[methodId];
      const mb = b.methods[methodId];
      if (!ma || !mb) return 0;
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "ticker") return mul * a.ticker.localeCompare(b.ticker);
      const va = sortKey === "winRate" ? ma.winRate : sortKey === "total" ? ma.total : sortKey === "avgGain" ? ma.avgGain : 0;
      const vb = sortKey === "winRate" ? mb.winRate : sortKey === "total" ? mb.total : sortKey === "avgGain" ? mb.avgGain : 0;
      return mul * (va - vb);
    });
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const summary = {
    formula,
    methods: config.methods,
    period: config.period,
    params: params.map(p => p.name),
    results: analyses.map(a => ({
      ticker: a.ticker,
      methods: Object.fromEntries(Object.entries(a.methods).map(([k, v]) => [k, { total: v.total, wins: v.wins, winRate: v.winRate, avgGain: v.avgGain }])),
    })),
    overallStats: Object.fromEntries(activeMethodIds.map(m => [m, overallStats(m)])),
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-foreground">📊 Hasil Analisa — {analyses.length} saham</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>← Kembali</Button>
          <Button size="sm" onClick={() => onSave(summary)}>💾 Simpan Hasil</Button>
        </div>
      </div>

      <Tabs defaultValue={activeMethodIds[0]}>
        <TabsList>
          {activeMethodIds.map(id => (
            <TabsTrigger key={id} value={id} className="text-xs">{methodLabels[id]}</TabsTrigger>
          ))}
        </TabsList>

        {activeMethodIds.map(methodId => {
          const stats = overallStats(methodId);
          const correlations = paramCorrelation(methodId);
          const sorted = sortAnalyses(methodId);

          return (
            <TabsContent key={methodId} value={methodId} className="space-y-4">
              {/* Overall Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                  { label: "Total Sinyal", value: stats.totalSignals },
                  { label: "WIN", value: stats.totalWins },
                  { label: "LOSE", value: stats.totalLosses },
                  { label: "WIN%", value: stats.winRate.toFixed(1) + "%", color: stats.winRate >= 50 ? "text-emerald-500" : "text-red-500" },
                  { label: "Avg Gain", value: stats.avgGain.toFixed(2) + "%" },
                ].map((s, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                      <p className={`text-lg font-bold ${(s as any).color || "text-foreground"}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Equity Curve */}
              {stats.equityCurve.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-bold mb-2">Equity Curve Gabungan</p>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={stats.equityCurve}>
                        <XAxis dataKey="idx" tick={false} />
                        <YAxis tick={{ fontSize: 10 }} width={30} />
                        <RechartsTooltip contentStyle={{ fontSize: 10 }} />
                        <Line dataKey="value" stroke="hsl(var(--primary))" dot={false} strokeWidth={1.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Ticker Ranking Table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs h-8 w-8" />
                      <TableHead className="text-xs h-8 cursor-pointer" onClick={() => toggleSort("ticker")}>Ticker <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                      <TableHead className="text-xs h-8 cursor-pointer" onClick={() => toggleSort("total")}>Sinyal <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                      <TableHead className="text-xs h-8">WIN</TableHead>
                      <TableHead className="text-xs h-8">LOSE</TableHead>
                      <TableHead className="text-xs h-8 cursor-pointer" onClick={() => toggleSort("winRate")}>WIN% <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                      <TableHead className="text-xs h-8 cursor-pointer" onClick={() => toggleSort("avgGain")}>Avg Gain <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                      <TableHead className="text-xs h-8">Best Day</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map(a => {
                      const mr = a.methods[methodId];
                      if (!mr || mr.total === 0) return null;
                      const isExpanded = expandedTicker === a.ticker;
                      return (
                        <>
                          <TableRow
                            key={a.ticker}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setExpandedTicker(isExpanded ? null : a.ticker)}
                          >
                            <TableCell className="py-1.5 px-2">
                              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 font-bold">{a.ticker}</TableCell>
                            <TableCell className="text-xs py-1.5">{mr.total}</TableCell>
                            <TableCell className="text-xs py-1.5 text-emerald-500">{mr.wins}</TableCell>
                            <TableCell className="text-xs py-1.5 text-red-500">{mr.losses}</TableCell>
                            <TableCell className="text-xs py-1.5">
                              <Badge variant="outline" className={`text-xs ${mr.winRate >= 60 ? "text-emerald-500 border-emerald-500/30" : mr.winRate >= 40 ? "text-yellow-500 border-yellow-500/30" : "text-red-500 border-red-500/30"}`}>
                                {mr.winRate.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs py-1.5">{mr.avgGain.toFixed(2)}%</TableCell>
                            <TableCell className="text-xs py-1.5">Day {mr.bestDay}</TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${a.ticker}-detail`}>
                              <TableCell colSpan={8} className="p-3 bg-muted/30">
                                <TickerDetail mr={mr} params={params} />
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Parameter Correlation */}
              {correlations.length > 0 && (
                <Card>
                  <CardContent className="p-3">
                    <p className="text-xs font-bold mb-2">🎛️ Korelasi Parameter</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs h-7">Parameter</TableHead>
                          <TableHead className="text-xs h-7">% TRUE</TableHead>
                          <TableHead className="text-xs h-7">WIN% TRUE</TableHead>
                          <TableHead className="text-xs h-7">WIN% FALSE</TableHead>
                          <TableHead className="text-xs h-7">Selisih</TableHead>
                          <TableHead className="text-xs h-7">Impact</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {correlations.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map(c => (
                          <TableRow key={c.name}>
                            <TableCell className="text-xs py-1">{c.name}</TableCell>
                            <TableCell className="text-xs py-1">{c.pctTrue.toFixed(0)}%</TableCell>
                            <TableCell className="text-xs py-1 text-emerald-500">{c.winTrue.toFixed(1)}%</TableCell>
                            <TableCell className="text-xs py-1 text-red-500">{c.winFalse.toFixed(1)}%</TableCell>
                            <TableCell className="text-xs py-1">
                              <span className={c.diff > 0 ? "text-emerald-500" : "text-red-500"}>
                                {c.diff > 0 ? "+" : ""}{c.diff.toFixed(1)}%
                              </span>
                            </TableCell>
                            <TableCell className="text-xs py-1">{c.impact}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// ========== TICKER DETAIL ==========
function TickerDetail({ mr, params }: { mr: MethodResult; params: ParamItem[] }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>WIN%: <span className="font-bold text-foreground">{mr.winRate.toFixed(1)}%</span></span>
        <span>Avg: <span className="font-bold text-foreground">{mr.avgGain.toFixed(2)}%</span></span>
        <span>Best Day: <span className="font-bold text-foreground">Day {mr.bestDay}</span></span>
      </div>

      <div className="max-h-[300px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px] h-6">Tanggal</TableHead>
              <TableHead className="text-[10px] h-6">Close</TableHead>
              {mr.events[0]?.dayPcts.map((_, d) => (
                <TableHead key={d} className="text-[10px] h-6">Day{d + 1}%</TableHead>
              ))}
              <TableHead className="text-[10px] h-6">Gap</TableHead>
              <TableHead className="text-[10px] h-6">Result</TableHead>
              <TableHead className="text-[10px] h-6">Params</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mr.events.map((e, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-[10px] py-1 font-mono">{e.date}</TableCell>
                <TableCell className="text-[10px] py-1 font-mono">{e.closeDay0.toLocaleString("id-ID")}</TableCell>
                {e.dayPcts.map((pct, d) => (
                  <TableCell key={d} className={`text-[10px] py-1 ${e.dayWins[d] ? "text-emerald-500" : pct < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {pct.toFixed(2)}% {e.dayWins[d] ? "✅" : "❌"}
                  </TableCell>
                ))}
                <TableCell className="text-[10px] py-1">{e.gapDay1}</TableCell>
                <TableCell className="text-[10px] py-1">
                  <Badge variant="outline" className={`text-[10px] ${e.result === "WIN" ? "text-emerald-500" : "text-red-500"}`}>
                    {e.result}
                  </Badge>
                </TableCell>
                <TableCell className="text-[10px] py-1">
                  {Object.values(e.params).filter(Boolean).length}/{Object.keys(e.params).length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
