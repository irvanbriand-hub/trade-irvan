import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Plus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getScreenerStore } from "@/lib/screenerStore";

interface Props {
  ticker: string | null;
  onClose: () => void;
}

interface CorrelationRow {
  label: string;
  total: number;
  winPcts: number[];
  avgPct: number;
}

export function SuperketatAnalysis({ ticker, onClose }: Props) {
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sk-analysis-v2", ticker],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("yahoo-finance-sk-analysis", {
        body: { ticker },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!ticker,
  });

  const handleAddMonitoring = async () => {
    if (!user || !data || data.events.length === 0) return;
    setAdding(true);
    try {
      const ev = data.events[0];
      const store = getScreenerStore();
      const skStock = store.skStocks?.find((s: any) => s.ticker === data.ticker);
      
      const isConf = ev.isConfluence || false;
      const { error } = await supabase.from("sk_monitoring").insert({
        user_id: user.id,
        ticker: data.ticker,
        tanggal_masuk: ev.date,
        close_day0: ev.closeDay0,
        jalur_masuk: ev.jalur || "",
        ii_score: ev.ii || 0,
        tma20: ev.tma20 || 0,
        vok_tipe: ev.vokTipe || "",
        macd_kondisi: ev.macdKondisi || "",
        stoch_kondisi: ev.stochKondisi || "",
        adx_kondisi: ev.adxKondisi || "",
        is_confluence: isConf,
        vv0_saat_masuk: ev.vv0 || null,
        vv1_saat_masuk: ev.vv1 || null,
        vm60_saat_masuk: ev.vm60 || null,
        status: "MONITORING",
      } as any);
      if (error) throw error;
      toast({ title: "Berhasil!", description: `${data.ticker} ditambahkan ke SK Monitoring` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const colorPct = (v: number | null) => {
    if (v === null || v === undefined) return "text-muted-foreground";
    return v > 0 ? "text-green-500" : v < 0 ? "text-red-500" : "text-foreground";
  };

  const CorrelationTable = ({ title, rows }: { title: string; rows: CorrelationRow[] }) => {
    if (!rows || rows.length === 0) return null;
    const bestIdx = rows.reduce((bi, r, i) => (r.winPcts[0] || 0) > (rows[bi]?.winPcts[0] || 0) ? i : bi, 0);
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">{title}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Grup</TableHead>
                  <TableHead className="text-[10px] text-right">Total</TableHead>
                  {[1,2,3,4,5].map(d => <TableHead key={d} className="text-[10px] text-right">WIN D{d}</TableHead>)}
                  <TableHead className="text-[10px] text-right">Avg%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={r.label} className={idx === bestIdx && r.total > 0 ? "bg-primary/5" : ""}>
                    <TableCell className="text-[10px] font-mono font-bold">{r.label} {idx === bestIdx && r.total > 0 ? "⭐" : ""}</TableCell>
                    <TableCell className="text-[10px] text-right font-mono">{r.total}</TableCell>
                    {r.winPcts.map((w, i) => (
                      <TableCell key={i} className={cn("text-[10px] text-right font-mono", w >= 70 ? "text-green-500 font-bold" : w >= 50 ? "text-green-500" : "text-red-500")}>
                        {r.total > 0 ? `${w.toFixed(0)}%` : "—"}
                      </TableCell>
                    ))}
                    <TableCell className={cn("text-[10px] text-right font-mono", colorPct(r.avgPct))}>{r.total > 0 ? `${r.avgPct.toFixed(2)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={!!ticker} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Analisa Superketat — {ticker}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Menganalisa data historis...</span>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ditemukan <span className="font-bold text-foreground">{data.totalEvents}</span> kejadian Superketat
            </p>

            <Tabs defaultValue="ringkasan">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="ringkasan" className="text-[10px]">Ringkasan</TabsTrigger>
                <TabsTrigger value="detail" className="text-[10px]">Detail</TabsTrigger>
                <TabsTrigger value="korelasi" className="text-[10px]">Korelasi</TabsTrigger>
                <TabsTrigger value="kesimpulan" className="text-[10px]">Kesimpulan</TabsTrigger>
              </TabsList>

              {/* RINGKASAN */}
              <TabsContent value="ringkasan" className="space-y-4 mt-3">
                {data.ranking && data.ranking.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking Day Entry</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Day</TableHead>
                            <TableHead className="text-[10px] text-right">WIN%</TableHead>
                            <TableHead className="text-[10px] text-right">Avg%</TableHead>
                            <TableHead className="text-[10px] text-right">Score</TableHead>
                            <TableHead className="text-[10px] text-center">Reko</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.ranking.map((r: any, idx: number) => (
                            <TableRow key={r.day} className={idx === 0 ? "bg-primary/5" : ""}>
                              <TableCell className="font-mono text-xs font-bold">Day {r.day}</TableCell>
                              <TableCell className={cn("text-right font-mono text-xs", r.winPct >= 50 ? "text-green-500" : "text-red-500")}>{r.winPct.toFixed(1)}%</TableCell>
                              <TableCell className={cn("text-right font-mono text-xs", colorPct(r.avgPct))}>{r.avgPct.toFixed(2)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.score.toFixed(1)}</TableCell>
                              <TableCell className="text-center text-xs">{r.reko}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Ringkasan Performa Day 1-5</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Day</TableHead>
                            <TableHead className="text-[10px] text-right">Avg%</TableHead>
                            <TableHead className="text-[10px] text-right">WIN%</TableHead>
                            <TableHead className="text-[10px] text-right">%Pos</TableHead>
                            <TableHead className="text-[10px] text-right">%Neg</TableHead>
                            <TableHead className="text-[10px] text-right">Avg Gap</TableHead>
                            <TableHead className="text-[10px] text-right">%GUp</TableHead>
                            <TableHead className="text-[10px] text-right">%GDn</TableHead>
                            <TableHead className="text-[10px] text-right">Best</TableHead>
                            <TableHead className="text-[10px] text-right">Worst</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(data.summary || []).map((s: any) => (
                            <TableRow key={s.day}>
                              <TableCell className="font-mono text-xs font-bold">Day {s.day}</TableCell>
                              <TableCell className={cn("text-right font-mono text-xs", colorPct(s.avgPct))}>{s.avgPct.toFixed(2)}%</TableCell>
                              <TableCell className={cn("text-right font-mono text-xs font-bold", s.winPct >= 50 ? "text-green-500" : "text-red-500")}>{s.winPct.toFixed(1)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs text-green-500">{s.pctPositive.toFixed(0)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs text-red-500">{s.pctNegative.toFixed(0)}%</TableCell>
                              <TableCell className={cn("text-right font-mono text-xs", colorPct(s.avgGap))}>{s.avgGap.toFixed(2)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs text-green-500">{s.pctGapUp.toFixed(0)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs text-red-500">{s.pctGapDown.toFixed(0)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs text-green-500">{s.bestPct.toFixed(2)}%</TableCell>
                              <TableCell className="text-right font-mono text-xs text-red-500">{s.worstPct.toFixed(2)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DETAIL */}
              <TabsContent value="detail" className="mt-3">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Detail Semua Kejadian ({data.events?.length || 0})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Tanggal</TableHead>
                            <TableHead className="text-[10px] text-right">Close</TableHead>
                            <TableHead className="text-[10px]">Jalur</TableHead>
                            <TableHead className="text-[10px]">VOK</TableHead>
                            <TableHead className="text-[10px] text-right">ii</TableHead>
                            <TableHead className="text-[10px] text-right">TMA20</TableHead>
                            <TableHead className="text-[10px]">MACD</TableHead>
                            <TableHead className="text-[10px]">Stoch</TableHead>
                            <TableHead className="text-[10px]">ADX</TableHead>
                            {[1,2,3,4,5].map(d => <TableHead key={d} className="text-[10px] text-right">D{d}%</TableHead>)}
                            {[1,2,3,4,5].map(d => <TableHead key={`w${d}`} className="text-[10px] text-center">W{d}</TableHead>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(data.events || []).map((ev: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-[10px]">{ev.date}</TableCell>
                              <TableCell className="text-right font-mono text-[10px]">{ev.closeDay0?.toLocaleString("id-ID")}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[8px]">{ev.jalur}</Badge></TableCell>
                              <TableCell className="text-[8px] font-mono text-muted-foreground">{ev.vokTipe}</TableCell>
                              <TableCell className={cn("text-right font-mono text-[10px]", ev.ii > 0 ? "text-green-500" : ev.ii < 0 ? "text-red-500" : "")}>{ev.ii?.toFixed(1)}</TableCell>
                              <TableCell className={cn("text-right font-mono text-[10px]", ev.tma20 > 0 ? "text-red-500" : "text-green-500")}>{ev.tma20?.toFixed(2)}</TableCell>
                              <TableCell><Badge variant="outline" className="text-[7px]">{ev.macdKondisi}</Badge></TableCell>
                              <TableCell><Badge variant="outline" className="text-[7px]">{ev.stochKondisi}</Badge></TableCell>
                              <TableCell><Badge variant="outline" className="text-[7px]">{ev.adxKondisi}</Badge></TableCell>
                              {[1,2,3,4,5].map(d => {
                                const dp = ev.days?.find((x: any) => x.day === d);
                                return (
                                  <TableCell key={d} className={cn("text-right font-mono text-[10px]", colorPct(dp?.pctClose ?? null))}>
                                    {dp?.pctClose != null ? `${dp.pctClose.toFixed(2)}%` : "—"}
                                  </TableCell>
                                );
                              })}
                              {[1,2,3,4,5].map(d => {
                                const dp = ev.days?.find((x: any) => x.day === d);
                                return (
                                  <TableCell key={`w${d}`} className="text-center text-[10px]">
                                    {dp?.win === true ? "✅" : dp?.win === false ? "❌" : "—"}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* KORELASI */}
              <TabsContent value="korelasi" className="space-y-3 mt-3">
                <CorrelationTable title="II Score vs WIN Rate" rows={data.iiCorrelation || []} />
                <CorrelationTable title="VOK Tipe vs WIN Rate" rows={data.vokCorrelation || []} />
                <CorrelationTable title="SAFEBULL vs SAFEMSP vs WIN Rate" rows={data.jalurCorrelation || []} />
                <CorrelationTable title="TMA20 vs WIN Rate" rows={data.tma20Correlation || []} />
                <CorrelationTable title="ADX Kondisi vs WIN Rate" rows={data.adxCorrelation || []} />
                <CorrelationTable title="🔥 Confluence (SK+VOL) vs Non-Confluence" rows={data.confluenceCorrelation || []} />
              </TabsContent>

              {/* KESIMPULAN */}
              <TabsContent value="kesimpulan" className="space-y-4 mt-3">
                {data.conclusion && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Star className="h-4 w-4 text-primary" />
                        Ringkasan Pola Historis
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs whitespace-pre-wrap text-foreground font-mono">{data.conclusion}</pre>
                    </CardContent>
                  </Card>
                )}

                <Button onClick={handleAddMonitoring} disabled={adding || !data.events?.length} className="w-full">
                  {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  Tambah ke SK Monitoring
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
