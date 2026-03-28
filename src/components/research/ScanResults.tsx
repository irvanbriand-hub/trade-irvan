import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { compileFormula, evaluateFormulaOnCandles, type CandleData } from "@/lib/formulaEvaluator";
import type { ScanResult } from "./ScanProgress";
import type { BacktestConfigData } from "./BacktestConfig";

interface ScanResultsProps {
  results: ScanResult[];
  formula: string;
  scanTime: string;
  dataDate?: string;
  onProceed: () => void;
  onBack: () => void;
}

type SortKey = "ticker" | "close" | "change" | "volume" | "value";

interface SingleBacktestResult {
  ticker: string;
  totalSignals: number;
  wins: number;
  winRate: number;
  avgGain: number;
  bestDay: number;
  events: {
    date: string;
    close: number;
    dayPcts: number[];
    dayWins: boolean[];
    result: "WIN" | "LOSE";
  }[];
}

export default function ScanResults({ results, formula, scanTime, dataDate, onProceed, onBack }: ScanResultsProps) {
  const [sortKey, setSortKey] = useState<SortKey>("change");
  const [sortAsc, setSortAsc] = useState(false);

  // Single stock backtest state
  const [singleTicker, setSingleTicker] = useState("");
  const [singleResults, setSingleResults] = useState<SingleBacktestResult[]>([]);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleExpandedTicker, setSingleExpandedTicker] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortKey === "ticker") return mul * a.ticker.localeCompare(b.ticker);
      return mul * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
    });
  }, [results, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <TableHead className="text-xs h-8 cursor-pointer hover:text-foreground" onClick={() => toggleSort(k)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "text-muted-foreground/40"}`} />
      </div>
    </TableHead>
  );

  const fmtNum = (n: number) => n >= 1e12 ? (n / 1e12).toFixed(1) + "T" : n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n.toLocaleString("id-ID");

  // Single stock backtest
  const runSingleBacktest = async () => {
    const ticker = singleTicker.trim().toUpperCase();
    if (!ticker) return;
    // Check if already tested
    if (singleResults.find(r => r.ticker === ticker)) return;

    setSingleLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
        body: { ticker: ticker + ".JK", count: 600 },
      });
      if (error || !data?.candles?.length) {
        setSingleLoading(false);
        return;
      }

      const candles: CandleData[] = data.candles
        .filter((c: CandleData) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
        .sort((a: CandleData, b: CandleData) => a.time - b.time);

      if (candles.length < 100) {
        setSingleLoading(false);
        return;
      }

      const signalIndices = evaluateFormulaOnCandles(formula, candles, 50);
      const threshold = 0.02; // Default BSJP 2%
      const maxDays = 5;

      const events: SingleBacktestResult["events"] = [];
      for (const i of signalIndices) {
        if (i + maxDays >= candles.length) continue;
        const c0 = candles[i].close;
        const dayPcts: number[] = [];
        const dayWins: boolean[] = [];
        for (let d = 1; d <= maxDays; d++) {
          const pct = ((candles[i + d].high - c0) / c0) * 100;
          dayPcts.push(pct);
          dayWins.push(candles[i + d].high >= c0 * (1 + threshold));
        }
        const isWin = dayWins[0]; // BSJP = Day 1 only
        events.push({
          date: new Date(candles[i].time * 1000).toISOString().slice(0, 10),
          close: c0,
          dayPcts,
          dayWins,
          result: isWin ? "WIN" : "LOSE",
        });
      }

      const wins = events.filter(e => e.result === "WIN");
      const avgGain = wins.length > 0 ? wins.reduce((s, e) => s + e.dayPcts[0], 0) / wins.length : 0;
      const dayWinCounts = Array(maxDays).fill(0);
      events.forEach(e => e.dayWins.forEach((w, d) => { if (w) dayWinCounts[d]++; }));
      const bestDay = dayWinCounts.indexOf(Math.max(...dayWinCounts)) + 1;

      setSingleResults(prev => [...prev, {
        ticker,
        totalSignals: events.length,
        wins: wins.length,
        winRate: events.length > 0 ? (wins.length / events.length) * 100 : 0,
        avgGain,
        bestDay,
        events,
      }]);
    } catch (err) {
      console.error("Single backtest error:", err);
    }
    setSingleLoading(false);
    setSingleTicker("");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Ditemukan <span className="text-primary">{results.length}</span> saham
              </h3>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate max-w-md">
                Formula: {formula.slice(0, 80)}{formula.length > 80 ? "..." : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {dataDate && <>Data per: {dataDate} | </>}Scan: {scanTime}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onBack}>← Kembali</Button>
              <Button size="sm" onClick={onProceed} disabled={results.length === 0}>
                ⚙️ Pilih Metode & Parameter →
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader k="ticker" label="Ticker" />
                <SortHeader k="close" label="Harga" />
                <SortHeader k="change" label="% Change" />
                <SortHeader k="volume" label="Volume" />
                <SortHeader k="value" label="Value" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.ticker}>
                  <TableCell className="text-xs font-bold py-2">{r.ticker}</TableCell>
                  <TableCell className="text-xs py-2 font-mono">{r.close.toLocaleString("id-ID")}</TableCell>
                  <TableCell className="text-xs py-2">
                    <Badge variant="outline" className={`text-xs ${r.change >= 0 ? "text-emerald-500 border-emerald-500/30" : "text-red-500 border-red-500/30"}`}>
                      {r.change >= 0 ? "+" : ""}{r.change.toFixed(2)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs py-2 text-muted-foreground font-mono">{fmtNum(r.volume)}</TableCell>
                  <TableCell className="text-xs py-2 text-muted-foreground font-mono">{fmtNum(r.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {results.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p className="text-2xl mb-2">😔</p>
            <p className="text-sm">Tidak ada saham yang lolos formula ini.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onBack}>Ubah Formula</Button>
          </CardContent>
        </Card>
      )}

      {/* Single Stock Backtest Section */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">🔍 Single Stock Backtest</h3>
            <p className="text-xs text-muted-foreground">Test formula ke saham manapun tanpa scan IDX</p>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Contoh: ADRO"
              value={singleTicker}
              onChange={e => setSingleTicker(e.target.value.toUpperCase())}
              className="text-xs h-8 max-w-[200px] font-mono"
              onKeyDown={e => { if (e.key === "Enter") runSingleBacktest(); }}
            />
            <Button size="sm" onClick={runSingleBacktest} disabled={singleLoading || !singleTicker.trim()} className="h-8 text-xs">
              {singleLoading ? "Loading..." : "▶ Backtest Saham Ini"}
            </Button>
          </div>

          {singleResults.map(sr => (
            <Card key={sr.ticker} className="border-primary/20">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground">
                    Hasil backtest <span className="text-primary">{sr.ticker}</span>
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setSingleExpandedTicker(singleExpandedTicker === sr.ticker ? null : sr.ticker)}
                  >
                    {singleExpandedTicker === sr.ticker ? "▲ Sembunyikan" : "▼ Detail"}
                  </Button>
                </div>

                {/* Stats cards */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-muted/50 rounded p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Sinyal</p>
                    <p className="text-sm font-bold">{sr.totalSignals}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">WIN%</p>
                    <p className={`text-sm font-bold ${sr.winRate >= 50 ? "text-emerald-500" : "text-red-500"}`}>
                      {sr.winRate.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Avg%</p>
                    <p className="text-sm font-bold">{sr.avgGain.toFixed(2)}%</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Best Day</p>
                    <p className="text-sm font-bold">Day {sr.bestDay}</p>
                  </div>
                </div>

                {/* Event table */}
                {singleExpandedTicker === sr.ticker && sr.events.length > 0 && (
                  <div className="border border-border rounded overflow-hidden max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px] h-7">Tanggal</TableHead>
                          <TableHead className="text-[10px] h-7">Close</TableHead>
                          <TableHead className="text-[10px] h-7">Day1%</TableHead>
                          <TableHead className="text-[10px] h-7">Day2%</TableHead>
                          <TableHead className="text-[10px] h-7">Day3%</TableHead>
                          <TableHead className="text-[10px] h-7">Day4%</TableHead>
                          <TableHead className="text-[10px] h-7">Day5%</TableHead>
                          <TableHead className="text-[10px] h-7">WIN</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sr.events.map((e, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-[10px] py-1">{e.date}</TableCell>
                            <TableCell className="text-[10px] py-1 font-mono">{e.close.toLocaleString("id-ID")}</TableCell>
                            {e.dayPcts.map((p, di) => (
                              <TableCell key={di} className={`text-[10px] py-1 font-mono ${p >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                {p.toFixed(2)}%
                              </TableCell>
                            ))}
                            <TableCell className="text-[10px] py-1">
                              {e.result === "WIN" ? "✅" : "❌"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {sr.events.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Tidak ada sinyal historis ditemukan.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
