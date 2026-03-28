import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Eye, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccumWatch } from "@/hooks/useAccumWatch";
import { useBandarmology } from "@/hooks/useBandarmology";
import { useTradingDays } from "@/hooks/useTradingDays";
import AccumWatchExpandedRow from "@/components/AccumWatchExpandedRow";

const tierColors: Record<string, string> = {
  S: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  A: "bg-green-500/10 text-green-400 border-green-500/30",
  B: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  C: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

const sourceStars = (count: number) => {
  if (count >= 3) return "⭐⭐⭐";
  if (count === 2) return "⭐⭐";
  return "⭐";
};

type SortKey = "ticker" | "marketCap" | "liquidity" | "composite" | "streak" | "sourceCount" | "tier" | "isTopv" | "tanggal_pertama_accum" | "daysSince" | "statusSK";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 inline ml-0.5 opacity-40" />;
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 inline ml-0.5 text-primary" />
    : <ChevronDown className="h-3 w-3 inline ml-0.5 text-primary" />;
}

export default function AccumWatch() {
  const { items: watchItems, isLoading: watchLoading } = useAccumWatch();
  const { items: bandarItems, isLoading: bandarLoading, getTickerHistory } = useBandarmology();
  const { getTradingDaysSince } = useTradingDays();
  const [filterTier, setFilterTier] = useState("all");
  const [onlyTierSA, setOnlyTierSA] = useState(false);
  const [searchTicker, setSearchTicker] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const watchingItems = useMemo(() => watchItems.filter(i => i.status === "WATCHING"), [watchItems]);
  const confirmedItems = useMemo(() => watchItems.filter(i => i.status === "CONFIRMED"), [watchItems]);

  // Get all unique submit dates sorted ascending
  const allSubmitDates = useMemo(() => {
    const dates = [...new Set(bandarItems.map(b => b.tanggal_data))];
    return dates.sort();
  }, [bandarItems]);

  // For each watching ticker, count how many submit days it appeared
  const enrichedWatch = useMemo(() => {
    const bandarByTicker = new Map<string, typeof bandarItems[0]>();
    for (const b of bandarItems) {
      const existing = bandarByTicker.get(b.ticker);
      if (!existing || b.tanggal_data > existing.tanggal_data || (b.tanggal_data === existing.tanggal_data && b.input_time > existing.input_time)) {
        bandarByTicker.set(b.ticker, b);
      }
    }

    // Group bandar dates per ticker
    const tickerDates = new Map<string, Set<string>>();
    for (const b of bandarItems) {
      if (!tickerDates.has(b.ticker)) tickerDates.set(b.ticker, new Set());
      tickerDates.get(b.ticker)!.add(b.tanggal_data);
    }

    return watchingItems.map(w => {
      const bandar = bandarByTicker.get(w.ticker);
      const dates = tickerDates.get(w.ticker);
      const sortedDates = dates ? [...dates].sort() : [];
      const firstDate = sortedDates[0] || w.tanggal_pertama_accum;
      const lastDate = sortedDates[sortedDates.length - 1] || w.tanggal_pertama_accum;
      // Use trading days instead of submission count
      const daysSince = getTradingDaysSince(firstDate) || 1;

      return {
        ...w,
        bandarData: bandar || null,
        daysSince,
        firstDate,
        lastDate,
        totalSubmitDays: sortedDates.length,
        composite: bandar?.composite_pct || null,
        streak: bandar?.streak || null,
        sourceCount: bandar?.source_count || 0,
        marketCap: bandar?.market_cap || "",
        liquidity: bandar?.liquidity || "",
        isTopv: bandar?.is_topv || false,
      };
    });
  }, [watchingItems, bandarItems]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleExpand = (ticker: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const filteredWatch = useMemo(() => {
    let data = enrichedWatch;
    if (filterTier !== "all") data = data.filter(d => d.tier_saat_masuk === filterTier);
    if (onlyTierSA) data = data.filter(d => d.tier_saat_masuk === "S" || d.tier_saat_masuk === "A");
    if (searchTicker) data = data.filter(d => d.ticker.includes(searchTicker.toUpperCase()));

    // Sort
    const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      data = [...data].sort((a, b) => {
        let va: any, vb: any;
        switch (sortKey) {
          case "ticker": va = a.ticker; vb = b.ticker; return va.localeCompare(vb) * dir;
          case "marketCap": va = a.marketCap; vb = b.marketCap; return va.localeCompare(vb) * dir;
          case "liquidity": va = a.liquidity || ""; vb = b.liquidity || ""; return va.localeCompare(vb) * dir;
          case "composite": va = a.composite || 0; vb = b.composite || 0; return (va - vb) * dir;
          case "streak": va = a.streak || 0; vb = b.streak || 0; return (va - vb) * dir;
          case "sourceCount": va = a.sourceCount; vb = b.sourceCount; return (va - vb) * dir;
          case "tier": va = tierOrder[a.tier_saat_masuk] ?? 3; vb = tierOrder[b.tier_saat_masuk] ?? 3; return (va - vb) * dir;
          case "isTopv": va = a.isTopv ? 1 : 0; vb = b.isTopv ? 1 : 0; return (va - vb) * dir;
          case "tanggal_pertama_accum": return a.tanggal_pertama_accum.localeCompare(b.tanggal_pertama_accum) * dir;
          case "daysSince": return (a.daysSince - b.daysSince) * dir;
          default: return 0;
        }
      });
    } else {
      // Default sort: Tier S → A → B → C, then streak desc, then composite desc
      data = [...data].sort((a, b) => {
        const ta = tierOrder[a.tier_saat_masuk] ?? 3;
        const tb = tierOrder[b.tier_saat_masuk] ?? 3;
        if (ta !== tb) return ta - tb;
        if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0);
        return (b.composite || 0) - (a.composite || 0);
      });
    }
    return data;
  }, [enrichedWatch, filterTier, onlyTierSA, searchTicker, sortKey, sortDir]);

  const tierCounts = useMemo(() => ({
    S: enrichedWatch.filter(w => w.tier_saat_masuk === "S").length,
    A: enrichedWatch.filter(w => w.tier_saat_masuk === "A").length,
    B: enrichedWatch.filter(w => w.tier_saat_masuk === "B").length,
    C: enrichedWatch.filter(w => w.tier_saat_masuk === "C").length,
  }), [enrichedWatch]);

  const avgDaysToConfirm = useMemo(() => {
    const confirmed = confirmedItems.filter(c => c.hari_tunggu != null);
    if (confirmed.length === 0) return null;
    return (confirmed.reduce((sum, c) => sum + (c.hari_tunggu || 0), 0) / confirmed.length).toFixed(1);
  }, [confirmedItems]);

  const isLoading = watchLoading || bandarLoading;

  const columns: { key: SortKey; label: string; className?: string }[] = [
    { key: "ticker", label: "Ticker" },
    { key: "marketCap", label: "Cap", className: "text-center" },
    { key: "liquidity", label: "Liq" },
    { key: "composite", label: "Comp%", className: "text-right" },
    { key: "streak", label: "Streak", className: "text-center" },
    { key: "sourceCount", label: "Source", className: "text-center" },
    { key: "tier", label: "Tier", className: "text-center" },
    { key: "isTopv", label: "TopV", className: "text-center" },
    { key: "tanggal_pertama_accum", label: "Pertama Accum" },
    { key: "daysSince", label: "Hari ke-", className: "text-center" },
    { key: "statusSK", label: "Status SK", className: "text-center" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" />
        Accum Watch
      </h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-[10px] text-muted-foreground font-semibold">Total Watch</p>
            <p className="text-2xl font-bold text-foreground">{enrichedWatch.length}</p>
          </CardContent>
        </Card>
        {(["S", "A", "B", "C"] as const).map(t => (
          <Card key={t}>
            <CardContent className="pt-4 pb-3 px-4">
              <p className="text-[10px] text-muted-foreground font-semibold">Tier {t}</p>
              <p className="text-2xl font-bold text-foreground">{tierCounts[t]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {avgDaysToConfirm && (
        <Card className="border-primary/20">
          <CardContent className="pt-3 pb-3 px-4 text-xs text-muted-foreground">
            📊 Rata-rata waktu Accum → Superketat confirm: <span className="font-bold text-foreground">{avgDaysToConfirm} hari</span>
            {" • "}Total confirmed: {confirmedItems.length}
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tier</SelectItem>
            <SelectItem value="S">Tier S</SelectItem>
            <SelectItem value="A">Tier A</SelectItem>
            <SelectItem value="B">Tier B</SelectItem>
            <SelectItem value="C">Tier C</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Switch id="aw-sa" checked={onlyTierSA} onCheckedChange={setOnlyTierSA} />
          <Label htmlFor="aw-sa" className="text-[10px] cursor-pointer">Hanya S+A</Label>
        </div>
        <Input
          placeholder="Cari ticker..."
          value={searchTicker}
          onChange={e => setSearchTicker(e.target.value)}
          className="h-8 text-xs w-28 ml-auto"
        />
      </div>

      {/* Watch Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredWatch.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
            Belum ada ticker di Accum Watch. Data akan terisi otomatis saat Anda menyimpan data Bandarmology.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map(col => (
                      <TableHead
                        key={col.key}
                        className={cn("text-[10px] cursor-pointer select-none hover:text-primary", col.className)}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWatch.map(w => (
                    <>
                      <TableRow
                        key={w.id}
                        className={cn("cursor-pointer hover:bg-muted/30", expandedTickers.has(w.ticker) && "bg-muted/20")}
                        onClick={() => toggleExpand(w.ticker)}
                      >
                        <TableCell className="font-mono font-bold text-xs text-primary">{w.ticker}</TableCell>
                        <TableCell className="text-center text-xs">
                          {w.marketCap === "Big" ? "🔵" : w.marketCap === "Mid" ? "🟢" : w.marketCap === "Small" ? "🟡" : w.marketCap === "Micro" ? "🔴" : "⚪"}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{w.liquidity || "—"}</TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px] font-bold", (w.composite || 0) >= 60 ? "text-green-500" : "text-foreground")}>
                          {w.composite?.toFixed(1) || "—"}%
                        </TableCell>
                        <TableCell className="text-center font-mono text-[10px]">
                          {w.streak != null ? `${w.streak}d↑` : "—"}
                        </TableCell>
                        <TableCell className="text-center text-[10px]">{sourceStars(w.sourceCount)}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn("text-[8px] font-bold", tierColors[w.tier_saat_masuk])}>
                            {w.tier_saat_masuk}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-[10px]">
                          {w.isTopv && <Badge className="text-[8px] bg-purple-500/10 text-purple-400 border-purple-500/30">TopV</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">{w.tanggal_pertama_accum}</TableCell>
                        <TableCell className="text-center font-mono text-xs font-bold">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground">{w.daysSince}</span>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs space-y-1">
                              <p>Pertama muncul: {w.firstDate}</p>
                              <p>Data terakhir: {w.lastDate}</p>
                              <p>Total hari submit: {w.totalSubmitDays} hari</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center text-[10px]">
                          <Badge variant="outline" className="text-[8px] border-red-500/30 text-red-400">
                            ❌ Belum SK
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {expandedTickers.has(w.ticker) && (
                        <TableRow key={`${w.id}-expand`}>
                          <TableCell colSpan={11} className="p-0 bg-muted/10">
                            <AccumWatchExpandedRow
                              ticker={w.ticker}
                              getTickerHistory={getTickerHistory}
                              bandarData={w.bandarData}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
