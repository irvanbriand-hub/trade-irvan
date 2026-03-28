import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, RefreshCw, Trash2, Eye, Award, Flame, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useBandarmology, type BandarmologyRow } from "@/hooks/useBandarmology";
import { useTradingDays } from "@/hooks/useTradingDays";

interface SkMonitoringRow {
  id: string;
  ticker: string;
  tanggal_masuk: string;
  close_day0: number;
  jalur_masuk: string;
  ii_score: number;
  tma20: number;
  vok_tipe: string;
  macd_kondisi: string;
  stoch_kondisi: string;
  adx_kondisi: string;
  status: string;
  created_at: string;
  is_confluence: boolean;
  vv0_saat_masuk: number | null;
  vv1_saat_masuk: number | null;
  vm60_saat_masuk: number | null;
}

interface DayData {
  pctClose: number | null;
  volRel: number | null;
}

interface EntryReco {
  ticker: string;
  dayN: number;
  winPctHistoris: number;
  avgPctHistoris: number;
  match: "✅" | "⚠️" | "❌";
  reko: "🔥" | "✅" | "⚠️" | "❌";
  stillSK: boolean;
}

export default function SkMonitoring() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData[]>>({});
  const [recoMap, setRecoMap] = useState<Record<string, EntryReco>>({});
  const [loadingData, setLoadingData] = useState(false);
  const { items: bandarItems } = useBandarmology();
  const { getTradingDaysSince } = useTradingDays();

  // Build accum map per ticker (latest data)
  const accumMap = useMemo(() => {
    const map = new Map<string, BandarmologyRow>();
    for (const b of bandarItems) {
      const existing = map.get(b.ticker);
      if (!existing || b.tanggal_data > existing.tanggal_data || (b.tanggal_data === existing.tanggal_data && b.input_time > existing.input_time)) {
        map.set(b.ticker, b);
      }
    }
    return map;
  }, [bandarItems]);

  // Calculate accum score bonus
  const getAccumBonus = (ticker: string): number => {
    const acc = accumMap.get(ticker);
    if (!acc) return 0;
    let bonus = 0;
    const streak = acc.streak || 0;
    if (acc.tier === "S" && streak >= 3) bonus += 4;
    else if (acc.tier === "S") bonus += 3;
    else if (acc.tier === "A" && streak >= 3) bonus += 3;
    else if (acc.tier === "A") bonus += 2;
    else if (acc.tier === "B" && streak >= 3) bonus += 2;
    else if (acc.tier === "B") bonus += 1;
    return bonus;
  };

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sk-monitoring", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sk_monitoring")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as SkMonitoringRow[];
    },
    enabled: !!user,
  });

  const fetchAllData = useCallback(async () => {
    if (items.length === 0) return;
    setLoadingData(true);
    const newDayMap: Record<string, DayData[]> = {};
    const newRecoMap: Record<string, EntryReco> = {};

    for (const item of items) {
      if (item.status !== "MONITORING") continue;
      try {
        const { data, error } = await supabase.functions.invoke("yahoo-finance-sk-analysis", {
          body: { ticker: item.ticker },
        });
        if (error || !data) continue;

        // Find matching event
        const events = data.events || [];
        const matchEvent = events.find((e: any) => e.date === item.tanggal_masuk);
        if (matchEvent) {
          newDayMap[item.id] = matchEvent.days.map((d: any) => ({
            pctClose: d.pctClose,
            volRel: d.volRel,
          }));
        } else {
          newDayMap[item.id] = [1,2,3,4,5].map(() => ({ pctClose: null, volRel: null }));
        }

        // Calculate Day N position using trading days
        const tradingDays = getTradingDaysSince(item.tanggal_masuk);
        const dayN = Math.min(Math.max(tradingDays, 1), 5);

        // Get historical WIN% for this day
        const summaryForDay = (data.summary || []).find((s: any) => s.day === dayN);
        const winPct = summaryForDay?.winPct || 0;
        const avgPct = summaryForDay?.avgPct || 0;

        // Check latest event for current conditions
        const latestEvent = events[0];
        const stillSK = latestEvent && latestEvent.date === new Date().toISOString().split("T")[0];

        // Determine match
        let match: "✅" | "⚠️" | "❌" = "⚠️";
        if (latestEvent) {
          const jalurMatch = latestEvent.jalur === item.jalur_masuk;
          const adxMatch = latestEvent.adxKondisi === item.adx_kondisi;
          if (jalurMatch && adxMatch) match = "✅";
          else if (!jalurMatch && !adxMatch) match = "❌";
        }

        let reko: "🔥" | "✅" | "⚠️" | "❌" = "⚠️";
        if (winPct >= 70 && match === "✅") reko = "🔥";
        else if (winPct >= 50 && match !== "❌") reko = "✅";
        else if (winPct < 30) reko = "❌";

        // Confluence boost: upgrade reko by 1 level
        if (item.is_confluence) {
          if (reko === "✅") reko = "🔥";
          else if (reko === "⚠️") reko = "✅";
        }

        newRecoMap[item.id] = { ticker: item.ticker, dayN, winPctHistoris: winPct, avgPctHistoris: avgPct, match, reko, stillSK: !!stillSK };
      } catch {
        newDayMap[item.id] = [1,2,3,4,5].map(() => ({ pctClose: null, volRel: null }));
      }
    }

    setDayDataMap(newDayMap);
    setRecoMap(newRecoMap);
    setLoadingData(false);
  }, [items]);

  useEffect(() => {
    if (items.length > 0 && Object.keys(dayDataMap).length === 0) fetchAllData();
  }, [items.length]); // eslint-disable-line

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
    toast({ title: "Data diperbarui" });
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("sk_monitoring").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["sk-monitoring"] });
      toast({ title: "Dihapus dari monitoring" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const colorPct = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "text-muted-foreground";
    return v > 0 ? "text-green-500" : v < 0 ? "text-red-500" : "text-foreground";
  };

  const monitoringItems = items.filter(i => i.status === "MONITORING");
  const hotEntries = Object.values(recoMap).filter(r => r.reko === "🔥").sort((a, b) => b.winPctHistoris - a.winPctHistoris);
  const safebullCount = monitoringItems.filter(i => i.jalur_masuk === "SAFEBULL" || i.jalur_masuk === "KEDUANYA").length;
  const safemspCount = monitoringItems.filter(i => i.jalur_masuk === "SAFEMSP" || i.jalur_masuk === "KEDUANYA").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">SK Monitoring</h1>
        <Button onClick={handleRefresh} disabled={refreshing || loadingData} size="sm">
          {refreshing || loadingData ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh Data
        </Button>
      </div>

      {/* Hot Entries */}
      {hotEntries.length > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500" />
              🔥 Entry Hari Ini
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {hotEntries.map(r => (
                <Badge key={r.ticker} className="text-xs bg-orange-500/10 text-orange-400 border-orange-500/30">
                  {r.ticker} Day{r.dayN} (WIN {r.winPctHistoris.toFixed(0)}%)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground">Total Monitoring</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{monitoringItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground">SAFEBULL / SAFEMSP</span>
            </div>
            <p className="text-lg font-bold text-foreground">{safebullCount} / {safemspCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground">🔥 Hot Entries</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{hotEntries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-muted-foreground">Avg Performa D1-5</span>
            </div>
            <div className="flex gap-1.5">
              {[0,1,2,3,4].map(i => {
                const allPcts = monitoringItems.map(it => dayDataMap[it.id]?.[i]?.pctClose).filter(v => v != null) as number[];
                const avg = allPcts.length > 0 ? allPcts.reduce((a,b) => a+b, 0) / allPcts.length : null;
                return (
                  <span key={i} className={cn("text-[9px] font-mono", avg != null ? (avg > 0 ? "text-green-500" : "text-red-500") : "text-muted-foreground")}>
                    D{i+1}:{avg != null ? `${avg.toFixed(1)}%` : "—"}
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations Table */}
      {Object.keys(recoMap).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Rekomendasi Entry</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Ticker</TableHead>
                    <TableHead className="text-[10px] text-center">Day ke-</TableHead>
                    <TableHead className="text-[10px] text-right">WIN%</TableHead>
                    <TableHead className="text-[10px] text-right">Avg%</TableHead>
                    <TableHead className="text-[10px] text-center">Match</TableHead>
                    <TableHead className="text-[10px] text-center">Masih SK?</TableHead>
                    <TableHead className="text-[10px] text-center">Reko</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(recoMap)
                    .sort(([,a], [,b]) => {
                      const order = { "🔥": 0, "✅": 1, "⚠️": 2, "❌": 3 };
                      return (order[a.reko] || 3) - (order[b.reko] || 3) || b.winPctHistoris - a.winPctHistoris;
                    })
                    .map(([id, r]) => (
                      <TableRow key={id}>
                        <TableCell className="font-mono font-bold text-xs text-primary">{r.ticker}</TableCell>
                        <TableCell className="text-center font-mono text-xs">Day {r.dayN}</TableCell>
                        <TableCell className={cn("text-right font-mono text-xs", r.winPctHistoris >= 50 ? "text-green-500" : "text-red-500")}>{r.winPctHistoris.toFixed(1)}%</TableCell>
                        <TableCell className={cn("text-right font-mono text-xs", colorPct(r.avgPctHistoris))}>{r.avgPctHistoris.toFixed(2)}%</TableCell>
                        <TableCell className="text-center text-xs">{r.match}</TableCell>
                        <TableCell className="text-center text-xs">{r.stillSK ? "✅" : "❌"}</TableCell>
                        <TableCell className="text-center text-sm">{r.reko}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monitoring Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            <p>Belum ada saham di SK Monitoring.</p>
            <p className="text-xs mt-1">Tambahkan dari hasil analisa Superketat di halaman Screener.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Detail Monitoring</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Ticker</TableHead>
                    <TableHead className="text-[10px] text-center">Confluence</TableHead>
                    <TableHead className="text-[10px]">Tgl Masuk</TableHead>
                    <TableHead className="text-[10px] text-right">Close D0</TableHead>
                    <TableHead className="text-[10px]">Jalur</TableHead>
                    <TableHead className="text-[10px] text-right">ii</TableHead>
                    <TableHead className="text-[10px] text-right">TMA20</TableHead>
                    {[1,2,3,4,5].map(d => (
                      <TableHead key={d} className="text-[10px] text-center">
                        <div>D{d}%</div>
                        <div className="text-[8px] text-muted-foreground">VR</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-[10px] text-center">Accum</TableHead>
                    <TableHead className="text-[10px] text-center">Status</TableHead>
                    <TableHead className="text-[10px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => {
                    const dd = dayDataMap[item.id] || [];
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono font-bold text-xs text-primary">{item.ticker}</TableCell>
                        <TableCell className="text-center">
                          {item.is_confluence ? (
                            <Badge className="text-[8px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">🔥 SK+VOL</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[8px] text-muted-foreground">SK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{item.tanggal_masuk}</TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{item.close_day0?.toLocaleString("id-ID")}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[8px]">{item.jalur_masuk || "—"}</Badge></TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px]", (item.ii_score || 0) > 0 ? "text-green-500" : "text-red-500")}>{(item.ii_score || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{(item.tma20 || 0).toFixed(2)}</TableCell>
                        {[0,1,2,3,4].map(i => {
                          const d = dd[i];
                          return (
                            <TableCell key={i} className={cn("text-center font-mono text-[10px]", colorPct(d?.pctClose ?? null))}>
                              <div>{d?.pctClose != null ? `${d.pctClose.toFixed(2)}%` : "—"}</div>
                              <div className="text-[8px] text-muted-foreground">{d?.volRel != null ? `${d.volRel.toFixed(1)}x` : "—"}</div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center">
                          {(() => {
                            const acc = accumMap.get(item.ticker);
                            if (!acc) return <Badge variant="outline" className="text-[8px] text-muted-foreground">🏦 No data</Badge>;
                            const tierColor = acc.tier === "S" ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" :
                              acc.tier === "A" ? "bg-green-500/10 text-green-400 border-green-500/30" :
                              acc.tier === "B" ? "bg-zinc-400/10 text-zinc-300 border-zinc-400/30" :
                              "bg-zinc-500/10 text-zinc-500 border-zinc-500/30";
                            return (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge className={cn("text-[8px]", tierColor)}>
                                    🏦 {acc.tier} {acc.composite_pct?.toFixed(0)}% {acc.streak || 0}d↑
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs space-y-0.5">
                                  <p>Tier: {acc.tier} | Source: {"⭐".repeat(acc.source_count)}</p>
                                  <p>Composite: {acc.composite_pct?.toFixed(1)}%</p>
                                  <p>Daily: {acc.daily_pct?.toFixed(1)}% | Weekly: {acc.weekly_pct?.toFixed(1)}%</p>
                                  {acc.top1_pct && <p>Top1: {acc.top1_pct.toFixed(1)}% ({acc.top1_broker})</p>}
                                  <p>Value: {acc.value ? `Rp ${(acc.value / 1e6).toFixed(0)}M` : "—"}</p>
                                  <p>Streak: {acc.streak || 0}d↑ | TopV: {acc.is_topv ? "Ya" : "Tidak"}</p>
                                  <p className="text-primary font-bold">Bonus score: +{getAccumBonus(item.ticker)}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={item.status === "MONITORING" ? "default" : "secondary"} className="text-[8px]">{item.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
