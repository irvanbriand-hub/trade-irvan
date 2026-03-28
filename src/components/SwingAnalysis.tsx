import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Star, Target, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type SwingType = "ketat_allma" | "ketat_pertama" | "bottom_fishing";

const SWING_LABELS: Record<SwingType, string> = {
  ketat_allma: "Ketat + Above All MA",
  ketat_pertama: "Ketat Pertama",
  bottom_fishing: "Big MA Bottom Fishing",
};

interface Props {
  ticker: string | null;
  screenerType: SwingType;
  onClose: () => void;
  onAnalysisData?: (ticker: string, data: any) => void;
}

interface CorrelationRow {
  label: string; total: number; winPcts: number[]; avgPct: number;
}

interface RankingRow {
  day: number; winPct: number; avgPct: number; gapUpPct: number; score: number; reko: string; maxScore: number;
}

export function SwingAnalysis({ ticker, screenerType, onClose, onAnalysisData }: Props) {
  const { user } = useAuth();
  const [showConfirm, setShowConfirm] = useState(false);
  const [entryNotes, setEntryNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["swing-analysis", ticker, screenerType],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("yahoo-finance-swing-analysis", {
        body: { ticker, screenerType },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!ticker,
  });

  // Emit analysis data to parent for caching
  const emittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (data && ticker && onAnalysisData && emittedRef.current !== ticker) {
      emittedRef.current = ticker;
      onAnalysisData(ticker, data);
    }
  }, [data, ticker, onAnalysisData]);

  const bestDay = data?.bestDay;
  const altDay = data?.altDay;

  const handleOpenConfirm = () => {
    if (!data || data.events.length === 0) return;
    const bd = bestDay;
    const notes = bd
      ? `Entry optimal pagi hari ke-${bd.day}. WIN% historis ${bd.winPct.toFixed(1)}%, avg ${bd.avgPct.toFixed(2)}%. Gap Up ${bd.gapUpPct.toFixed(0)}% dari kejadian historis.${data.conclusion?.includes("Kondisi terbaik:") ? "" : ""}`
      : "Belum ada pola entry kuat dari historis.";
    setEntryNotes(notes);
    setShowConfirm(true);
  };

  const handleAddMonitoring = async () => {
    if (!user || !data || data.events.length === 0) return;
    setAdding(true);
    try {
      const ev = data.events[0];
      const { error } = await supabase.from("swing_monitoring").insert({
        user_id: user.id,
        ticker: data.ticker,
        screener_name: screenerType,
        tanggal_masuk: ev.date,
        close_day0: ev.closeDay0,
        ii_score: ev.ii || 0,
        tma20: ev.tma20 || 0,
        vok_tipe: ev.vokTipe || "",
        macd_kondisi: ev.macdKondisi || "",
        stoch_kondisi: ev.stochKondisi || "",
        adx_kondisi: ev.adxKondisi || "",
        entry_day_rekomendasi: bestDay?.day || null,
        win_pct_day_rekom: bestDay?.winPct || null,
        avg_pct_day_rekom: bestDay?.avgPct || null,
        entry_notes: entryNotes,
        parameter_khusus: {
          screenerType,
          ...(ev.maAboveCount !== undefined && { maAboveCount: ev.maAboveCount }),
          ...(ev.nearestMA && { nearestMA: ev.nearestMA, nearestMADist: ev.nearestMADist }),
          ...(ev.daysNotKetat !== undefined && { daysNotKetat: ev.daysNotKetat }),
        },
        status: "MONITORING",
      } as any);
      if (error) throw error;
      toast({ title: "Berhasil!", description: `${data.ticker} ditambahkan ke Swing Monitoring` });
      setShowConfirm(false);
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

  const EntryDayRanking = ({ ranking }: { ranking: RankingRow[] }) => {
    if (!ranking || ranking.length === 0) return null;
    const bestScore = Math.max(...ranking.map(r => r.score));
    return (
      <Card className="border-yellow-500/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-yellow-500" />
            Rekomendasi Entry Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">Day</TableHead>
                <TableHead className="text-[10px] text-right">WIN%</TableHead>
                <TableHead className="text-[10px] text-right">Avg%</TableHead>
                <TableHead className="text-[10px] text-right">Gap Up%</TableHead>
                <TableHead className="text-[10px] text-right">Score</TableHead>
                <TableHead className="text-[10px] text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranking.map((r) => (
                <TableRow key={r.day} className={r.score === bestScore && r.score >= 5 ? "bg-yellow-500/10" : ""}>
                  <TableCell className="font-mono text-xs font-bold">Day {r.day}</TableCell>
                  <TableCell className={cn("text-right font-mono text-xs", r.winPct >= 70 ? "text-green-500 font-bold" : r.winPct >= 60 ? "text-green-500" : "text-red-500")}>{r.winPct.toFixed(1)}%</TableCell>
                  <TableCell className={cn("text-right font-mono text-xs", colorPct(r.avgPct))}>{r.avgPct.toFixed(2)}%</TableCell>
                  <TableCell className={cn("text-right font-mono text-xs", r.gapUpPct >= 60 ? "text-green-500" : "text-muted-foreground")}>{r.gapUpPct.toFixed(0)}%</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">{r.score}/{r.maxScore}</TableCell>
                  <TableCell className="text-center text-xs">{r.reko}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Narasi */}
          {bestDay && (
            <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border text-xs">
              <p>Berdasarkan <span className="font-bold">{data?.totalEvents || 0}</span> kejadian historis, entry paling optimal di pagi <span className="font-bold text-yellow-500">HARI KE-{bestDay.day}</span> karena:</p>
              <ul className="mt-1 space-y-0.5 ml-2">
                <li>✅ WIN rate 5%+: {bestDay.winPct.toFixed(1)}%</li>
                <li>✅ Rata-rata kenaikan: {bestDay.avgPct.toFixed(2)}%</li>
                <li>✅ Gap Up {bestDay.gapUpPct.toFixed(0)}% dari kejadian</li>
              </ul>
              {altDay && (
                <p className="mt-2 text-muted-foreground">
                  Alternatif entry di <span className="font-bold">HARI KE-{altDay.day}</span> dengan WIN% {altDay.winPct.toFixed(1)}% dan avg {altDay.avgPct.toFixed(2)}%
                </p>
              )}
            </div>
          )}
          {!bestDay && data && data.totalEvents > 0 && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              📅 Entry: Belum ada pola kuat — WIN% &lt; 60% di semua day
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <Dialog open={!!ticker && !showConfirm} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Analisa {SWING_LABELS[screenerType]} — {ticker}</DialogTitle>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-sm text-muted-foreground">Menganalisa data historis...</span>
            </div>
          )}

          {data && (
            <div className="space-y-4">
              {/* Entry Optimal Badge */}
              {bestDay && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
                  <Target className="h-4 w-4 text-yellow-500 shrink-0" />
                  <span className="text-xs">
                    📅 Entry Optimal: <span className="font-bold text-yellow-500">Day {bestDay.day}</span>
                    {altDay && <> atau <span className="font-bold text-yellow-500">Day {altDay.day}</span></>}
                    {" — "}WIN% {bestDay.winPct.toFixed(1)}%, Avg% {bestDay.avgPct.toFixed(2)}%, Gap Up {bestDay.gapUpPct.toFixed(0)}%
                  </span>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Ditemukan <span className="font-bold text-foreground">{data.totalEvents}</span> kejadian {SWING_LABELS[screenerType]}
              </p>

              <Tabs defaultValue="ringkasan">
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="ringkasan" className="text-[10px]">Ringkasan</TabsTrigger>
                  <TabsTrigger value="entry" className="text-[10px]">Entry Day</TabsTrigger>
                  <TabsTrigger value="detail" className="text-[10px]">Detail</TabsTrigger>
                  <TabsTrigger value="korelasi" className="text-[10px]">Korelasi</TabsTrigger>
                  <TabsTrigger value="kesimpulan" className="text-[10px]">Kesimpulan</TabsTrigger>
                </TabsList>

                {/* RINGKASAN */}
                <TabsContent value="ringkasan" className="space-y-4 mt-3">
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

                {/* ENTRY DAY RANKING */}
                <TabsContent value="entry" className="space-y-4 mt-3">
                  <EntryDayRanking ranking={data.ranking || []} />
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
                  <CorrelationTable title="TMA20 vs WIN Rate" rows={data.tma20Correlation || []} />
                  <CorrelationTable title="ADX Kondisi vs WIN Rate" rows={data.adxCorrelation || []} />
                  <CorrelationTable title="Gap vs WIN Rate" rows={data.gapCorrelation || []} />
                  {data.specificCorrelation && data.specificCorrelation.length > 0 && (
                    <CorrelationTable title={`${SWING_LABELS[screenerType]} — Korelasi Khusus`} rows={data.specificCorrelation} />
                  )}
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

                  <EntryDayRanking ranking={data.ranking || []} />

                  <Button onClick={handleOpenConfirm} disabled={!data.events?.length} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Tambah ke Monitoring
                  </Button>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Tambah {ticker} ke Monitoring?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-muted-foreground">Screener:</div>
              <div className="font-medium">{SWING_LABELS[screenerType]}</div>
              <div className="text-muted-foreground">Tanggal masuk:</div>
              <div className="font-medium">{data?.events?.[0]?.date || "—"}</div>
              <div className="text-muted-foreground">Close Day 0:</div>
              <div className="font-medium">{data?.events?.[0]?.closeDay0?.toLocaleString("id-ID") || "—"}</div>
            </div>

            {bestDay && (
              <div className="p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-xs">
                <p className="font-bold text-yellow-500">⭐ Entry optimal: Pagi Hari ke-{bestDay.day}</p>
                <p>WIN% historis: {bestDay.winPct.toFixed(1)}%</p>
                <p>Avg kenaikan: {bestDay.avgPct.toFixed(2)}%</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Entry Notes:</label>
              <Textarea value={entryNotes} onChange={e => setEntryNotes(e.target.value)} rows={4} className="text-xs" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowConfirm(false)}>Batal</Button>
            <Button size="sm" onClick={handleAddMonitoring} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Simpan ke Monitoring
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
