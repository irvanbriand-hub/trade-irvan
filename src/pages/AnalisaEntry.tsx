import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Zap, Eye, TrendingUp, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getScreenerStore } from "@/lib/screenerStore";
import { useBandarmology } from "@/hooks/useBandarmology";
import { useAkSmartMoney } from "@/hooks/useAkSmartMoney";
import { AkSmartMoneyBadgeComponent } from "@/components/AkSmartMoneyBadge";

interface EntryCandidate {
  ticker: string;
  sumber: string;
  winPct: number;
  avgPct: number;
  match: "✅" | "⚠️" | "❌";
  iiScore: number;
  tma20: number;
  adxKondisi: string;
  jalur: string;
  reko: "🔥" | "✅" | "⚠️" | "❌";
  isConfluence: boolean;
}

export default function AnalisaEntry() {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<EntryCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterSumber, setFilterSumber] = useState("all");
  const [filterReko, setFilterReko] = useState("all");
  const [onlyMatch, setOnlyMatch] = useState(false);
  const [onlyAk, setOnlyAk] = useState(false);
  const [fromMonitoring, setFromMonitoring] = useState(0);
  const [fromScan, setFromScan] = useState(0);

  const { items: bandarItems } = useBandarmology();
  const { getBadge: getAkBadge, getEntryBonus, confluenceTickers } = useAkSmartMoney(bandarItems);

  const { data: monitoringItems = [] } = useQuery({
    queryKey: ["sk-monitoring", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sk_monitoring")
        .select("*")
        .eq("status", "MONITORING")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    const results: EntryCandidate[] = [];

    for (const item of monitoringItems) {
      try {
        const { data } = await supabase.functions.invoke("yahoo-finance-sk-analysis", {
          body: { ticker: item.ticker },
        });
        if (!data) continue;

        const entryDate = new Date(item.tanggal_masuk);
        const today = new Date();
        const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
        const dayN = Math.min(Math.max(diffDays, 1), 5);

        const summaryForDay = (data.summary || []).find((s: any) => s.day === dayN);
        const winPct = summaryForDay?.winPct || 0;
        const avgPct = summaryForDay?.avgPct || 0;

        const latestEvent = (data.events || [])[0];
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

        results.push({
          ticker: item.ticker,
          sumber: `SK Monitoring Day ${dayN}`,
          winPct, avgPct, match,
          iiScore: item.ii_score || 0,
          tma20: item.tma20 || 0,
          adxKondisi: item.adx_kondisi || "—",
          jalur: item.jalur_masuk || "—",
          reko,
          isConfluence: !!(item as any).is_confluence,
        });
      } catch {}
    }
    setFromMonitoring(results.length);

    const store = getScreenerStore();
    const skStocks = store.skStocks || [];
    let scanCount = 0;
    for (const stock of skStocks.slice(0, 20)) {
      if (results.some(r => r.ticker === stock.ticker)) continue;
      try {
        const { data } = await supabase.functions.invoke("yahoo-finance-sk-analysis", {
          body: { ticker: stock.ticker },
        });
        if (!data) continue;

        const summaryForDay1 = (data.summary || []).find((s: any) => s.day === 1);
        const winPct = summaryForDay1?.winPct || 0;
        const avgPct = summaryForDay1?.avgPct || 0;

        let reko: "🔥" | "✅" | "⚠️" | "❌" = "⚠️";
        if (winPct >= 70) reko = "🔥";
        else if (winPct >= 50) reko = "✅";
        else if (winPct < 30) reko = "❌";

        results.push({
          ticker: stock.ticker,
          sumber: "Scan Baru Day 1",
          winPct, avgPct,
          match: "✅",
          iiScore: stock.ii,
          tma20: stock.tma20,
          adxKondisi: stock.adxKondisi,
          jalur: stock.jalur,
          reko,
          isConfluence: !!(stock as any).isConfluence,
        });
        scanCount++;
      } catch {}
    }
    setFromScan(scanCount);
    setCandidates(results);
    setLoading(false);
  }, [monitoringItems]);

  useEffect(() => {
    if (monitoringItems.length > 0 && candidates.length === 0 && !loading) {
      fetchCandidates();
    }
  }, [monitoringItems.length]); // eslint-disable-line

  // Confluence alert tickers that are in candidates
  const confluenceInCandidates = useMemo(() => {
    const candidateTickers = new Set(candidates.map(c => c.ticker));
    return confluenceTickers.filter(ct => candidateTickers.has(ct.ticker));
  }, [candidates, confluenceTickers]);

  const filtered = useMemo(() => {
    let data = candidates;
    if (filterSumber === "monitoring") data = data.filter(c => c.sumber.startsWith("SK"));
    else if (filterSumber === "scan") data = data.filter(c => c.sumber.startsWith("Scan"));
    if (filterReko !== "all") data = data.filter(c => c.reko === filterReko);
    if (onlyMatch) data = data.filter(c => c.match === "✅");
    if (onlyAk) data = data.filter(c => getAkBadge(c.ticker) !== null);

    const order = { "🔥": 0, "✅": 1, "⚠️": 2, "❌": 3 };
    return data.sort((a, b) => {
      // AK+Bandar confluence first
      const akBonusA = getEntryBonus(a.ticker);
      const akBonusB = getEntryBonus(b.ticker);
      const confA = a.isConfluence ? 0 : 1;
      const confB = b.isConfluence ? 0 : 1;
      const rekoA = order[a.reko] || 3;
      const rekoB = order[b.reko] || 3;
      // AK+Bandar (bonus 5) gets top priority
      if (akBonusA === 5 && akBonusB !== 5) return -1;
      if (akBonusB === 5 && akBonusA !== 5) return 1;
      const scoreA = confA * 10 + rekoA - akBonusA;
      const scoreB = confB * 10 + rekoB - akBonusB;
      return scoreA - scoreB || b.winPct - a.winPct;
    });
  }, [candidates, filterSumber, filterReko, onlyMatch, onlyAk, getEntryBonus, getAkBadge]);

  const colorPct = (v: number) => v > 0 ? "text-green-500" : v < 0 ? "text-red-500" : "text-foreground";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Analisa Entry</h1>
        <Button onClick={fetchCandidates} disabled={loading} size="sm">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Refresh
        </Button>
      </div>

      {/* Confluence Alert */}
      {confluenceInCandidates.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Flame className="h-5 w-5 text-yellow-500" />
              <span className="font-bold text-yellow-500 text-sm">🔥 CONFLUENCE SIGNAL!</span>
              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                {confluenceInCandidates.length} saham
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              Saham konfirmasi AK + Bandarmology hari ini:
            </p>
            <div className="flex flex-wrap gap-2">
              {confluenceInCandidates.map(ct => (
                <Badge key={ct.ticker} className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-xs">
                  🎯 {ct.ticker} — Score {ct.score}/100
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground">Total Kandidat</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{candidates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground">Dari SK Monitoring</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fromMonitoring}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-[10px] font-semibold text-muted-foreground">Dari Scan Baru</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fromScan}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterSumber} onValueChange={setFilterSumber}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Sumber</SelectItem>
            <SelectItem value="monitoring">SK Monitoring</SelectItem>
            <SelectItem value="scan">Scan Baru</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterReko} onValueChange={setFilterReko}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Reko</SelectItem>
            <SelectItem value="🔥">🔥 Hot</SelectItem>
            <SelectItem value="✅">✅ Oke</SelectItem>
            <SelectItem value="⚠️">⚠️ Cukup</SelectItem>
            <SelectItem value="❌">❌ Hindari</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="only-match" checked={onlyMatch} onCheckedChange={setOnlyMatch} />
          <Label htmlFor="only-match" className="text-[10px] text-muted-foreground">Hanya ✅ Match</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="only-ak" checked={onlyAk} onCheckedChange={setOnlyAk} />
          <Label htmlFor="only-ak" className="text-[10px] text-muted-foreground">🐋 Hanya ada AK</Label>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Menganalisa kandidat entry...</span>
        </div>
      )}

      {!loading && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                     <TableHead className="text-[10px]">Ticker</TableHead>
                     <TableHead className="text-[10px] text-center">Confluence</TableHead>
                     <TableHead className="text-[10px]">Sumber</TableHead>
                     <TableHead className="text-[10px] text-right">WIN%</TableHead>
                     <TableHead className="text-[10px] text-right">Avg%</TableHead>
                     <TableHead className="text-[10px] text-center">Match</TableHead>
                     <TableHead className="text-[10px] text-right">ii</TableHead>
                     <TableHead className="text-[10px] text-right">TMA20</TableHead>
                     <TableHead className="text-[10px]">ADX</TableHead>
                     <TableHead className="text-[10px]">Jalur</TableHead>
                     <TableHead className="text-[10px] text-center">🐋 Smart Money</TableHead>
                     <TableHead className="text-[10px] text-center">AK Bonus</TableHead>
                     <TableHead className="text-[10px] text-center">Reko</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                     <TableCell colSpan={13} className="text-center py-8 text-muted-foreground text-sm">
                        {candidates.length === 0 ? "Belum ada data. Klik Refresh untuk memulai analisa." : "Tidak ada kandidat sesuai filter."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c, idx) => {
                      const akBonus = getEntryBonus(c.ticker);
                      const akBadge = getAkBadge(c.ticker);
                      return (
                        <TableRow key={`${c.ticker}-${idx}`} className={cn(
                          akBadge?.badgeType === "whale_bandar" ? "bg-yellow-500/10" :
                          c.isConfluence && c.reko === "🔥" ? "bg-yellow-500/5" : 
                          c.reko === "🔥" ? "bg-orange-500/5" : ""
                        )}>
                          <TableCell className="font-mono font-bold text-xs text-primary">{c.ticker}</TableCell>
                          <TableCell className="text-center">
                            {c.isConfluence ? (
                              <Badge className="text-[8px] bg-yellow-500/10 text-yellow-500 border-yellow-500/30">🔥 SK+VOL</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[8px] text-muted-foreground">SK</Badge>
                            )}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-[8px]">{c.sumber}</Badge></TableCell>
                          <TableCell className={cn("text-right font-mono text-xs", c.winPct >= 50 ? "text-green-500" : "text-red-500")}>{c.winPct.toFixed(1)}%</TableCell>
                          <TableCell className={cn("text-right font-mono text-xs", colorPct(c.avgPct))}>{c.avgPct.toFixed(2)}%</TableCell>
                          <TableCell className="text-center text-xs">{c.match}</TableCell>
                          <TableCell className={cn("text-right font-mono text-xs", c.iiScore > 0 ? "text-green-500" : "text-red-500")}>{c.iiScore.toFixed(1)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{c.tma20.toFixed(2)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[7px]">{c.adxKondisi}</Badge></TableCell>
                          <TableCell><Badge variant="outline" className="text-[8px]">{c.jalur}</Badge></TableCell>
                          <TableCell className="text-center">
                            <AkSmartMoneyBadgeComponent data={akBadge} />
                          </TableCell>
                          <TableCell className="text-center">
                            {akBonus > 0 ? (
                              <Badge className={cn("text-[8px]", 
                                akBonus >= 5 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                                akBonus >= 3 ? "bg-green-500/20 text-green-400 border-green-500/30" :
                                "bg-green-500/10 text-green-500 border-green-500/20"
                              )}>+{akBonus}</Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-center text-sm">{c.reko}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
