import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { IDX_TICKERS } from "@/data/idxTickers";
import { sma, bollingerBands, calcMACD } from "@/lib/chartIndicators";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CandidateResult {
  ticker: string;
  close: number;
  score: number;
  matchCount: number;
  totalParams: number;
  fraksi: string;
  batasAra: number;
  paramChecks: { param: string; match: boolean; actual: string; expected: string }[];
}

// Simplified RSI calc
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

// Known patterns from analysis
const AVAILABLE_PATTERNS = [
  { id: "green_volspike", label: "Candle Hijau + Vol Spike", params: ["GREEN", "VSPK"] },
  { id: "green_sma20", label: "Candle Hijau + C>SMA20", params: ["GREEN", "SMA20"] },
  { id: "green_volspike_sma20", label: "Candle Hijau + Vol Spike + C>SMA20", params: ["GREEN", "VSPK", "SMA20"] },
  { id: "green_macd_sma5", label: "Candle Hijau + MACD Bull + C>SMA5", params: ["GREEN", "MBULL", "SMA5"] },
  { id: "volspike_gup", label: "Vol Spike + Gap Up", params: ["VSPK", "GUP"] },
  { id: "green_pctpos_sma5", label: "Candle Hijau + % Positif + C>SMA5", params: ["GREEN", "PCTPOS", "SMA5"] },
  { id: "full_momentum", label: "Candle Hijau + Vol Spike + MACD Bull + C>SMA20", params: ["GREEN", "VSPK", "MBULL", "SMA20"] },
];

