import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Trophy, TrendingUp, Activity, Star, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WrScannerItem } from "@/hooks/useWrScanner";

interface WlAnalysisProps {
  data: WrScannerItem[];
  wlTickerCatMap: Record<string, string>;
}

interface GroupStats {
  total: number;
  win: number;
  lose: number;
  winPcts: number[];
  equityCurve: number[];
}

function calcStats(items: WrScannerItem[]): GroupStats {
  const s: GroupStats = { total: 0, win: 0, lose: 0, winPcts: [], equityCurve: [] };
  for (const item of items) {
    s.total++;
    const prev = s.equityCurve.length > 0 ? s.equityCurve[s.equityCurve.length - 1] : 0;
    if (item.result === "WIN") {
      s.win++;
      if (item.pct_open_to_high != null) s.winPcts.push(item.pct_open_to_high);
      s.equityCurve.push(prev + 1);
    } else {
      s.lose++;
      s.equityCurve.push(prev - 1);
    }
  }
  return s;
}

function wr(s: GroupStats) {
  return s.total > 0 ? (s.win / s.total) * 100 : 0;
}
function avgGain(s: GroupStats) {
  return s.winPcts.length > 0 ? s.winPcts.reduce((a, b) => a + b, 0) / s.winPcts.length : 0;
}

