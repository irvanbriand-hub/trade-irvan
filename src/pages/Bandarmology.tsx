import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, RotateCcw, TrendingUp, Database, Search, ArrowUp, ArrowDown, Minus, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { parseBandarmologyInput, type ParseResult } from "@/lib/bandarmologyParser";
import { useBandarmology } from "@/hooks/useBandarmology";
import { useAccumWatch } from "@/hooks/useAccumWatch";
import { useAuth } from "@/hooks/useAuth";
import AkTracker from "@/components/bandarmology/AkTracker";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine, Area
} from "recharts";

const tierColors: Record<string, string> = {
  S: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  A: "bg-green-500/10 text-green-400 border-green-500/30",
  B: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  C: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

const capEmoji: Record<string, string> = {
  Big: "🔵",
  Mid: "🟢",
  Small: "🟡",
  Micro: "🔴",
  Unknown: "⚪",
};

const formatValue = (v: number | null) => {
  if (v == null) return "—";
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(1)}M`;
  return `Rp ${v.toLocaleString("id-ID")}`;
};

function RankDeltaBadge({ delta, isNew }: { delta: number | null; isNew: boolean }) {
  if (isNew) return <span className="text-yellow-400 text-[10px] font-bold">🆕</span>;
  if (delta == null) return <span className="text-muted-foreground text-[10px]">➡️</span>;
  if (delta > 0) return <span className="text-green-500 text-[10px] font-mono">↑{delta}</span>;
  if (delta < 0) return <span className="text-red-500 text-[10px] font-mono">↓{Math.abs(delta)}</span>;
  return <span className="text-muted-foreground text-[10px]">➡️</span>;
}

export default function Bandarmology() {
  const { user } = useAuth();
  const {
    items, isLoading, saveData, deleteByDate,
    getExistingDates, getInputCountForDate, getRankDelta, getTickerHistory
  } = useBandarmology();
  const { syncFromBandarmology } = useAccumWatch();

  const [topl50Text, setTopl50Text] = useState("");
  const [top20Text, setTop20Text] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterDate, setFilterDate] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterCap, setFilterCap] = useState<string>("all");
  const [onlyBigMid, setOnlyBigMid] = useState(false);
  const [onlyStreak3, setOnlyStreak3] = useState(false);
  const [onlyFull, setOnlyFull] = useState(false);
  const [searchTicker, setSearchTicker] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const handleParse = () => {
    if (!topl50Text.trim()) {
      toast({ title: "Data /topl50 wajib diisi", variant: "destructive" });
      return;
    }
    try {
      const result = parseBandarmologyInput(topl50Text, top20Text || undefined);
      if (result.merged.length === 0) {
        toast({ title: "Tidak ada data terdeteksi", description: "Pastikan format /topl50 sesuai", variant: "destructive" });
        return;
      }
      setParseResult(result);
    } catch (e: any) {
      toast({ title: "Parse error", description: e.message, variant: "destructive" });
    }
  };

  const handleSave = async (mode: "replace" | "add") => {
    if (!parseResult || !user) return;
    setSaving(true);
    try {
      if (mode === "replace") await deleteByDate(parseResult.tanggal);
      await saveData(parseResult.tanggal, parseResult.merged);
      // Auto-populate Accum Watch from today's bandar data
      await syncFromBandarmology();
      setParseResult(null);
      setTopl50Text("");
      setTop20Text("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(items.map(i => i.tanggal_data))];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [items]);

  const displayData = useMemo(() => {
    let data = items;
    if (filterDate !== "all") data = data.filter(i => i.tanggal_data === filterDate);
    if (filterTier !== "all") data = data.filter(i => i.tier === filterTier);
    if (filterCap !== "all") data = data.filter(i => i.market_cap === filterCap);
    if (onlyBigMid) data = data.filter(i => i.market_cap === "Big" || i.market_cap === "Mid");
    if (onlyStreak3) data = data.filter(i => (i.streak ?? 0) >= 3);
    if (onlyFull) data = data.filter(i => i.data_tier === "FULL");
    if (searchTicker) data = data.filter(i => i.ticker.includes(searchTicker.toUpperCase()));

    // Latest input per date-ticker
    const latestByDateTicker = new Map<string, typeof data[0]>();
    for (const d of data) {
      const key = `${d.tanggal_data}-${d.ticker}`;
      const existing = latestByDateTicker.get(key);
      if (!existing || d.input_time > existing.input_time) latestByDateTicker.set(key, d);
    }
    return [...latestByDateTicker.values()].sort((a, b) => {
      if (a.tanggal_data !== b.tanggal_data) return b.tanggal_data.localeCompare(a.tanggal_data);
      return (a.rank_score ?? 999) - (b.rank_score ?? 999);
    });
  }, [items, filterDate, filterTier, filterCap, onlyBigMid, onlyStreak3, onlyFull, searchTicker]);

  // Rank movement alerts - only if 2+ days of data exist
  const hasEnoughData = uniqueDates.length >= 2;

  const rankAlerts = useMemo(() => {
    if (!hasEnoughData) return [];
    const latestDate = uniqueDates[0];
    const prevDate = uniqueDates[1];
    const todayData = displayData.filter(d => d.tanggal_data === latestDate && (d.rank_score ?? 99) <= 20);
    
    // Get previous day's latest data per ticker
    const prevLatest = items.filter(i => i.tanggal_data === prevDate);
    const prevByTicker = new Map<string, typeof prevLatest[0]>();
    for (const p of prevLatest) {
      const ex = prevByTicker.get(p.ticker);
      if (!ex || p.input_time > ex.input_time) prevByTicker.set(p.ticker, p);
    }

    return todayData
      .map(d => {
        const prev = prevByTicker.get(d.ticker);
        const prevRank = prev?.rank_score ?? null;
        const wasOutside = prevRank == null || prevRank > 20;
        const delta = prevRank != null ? prevRank - (d.rank_score ?? 0) : null;
        return { ...d, delta, wasOutside, prevRank };
      })
      .filter(d => d.wasOutside || (d.delta != null && d.delta > 0))
      .sort((a, b) => {
        const tierOrder: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };
        const ta = tierOrder[a.tier] ?? 3, tb = tierOrder[b.tier] ?? 3;
        if (ta !== tb) return ta - tb;
        return (b.streak || 0) - (a.streak || 0);
      });
  }, [hasEnoughData, uniqueDates, displayData, items]);

  // Alert collapse state from localStorage
  const [alertExpanded, setAlertExpanded] = useState(() => {
    try { return localStorage.getItem("bm-alert-expanded") === "true"; } catch { return false; }
  });
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  useEffect(() => {
    try { localStorage.setItem("bm-alert-expanded", String(alertExpanded)); } catch {}
  }, [alertExpanded]);

  // Ticker history for selected ticker
  const tickerHistory = useMemo(() => {
    if (!selectedTicker) return [];
    return getTickerHistory(selectedTicker);
  }, [selectedTicker, getTickerHistory]);

  const existingDates = getExistingDates();
  const isExistingDate = parseResult ? existingDates.has(parseResult.tanggal) : false;
  const inputCount = parseResult ? getInputCountForDate(parseResult.tanggal) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        Bandarmology
      </h1>

      <Tabs defaultValue="bandar" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="bandar" className="text-xs">🏦 Bandarmology</TabsTrigger>
          <TabsTrigger value="ak" className="text-xs">🐋 AK Tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="ak">
          <AkTracker />
        </TabsContent>

        <TabsContent value="bandar">
      {/* Input Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Input Data Bot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Text Area 1 - Required */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">📋 Data /topl50 (Rank 1-50 + Streak) <span className="text-red-400">*wajib</span></Label>
            <Textarea
              placeholder={"Paste output /topl50 disini...\n\nFormat: 🔝 Top 50 Accumulation — 📅 DD-MM-YYYY\n # Ticker🔵 Score Str Brk Pat"}
              value={topl50Text}
              onChange={e => setTopl50Text(e.target.value)}
              className="min-h-[160px] font-mono text-xs"
            />
          </div>

          {/* Text Area 2 - Optional */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">📊 Data /top20 (Detail Lengkap) <span className="text-muted-foreground font-normal">— opsional</span></Label>
            <Textarea
              placeholder={"Paste output /top20 disini...\n\nFormat: 🔝 Top 20 Accumulation Stocks\n(by Accum Score) 📅 DD-MM-YYYY\n1. TICKER 🔵 High Liq\n   Composite: XX.X%..."}
              value={top20Text}
              onChange={e => setTop20Text(e.target.value)}
              className="min-h-[120px] font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground italic">
              *Opsional — untuk mendapatkan detail Value, Daily%, Weekly%, Top1% pada top 20 saham
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleParse} disabled={!topl50Text.trim()} size="sm">
              <TrendingUp className="h-4 w-4 mr-1" />
              Parse & Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setTopl50Text(""); setTop20Text(""); setParseResult(null); }}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>

          {/* Parse Preview */}
          {parseResult && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 space-y-2">
                <p className="text-sm font-semibold text-foreground">Berhasil parse:</p>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <p>📅 Tanggal: <span className="font-bold text-foreground">{parseResult.tanggal}</span></p>
                  <p>/topl50: {parseResult.toplCount} saham ✅</p>
                  <p>/top20: {parseResult.top20Count > 0 ? `${parseResult.top20Count} saham ✅` : "⚠️ Tidak diisi"}</p>
                  <div className="border-t border-border/30 pt-1 mt-1">
                    <p><span className="font-semibold text-foreground">FULL</span> (detail lengkap): {parseResult.fullCount} saham</p>
                    <p><span className="font-semibold text-foreground">PARTIAL</span> (streak saja): {parseResult.partialCount} saham</p>
                    <p className="font-semibold text-foreground">Total: {parseResult.merged.length} saham unik</p>
                  </div>
                  <div className="border-t border-border/30 pt-1 mt-1">
                    <p>Tier S: {parseResult.tierS} | Tier A: {parseResult.tierA} | Tier B: {parseResult.tierB} | Tier C: {parseResult.tierC}</p>
                  </div>
                  {parseResult.newTop20 > 0 && (
                    <p className="text-yellow-400">🚀 Masuk Top 20 baru: {parseResult.newTop20} saham</p>
                  )}
                </div>

                {isExistingDate && (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-2 text-xs text-yellow-400">
                    ⚠️ Data {parseResult.tanggal} sudah ada (input ke-{inputCount}). Replace atau Tambah sebagai update?
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  {isExistingDate ? (
                    <>
                      <Button size="sm" onClick={() => handleSave("replace")} disabled={saving}>
                        {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        Replace
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleSave("add")} disabled={saving}>
                        {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        Tambah Update
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => handleSave("add")} disabled={saving}>
                      {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      Simpan
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setParseResult(null)}>Ulangi</Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Rank Movement Alerts */}
      {!hasEnoughData && uniqueDates.length === 1 && (
        <Card className="border-muted">
          <CardContent className="pt-3 pb-3 px-4 text-xs text-muted-foreground">
            ℹ️ Belum ada data pembanding. Alert "Masuk Top 20" akan aktif setelah 2+ hari data.
          </CardContent>
        </Card>
      )}
      {rankAlerts.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardHeader
            className="pb-2 cursor-pointer select-none"
            onClick={() => setAlertExpanded(p => !p)}
          >
            <CardTitle className="text-sm text-yellow-400 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              🚀 MASUK TOP 20 HARI INI! ({rankAlerts.length} saham)
              {alertExpanded ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
            </CardTitle>
          </CardHeader>
          {alertExpanded && (
            <CardContent className="space-y-2 pt-0">
              {(showAllAlerts ? rankAlerts : rankAlerts.slice(0, 5)).map(a => (
                <div key={a.id} className="flex items-center gap-3 text-xs bg-background/50 rounded-md p-2">
                  <span className="font-bold text-primary">{a.ticker}</span>
                  <span>{capEmoji[a.market_cap] || "⚪"}</span>
                  <Badge variant="outline" className={cn("text-[8px]", tierColors[a.tier])}>{a.tier}</Badge>
                  {a.wasOutside ? (
                    <span className="text-yellow-400">🆕 Masuk Top 20! {a.prevRank != null ? `(was #${a.prevRank})` : ""}</span>
                  ) : (
                    <span className="text-green-400">Naik {a.delta} posisi → Rank #{a.rank_score}</span>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {a.streak != null ? (a.is_new_entry ? "NEW" : `${a.streak}d↑`) : "—"} | {a.composite_pct?.toFixed(1)}%
                  </span>
                </div>
              ))}
              {!showAllAlerts && rankAlerts.length > 5 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAllAlerts(true); }}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  Lihat semua {rankAlerts.length} saham <ChevronDown className="h-3 w-3" />
                </button>
              )}
              {showAllAlerts && rankAlerts.length > 5 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAllAlerts(false); }}
                  className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                >
                  Sembunyikan <ChevronUp className="h-3 w-3" />
                </button>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterDate} onValueChange={setFilterDate}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Tanggal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Tanggal</SelectItem>
            {uniqueDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tier</SelectItem>
            {["S", "A", "B", "C"].map(t => <SelectItem key={t} value={t}>Tier {t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCap} onValueChange={setFilterCap}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Cap" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cap</SelectItem>
            {["Big", "Mid", "Small", "Micro"].map(c => <SelectItem key={c} value={c}>{capEmoji[c]} {c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Switch id="bm-bigmid" checked={onlyBigMid} onCheckedChange={setOnlyBigMid} />
          <Label htmlFor="bm-bigmid" className="text-[10px] cursor-pointer">Big+Mid</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch id="bm-streak3" checked={onlyStreak3} onCheckedChange={setOnlyStreak3} />
          <Label htmlFor="bm-streak3" className="text-[10px] cursor-pointer">Streak≥3</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch id="bm-full" checked={onlyFull} onCheckedChange={setOnlyFull} />
          <Label htmlFor="bm-full" className="text-[10px] cursor-pointer">FULL only</Label>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cari ticker..."
            value={searchTicker}
            onChange={e => {
              setSearchTicker(e.target.value);
              if (e.target.value.length >= 3) setSelectedTicker(e.target.value.toUpperCase());
              else setSelectedTicker(null);
            }}
            className="h-8 text-xs w-28"
          />
        </div>
      </div>

      {/* Ticker History Panel — Sticky chart + scrollable detail */}
      {selectedTicker && tickerHistory.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 sticky top-0 z-10 bg-card border-b border-border/30">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="text-primary font-bold">{selectedTicker}</span>
              <span>{capEmoji[tickerHistory[tickerHistory.length - 1]?.market_cap] || "⚪"}</span>
              <Badge variant="outline" className={cn("text-[8px]", tierColors[tickerHistory[tickerHistory.length - 1]?.tier])}>
                {tickerHistory[tickerHistory.length - 1]?.tier}
              </Badge>
              <span className="text-xs text-muted-foreground ml-2">
                Terakhir: Rank #{tickerHistory[tickerHistory.length - 1]?.rank_score} | Composite {tickerHistory[tickerHistory.length - 1]?.composite_pct?.toFixed(1)}% | {tickerHistory[tickerHistory.length - 1]?.streak != null ? `${tickerHistory[tickerHistory.length - 1]?.streak}d↑` : "—"}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto text-xs h-6" onClick={() => setSelectedTicker(null)}>✕</Button>
            </CardTitle>
          </CardHeader>
          {/* Sticky Chart */}
          <div className="sticky top-[52px] z-10 bg-card border-b border-border/30 px-4 py-2">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tickerHistory.map(h => ({
                  date: h.tanggal_data.slice(5),
                  rank: h.rank_score,
                  composite: h.composite_pct,
                  streak: h.streak,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis reversed domain={[1, 50]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(value: any, name: string) => {
                      if (name === "rank") return [`#${value}`, "Rank"];
                      if (name === "composite") return [`${value}%`, "Composite"];
                      return [value, name];
                    }}
                  />
                  <ReferenceLine y={20} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: "Top 20", fill: "hsl(var(--destructive))", fontSize: 10 }} />
                  <Line type="monotone" dataKey="rank" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Scrollable Detail Table */}
          <CardContent className="space-y-3 pt-3">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Tanggal</TableHead>
                    <TableHead className="text-[10px] text-center">Rank</TableHead>
                    <TableHead className="text-[10px] text-center">Δ</TableHead>
                    <TableHead className="text-[10px] text-right">Comp%</TableHead>
                    <TableHead className="text-[10px] text-center">Streak</TableHead>
                    <TableHead className="text-[10px]">Top1</TableHead>
                    <TableHead className="text-[10px] text-right">Value</TableHead>
                    <TableHead className="text-[10px] text-right">Daily%</TableHead>
                    <TableHead className="text-[10px] text-right">Weekly%</TableHead>
                    <TableHead className="text-[10px] text-center">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...tickerHistory].reverse().map((h, i) => {
                    const rd = getRankDelta(h.ticker, h.tanggal_data, h.rank_score);
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono text-[10px]">{h.tanggal_data}</TableCell>
                        <TableCell className="text-center font-mono text-[10px] font-bold">#{h.rank_score}</TableCell>
                        <TableCell className="text-center"><RankDeltaBadge delta={rd.delta} isNew={rd.isNew} /></TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px] font-bold", (h.composite_pct || 0) >= 60 ? "text-green-500" : "")}>{h.composite_pct?.toFixed(1)}%</TableCell>
                        <TableCell className="text-center text-[10px] font-mono">
                          {h.is_new_entry ? <span className="text-yellow-400">NEW</span> : h.streak != null ? `${h.streak}d↑` : "—"}
                        </TableCell>
                        <TableCell className="text-[10px]">{h.top1_pct != null ? `${h.top1_pct.toFixed(1)}% (${h.top1_broker})` : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{formatValue(h.value)}</TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px]", (h.daily_pct || 0) > 0 ? "text-green-500" : (h.daily_pct || 0) < 0 ? "text-red-500" : "")}>{h.daily_pct != null ? `${h.daily_pct.toFixed(1)}%` : "—"}</TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px]", (h.weekly_pct || 0) > 0 ? "text-green-500" : (h.weekly_pct || 0) < 0 ? "text-red-500" : "")}>{h.weekly_pct != null ? `${h.weekly_pct.toFixed(1)}%` : "—"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn("text-[8px]", h.data_tier === "FULL" ? "text-green-400 border-green-500/30" : "text-zinc-400 border-zinc-500/30")}>{h.data_tier}</Badge>
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

      {/* Main Data Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : displayData.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
            Belum ada data bandarmology. Paste output bot di atas untuk memulai.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Tanggal</TableHead>
                    <TableHead className="text-[10px]">Ticker</TableHead>
                    <TableHead className="text-[10px] text-center">Cap</TableHead>
                    <TableHead className="text-[10px] text-center">Rank</TableHead>
                    <TableHead className="text-[10px] text-center">Δ</TableHead>
                    <TableHead className="text-[10px] text-right">Comp%</TableHead>
                    <TableHead className="text-[10px] text-center">Streak</TableHead>
                    <TableHead className="text-[10px]">Top1</TableHead>
                    <TableHead className="text-[10px] text-right">Value</TableHead>
                    <TableHead className="text-[10px] text-right">Daily%</TableHead>
                    <TableHead className="text-[10px] text-right">Weekly%</TableHead>
                    <TableHead className="text-[10px] text-center">Tier</TableHead>
                    <TableHead className="text-[10px] text-center">Data</TableHead>
                    <TableHead className="text-[10px]">Pattern</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.map((r) => {
                    const rd = getRankDelta(r.ticker, r.tanggal_data, r.rank_score);
                    return (
                      <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setSelectedTicker(r.ticker)}>
                        <TableCell className="font-mono text-[10px]">{r.tanggal_data}</TableCell>
                        <TableCell className="font-mono font-bold text-xs text-primary">{r.ticker}</TableCell>
                        <TableCell className="text-center text-xs">
                          <Tooltip>
                            <TooltipTrigger>{capEmoji[r.market_cap] || "⚪"}</TooltipTrigger>
                            <TooltipContent className="text-xs">{r.market_cap || "Unknown"}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center font-mono text-[10px] font-bold">#{r.rank_score}</TableCell>
                        <TableCell className="text-center"><RankDeltaBadge delta={rd.delta} isNew={rd.isNew} /></TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px] font-bold", (r.composite_pct || 0) >= 60 ? "text-green-500" : "")}>
                          {r.composite_pct?.toFixed(1) || "—"}%
                        </TableCell>
                        <TableCell className="text-center text-[10px] font-mono">
                          {r.is_new_entry ? <span className="text-yellow-400">NEW</span> : r.streak != null ? `${r.streak}d↑` : "—"}
                        </TableCell>
                        <TableCell className="text-[10px]">
                          {r.top1_pct != null ? <span>{r.top1_pct.toFixed(1)}% <span className="text-muted-foreground">({r.top1_broker})</span></span> : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-[10px]">{formatValue(r.value)}</TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px]", (r.daily_pct || 0) > 0 ? "text-green-500" : (r.daily_pct || 0) < 0 ? "text-red-500" : "")}>
                          {r.daily_pct != null ? `${r.daily_pct.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono text-[10px]", (r.weekly_pct || 0) > 0 ? "text-green-500" : (r.weekly_pct || 0) < 0 ? "text-red-500" : "")}>
                          {r.weekly_pct != null ? `${r.weekly_pct.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn("text-[8px] font-bold", tierColors[r.tier])}>{r.tier}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn("text-[8px]", r.data_tier === "FULL" ? "text-green-400 border-green-500/30" : "text-zinc-400 border-zinc-500/30")}>{r.data_tier}</Badge>
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{r.pattern || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
