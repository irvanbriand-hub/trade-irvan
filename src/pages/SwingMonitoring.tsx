import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Trash2, Eye, Flame, TrendingUp, Target, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useTradingDays } from "@/hooks/useTradingDays";

interface SwingMonitoringRow {
  id: string;
  ticker: string;
  screener_name: string;
  tanggal_masuk: string;
  close_day0: number;
  ii_score: number;
  tma20: number;
  vok_tipe: string;
  macd_kondisi: string;
  stoch_kondisi: string;
  adx_kondisi: string;
  entry_day_rekomendasi: number | null;
  win_pct_day_rekom: number | null;
  avg_pct_day_rekom: number | null;
  entry_notes: string;
  parameter_khusus: any;
  status: string;
  created_at: string;
}

interface DayData {
  pctClose: number | null;
  volRel: number | null;
}

const SCREENER_LABELS: Record<string, string> = {
  ketat_allma: "Ketat + All MA",
  ketat_pertama: "Ketat Pertama",
  bottom_fishing: "Bottom Fishing",
};

export default function SwingMonitoring() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [dayDataMap, setDayDataMap] = useState<Record<string, DayData[]>>({});
  const [loadingData, setLoadingData] = useState(false);
  const { getTradingDaysSince } = useTradingDays();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["swing-monitoring", user?.id],
    queryFn: async () => {
      console.log("[SwingMonitoring] Fetching data for user:", user?.id);
      const { data, error } = await supabase
        .from("swing_monitoring")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[SwingMonitoring] Error fetching:", error);
        throw error;
      }
      console.log("[SwingMonitoring] Fetched items:", data?.length);
      return (data || []) as unknown as SwingMonitoringRow[];
    },
    enabled: !!user,
  });

  const monitoringItems = items.filter(i => i.status === "MONITORING");

  const fetchAllData = useCallback(async () => {
    if (monitoringItems.length === 0) return;
    setLoadingData(true);
    const newDayMap: Record<string, DayData[]> = {};

    for (const item of monitoringItems) {
      try {
        const { data, error } = await supabase.functions.invoke("yahoo-finance-swing-analysis", {
          body: { ticker: item.ticker, screenerType: item.screener_name },
        });
        if (error || !data) continue;

        const events = data.events || [];
        const matchEvent = events.find((e: any) => e.date === item.tanggal_masuk);
        if (matchEvent) {
          newDayMap[item.id] = (matchEvent.days || []).map((d: any) => ({
            pctClose: d.pctClose,
            volRel: d.volRel,
          }));
        } else {
          newDayMap[item.id] = [1, 2, 3, 4, 5].map(() => ({ pctClose: null, volRel: null }));
        }
      } catch {
        newDayMap[item.id] = [1, 2, 3, 4, 5].map(() => ({ pctClose: null, volRel: null }));
      }
    }

    setDayDataMap(newDayMap);
    setLoadingData(false);
  }, [monitoringItems]);

  useEffect(() => {
    if (monitoringItems.length > 0 && Object.keys(dayDataMap).length === 0) fetchAllData();
  }, [monitoringItems.length]); // eslint-disable-line

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["swing-monitoring"] });
    await fetchAllData();
    setRefreshing(false);
    toast({ title: "Data diperbarui" });
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("swing_monitoring").delete().eq("id", id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["swing-monitoring"] });
      toast({ title: "Dihapus dari monitoring" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const colorPct = (v: number | null | undefined) => {
    if (v === null || v === undefined) return "text-muted-foreground";
    return v > 0 ? "text-green-500" : v < 0 ? "text-red-500" : "text-foreground";
  };

  const getDayN = (tanggalMasuk: string) => {
    const tradingDays = getTradingDaysSince(tanggalMasuk);
    return Math.min(Math.max(tradingDays, 1), 5);
  };

  const getEntryStatus = (item: SwingMonitoringRow) => {
    if (!item.entry_day_rekomendasi) return null;
    const dayN = getDayN(item.tanggal_masuk);
    if (dayN === item.entry_day_rekomendasi) return "entry";
    if (dayN < item.entry_day_rekomendasi) return "wait";
    return "passed";
  };

  // Sort: 🎯 HARI ENTRY first, then ⏳, then ⚠️
  const sortedItems = useMemo(() => {
    return [...monitoringItems].sort((a, b) => {
      const statusA = getEntryStatus(a);
      const statusB = getEntryStatus(b);
      const order = { entry: 0, wait: 1, passed: 2 };
      return (order[statusA as keyof typeof order] ?? 3) - (order[statusB as keyof typeof order] ?? 3);
    });
  }, [monitoringItems]);

  const entryTodayItems = sortedItems.filter(i => getEntryStatus(i) === "entry");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Swing Monitoring</h1>
        <Button onClick={handleRefresh} disabled={refreshing || loadingData} size="sm">
          {refreshing || loadingData ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh Data
        </Button>
      </div>

      {/* 🎯 Entry Hari Ini */}
      {entryTodayItems.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-yellow-500" />
              🎯 Entry Hari Ini!
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {entryTodayItems.map(item => (
                <Badge key={item.id} className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
                  {item.ticker} Day{item.entry_day_rekomendasi} (WIN {(item.win_pct_day_rekom || 0).toFixed(0)}%) — {SCREENER_LABELS[item.screener_name] || item.screener_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <Target className="h-4 w-4 text-yellow-500" />
              <span className="text-[10px] font-semibold text-muted-foreground">🎯 Entry Hari Ini</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{entryTodayItems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-muted-foreground">Per Screener</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(SCREENER_LABELS).map(([key, label]) => {
                const count = monitoringItems.filter(i => i.screener_name === key).length;
                if (count === 0) return null;
                return (
                  <Badge key={key} variant="outline" className="text-[9px]">{label}: {count}</Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
            <p>Belum ada saham di Swing Monitoring.</p>
            <p className="text-xs mt-1">Tambahkan dari hasil analisa Swing di halaman Screener.</p>
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
                    <TableHead className="text-[10px]">Screener</TableHead>
                    <TableHead className="text-[10px]">Tgl Masuk</TableHead>
                    <TableHead className="text-[10px] text-right">Close D0</TableHead>
                    <TableHead className="text-[10px] text-right">ii</TableHead>
                    <TableHead className="text-[10px] text-right">TMA20</TableHead>
                    <TableHead className="text-[10px] text-center">Entry Plan</TableHead>
                    {[1, 2, 3, 4, 5].map(d => (
                      <TableHead key={d} className="text-[10px] text-center">
                        <div>D{d}%</div>
                        <div className="text-[8px] text-muted-foreground">VR</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-[10px] text-center">Status</TableHead>
                    <TableHead className="text-[10px]">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedItems.map(item => {
                    const dd = dayDataMap[item.id] || [];
                    const entryStatus = getEntryStatus(item);
                    const dayN = getDayN(item.tanggal_masuk);
                    const isEntryDay = entryStatus === "entry";
                    return (
                      <TableRow key={item.id} className={isEntryDay ? "bg-yellow-500/5" : ""}>
                        <TableCell className="font-mono font-bold text-xs text-primary">{item.ticker}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[8px]">
                            {SCREENER_LABELS[item.screener_name] || item.screener_name}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{item.tanggal_masuk}</TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{item.close_day0?.toLocaleString("id-ID")}</TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px]", (item.ii_score || 0) > 0 ? "text-green-500" : "text-red-500")}>{(item.ii_score || 0).toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{(item.tma20 || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {item.entry_day_rekomendasi ? (
                            <div className="space-y-0.5">
                              {isEntryDay && (
                                <Badge className="text-[8px] bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                                  🎯 HARI ENTRY!
                                </Badge>
                              )}
                              {entryStatus === "wait" && (
                                <Badge variant="outline" className="text-[8px] text-muted-foreground">
                                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                                  ⏳ Tunggu {item.entry_day_rekomendasi - dayN} hari
                                </Badge>
                              )}
                              {entryStatus === "passed" && (
                                <Badge variant="outline" className="text-[8px] text-yellow-600">
                                  ⚠️ Lewat Day optimal
                                </Badge>
                              )}
                              <div className="text-[8px] text-muted-foreground">
                                Day {item.entry_day_rekomendasi} • WIN {(item.win_pct_day_rekom || 0).toFixed(0)}%
                              </div>
                            </div>
                          ) : (
                            <span className="text-[8px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {[0, 1, 2, 3, 4].map(i => {
                          const d = dd[i];
                          return (
                            <TableCell key={i} className={cn("text-center font-mono text-[10px]", colorPct(d?.pctClose ?? null))}>
                              <div>{d?.pctClose != null ? `${d.pctClose.toFixed(2)}%` : "—"}</div>
                              <div className="text-[8px] text-muted-foreground">{d?.volRel != null ? `${d.volRel.toFixed(1)}x` : "—"}</div>
                            </TableCell>
                          );
                        })}
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
