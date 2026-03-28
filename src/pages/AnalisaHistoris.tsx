import React, { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Trophy, TrendingUp, Flame, ExternalLink, Zap, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWrScanner } from "@/hooks/useWrScanner";
import { runBacktestForTicker, calcScreenerStats, SCREENER_NAMES, type BacktestScreenerStats, type BacktestSignal } from "@/lib/backtestEngine";
import HistorisParamCorrelation from "@/components/HistorisParamCorrelation";

interface RankingRow {
  ticker: string;
  screener: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGainWin: number;
  lastSignalDate: string;
  isInTodayScan: boolean;
  avgParamCount: number;
  paramWrBoost: number; // how much params boost WR for this ticker+screener
  actionScore: number;
}

type SortKey = keyof RankingRow;

export default function AnalisaHistoris() {
  const navigate = useNavigate();
  const { data: wrItems = [] } = useWrScanner();
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [allSignals, setAllSignals] = useState<BacktestSignal[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [hasResult, setHasResult] = useState(false);
  const abortRef = useRef(false);

  // Filters
  const [filterScreener, setFilterScreener] = useState("all");
  const [filterWrMin, setFilterWrMin] = useState("all");
  const [filterSignalMin, setFilterSignalMin] = useState("all");
  const [showTodayOnly, setShowTodayOnly] = useState(false);

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("actionScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const today = new Date().toISOString().split("T")[0];
  const todayTickers = useMemo(() => {
    return new Set(wrItems.filter(i => i.tanggal_import === today).map(i => i.ticker));
  }, [wrItems, today]);

  // Get unique tickers from wr_scanner
  const uniqueTickers = useMemo(() => {
    return [...new Set(wrItems.map(i => i.ticker))];
  }, [wrItems]);

  const handleGenerate = useCallback(async () => {
    if (uniqueTickers.length === 0) return;
    setIsRunning(true);
    setHasResult(false);
    setProgressTotal(uniqueTickers.length);
    setProgressCurrent(0);
    abortRef.current = false;

    const results: RankingRow[] = [];
    const collectedSignals: BacktestSignal[] = [];
    for (let i = 0; i < uniqueTickers.length; i++) {
      if (abortRef.current) break;
      const ticker = uniqueTickers[i];
      setProgressCurrent(i + 1);

      try {
        const bt = await runBacktestForTicker(ticker);
        const stats = calcScreenerStats(bt.signals);
        const isToday = todayTickers.has(ticker);

        collectedSignals.push(...bt.signals);

        for (const st of stats) {
          if (st.total === 0) continue;

          // Calculate param stats for this ticker+screener combo
          const screenerSignals = bt.signals.filter(
            s => s.screener === st.name && s.result !== "N/A" && s.params
          );
          const avgParamCount = screenerSignals.length > 0
            ? screenerSignals.reduce((sum, s) => sum + (s.params?.count || 0), 0) / screenerSignals.length
            : 0;

          // Param WR boost: WR of signals with count>=5 vs count<5
          const highParamSigs = screenerSignals.filter(s => (s.params?.count || 0) >= 5);
          const lowParamSigs = screenerSignals.filter(s => (s.params?.count || 0) < 5);
          const highParamWR = highParamSigs.length > 0
            ? (highParamSigs.filter(s => s.result === "WIN").length / highParamSigs.length) * 100 : 0;
          const lowParamWR = lowParamSigs.length > 0
            ? (lowParamSigs.filter(s => s.result === "WIN").length / lowParamSigs.length) * 100 : 0;
          const paramWrBoost = highParamSigs.length >= 2 ? highParamWR - lowParamWR : 0;

          // Action score: WR base + param bonus + today bonus
          const wrScore = st.winRate;
          const paramBonus = avgParamCount >= 7 ? 8 : avgParamCount >= 5 ? 5 : avgParamCount >= 3 ? 2 : 0;
          const todayBonus = isToday ? 10 : 0;
          const signalBonus = st.total >= 10 ? 5 : st.total >= 5 ? 3 : 0;
          const actionScore = wrScore + paramBonus + todayBonus + signalBonus;

          results.push({
            ticker,
            screener: st.name,
            total: st.total,
            wins: st.wins,
            losses: st.losses,
            winRate: st.winRate,
            avgGainWin: st.avgGainWin,
            lastSignalDate: st.lastSignalDate,
            isInTodayScan: isToday,
            avgParamCount,
            paramWrBoost,
            actionScore,
          });
        }
      } catch (err) {
        console.error(`[AnalisaHistoris] Error for ${ticker}:`, err);
      }
    }

    setRanking(results);
    setAllSignals(collectedSignals);
    setHasResult(true);
    setIsRunning(false);
  }, [uniqueTickers, todayTickers]);

  // Filtered + sorted data
  const displayData = useMemo(() => {
    let data = [...ranking];

    if (filterScreener !== "all") {
      data = data.filter(r => r.screener === filterScreener);
    }
    if (filterWrMin !== "all") {
      const min = parseInt(filterWrMin);
      data = data.filter(r => r.winRate >= min);
    }
    if (filterSignalMin !== "all") {
      const min = parseInt(filterSignalMin);
      data = data.filter(r => r.total >= min);
    }
    if (showTodayOnly) {
      data = data.filter(r => r.isInTodayScan);
    }

    return data.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [ranking, filterScreener, filterWrMin, filterSignalMin, showTodayOnly, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Insights
  const insights = useMemo(() => {
    if (!hasResult || ranking.length === 0) return null;

    // Pure WR best (no param consideration)
    const bestWR = ranking.filter(r => r.total >= 5).sort((a, b) => b.winRate - a.winRate)[0] || null;

    // Most consistent (WR >70% with most signals)
    const consistent = ranking.filter(r => r.winRate >= 70).sort((a, b) => b.total - a.total)[0] || null;

    // Hot today WR only
    const hotTodayWR = ranking.filter(r => r.isInTodayScan && r.winRate >= 70).sort((a, b) => b.winRate - a.winRate);

    // Best actionable: highest action score with min 5 signals (WR + Param combined)
    const bestCombo = ranking.filter(r => r.total >= 5).sort((a, b) => b.actionScore - a.actionScore)[0] || null;

    // Best param correlation
    const bestParam = ranking.filter(r => r.total >= 5 && r.avgParamCount >= 5).sort((a, b) => b.paramWrBoost - a.paramWrBoost)[0] || null;

    // Hot today combined
    const hotTodayCombo = ranking.filter(r => r.isInTodayScan && r.winRate >= 60).sort((a, b) => b.actionScore - a.actionScore);

    return { bestWR, consistent, hotTodayWR, bestCombo, bestParam, hotTodayCombo };
  }, [ranking, hasResult]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 inline ml-0.5" /> : <ArrowDown className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Analisa Historis Scanner</h1>
          <p className="text-xs text-muted-foreground">Backtest semua emiten dari WR Scanner terhadap 7 screener</p>
        </div>
        <Button onClick={handleGenerate} disabled={isRunning || uniqueTickers.length === 0} size="sm">
          {isRunning ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Menganalisa...</>
          ) : (
            <><Zap className="h-4 w-4 mr-2" />Generate Analisa Historis</>
          )}
        </Button>
      </div>

      {/* Progress */}
      {isRunning && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Menganalisa {progressCurrent} dari {progressTotal} emiten...</span>
                <span>{Math.round((progressCurrent / progressTotal) * 100)}%</span>
              </div>
              <Progress value={(progressCurrent / progressTotal) * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {!isRunning && !hasResult && uniqueTickers.length === 0 && (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            <p>Belum ada data di WR Scanner. Import hasil scan terlebih dahulu.</p>
          </CardContent>
        </Card>
      )}

      {hasResult && insights && (
        <>
          {/* SECTION C: INSIGHTS */}
          {/* ROW 1: Pure WR Insights */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">📈 Berdasarkan Win Rate</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {insights.bestWR && (
                <Card className="border-green-500/30 bg-green-500/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="h-4 w-4 text-green-500" />
                      <span className="text-xs font-semibold text-green-500">WR Tertinggi</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.bestWR.ticker} — {insights.bestWR.screener}</p>
                    <p className="text-xs text-muted-foreground">WR {insights.bestWR.winRate.toFixed(1)}% ({insights.bestWR.total} sinyal)</p>
                  </CardContent>
                </Card>
              )}
              {insights.consistent && (
                <Card className="border-blue-500/30 bg-blue-500/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-500">Paling Konsisten</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.consistent.ticker} — {insights.consistent.screener}</p>
                    <p className="text-xs text-muted-foreground">WR {insights.consistent.winRate.toFixed(1)}% ({insights.consistent.total} sinyal)</p>
                  </CardContent>
                </Card>
              )}
              <Card className="border-orange-500/30 bg-orange-500/5">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-semibold text-orange-500">🔥 Hot Today (WR)</span>
                  </div>
                  {insights.hotTodayWR.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {insights.hotTodayWR.slice(0, 5).map(h => (
                          <Badge key={`wr-${h.ticker}-${h.screener}`} className="text-[9px] bg-orange-500/10 text-orange-600 border-orange-500/30">
                            {h.ticker} ({h.winRate.toFixed(0)}%)
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{insights.hotTodayWR.length} combo WR &gt;70% hari ini</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Tidak ada combo WR &gt;70% hari ini</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ROW 2: Combined WR + Param Insights */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">📊 Kombinasi WR + Parameter Historis</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {insights.bestCombo && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Trophy className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-primary">🏆 Paling Actionable</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.bestCombo.ticker} — {insights.bestCombo.screener}</p>
                    <p className="text-xs text-muted-foreground">
                      WR {insights.bestCombo.winRate.toFixed(1)}% • Param {insights.bestCombo.avgParamCount.toFixed(1)}/8 • Score {insights.bestCombo.actionScore.toFixed(0)}
                    </p>
                  </CardContent>
                </Card>
              )}
              {insights.bestParam && (
                <Card className="border-purple-500/30 bg-purple-500/5">
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-purple-500" />
                      <span className="text-xs font-semibold text-purple-500">📊 Param Terkuat</span>
                    </div>
                    <p className="text-sm font-bold text-foreground">{insights.bestParam.ticker} — {insights.bestParam.screener}</p>
                    <p className="text-xs text-muted-foreground">
                      Avg {insights.bestParam.avgParamCount.toFixed(1)}/8 • WR Boost {insights.bestParam.paramWrBoost > 0 ? "+" : ""}{insights.bestParam.paramWrBoost.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card className="border-orange-500/30 bg-orange-500/5">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-semibold text-orange-500">🔥 Hot Today (Combo)</span>
                  </div>
                  {insights.hotTodayCombo.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {insights.hotTodayCombo.slice(0, 5).map(h => (
                          <Badge key={`combo-${h.ticker}-${h.screener}`} className="text-[9px] bg-orange-500/10 text-orange-600 border-orange-500/30">
                            {h.ticker} ({h.winRate.toFixed(0)}% • {h.avgParamCount.toFixed(0)}/8)
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{insights.hotTodayCombo.length} combo actionable hari ini</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Tidak ada combo actionable hari ini</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* SECTION B: RANKING TABLE */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Ranking Emiten × Screener</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-4 items-center">
                <Select value={filterScreener} onValueChange={setFilterScreener}>
                  <SelectTrigger className="w-52 h-8 text-xs">
                    <SelectValue placeholder="Filter Screener" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Screener</SelectItem>
                    {SCREENER_NAMES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterWrMin} onValueChange={setFilterWrMin}>
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
                <Select value={filterSignalMin} onValueChange={setFilterSignalMin}>
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
                <div className="flex items-center gap-2">
                  <Switch id="today-filter" checked={showTodayOnly} onCheckedChange={setShowTodayOnly} />
                  <Label htmlFor="today-filter" className="text-xs text-muted-foreground cursor-pointer">
                    Hanya scan hari ini
                  </Label>
                </div>
                <span className="text-xs text-muted-foreground ml-auto">{displayData.length} hasil</span>
              </div>

              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {([
                        ["ticker", "Ticker"],
                        ["screener", "Screener"],
                        ["total", "Sinyal"],
                        ["winRate", "WR%"],
                        ["avgParamCount", "Param"],
                        ["actionScore", "Score"],
                        ["avgGainWin", "Avg%"],
                        ["lastSignalDate", "Last"],
                      ] as [SortKey, string][]).map(([key, label]) => (
                        <TableHead
                          key={key}
                          className="text-xs cursor-pointer select-none hover:text-foreground"
                          onClick={() => handleSort(key)}
                        >
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            {label}
                            <SortIcon col={key} />
                          </span>
                        </TableHead>
                      ))}
                      <TableHead className="text-xs">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayData.slice(0, 300).map((r, idx) => (
                      <TableRow key={`${r.ticker}-${r.screener}-${idx}`}>
                        <TableCell className="text-xs font-mono font-bold">
                          <div className="flex items-center gap-1">
                            {r.ticker}
                            {r.isInTodayScan && (
                              <Badge className="text-[8px] px-1 py-0 bg-orange-500/10 text-orange-500 border-orange-500/30">TODAY</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{r.screener}</TableCell>
                        <TableCell className="text-center font-mono text-xs">{r.total}</TableCell>
                        <TableCell className="text-center">
                          <span className={cn("font-bold font-mono text-xs", r.winRate >= 50 ? "text-green-500" : "text-red-500")}>
                            {r.winRate.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn("text-[9px] font-mono",
                            r.avgParamCount >= 7 ? "bg-yellow-500/20 text-yellow-600 border-yellow-500/40" :
                            r.avgParamCount >= 5 ? "bg-green-500/10 text-green-600 border-green-500/30" :
                            r.avgParamCount >= 3 ? "bg-orange-500/10 text-orange-600 border-orange-500/30" :
                            "text-muted-foreground"
                          )}>
                            {r.avgParamCount.toFixed(1)}/8
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={cn("font-bold font-mono text-xs",
                            r.actionScore >= 90 ? "text-green-500" : r.actionScore >= 75 ? "text-blue-500" : "text-muted-foreground"
                          )}>
                            {r.actionScore.toFixed(0)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">{r.avgGainWin.toFixed(2)}%</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.lastSignalDate}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px] px-2"
                            onClick={() => navigate(`/historical-backtest?ticker=${r.ticker}`)}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {displayData.length > 300 && (
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Menampilkan 300 dari {displayData.length} hasil
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Parameter Correlation Section */}
          <HistorisParamCorrelation signals={allSignals} />
        </>
      )}
    </div>
  );
}
