import React, { useState, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { IDX_TICKERS } from "@/data/idxTickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Loader2, ScanSearch, TrendingUp, TrendingDown, Target, ChevronDown, ChevronUp } from "lucide-react";
import { AiInsightButton, AiInsightPanel } from "@/components/AiInsightRow";
import JendralHistoryPanel from "@/components/jendral/JendralHistoryPanel";
import { useAkSmartMoney } from "@/hooks/useAkSmartMoney";
import { AkSmartMoneyBadgeComponent } from "@/components/AkSmartMoneyBadge";
import { useBandarmology } from "@/hooks/useBandarmology";

interface JendralResult {
  ticker: string;
  name: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  value: number;
  sinyal: 'BELI' | 'JUAL' | 'PERIKSA';
  buyK1: boolean; buyK2: boolean; buyK3: boolean;
  sellK1: boolean; sellK2: boolean;
  ao: number; ac: number;
  hma5: number;
  haStatus: string;
  pivot: number; target: number; stopLoss: number;
  ma8: number; ma21: number; ma55: number;
  maV21: number;
  rsi: number;
  dailyPct: number; weeklyPct: number; monthlyPct: number; yearlyPct: number | null;
  mfiColor: string;
  passFilter: boolean;
  likuid: boolean;
}

const BATCH_SIZE = 5;

function pctColor(pct: number): string {
  if (pct >= 30) return "text-emerald-800 dark:text-emerald-300 font-bold";
  if (pct >= 10) return "text-emerald-600 dark:text-emerald-400 font-semibold";
  if (pct >= 3) return "text-green-600 dark:text-green-400";
  if (pct >= 0) return "text-green-500 dark:text-green-500";
  if (pct >= -3) return "text-pink-500 dark:text-pink-400";
  if (pct >= -10) return "text-red-500 dark:text-red-400";
  if (pct >= -30) return "text-red-600 dark:text-red-500 font-semibold";
  return "text-red-800 dark:text-red-300 font-bold";
}

function formatNum(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return "-";
  return n.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatVolume(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return v.toString();
}

export default function JendralHunter() {
  const [results, setResults] = useState<JendralResult[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanProgressPct, setScanProgressPct] = useState(0);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [filterSignal, setFilterSignal] = useState("all");
  const [onlyLikuid, setOnlyLikuid] = useState(true);
  const [minDaily, setMinDaily] = useState("");
  const [filterCap, setFilterCap] = useState("all");
  const [searchTicker, setSearchTicker] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [aiExpandedTickers, setAiExpandedTickers] = useState<Set<string>>(new Set());
  const [historyTicker, setHistoryTicker] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("screener");
  const abortRef = useRef(false);
  const { items: bandarItems } = useBandarmology();
  const { getBadge: getAkBadge } = useAkSmartMoney(bandarItems);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    abortRef.current = false;
    setScanProgress("Memulai scan...");
    setScanProgressPct(0);
    const allResults: JendralResult[] = [];
    const totalTickers = IDX_TICKERS.length;

    try {
      for (let i = 0; i < totalTickers; i += BATCH_SIZE) {
        if (abortRef.current) break;
        const batch = IDX_TICKERS.slice(i, i + BATCH_SIZE);
        setScanProgress(`Memproses ${i + batch.length}/${totalTickers} saham...`);
        setScanProgressPct(Math.round(((i + batch.length) / totalTickers) * 100));

        const { data, error } = await supabase.functions.invoke("yahoo-finance-jendral", {
          body: { tickers: batch, mode: "scan" },
        });

        if (data?.results) {
          allResults.push(...data.results.filter((r: JendralResult) => r.passFilter));
          setResults([...allResults]);
        }
      }

      setLastScanTime(new Date());
      toast({ title: "Scan selesai!", description: `${allResults.length} saham ditemukan` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsScanning(false);
      setScanProgress("");
      setScanProgressPct(0);
    }
  }, []);

  const filteredResults = useMemo(() => {
    let data = [...results];
    if (filterSignal !== "all") data = data.filter(r => r.sinyal === filterSignal);
    if (onlyLikuid) data = data.filter(r => r.likuid);
    if (minDaily) data = data.filter(r => r.dailyPct >= parseFloat(minDaily));
    if (searchTicker) data = data.filter(r => r.ticker.includes(searchTicker.toUpperCase()));

    // Sort: BELI first, then by dailyPct desc
    data.sort((a, b) => {
      const order = { BELI: 0, PERIKSA: 1, JUAL: 2 };
      const sA = order[a.sinyal] ?? 1, sB = order[b.sinyal] ?? 1;
      if (sA !== sB) return sA - sB;
      return b.dailyPct - a.dailyPct;
    });
    return data;
  }, [results, filterSignal, onlyLikuid, minDaily, searchTicker]);

  const stats = useMemo(() => {
    const beli = results.filter(r => r.sinyal === 'BELI').length;
    const jual = results.filter(r => r.sinyal === 'JUAL').length;
    return { total: results.length, beli, jual, periksa: results.length - beli - jual };
  }, [results]);

  const toggleAiExpand = (ticker: string) => {
    setAiExpandedTickers(prev => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">🎯 Jendral Hunter</h1>
        <p className="text-sm text-muted-foreground">Screener berbasis AO/AC Momentum, HMA, dan Heiken Ashi</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="screener">🎯 Screener</TabsTrigger>
          <TabsTrigger value="stats">📈 Statistik Global</TabsTrigger>
        </TabsList>

        <TabsContent value="screener" className="space-y-4">
          {/* Scan Button */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Button onClick={handleScan} disabled={isScanning} className="gap-2">
                  {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
                  {isScanning ? "Scanning..." : "🔍 Scan Jendral Hunter"}
                </Button>
                {isScanning && (
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <p className="text-xs text-muted-foreground">{scanProgress}</p>
                    <Progress value={scanProgressPct} className="h-2" />
                  </div>
                )}
                {lastScanTime && !isScanning && (
                  <p className="text-xs text-muted-foreground">Scan: {format(lastScanTime, "dd MMM yyyy HH:mm:ss")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {results.length > 0 && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Saham</p>
                </CardContent></Card>
                <Card className="border-green-500/30"><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-green-500">{stats.beli}</p>
                  <p className="text-xs text-muted-foreground">🟢 Sinyal BELI</p>
                </CardContent></Card>
                <Card className="border-red-500/30"><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-red-500">{stats.jual}</p>
                  <p className="text-xs text-muted-foreground">🔴 Sinyal JUAL</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-muted-foreground">{stats.periksa}</p>
                  <p className="text-xs text-muted-foreground">🔍 Periksa Chart</p>
                </CardContent></Card>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1">
                  {["all", "BELI", "JUAL", "PERIKSA"].map(s => (
                    <Button key={s} size="sm" variant={filterSignal === s ? "default" : "outline"}
                      onClick={() => setFilterSignal(s)} className="text-xs">
                      {s === "all" ? "Semua" : s === "BELI" ? "🟢 BELI" : s === "JUAL" ? "🔴 JUAL" : "🔍 Periksa"}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={onlyLikuid} onCheckedChange={setOnlyLikuid} id="likuid" />
                  <Label htmlFor="likuid" className="text-xs">Hanya Likuid</Label>
                </div>
                <Input placeholder="Min Daily %" className="w-24 h-8 text-xs" value={minDaily}
                  onChange={e => setMinDaily(e.target.value)} />
                <Input placeholder="Cari ticker..." className="w-32 h-8 text-xs" value={searchTicker}
                  onChange={e => setSearchTicker(e.target.value)} />
              </div>

              {/* Results Table */}
              <div className="text-xs text-muted-foreground">
                Menampilkan {filteredResults.length} dari {results.length} saham
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-20">Ticker</TableHead>
                      <TableHead className="text-xs w-20">Sinyal</TableHead>
                      <TableHead className="text-xs text-right">RSI</TableHead>
                      <TableHead className="text-xs text-right">MA8</TableHead>
                      <TableHead className="text-xs text-right">Close</TableHead>
                      <TableHead className="text-xs text-right">Open</TableHead>
                      <TableHead className="text-xs text-right">High</TableHead>
                      <TableHead className="text-xs text-right">Low</TableHead>
                      <TableHead className="text-xs text-right">Volume</TableHead>
                      <TableHead className="text-xs text-right">D%</TableHead>
                      <TableHead className="text-xs text-right">W%</TableHead>
                      <TableHead className="text-xs text-right">M%</TableHead>
                      <TableHead className="text-xs text-right">Y%</TableHead>
                      <TableHead className="text-xs text-right">AO</TableHead>
                      <TableHead className="text-xs text-right">AC</TableHead>
                      <TableHead className="text-xs text-right">Pivot</TableHead>
                      <TableHead className="text-xs text-right">Target</TableHead>
                      <TableHead className="text-xs text-right">SL</TableHead>
                      <TableHead className="text-xs text-center">🐋 SM</TableHead>
                      <TableHead className="text-xs">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map(r => (
                      <React.Fragment key={r.ticker}>
                        <TableRow className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker)}>
                          <TableCell className="text-xs font-medium">
                            <div className="flex items-center gap-1">
                              {expandedTicker === r.ticker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {r.ticker}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={r.sinyal === 'BELI' ? 'default' : r.sinyal === 'JUAL' ? 'destructive' : 'secondary'}
                              className={cn("text-[10px]", r.sinyal === 'BELI' && "bg-green-600 hover:bg-green-700")}>
                              {r.sinyal === 'BELI' ? '🟢 BELI' : r.sinyal === 'JUAL' ? '🔴 JUAL' : '🔍 Periksa'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right">{formatNum(r.rsi, 1)}</TableCell>
                          <TableCell className="text-xs text-right">{formatNum(r.ma8)}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{formatNum(r.close)}</TableCell>
                          <TableCell className="text-xs text-right">{formatNum(r.open)}</TableCell>
                          <TableCell className="text-xs text-right">{formatNum(r.high)}</TableCell>
                          <TableCell className="text-xs text-right">{formatNum(r.low)}</TableCell>
                          <TableCell className="text-xs text-right">{formatVolume(r.volume)}</TableCell>
                          <TableCell className={cn("text-xs text-right", pctColor(r.dailyPct))}>{r.dailyPct.toFixed(2)}%</TableCell>
                          <TableCell className={cn("text-xs text-right", pctColor(r.weeklyPct))}>{r.weeklyPct.toFixed(2)}%</TableCell>
                          <TableCell className={cn("text-xs text-right", pctColor(r.monthlyPct))}>{r.monthlyPct.toFixed(2)}%</TableCell>
                          <TableCell className={cn("text-xs text-right", r.yearlyPct != null ? pctColor(r.yearlyPct) : "")}>
                            {r.yearlyPct != null ? r.yearlyPct.toFixed(2) + "%" : "-"}
                          </TableCell>
                          <TableCell className={cn("text-xs text-right", r.ao > 0 ? "text-green-500" : "text-red-500")}>{r.ao.toFixed(2)}</TableCell>
                          <TableCell className={cn("text-xs text-right", r.ac > 0 ? "text-green-500" : "text-red-500")}>{r.ac.toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">{formatNum(r.pivot)}</TableCell>
                          <TableCell className="text-xs text-right text-green-500">{formatNum(r.target)}</TableCell>
                          <TableCell className="text-xs text-right text-red-500">{formatNum(r.stopLoss)}</TableCell>
                          <TableCell className="text-center">
                            <AkSmartMoneyBadgeComponent data={getAkBadge(r.ticker)} />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                              <AiInsightButton
                                ticker={r.ticker}
                                isExpanded={aiExpandedTickers.has(r.ticker)}
                                onToggle={() => toggleAiExpand(r.ticker)}
                                price={r.close}
                                volume={r.volume}
                              />
                              <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                                onClick={() => setHistoryTicker(historyTicker === r.ticker ? null : r.ticker)}>
                                📊
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded row: signal details */}
                        {expandedTicker === r.ticker && (
                          <TableRow>
                            <TableCell colSpan={19} className="bg-muted/30 p-3">
                              <div className="space-y-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">HMA5:</span>{" "}
                                    <span className={r.close > r.hma5 ? "text-green-500" : "text-red-500"}>{formatNum(r.hma5)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">HA Status:</span>{" "}
                                    <Badge variant={r.haStatus === 'BULLISH' ? 'default' : 'destructive'} className="text-[10px]">{r.haStatus}</Badge>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Likuid:</span>{" "}
                                    {r.likuid ? <span className="text-green-500">✅ Ya</span> : <span className="text-red-500">❌ Tidak</span>}
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">MA21:</span> {formatNum(r.ma21)} | <span className="text-muted-foreground">MA55:</span> {formatNum(r.ma55)}
                                  </div>
                                </div>

                                <div className="text-xs space-y-1">
                                  <p className="font-medium text-foreground">Kondisi Sinyal:</p>
                                  <div className="flex gap-2 flex-wrap">
                                    <Badge variant={r.buyK1 ? "default" : "outline"} className={cn("text-[10px]", r.buyK1 && "bg-green-600")}>
                                      K1: AC↑ + Likuid + Pivot&gt;Low {r.buyK1 ? "✅" : "❌"}
                                    </Badge>
                                    <Badge variant={r.buyK2 ? "default" : "outline"} className={cn("text-[10px]", r.buyK2 && "bg-green-600")}>
                                      K2: AC↑ + Doji + HMA5 {r.buyK2 ? "✅" : "❌"}
                                    </Badge>
                                    <Badge variant={r.buyK3 ? "default" : "outline"} className={cn("text-[10px]", r.buyK3 && "bg-green-600")}>
                                      K3: Hijau + HMA5 + HA↑ {r.buyK3 ? "✅" : "❌"}
                                    </Badge>
                                    {r.sinyal === 'JUAL' && (
                                      <>
                                        <Badge variant="destructive" className="text-[10px]">
                                          S1: C&lt;prevO {r.sellK1 ? "✅" : "❌"}
                                        </Badge>
                                        <Badge variant="destructive" className="text-[10px]">
                                          S2: HA↓ + HMA5&gt;C {r.sellK2 ? "✅" : "❌"}
                                        </Badge>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}

                        {/* AI Panel */}
                        {aiExpandedTickers.has(r.ticker) && (
                          <TableRow>
                            <TableCell colSpan={19} className="p-0">
                              <AiInsightPanel
                                ticker={r.ticker}
                                price={r.close}
                                volume={r.volume}
                              />
                            </TableCell>
                          </TableRow>
                        )}

                        {/* History Panel */}
                        {historyTicker === r.ticker && (
                          <TableRow>
                            <TableCell colSpan={19} className="p-0">
                              <JendralHistoryPanel ticker={r.ticker} />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="stats">
          <JendralGlobalStats results={results} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// === GLOBAL STATS COMPONENT ===
function JendralGlobalStats({ results }: { results: JendralResult[] }) {
  if (results.length === 0) {
    return (
      <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">
        Jalankan scan terlebih dahulu untuk melihat statistik global.
      </CardContent></Card>
    );
  }

  const beliResults = results.filter(r => r.sinyal === 'BELI');

  const conditionStats = useMemo(() => {
    const k1 = beliResults.filter(r => r.buyK1).length;
    const k2 = beliResults.filter(r => r.buyK2).length;
    const k3 = beliResults.filter(r => r.buyK3).length;
    return { k1, k2, k3 };
  }, [beliResults]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{results.length}</p>
          <p className="text-xs text-muted-foreground">Total Saham Terscan</p>
        </CardContent></Card>
        <Card className="border-green-500/30"><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-green-500">{beliResults.length}</p>
          <p className="text-xs text-muted-foreground">Sinyal BELI Hari Ini</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{conditionStats.k1}</p>
          <p className="text-xs text-muted-foreground">K1: AC + Likuid</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-bold text-foreground">{conditionStats.k3}</p>
          <p className="text-xs text-muted-foreground">K3: Hijau + HMA + HA</p>
        </CardContent></Card>
      </div>

      {/* Top BUY signals by daily% */}
      <Card>
        <CardHeader><CardTitle className="text-sm">🏆 Top 10 Sinyal BELI (by Daily%)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ticker</TableHead>
                <TableHead className="text-xs text-right">Daily%</TableHead>
                <TableHead className="text-xs text-right">Weekly%</TableHead>
                <TableHead className="text-xs text-right">Monthly%</TableHead>
                <TableHead className="text-xs text-right">RSI</TableHead>
                <TableHead className="text-xs">Kondisi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {beliResults.sort((a, b) => b.dailyPct - a.dailyPct).slice(0, 10).map(r => (
                <TableRow key={r.ticker}>
                  <TableCell className="text-xs font-medium">{r.ticker}</TableCell>
                  <TableCell className={cn("text-xs text-right", pctColor(r.dailyPct))}>{r.dailyPct.toFixed(2)}%</TableCell>
                  <TableCell className={cn("text-xs text-right", pctColor(r.weeklyPct))}>{r.weeklyPct.toFixed(2)}%</TableCell>
                  <TableCell className={cn("text-xs text-right", pctColor(r.monthlyPct))}>{r.monthlyPct.toFixed(2)}%</TableCell>
                  <TableCell className="text-xs text-right">{formatNum(r.rsi, 1)}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex gap-1">
                      {r.buyK1 && <Badge className="text-[9px] bg-green-600">K1</Badge>}
                      {r.buyK2 && <Badge className="text-[9px] bg-blue-600">K2</Badge>}
                      {r.buyK3 && <Badge className="text-[9px] bg-purple-600">K3</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Distribution */}
      <Card>
        <CardHeader><CardTitle className="text-sm">📊 Distribusi Sinyal</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: "K1: AC↑ + Likuid + Pivot>Low", count: conditionStats.k1, color: "bg-green-500" },
              { label: "K2: AC↑ + Doji + HMA5", count: conditionStats.k2, color: "bg-blue-500" },
              { label: "K3: Hijau + HMA5 + HA↑", count: conditionStats.k3, color: "bg-purple-500" },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-48 text-xs text-muted-foreground">{item.label}</div>
                <div className="flex-1">
                  <div className="h-5 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", item.color)}
                      style={{ width: `${beliResults.length > 0 ? (item.count / beliResults.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="w-16 text-xs text-right font-medium">{item.count} ({beliResults.length > 0 ? ((item.count / beliResults.length) * 100).toFixed(0) : 0}%)</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
