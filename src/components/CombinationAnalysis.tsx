import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Trophy, TrendingUp, Zap, Eye, ArrowUpDown, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { WrScannerItem } from "@/hooks/useWrScanner";

interface CombinationStat {
  key: string;
  screeners: string[];
  count: number;
  total: number;
  win: number;
  lose: number;
  winRate: number;
  avgPctWin: number;
  items: WrScannerItem[];
}

function generateCombinations(arr: string[]): string[][] {
  const result: string[][] = [];
  const sorted = [...arr].sort();
  for (let size = 1; size <= sorted.length; size++) {
    const combine = (start: number, combo: string[]) => {
      if (combo.length === size) {
        result.push([...combo]);
        return;
      }
      for (let i = start; i < sorted.length; i++) {
        combo.push(sorted[i]);
        combine(i + 1, combo);
        combo.pop();
      }
    };
    combine(0, []);
  }
  return result;
}

interface Props {
  data: WrScannerItem[];
  wlTickerSet: Set<string>;
  wlTickerCatMap: Record<string, string>;
}

export default function CombinationAnalysis({ data, wlTickerSet, wlTickerCatMap }: Props) {
  const [filterCount, setFilterCount] = useState("all");
  const [filterWr, setFilterWr] = useState("all");
  const [showWlOnly, setShowWlOnly] = useState(false);
  const [sortCol, setSortCol] = useState<string>("winRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailCombo, setDetailCombo] = useState<CombinationStat | null>(null);

  const combinations = useMemo(() => {
    const backtested = data.filter(d => d.status === "WIN" || d.status === "LOSE");
    const comboMap: Record<string, CombinationStat> = {};

    for (const item of backtested) {
      const screeners = item.screener_names;
      if (!screeners.length) continue;
      const combos = generateCombinations(screeners);

      for (const combo of combos) {
        const key = combo.join(" + ");
        if (!comboMap[key]) {
          comboMap[key] = {
            key,
            screeners: combo,
            count: combo.length,
            total: 0,
            win: 0,
            lose: 0,
            winRate: 0,
            avgPctWin: 0,
            items: [],
          };
        }
        comboMap[key].total++;
        if (item.result === "WIN") comboMap[key].win++;
        else comboMap[key].lose++;
        comboMap[key].items.push(item);
      }
    }

    for (const c of Object.values(comboMap)) {
      c.winRate = c.total > 0 ? (c.win / c.total) * 100 : 0;
      const winPcts = c.items
        .filter(i => i.result === "WIN" && i.pct_open_to_high != null)
        .map(i => i.pct_open_to_high!);
      c.avgPctWin = winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0;
    }

    return Object.values(comboMap);
  }, [data]);

  const filtered = useMemo(() => {
    let result = combinations;
    if (filterCount !== "all") {
      if (filterCount === "4+") result = result.filter(c => c.count >= 4);
      else result = result.filter(c => c.count === Number(filterCount));
    }
    if (filterWr !== "all") {
      const min = Number(filterWr);
      result = result.filter(c => c.winRate > min);
    }
    if (showWlOnly) {
      result = result.filter(c => c.items.some(i => wlTickerSet.has(i.ticker)));
    }
    return result;
  }, [combinations, filterCount, filterWr, showWlOnly, wlTickerSet]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: number, vb: number;
      switch (sortCol) {
        case "count": va = a.count; vb = b.count; break;
        case "total": va = a.total; vb = b.total; break;
        case "win": va = a.win; vb = b.win; break;
        case "lose": va = a.lose; vb = b.lose; break;
        case "winRate": va = a.winRate; vb = b.winRate; break;
        case "avgPct": va = a.avgPctWin; vb = b.avgPctWin; break;
        default: va = a.winRate; vb = b.winRate;
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [filtered, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // Insight cards
  const insights = useMemo(() => {
    if (combinations.length === 0) return null;
    const bestWr = [...combinations].sort((a, b) => b.winRate - a.winRate)[0];
    const mostFreq = [...combinations].sort((a, b) => b.total - a.total)[0];
    const reliable = [...combinations]
      .filter(c => c.winRate > 60)
      .sort((a, b) => b.total - a.total)[0] || null;
    return { bestWr, mostFreq, reliable };
  }, [combinations]);

  const SortHeader = ({ col, label, align }: { col: string; label: string; align?: string }) => (
    <th
      className={cn("p-3 text-xs font-semibold uppercase text-muted-foreground cursor-pointer hover:text-foreground select-none", align || "text-left")}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sortCol === col ? "text-primary" : "text-muted-foreground/40")} />
      </span>
    </th>
  );

  const resultBadge = (status: string) => {
    if (status === "WIN") return <Badge className="bg-gain/20 text-gain border-gain/30 text-[10px]">WIN</Badge>;
    if (status === "LOSE") return <Badge className="bg-loss/20 text-loss border-loss/30 text-[10px]">LOSE</Badge>;
    return <Badge variant="secondary" className="text-[10px]">OPEN</Badge>;
  };

  if (combinations.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        Belum ada data backtest. Jalankan backtest terlebih dahulu untuk melihat analisis kombinasi.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Insight Cards */}
      {insights && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Kombinasi WR Tertinggi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-bold text-foreground">{insights.bestWr.key}</p>
              <p className="text-xs text-muted-foreground mt-1">
                WR: <span className="text-gain font-semibold">{insights.bestWr.winRate.toFixed(1)}%</span>
                {" · "}Total: {insights.bestWr.total} · Avg: {insights.bestWr.avgPctWin.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" /> Paling Sering Muncul
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-bold text-foreground">{insights.mostFreq.key}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Total: <span className="font-semibold">{insights.mostFreq.total}x</span>
                {" · "}WR: {insights.mostFreq.winRate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-500" /> Terbaik Keseluruhan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {insights.reliable ? (
                <>
                  <p className="text-sm font-bold text-foreground">{insights.reliable.key}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    WR: <span className="text-gain font-semibold">{insights.reliable.winRate.toFixed(1)}%</span>
                    {" · "}Total: {insights.reliable.total}x
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Belum ada kombinasi dengan WR &gt;60%</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterCount} onValueChange={setFilterCount}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Jumlah Screener" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Jumlah</SelectItem>
            <SelectItem value="1">Single (1)</SelectItem>
            <SelectItem value="2">Double (2)</SelectItem>
            <SelectItem value="3">Triple (3)</SelectItem>
            <SelectItem value="4+">4+ Screener</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterWr} onValueChange={setFilterWr}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Min Win Rate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua WR</SelectItem>
            <SelectItem value="50">&gt;50%</SelectItem>
            <SelectItem value="60">&gt;60%</SelectItem>
            <SelectItem value="70">&gt;70%</SelectItem>
            <SelectItem value="80">&gt;80%</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="combo-wl-filter" checked={showWlOnly} onCheckedChange={setShowWlOnly} />
          <Label htmlFor="combo-wl-filter" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
            <Star className="h-3 w-3" /> Hanya WL
          </Label>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{sorted.length} kombinasi</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Kombinasi Screener</th>
              <SortHeader col="count" label="Jml" align="text-center" />
              <SortHeader col="total" label="Total" align="text-center" />
              <SortHeader col="win" label="WIN" align="text-center" />
              <SortHeader col="lose" label="LOSE" align="text-center" />
              <SortHeader col="winRate" label="Win Rate" align="text-center" />
              <SortHeader col="avgPct" label="Avg % O→H" align="text-center" />
              <th className="p-3 text-center text-xs font-semibold uppercase text-muted-foreground">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((combo, i) => (
              <tr key={combo.key} className={cn("border-b border-border/50 transition-colors hover:bg-accent/50", i % 2 === 0 ? "bg-card" : "bg-card/50")}>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {combo.screeners.map(s => (
                      <Badge key={s} variant="secondary" className="text-[9px] px-1.5 py-0.5 whitespace-nowrap">{s}</Badge>
                    ))}
                  </div>
                </td>
                <td className="p-3 text-center font-mono text-xs">{combo.count}</td>
                <td className="p-3 text-center font-mono text-xs font-semibold">{combo.total}</td>
                <td className="p-3 text-center font-mono text-xs text-gain font-semibold">{combo.win}</td>
                <td className="p-3 text-center font-mono text-xs text-loss font-semibold">{combo.lose}</td>
                <td className="p-3 text-center">
                  <span className={cn(
                    "font-mono text-xs font-bold px-2 py-0.5 rounded",
                    combo.winRate >= 70 ? "bg-gain/20 text-gain" :
                    combo.winRate >= 50 ? "bg-amber-500/20 text-amber-500" :
                    "bg-loss/20 text-loss"
                  )}>
                    {combo.winRate.toFixed(1)}%
                  </span>
                </td>
                <td className="p-3 text-center font-mono text-xs text-gain">{combo.avgPctWin.toFixed(2)}%</td>
                <td className="p-3 text-center">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setDetailCombo(combo)}>
                    <Eye className="h-3 w-3" /> Detail
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      <Dialog open={!!detailCombo} onOpenChange={() => setDetailCombo(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto">
          {detailCombo && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {detailCombo.screeners.map(s => (
                    <Badge key={s} className="text-xs">{s}</Badge>
                  ))}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-3">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{detailCombo.total}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg bg-gain/10 p-3 text-center">
                  <p className="text-xl font-bold text-gain">{detailCombo.win}</p>
                  <p className="text-[10px] text-muted-foreground">WIN</p>
                </div>
                <div className="rounded-lg bg-loss/10 p-3 text-center">
                  <p className="text-xl font-bold text-loss">{detailCombo.lose}</p>
                  <p className="text-[10px] text-muted-foreground">LOSE</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className={cn("text-xl font-bold", detailCombo.winRate >= 70 ? "text-gain" : detailCombo.winRate >= 50 ? "text-amber-500" : "text-loss")}>
                    {detailCombo.winRate.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Win Rate</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xl font-bold text-gain">{detailCombo.avgPctWin.toFixed(2)}%</p>
                  <p className="text-[10px] text-muted-foreground">Avg % O→H</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="p-2 text-left text-xs font-semibold text-muted-foreground">Tgl Import</th>
                      <th className="p-2 text-left text-xs font-semibold text-muted-foreground">Tgl Backtest</th>
                      <th className="p-2 text-left text-xs font-semibold text-muted-foreground">Ticker</th>
                      <th className="p-2 text-center text-xs font-semibold text-muted-foreground">WL</th>
                      <th className="p-2 text-right text-xs font-semibold text-muted-foreground">Open</th>
                      <th className="p-2 text-right text-xs font-semibold text-muted-foreground">High</th>
                      <th className="p-2 text-right text-xs font-semibold text-muted-foreground">% O→H</th>
                      <th className="p-2 text-center text-xs font-semibold text-muted-foreground">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailCombo.items
                      .sort((a, b) => b.tanggal_import.localeCompare(a.tanggal_import))
                      .map((item, i) => (
                        <tr key={item.id + "-" + i} className={cn("border-b border-border/50", i % 2 === 0 ? "bg-card" : "bg-card/50")}>
                          <td className="p-2 text-xs font-mono text-muted-foreground">{format(new Date(item.tanggal_import), "dd/MM/yy")}</td>
                          <td className="p-2 text-xs font-mono text-muted-foreground">{item.tanggal_backtest ? format(new Date(item.tanggal_backtest), "dd/MM/yy") : "—"}</td>
                          <td className="p-2 font-bold font-mono text-foreground text-xs">{item.ticker}</td>
                          <td className="p-2 text-center">
                            {wlTickerSet.has(item.ticker) ? (
                              <Badge variant="outline" className="text-[9px] px-1.5 border-amber-500/50 text-amber-500">
                                {wlTickerCatMap[item.ticker] || "WL"}
                              </Badge>
                            ) : "—"}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">{item.close_import != null ? item.close_import.toLocaleString("id-ID") : "—"}</td>
                          <td className="p-2 text-right font-mono text-xs">{item.high_price != null ? item.high_price.toLocaleString("id-ID") : "—"}</td>
                          <td className={cn("p-2 text-right font-mono text-xs font-semibold",
                            item.pct_open_to_high != null && item.pct_open_to_high >= 2 ? "text-gain" : item.pct_open_to_high != null ? "text-loss" : ""
                          )}>
                            {item.pct_open_to_high != null ? `${item.pct_open_to_high.toFixed(2)}%` : "—"}
                          </td>
                          <td className="p-2 text-center">{resultBadge(item.status)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