export default function AraLiveScanner() {
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(["green_volspike_sma20"]);
  const [scanning, setScanning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [results, setResults] = useState<CandidateResult[]>([]);
  const [scanDone, setScanDone] = useState(false);
  const [scanTime, setScanTime] = useState("");
  const [minScore, setMinScore] = useState(50);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const total = IDX_TICKERS.length;

  function togglePattern(id: string) {
    setSelectedPatterns(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }

  // Get combined unique params from selected patterns
  const activeParams = useMemo(() => {
    const allParams = new Set<string>();
    for (const pid of selectedPatterns) {
      const p = AVAILABLE_PATTERNS.find(pp => pp.id === pid);
      if (p) p.params.forEach(pp => allParams.add(pp));
    }
    return Array.from(allParams);
  }, [selectedPatterns]);

  async function startScan() {
    if (selectedPatterns.length === 0) return;
    setScanning(true);
    setProcessed(0);
    setResults([]);
    setScanDone(false);
    cancelRef.current = false;

    const allResults: CandidateResult[] = [];
    const batchSize = 5;

    for (let i = 0; i < total; i += batchSize) {
      if (cancelRef.current) break;
      const batch = IDX_TICKERS.slice(i, i + batchSize);

      const promises = batch.map(async (ticker) => {
        try {
          const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
            body: { ticker: ticker + ".JK", count: 100 },
          });
          if (error || !data?.candles?.length) return null;

          const candles = data.candles
            .filter((c: any) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
            .sort((a: any, b: any) => a.time - b.time);

          if (candles.length < 30) return null;

          const closes = candles.map((c: any) => c.close);
          const volumes = candles.map((c: any) => c.volume);
          const lastIdx = candles.length - 1;
          const c = candles[lastIdx];
          const prevC = candles[lastIdx - 1];
          if (!c || !prevC) return null;

          const sma5Val = sma(closes, 5);
          const sma20Val = sma(closes, 20);
          const sma50Val = sma(closes, 50);
          const volSma20 = sma(volumes, 20);
          const rsiArr = calcRSI(closes, 14);
          const macdData = calcMACD(closes);
          const bb = bollingerBands(closes, 20, 2);

          const isGreen = c.close > c.open;
          const pctChange = ((c.close - prevC.close) / prevC.close) * 100;
          const isVolSpike = volSma20[lastIdx] != null && volSma20[lastIdx]! > 0 && c.volume > volSma20[lastIdx]! * 2;
          const isGapUp = c.open > prevC.close * 1.001;
          const aboveSma5 = sma5Val[lastIdx] != null && c.close >= sma5Val[lastIdx]!;
          const aboveSma20 = sma20Val[lastIdx] != null && c.close >= sma20Val[lastIdx]!;
          const aboveSma50 = sma50Val[lastIdx] != null && c.close >= sma50Val[lastIdx]!;
          const ml = macdData.macdLine[lastIdx];
          const ms = macdData.signalLine[lastIdx];
          const isMacdBull = ml != null && ms != null && ml > ms;

          const paramChecks: Record<string, { match: boolean; actual: string; expected: string }> = {
            GREEN: { match: isGreen, actual: isGreen ? "Close > Open" : "Close ≤ Open", expected: "Close > Open" },
            VSPK: { match: isVolSpike, actual: `${volSma20[lastIdx] && volSma20[lastIdx]! > 0 ? (c.volume / volSma20[lastIdx]!).toFixed(1) : "?"}x MA20`, expected: ">2x MA20" },
            GUP: { match: isGapUp, actual: isGapUp ? "Gap Up" : "No Gap", expected: "Gap Up" },
            SMA5: { match: aboveSma5, actual: aboveSma5 ? "Above" : "Below", expected: "Above SMA5" },
            SMA20: { match: aboveSma20, actual: aboveSma20 ? "Above" : "Below", expected: "Above SMA20" },
            SMA50: { match: aboveSma50, actual: aboveSma50 ? "Above" : "Below", expected: "Above SMA50" },
            MBULL: { match: isMacdBull, actual: isMacdBull ? "Bullish" : "Bearish", expected: "Bullish" },
            PCTPOS: { match: pctChange > 0, actual: `${pctChange.toFixed(1)}%`, expected: "> 0%" },
          };

          const matchCount = activeParams.filter(p => paramChecks[p]?.match).length;
          const totalParams = activeParams.length;
          const score = totalParams > 0 ? Math.round((matchCount / totalParams) * 100) : 0;

          let fraksi: string, batasAra: number;
          if (c.close < 200) { fraksi = "<200"; batasAra = 35; }
          else if (c.close <= 5000) { fraksi = "200-5000"; batasAra = 25; }
          else { fraksi = ">5000"; batasAra = 20; }

          return {
            ticker,
            close: c.close,
            score,
            matchCount,
            totalParams,
            fraksi,
            batasAra,
            paramChecks: activeParams.map(p => ({
              param: p,
              match: paramChecks[p]?.match || false,
              actual: paramChecks[p]?.actual || "-",
              expected: paramChecks[p]?.expected || "-",
            })),
          } as CandidateResult;
        } catch {
          return null;
        }
      });

      const batchResults = await Promise.all(promises);
      for (const r of batchResults) {
        if (r && r.score > 0) allResults.push(r);
      }
      setProcessed(Math.min(i + batchSize, total));
      setResults([...allResults].sort((a, b) => b.score - a.score));
    }

    setScanTime(new Date().toLocaleString("id-ID"));
    setScanDone(true);
    setScanning(false);
  }

  const filteredResults = results.filter(r => r.score >= minScore);

  const getRowBg = (score: number) => {
    if (score >= 80) return "bg-yellow-500/10 border-l-2 border-l-yellow-500";
    if (score >= 60) return "bg-green-500/5 border-l-2 border-l-green-500";
    if (score >= 40) return "bg-yellow-500/5 border-l-2 border-l-yellow-600/50";
    return "";
  };

  const paramLabelMap: Record<string, string> = {
    GREEN: "Candle Hijau", VSPK: "Vol Spike", GUP: "Gap Up",
    SMA5: "C>SMA5", SMA20: "C>SMA20", SMA50: "C>SMA50",
    MBULL: "MACD Bull", PCTPOS: "% Positif",
  };

  return (
    <div className="space-y-4">
      {/* Pattern Selection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🎯 Pilih Pola ARA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_PATTERNS.map(p => (
              <Badge
                key={p.id}
                variant={selectedPatterns.includes(p.id) ? "default" : "outline"}
                className="cursor-pointer text-xs py-1 px-3"
                onClick={() => togglePattern(p.id)}
              >
                {selectedPatterns.includes(p.id) ? "✅ " : ""}{p.label}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={startScan} disabled={scanning || selectedPatterns.length === 0}>
              {scanning ? "Scanning..." : "🔍 Scan Kandidat ARA"}
            </Button>
            {scanning && (
              <button onClick={() => { cancelRef.current = true; }} className="text-xs text-muted-foreground hover:text-destructive underline">
                Batalkan
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {scanning && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <Progress value={(processed / total) * 100} className="h-3" />
            <p className="text-sm text-muted-foreground text-center">Scanning: {processed} / {total} saham</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {scanDone && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Ditemukan {filteredResults.length} kandidat ARA potensial
              </CardTitle>
              <span className="text-xs text-muted-foreground">Scan: {scanTime}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Filters */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Min Score: {minScore}%</span>
              <Slider value={[minScore]} onValueChange={([v]) => setMinScore(v)} min={0} max={100} step={10} className="max-w-[200px]" />
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-center">Match</TableHead>
                  <TableHead className="text-center">Fraksi ARA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredResults.map((r) => (
                  <Collapsible key={r.ticker} open={expandedRow === r.ticker} onOpenChange={(o) => setExpandedRow(o ? r.ticker : null)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className={`cursor-pointer ${getRowBg(r.score)}`}>
                          <TableCell className="w-8">
                            {expandedRow === r.ticker ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="font-bold">{r.ticker}</TableCell>
                          <TableCell className="text-right">{r.close.toLocaleString("id-ID")}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-2 justify-center">
                              <Progress value={r.score} className="h-2 w-16" />
                              <span className="font-bold text-sm">{r.score}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{r.matchCount}/{r.totalParams}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">+{r.batasAra}%</Badge>
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={6} className="p-0">
                            <div className="p-4 bg-muted/30">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Parameter</TableHead>
                                    <TableHead className="text-center">Match</TableHead>
                                    <TableHead>Nilai Aktual</TableHead>
                                    <TableHead>Pola</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {r.paramChecks.map(pc => (
                                    <TableRow key={pc.param}>
                                      <TableCell className="text-sm">{paramLabelMap[pc.param] || pc.param}</TableCell>
                                      <TableCell className="text-center">{pc.match ? "✅" : "❌"}</TableCell>
                                      <TableCell className="text-sm">{pc.actual}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{pc.expected}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
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
      )}
    </div>
  );
}
