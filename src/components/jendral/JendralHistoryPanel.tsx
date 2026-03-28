import React, { useState, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface HistoricalSignal {
  date: number;
  close: number;
  buyK1: boolean; buyK2: boolean; buyK3: boolean;
  ao: number; ac: number;
  hma5: number;
  haStatus: string;
  rsi: number;
  volume: number;
  highD1: number | null; highD2: number | null; highD3: number | null;
  pctD1: number | null; pctD2: number | null; pctD3: number | null;
  closeReturnD1: number | null;
  winBSJP: boolean; winSwing: boolean;
}

export default function JendralHistoryPanel({ ticker }: { ticker: string }) {
  const [signals, setSignals] = useState<HistoricalSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("yahoo-finance-jendral", {
        body: { tickers: [ticker], mode: "history" },
      });
      if (data?.results?.[0]?.signals) {
        setSignals(data.results[0].signals);
      }
      setLoaded(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  const stats = useMemo(() => {
    if (signals.length === 0) return null;
    const total = signals.length;
    const winBSJP = signals.filter(s => s.winBSJP).length;
    const winSwing = signals.filter(s => s.winSwing).length;
    const avgD1 = signals.filter(s => s.pctD1 != null).reduce((a, s) => a + (s.pctD1 || 0), 0) / (signals.filter(s => s.pctD1 != null).length || 1);
    const avgD3 = signals.filter(s => s.pctD3 != null).reduce((a, s) => a + (s.pctD3 || 0), 0) / (signals.filter(s => s.pctD3 != null).length || 1);
    const best = signals.filter(s => s.pctD1 != null).reduce((a, s) => Math.max(a, s.pctD1 || 0), -999);
    const worst = signals.filter(s => s.closeReturnD1 != null).reduce((a, s) => Math.min(a, s.closeReturnD1 || 0), 999);

    // Per condition
    const k1 = signals.filter(s => s.buyK1);
    const k2 = signals.filter(s => s.buyK2);
    const k3 = signals.filter(s => s.buyK3);

    return {
      total, winBSJP, winSwing,
      wrBSJP: (winBSJP / total) * 100,
      wrSwing: (winSwing / total) * 100,
      avgD1, avgD3, best, worst,
      conditions: [
        { name: "K1: AC↑ + Likuid + Pivot>Low", count: k1.length, wrBSJP: k1.length > 0 ? (k1.filter(s => s.winBSJP).length / k1.length) * 100 : 0, wrSwing: k1.length > 0 ? (k1.filter(s => s.winSwing).length / k1.length) * 100 : 0 },
        { name: "K2: AC↑ + Doji + HMA5", count: k2.length, wrBSJP: k2.length > 0 ? (k2.filter(s => s.winBSJP).length / k2.length) * 100 : 0, wrSwing: k2.length > 0 ? (k2.filter(s => s.winSwing).length / k2.length) * 100 : 0 },
        { name: "K3: Hijau + HMA5 + HA↑", count: k3.length, wrBSJP: k3.length > 0 ? (k3.filter(s => s.winBSJP).length / k3.length) * 100 : 0, wrSwing: k3.length > 0 ? (k3.filter(s => s.winSwing).length / k3.length) * 100 : 0 },
      ],
    };
  }, [signals]);

  // Equity curve calculation
  const equityCurve = useMemo(() => {
    if (signals.length === 0) return [];
    let equity = 100;
    return signals.filter(s => s.closeReturnD1 != null).map(s => {
      equity *= (1 + (s.closeReturnD1! / 100));
      return { date: s.date, equity };
    });
  }, [signals]);

  if (!loaded) {
    return (
      <div className="p-4 bg-muted/20">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">📊 Analisa Historis Jendral Hunter — {ticker}</p>
          <Button size="sm" onClick={fetchHistory} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {loading ? "Loading..." : "Muat Historis"}
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="p-4 text-sm text-muted-foreground">Tidak ada sinyal BUY historis untuk {ticker}</div>;
  }

  return (
    <div className="p-4 bg-muted/20 space-y-4">
      <p className="text-sm font-medium">📊 Analisa Historis Jendral Hunter — {ticker}</p>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        {[
          { label: "Total Sinyal", value: stats.total.toString() },
          { label: "WIN% BSJP", value: stats.wrBSJP.toFixed(1) + "%", color: stats.wrBSJP >= 50 ? "text-green-500" : "text-red-500" },
          { label: "WIN% Swing", value: stats.wrSwing.toFixed(1) + "%", color: stats.wrSwing >= 50 ? "text-green-500" : "text-red-500" },
          { label: "Avg % D+1", value: stats.avgD1.toFixed(2) + "%" },
          { label: "Best", value: stats.best.toFixed(2) + "%", color: "text-green-500" },
          { label: "Worst", value: stats.worst.toFixed(2) + "%", color: "text-red-500" },
        ].map(item => (
          <Card key={item.label}><CardContent className="pt-3 pb-2 text-center">
            <p className={cn("text-lg font-bold", item.color)}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground">{item.label}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Per-condition breakdown */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">Breakdown Per Kondisi BUY</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Kondisi</TableHead>
                <TableHead className="text-xs text-right">Sinyal</TableHead>
                <TableHead className="text-xs text-right">WIN% BSJP</TableHead>
                <TableHead className="text-xs text-right">WIN% Swing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.conditions.map(c => (
                <TableRow key={c.name}>
                  <TableCell className="text-xs">{c.name}</TableCell>
                  <TableCell className="text-xs text-right">{c.count}</TableCell>
                  <TableCell className={cn("text-xs text-right font-medium", c.wrBSJP >= 50 ? "text-green-500" : "text-red-500")}>{c.wrBSJP.toFixed(1)}%</TableCell>
                  <TableCell className={cn("text-xs text-right font-medium", c.wrSwing >= 50 ? "text-green-500" : "text-red-500")}>{c.wrSwing.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium border-t-2">
                <TableCell className="text-xs font-bold">TOTAL</TableCell>
                <TableCell className="text-xs text-right font-bold">{stats.total}</TableCell>
                <TableCell className={cn("text-xs text-right font-bold", stats.wrBSJP >= 50 ? "text-green-500" : "text-red-500")}>{stats.wrBSJP.toFixed(1)}%</TableCell>
                <TableCell className={cn("text-xs text-right font-bold", stats.wrSwing >= 50 ? "text-green-500" : "text-red-500")}>{stats.wrSwing.toFixed(1)}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Signal History Table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-xs">Riwayat Sinyal BUY (terbaru 50)</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Tanggal</TableHead>
                  <TableHead className="text-[10px] text-right">Close</TableHead>
                  <TableHead className="text-[10px]">Kondisi</TableHead>
                  <TableHead className="text-[10px] text-right">H D+1</TableHead>
                  <TableHead className="text-[10px] text-right">% D+1</TableHead>
                  <TableHead className="text-[10px] text-right">H D+2</TableHead>
                  <TableHead className="text-[10px] text-right">H D+3</TableHead>
                  <TableHead className="text-[10px]">BSJP</TableHead>
                  <TableHead className="text-[10px]">Swing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.slice(-50).reverse().map((s, idx) => (
                  <TableRow key={idx} className={cn(s.winBSJP ? "bg-green-500/5" : "bg-red-500/5")}>
                    <TableCell className="text-[10px]">{format(new Date(s.date * 1000), "dd/MM/yy")}</TableCell>
                    <TableCell className="text-[10px] text-right">{Math.round(s.close).toLocaleString()}</TableCell>
                    <TableCell className="text-[10px]">
                      <div className="flex gap-0.5">
                        {s.buyK1 && <Badge className="text-[8px] h-4 bg-green-600">K1</Badge>}
                        {s.buyK2 && <Badge className="text-[8px] h-4 bg-blue-600">K2</Badge>}
                        {s.buyK3 && <Badge className="text-[8px] h-4 bg-purple-600">K3</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px] text-right">{s.highD1 != null ? Math.round(s.highD1).toLocaleString() : "-"}</TableCell>
                    <TableCell className={cn("text-[10px] text-right", s.pctD1 != null && s.pctD1 >= 0 ? "text-green-500" : "text-red-500")}>
                      {s.pctD1 != null ? s.pctD1.toFixed(2) + "%" : "-"}
                    </TableCell>
                    <TableCell className="text-[10px] text-right">{s.highD2 != null ? Math.round(s.highD2).toLocaleString() : "-"}</TableCell>
                    <TableCell className="text-[10px] text-right">{s.highD3 != null ? Math.round(s.highD3).toLocaleString() : "-"}</TableCell>
                    <TableCell>{s.winBSJP ? <span className="text-green-500">✅</span> : <span className="text-red-500">❌</span>}</TableCell>
                    <TableCell>{s.winSwing ? <span className="text-green-500">✅</span> : <span className="text-red-500">❌</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Equity Curve */}
      {equityCurve.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs">📈 Equity Curve (Entry Close, Exit Close D+1)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-40 flex items-end gap-[1px]">
              {equityCurve.map((p, i) => {
                const min = Math.min(...equityCurve.map(e => e.equity));
                const max = Math.max(...equityCurve.map(e => e.equity));
                const range = max - min || 1;
                const height = ((p.equity - min) / range) * 100;
                return (
                  <div key={i} className={cn("flex-1 rounded-t-sm min-w-[1px]", p.equity >= 100 ? "bg-green-500" : "bg-red-500")}
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${format(new Date(p.date * 1000), "dd/MM/yy")}: ${p.equity.toFixed(2)}`} />
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Start: 100</span>
              <span>End: {equityCurve[equityCurve.length - 1]?.equity.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Insight */}
      {stats && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 text-xs space-y-1">
            <p className="font-medium text-foreground">📊 Insight Jendral Hunter {ticker}:</p>
            <p>• Total sinyal historis: <span className="font-bold">{stats.total}</span></p>
            <p>• WIN rate BSJP: <span className={cn("font-bold", stats.wrBSJP >= 50 ? "text-green-500" : "text-red-500")}>{stats.wrBSJP.toFixed(1)}%</span></p>
            <p>• WIN rate Swing 1-3: <span className={cn("font-bold", stats.wrSwing >= 50 ? "text-green-500" : "text-red-500")}>{stats.wrSwing.toFixed(1)}%</span></p>
            {stats.conditions.length > 0 && (() => {
              const best = stats.conditions.reduce((a, b) => a.wrBSJP > b.wrBSJP ? a : b);
              return <p>• Kondisi terbaik: <span className="font-bold">{best.name}</span> (WR {best.wrBSJP.toFixed(1)}%)</p>;
            })()}
            <p>• Avg gain D+1: <span className={cn("font-bold", stats.avgD1 >= 0 ? "text-green-500" : "text-red-500")}>{stats.avgD1.toFixed(2)}%</span></p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