function MiniChart({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const chartData = data.map((v, i) => ({ idx: i + 1, equity: v }));
  return (
    <div className="h-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="idx" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "11px",
            }}
            formatter={(v: number) => [v, "Equity"]}
          />
          <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatsCard({ title, stats, icon, highlight }: {
  title: string;
  stats: GroupStats;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  const winRate = wr(stats);
  const avg = avgGain(stats);
  return (
    <Card className={cn(highlight && "border-primary/30 bg-primary/5")}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{stats.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-lg font-bold text-gain">{stats.win}</p>
            <p className="text-[10px] text-muted-foreground">WIN</p>
          </div>
          <div>
            <p className="text-lg font-bold text-loss">{stats.lose}</p>
            <p className="text-[10px] text-muted-foreground">LOSE</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{winRate.toFixed(1)}%</p>
            <p className="text-[10px] text-muted-foreground">WR</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Avg % Open→High (WIN): <span className="text-gain font-mono font-semibold">{avg.toFixed(2)}%</span>
        </p>
        <MiniChart data={stats.equityCurve} />
      </CardContent>
    </Card>
  );
}

// Generate all screener combos for a single item, sorted and joined
function screenerComboKey(names: string[]): string {
  return [...names].sort().join(" + ");
}

export default function WlAnalysis({ data, wlTickerCatMap }: WlAnalysisProps) {
  const [filterWl, setFilterWl] = useState("all");
  const [filterScreener, setFilterScreener] = useState("all");
  const [filterWrMin, setFilterWrMin] = useState("all");
  const [sortCol, setSortCol] = useState<string>("wr");
  const [sortAsc, setSortAsc] = useState(false);

  const closedData = useMemo(() => data.filter(d => d.status === "WIN" || d.status === "LOSE"), [data]);

  const withWl = useMemo(() => closedData.filter(d => d.wl_kategori), [closedData]);
  const withoutWl = useMemo(() => closedData.filter(d => !d.wl_kategori), [closedData]);

  const statsWithWl = useMemo(() => calcStats(withWl), [withWl]);
  const statsWithoutWl = useMemo(() => calcStats(withoutWl), [withoutWl]);

  // Per-category stats
  const categoryStats = useMemo(() => {
    const map: Record<string, WrScannerItem[]> = {};
    for (const item of withWl) {
      const cat = item.wl_kategori || "Unknown";
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    }
    const result: { name: string; stats: GroupStats }[] = [];
    for (const [name, items] of Object.entries(map)) {
      result.push({ name, stats: calcStats(items) });
    }
    return result.sort((a, b) => wr(b.stats) - wr(a.stats));
  }, [withWl]);

  const allCategories = useMemo(() => categoryStats.map(c => c.name), [categoryStats]);

  // WL + Screener combo table
  const comboTable = useMemo(() => {
    const map: Record<string, { wl: string; screener: string; total: number; win: number; lose: number; winPcts: number[] }> = {};
    for (const item of closedData) {
      const wl = item.wl_kategori || "Tanpa WL";
      const screenerKey = screenerComboKey(item.screener_names);
      const key = `${wl}|||${screenerKey}`;
      if (!map[key]) map[key] = { wl, screener: screenerKey, total: 0, win: 0, lose: 0, winPcts: [] };
      map[key].total++;
      if (item.result === "WIN") {
        map[key].win++;
        if (item.pct_open_to_high != null) map[key].winPcts.push(item.pct_open_to_high);
      } else {
        map[key].lose++;
      }
    }
    return Object.values(map);
  }, [closedData]);

  const allScreeners = useMemo(() => {
    const set = new Set<string>();
    for (const c of comboTable) set.add(c.screener);
    return Array.from(set).sort();
  }, [comboTable]);

  const filteredCombo = useMemo(() => {
    let rows = comboTable;
    if (filterWl !== "all") rows = rows.filter(r => r.wl === filterWl);
    if (filterScreener !== "all") rows = rows.filter(r => r.screener === filterScreener);
    if (filterWrMin !== "all") {
      const min = parseInt(filterWrMin);
      rows = rows.filter(r => r.total > 0 && (r.win / r.total) * 100 > min);
    }
    // Sort
    rows = [...rows].sort((a, b) => {
      let va: number, vb: number;
      switch (sortCol) {
        case "wl": return sortAsc ? a.wl.localeCompare(b.wl) : b.wl.localeCompare(a.wl);
        case "screener": return sortAsc ? a.screener.localeCompare(b.screener) : b.screener.localeCompare(a.screener);
        case "total": va = a.total; vb = b.total; break;
        case "win": va = a.win; vb = b.win; break;
        case "lose": va = a.lose; vb = b.lose; break;
        case "avg":
          va = a.winPcts.length > 0 ? a.winPcts.reduce((x, y) => x + y, 0) / a.winPcts.length : 0;
          vb = b.winPcts.length > 0 ? b.winPcts.reduce((x, y) => x + y, 0) / b.winPcts.length : 0;
          break;
        default: // wr
          va = a.total > 0 ? (a.win / a.total) * 100 : 0;
          vb = b.total > 0 ? (b.win / b.total) * 100 : 0;
      }
      return sortAsc ? va! - vb! : vb! - va!;
    });
    return rows;
  }, [comboTable, filterWl, filterScreener, filterWrMin, sortCol, sortAsc]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sortIcon = (col: string) => sortCol === col ? (sortAsc ? " ↑" : " ↓") : "";

  // Insights
  const insightBestWl = useMemo(() => {
    const filtered = categoryStats.filter(c => c.stats.total >= 3);
    return filtered.length > 0 ? filtered[0] : null;
  }, [categoryStats]);

  const insightBestCombo = useMemo(() => {
    const filtered = comboTable.filter(c => c.total >= 3 && c.wl !== "Tanpa WL");
    if (filtered.length === 0) return null;
    return filtered.sort((a, b) => {
      const wrA = a.total > 0 ? (a.win / a.total) * 100 : 0;
      const wrB = b.total > 0 ? (b.win / b.total) * 100 : 0;
      return wrB - wrA;
    })[0];
  }, [comboTable]);

  const insightMostActive = useMemo(() => {
    return categoryStats.length > 0
      ? [...categoryStats].sort((a, b) => b.stats.total - a.stats.total)[0]
      : null;
  }, [categoryStats]);

  const wrDiff = wr(statsWithWl) - wr(statsWithoutWl);

  if (closedData.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        Belum ada data backtest (WIN/LOSE) untuk dianalisis.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* BAGIAN 4: INSIGHT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Kategori WL Terbaik
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insightBestWl ? (
              <>
                <p className="text-lg font-bold text-foreground">{insightBestWl.name}</p>
                <p className="text-xs text-muted-foreground">
                  WR {wr(insightBestWl.stats).toFixed(1)}% • {insightBestWl.stats.total}x muncul
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Min. 3x data diperlukan</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-primary" /> Kombinasi Terbaik WL + Screener
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insightBestCombo ? (
              <>
                <p className="text-sm font-bold text-foreground">{insightBestCombo.wl} | {insightBestCombo.screener}</p>
                <p className="text-xs text-muted-foreground">
                  WR {(insightBestCombo.total > 0 ? (insightBestCombo.win / insightBestCombo.total) * 100 : 0).toFixed(1)}% • {insightBestCombo.total}x muncul
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Min. 3x data diperlukan</p>
            )}
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3.5 w-3.5 text-primary" /> Kategori WL Paling Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            {insightMostActive ? (
              <>
                <p className="text-lg font-bold text-foreground">{insightMostActive.name}</p>
                <p className="text-xs text-muted-foreground">
                  {insightMostActive.stats.total}x muncul • WR {wr(insightMostActive.stats).toFixed(1)}%
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BAGIAN 1: PERBANDINGAN UTAMA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatsCard
          title="Dengan WL Rekomendasi"
          stats={statsWithWl}
          icon={<Star className="h-4 w-4 text-primary" />}
          highlight
        />
        <StatsCard
          title="Tanpa WL Rekomendasi"
          stats={statsWithoutWl}
        />
      </div>

      {/* Insight comparison */}
      <div className={cn(
        "rounded-lg border p-4 text-sm font-medium flex items-center gap-2",
        wrDiff > 0 ? "border-gain/30 bg-gain/5 text-gain" :
        wrDiff < 0 ? "border-loss/30 bg-loss/5 text-loss" :
        "border-border bg-muted text-muted-foreground"
      )}>
        {wrDiff > 0 ? (
          <><ArrowUpRight className="h-4 w-4" /> ✅ WL Rekomendasi meningkatkan WR sebesar +{wrDiff.toFixed(1)}% dibanding tanpa WL</>
        ) : wrDiff < 0 ? (
          <><ArrowDownRight className="h-4 w-4" /> ⚠️ WL Rekomendasi belum meningkatkan WR, selisih {wrDiff.toFixed(1)}%</>
        ) : (
          <><Minus className="h-4 w-4" /> ➡️ WL Rekomendasi tidak mempengaruhi WR</>
        )}
      </div>

      {/* BAGIAN 2: PER KATEGORI */}
      {categoryStats.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Statistik Per Kategori WL</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {categoryStats.map(c => (
              <StatsCard key={c.name} title={c.name} stats={c.stats} />
            ))}
          </div>
        </div>
      )}

      {/* BAGIAN 3: TABEL KOMBINASI WL + SCREENER */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Kombinasi WL Kategori + Screener</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterWl} onValueChange={setFilterWl}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="WL Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua WL</SelectItem>
              <SelectItem value="Tanpa WL">Tanpa WL</SelectItem>
              {allCategories.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterScreener} onValueChange={setFilterScreener}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Screener" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Screener</SelectItem>
              {allScreeners.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterWrMin} onValueChange={setFilterWrMin}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Min WR" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua WR</SelectItem>
              <SelectItem value="50">&gt; 50%</SelectItem>
              <SelectItem value="60">&gt; 60%</SelectItem>
              <SelectItem value="70">&gt; 70%</SelectItem>
              <SelectItem value="80">&gt; 80%</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filteredCombo.length} kombinasi</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {[
                  { key: "wl", label: "WL Kategori" },
                  { key: "screener", label: "Screener" },
                  { key: "total", label: "Total" },
                  { key: "win", label: "WIN" },
                  { key: "lose", label: "LOSE" },
                  { key: "wr", label: "Win Rate %" },
                  { key: "avg", label: "Avg % O→H" },
                ].map(col => (
                  <th
                    key={col.key}
                    className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}{sortIcon(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCombo.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-xs">Tidak ada data</td></tr>
              ) : (
                filteredCombo.map((row, i) => {
                  const wrVal = row.total > 0 ? (row.win / row.total) * 100 : 0;
                  const avgVal = row.winPcts.length > 0 ? row.winPcts.reduce((a, b) => a + b, 0) / row.winPcts.length : 0;
                  return (
                    <tr key={`${row.wl}-${row.screener}`} className={cn("border-b border-border/50 transition-colors hover:bg-accent/50", i % 2 === 0 ? "bg-card" : "bg-card/50")}>
                      <td className="p-3 text-xs font-medium">
                        <Badge variant={row.wl === "Tanpa WL" ? "secondary" : "default"} className="text-[10px]">{row.wl}</Badge>
                      </td>
                      <td className="p-3 text-xs font-mono">{row.screener}</td>
                      <td className="p-3 text-xs font-mono font-semibold">{row.total}</td>
                      <td className="p-3 text-xs font-mono text-gain font-semibold">{row.win}</td>
                      <td className="p-3 text-xs font-mono text-loss font-semibold">{row.lose}</td>
                      <td className={cn("p-3 text-xs font-mono font-bold", wrVal >= 70 ? "text-gain" : wrVal >= 50 ? "text-foreground" : "text-loss")}>
                        {wrVal.toFixed(1)}%
                      </td>
                      <td className="p-3 text-xs font-mono text-gain">{avgVal.toFixed(2)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
