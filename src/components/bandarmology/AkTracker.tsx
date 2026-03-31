import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Upload, RotateCcw, TrendingUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useAkTracker, parseAkBrokerInput, type CombinedDateRow } from "@/hooks/useAkTracker";
import { useBrokerProfiles } from "@/hooks/useBrokerProfiles";
import { useBandarmology } from "@/hooks/useBandarmology";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
  ComposedChart, Cell,
} from "recharts";
import BrokerSetup from "./BrokerSetup";
import SmartMoneyRanking from "./SmartMoneyRanking";

const formatVal = (v: number | null) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toLocaleString("id-ID");
};

const formatRp = (v: number | null) => {
  if (v == null) return "—";
  return `Rp ${formatVal(v)}`;
};

const tagVsSahamBadge = (tag: string, score?: any) => {
  const pct = score?.pct_of_market;
  const src = score?.value_source;
  const isFallback = src === "FALLBACK_HARDCODED";
  switch (tag) {
    case "WHALE": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px]">🔴 Whale{pct > 0 ? ` ${pct.toFixed(1)}%` : ""}{isFallback ? " ⚠️" : ""}</Badge>;
    case "BIG_ACCUM": return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[8px]">🟠 Big Accum{pct > 0 ? ` ${pct.toFixed(1)}%` : ""}{isFallback ? " ⚠️" : ""}</Badge>;
    default: return <Badge variant="outline" className="text-[8px]">🔵 Normal</Badge>;
  }
};

const tagVsAkBadge = (tag: string) => {
  switch (tag) {
    case "HYPERACCUM": return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px]">🚀 Hyperaccum</Badge>;
    case "ACCELERATION": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[8px]">⚡ Acceleration</Badge>;
    default: return <Badge variant="outline" className="text-[8px]">📊 Normal</Badge>;
  }
};

function patternBadge(pattern: string) {
  switch (pattern) {
    case "HYPERACCUM":   return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px]">🚀 Hyperaccum</Badge>;
    case "ACCELERATION": return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[8px]">⚡ Accel</Badge>;
    case "REVERSAL":     return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[8px]">🔄 Reversal</Badge>;
    case "DIVERGENCE":   return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[8px]">🔀 Diverge</Badge>;
    default:             return null;
  }
}

function scoreColor(score: number) {
  if (score >= 80) return "text-yellow-400";
  if (score >= 70) return "text-green-400";
  if (score >= 50) return "text-green-500";
  return "text-muted-foreground";
}

function rowBg(score: number, net: number) {
  if (net < 0) return "bg-red-500/5";
  if (score >= 80) return "bg-yellow-500/5";
  if (score >= 70) return "bg-green-500/5";
  if (score >= 50) return "bg-green-500/3";
  return "";
}

export default function AkTracker() {
  const { user } = useAuth();
  const { activeBrokers, ensureDefaultBroker } = useBrokerProfiles();
  const [selectedBrokerFilter, setSelectedBrokerFilter] = useState<string>("all");
  const [inputBrokerCode, setInputBrokerCode] = useState<string>("AK");

  const {
    brokerData, allBrokerData, scores, allScores, isLoading, saveData, deleteByDate,
    calculateScores, getExistingDates, getDataForDate, getScoresForDate,
    getTickerHistory, getTickerScoreHistory, getCombinedHistory,
  } = useAkTracker(selectedBrokerFilter === "all" ? undefined : selectedBrokerFilter);
  const { items: bandarItems, getLatestForDate } = useBandarmology();

  // Ensure default broker exists
  useEffect(() => {
    ensureDefaultBroker();
  }, [activeBrokers.length]);

  // Set default input broker
  useEffect(() => {
    if (activeBrokers.length > 0 && !activeBrokers.find(b => b.broker_code === inputBrokerCode)) {
      setInputBrokerCode(activeBrokers[0].broker_code);
    }
  }, [activeBrokers]);

  const [inputText, setInputText] = useState("");
  const [inputDate, setInputDate] = useState(new Date().toISOString().split("T")[0]);
  const [parsePreview, setParsePreview] = useState<ReturnType<typeof parseAkBrokerInput> | null>(null);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);

  const [filterDate, setFilterDate] = useState<string>("latest");
  const [filterNet, setFilterNet] = useState<string>("beli");
  const [minScore, setMinScore] = useState(30);
  const [filterTag, setFilterTag] = useState<string[]>([]);
  const [rollingWindow, setRollingWindow] = useState(10);
  const [searchTicker, setSearchTicker] = useState("");
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(brokerData.map(d => d.tanggal))];
    return dates.sort((a, b) => b.localeCompare(a));
  }, [brokerData]);

  const activeDate = filterDate === "latest" ? (uniqueDates[0] || "") : filterDate;

  const mergedData = useMemo(() => {
    const dataForDate = brokerData.filter(d => d.tanggal === activeDate);
    const scoresForDate = scores.filter(s => s.tanggal === activeDate);
    const scoreMap = new Map(scoresForDate.map(s => [`${s.ticker}-${s.broker_code}`, s]));
    
    const bandarForDate = getLatestForDate(activeDate);
    const bandarMap = new Map(bandarForDate.map(b => [b.ticker, b]));

    return dataForDate.map(d => ({
      ...d,
      score: scoreMap.get(`${d.ticker}-${d.broker_code}`) || null,
      bandar: bandarMap.get(d.ticker) || null,
    }));
  }, [brokerData, scores, activeDate, bandarItems, getLatestForDate]);

  const displayData = useMemo(() => {
    let data = [...mergedData];
    if (filterNet === "beli") data = data.filter(d => d.net_value > 0);
    else if (filterNet === "jual") data = data.filter(d => d.net_value < 0);
    data = data.filter(d => (d.score?.score_total ?? 0) >= minScore);
    if (filterTag.length > 0) {
      data = data.filter(d => {
        const s = d.score;
        if (!s) return false;
        if (filterTag.includes("whale") && s.tag_vs_saham === "WHALE") return true;
        if (filterTag.includes("big_accum") && s.tag_vs_saham === "BIG_ACCUM") return true;
        if (filterTag.includes("hyperaccum") && s.tag_vs_ak === "HYPERACCUM") return true;
        if (filterTag.includes("acceleration") && s.tag_vs_ak === "ACCELERATION") return true;
        if (filterTag.includes("reversal") && s.is_reversal_buy) return true;
        return false;
      });
    }
    if (searchTicker) data = data.filter(d => d.ticker.includes(searchTicker.toUpperCase()));
    data.sort((a, b) => {
      const sa = a.score?.score_total ?? 0;
      const sb = b.score?.score_total ?? 0;
      if (sa !== sb) return sb - sa;
      return b.net_value - a.net_value;
    });
    return data;
  }, [mergedData, filterNet, minScore, filterTag, searchTicker]);

  const summary = useMemo(() => {
    const all = mergedData;
    return {
      whales: all.filter(d => d.score?.tag_vs_saham === "WHALE").length,
      bigAccum: all.filter(d => d.score?.tag_vs_saham === "BIG_ACCUM").length,
      hyperaccum: all.filter(d => d.score?.tag_vs_ak === "HYPERACCUM").length,
      reversalBuy: all.filter(d => d.score?.is_reversal_buy).length,
      highScore: all.filter(d => (d.score?.score_total ?? 0) >= 70).length,
    };
  }, [mergedData]);

  const whaleAlerts = useMemo(() => {
    return mergedData
      .filter(d => d.score?.tag_vs_saham === "WHALE" || (d.score?.score_total ?? 0) >= 80)
      .sort((a, b) => (b.score?.score_total ?? 0) - (a.score?.score_total ?? 0));
  }, [mergedData]);

  // Pattern gabungan per ticker (untuk badge di main list)
  const combinedPatternMap = useMemo(() => {
    const map = new Map<string, string>();
    const uniqueTickers = [...new Set(allBrokerData.map(d => d.ticker))];
    for (const ticker of uniqueTickers) {
      const combined = getCombinedHistory(ticker);
      if (combined.length > 0) {
        map.set(ticker, combined[combined.length - 1].pattern);
      }
    }
    return map;
  }, [allBrokerData, getCombinedHistory]);

  const handleParse = () => {
    if (!inputText.trim()) {
      toast({ title: "Data kosong", variant: "destructive" });
      return;
    }
    try {
      const parsed = parseAkBrokerInput(inputText);
      if (parsed.length === 0) {
        toast({ title: "Tidak ada data terdeteksi", variant: "destructive" });
        return;
      }
      setParsePreview(parsed);
      const existingDates = getExistingDates(inputBrokerCode);
      if (existingDates.has(inputDate)) {
        setShowDuplicateDialog(true);
      }
    } catch (e: any) {
      toast({ title: "Parse error", description: e.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!parsePreview || !user) return;
    setSaving(true);
    try {
      await saveData(inputDate, parsePreview, inputBrokerCode);
      setParsePreview(null);
      setInputText("");
      setShowDuplicateDialog(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleCalcScores = async () => {
    if (!activeDate) return;
    setCalculating(true);
    try {
      const bc = selectedBrokerFilter === "all" ? undefined : selectedBrokerFilter;
      await calculateScores(activeDate, rollingWindow, bc);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setCalculating(false);
  };

  const existingDatesForInput = getExistingDates(inputBrokerCode);
  const isExistingDate = existingDatesForInput.has(inputDate);

  const tickerHistoryData = useMemo(() => {
    if (!expandedTicker) return [];
    const bc = selectedBrokerFilter === "all" ? undefined : selectedBrokerFilter;
    return getTickerHistory(expandedTicker, bc);
  }, [expandedTicker, getTickerHistory, selectedBrokerFilter]);

  const tickerScoreData = useMemo(() => {
    if (!expandedTicker) return [];
    const bc = selectedBrokerFilter === "all" ? undefined : selectedBrokerFilter;
    return getTickerScoreHistory(expandedTicker, bc);
  }, [expandedTicker, getTickerScoreHistory, selectedBrokerFilter]);

  const tickerAllBrokerHistory = useMemo(() => {
    if (!expandedTicker) return [];
    return allBrokerData.filter(d => d.ticker === expandedTicker);
  }, [expandedTicker, allBrokerData]);

  const tickerCombinedHistory = useMemo(() => {
    if (!expandedTicker) return [] as CombinedDateRow[];
    return getCombinedHistory(expandedTicker);
  }, [expandedTicker, getCombinedHistory]);

  const currentBroker = activeBrokers.find(b => b.broker_code === (selectedBrokerFilter === "all" ? "AK" : selectedBrokerFilter));
  const brokerColor = currentBroker?.color || "#00D4FF";

  return (
    <>
    <AlertDialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Data sudah ada</AlertDialogTitle>
          <AlertDialogDescription>
            Data [{inputBrokerCode}] tanggal {inputDate} sudah ada ({getDataForDate(inputDate, inputBrokerCode).length} saham). 
            Data baru akan menimpa data lama (upsert). Lanjutkan?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batalkan</AlertDialogCancel>
          <AlertDialogAction onClick={handleSave}>Timpa & Simpan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">🐋 Multi-Broker Tracker</h2>
          <p className="text-xs text-muted-foreground">Monitor akumulasi/distribusi multi-broker — deteksi whale dan confluence signal</p>
        </div>
        <div className="text-[10px] text-muted-foreground">
          {activeBrokers.length} broker aktif | {allBrokerData.length} rows | {[...new Set(allBrokerData.map(d => d.tanggal))].length} tanggal
        </div>
      </div>

      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">📊 Data & Analisa</TabsTrigger>
          <TabsTrigger value="ranking">🏆 Ranking</TabsTrigger>
          <TabsTrigger value="broker">⚙️ Broker</TabsTrigger>
        </TabsList>

        <TabsContent value="broker">
          <BrokerSetup />
        </TabsContent>

        <TabsContent value="ranking">
          <SmartMoneyRanking />
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          {/* Broker Filter Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-[10px]">Filter Broker:</Label>
            <Button
              size="sm"
              variant={selectedBrokerFilter === "all" ? "default" : "outline"}
              className="h-7 text-xs px-3"
              onClick={() => setSelectedBrokerFilter("all")}
            >
              Semua Broker
            </Button>
            {activeBrokers.map(b => (
              <Button
                key={b.broker_code}
                size="sm"
                variant={selectedBrokerFilter === b.broker_code ? "default" : "outline"}
                className="h-7 text-xs px-3"
                onClick={() => setSelectedBrokerFilter(b.broker_code)}
                style={selectedBrokerFilter === b.broker_code ? { backgroundColor: b.color, borderColor: b.color } : {}}
              >
                <span className="w-2 h-2 rounded-full mr-1.5 inline-block" style={{ backgroundColor: b.color }} />
                {b.broker_code}
              </Button>
            ))}
          </div>

          {/* Input Section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Upload className="h-4 w-4" />
                📋 Paste Data Broker
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={`Paste data broker activity...\n\nFormat:\nBUY\tB.VALUE\tB.LOT\tB.AVG\tSELL\tS.VALUE\tS.LOT\tS.AVG`}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                className="min-h-[120px] font-mono text-xs"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Broker:</Label>
                  <Select value={inputBrokerCode} onValueChange={setInputBrokerCode}>
                    <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {activeBrokers.map(b => (
                        <SelectItem key={b.broker_code} value={b.broker_code}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: b.color }} />
                            {b.broker_code}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs">📅 Tanggal:</Label>
                  <Input
                    type="date"
                    value={inputDate}
                    onChange={e => setInputDate(e.target.value)}
                    className="h-8 text-xs w-40"
                  />
                </div>
                <Button onClick={handleParse} disabled={!inputText.trim()} size="sm">
                  <TrendingUp className="h-4 w-4 mr-1" /> Parse & Preview
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setInputText(""); setParsePreview(null); }}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reset
                </Button>
              </div>

              {parsePreview && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-4 space-y-2">
                    <p className="text-sm font-semibold">Berhasil parse:</p>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>📅 Tanggal: <span className="font-bold text-foreground">{inputDate}</span> | Broker: <span className="font-bold text-foreground">{inputBrokerCode}</span></p>
                      <p>BUY: {parsePreview.filter(p => p.buy_value != null).length} saham | SELL: {parsePreview.filter(p => p.sell_value != null).length} saham</p>
                      <p className="font-semibold text-foreground">Total unik: {parsePreview.length} saham</p>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {isExistingDate ? "Timpa & Simpan" : "Simpan"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setParsePreview(null)}>Ulangi</Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Whale Alerts */}
          {whaleAlerts.length > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-400">🐋 WHALE DETECTED! ({whaleAlerts.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {whaleAlerts.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center gap-3 text-xs bg-background/50 rounded-md p-2 flex-wrap">
                    <span className="font-bold text-primary">{a.ticker}</span>
                    {selectedBrokerFilter === "all" && (
                      <Badge className="text-[8px]" style={{ backgroundColor: `${activeBrokers.find(b => b.broker_code === a.broker_code)?.color || "#00D4FF"}20`, color: activeBrokers.find(b => b.broker_code === a.broker_code)?.color || "#00D4FF" }}>
                        {a.broker_code}
                      </Badge>
                    )}
                    {tagVsSahamBadge(a.score?.tag_vs_saham || "NORMAL", a.score)}
                    {tagVsAkBadge(a.score?.tag_vs_ak || "NORMAL")}
                    <span className={cn("font-bold", a.net_value > 0 ? "text-green-400" : "text-red-400")}>
                      Net: {formatRp(a.net_value)}
                    </span>
                    {a.score && (
                      <span className="text-muted-foreground">Score: {a.score.score_total}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          {activeDate && mergedData.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <Card><CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-red-400">{summary.whales}</p>
                <p className="text-[10px] text-muted-foreground">🔴 Whale</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-orange-400">{summary.bigAccum}</p>
                <p className="text-[10px] text-muted-foreground">🟠 Big Accum</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-red-400">{summary.hyperaccum}</p>
                <p className="text-[10px] text-muted-foreground">🚀 Hyperaccum</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-blue-400">{summary.reversalBuy}</p>
                <p className="text-[10px] text-muted-foreground">🔄 Reversal Buy</p>
              </CardContent></Card>
              <Card><CardContent className="p-3 text-center">
                <p className="text-lg font-bold text-green-400">{summary.highScore}</p>
                <p className="text-[10px] text-muted-foreground">⭐ Score ≥70</p>
              </CardContent></Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterDate} onValueChange={setFilterDate}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Tanggal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">Terakhir</SelectItem>
                {uniqueDates.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterNet} onValueChange={setFilterNet}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="semua">Semua</SelectItem>
                <SelectItem value="beli">Net Beli</SelectItem>
                <SelectItem value="jual">Net Jual</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px]">Min Score:</Label>
              <Input type="number" value={minScore} onChange={e => setMinScore(Number(e.target.value))} className="h-8 text-xs w-16" min={0} max={100} />
            </div>
            <Select value={String(rollingWindow)} onValueChange={v => setRollingWindow(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5H</SelectItem>
                <SelectItem value="10">10H</SelectItem>
                <SelectItem value="20">20H</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleCalcScores} disabled={calculating || !activeDate} className="h-8 text-xs">
              {calculating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <TrendingUp className="h-3 w-3 mr-1" />}
              Hitung Score
            </Button>
            <div className="flex items-center gap-1 ml-auto">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Cari ticker..." value={searchTicker} onChange={e => setSearchTicker(e.target.value)} className="h-8 text-xs w-28" />
            </div>
          </div>

          {/* Tag filter */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { key: "whale", label: "🔴 Whale" },
              { key: "big_accum", label: "🟠 Big Accum" },
              { key: "hyperaccum", label: "🚀 Hyperaccum" },
              { key: "acceleration", label: "⚡ Acceleration" },
              { key: "reversal", label: "🔄 Reversal Buy" },
            ].map(t => (
              <label key={t.key} className="flex items-center gap-1 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterTag.includes(t.key)}
                  onChange={e => {
                    if (e.target.checked) setFilterTag(p => [...p, t.key]);
                    else setFilterTag(p => p.filter(x => x !== t.key));
                  }}
                  className="h-3 w-3"
                />
                {t.label}
              </label>
            ))}
          </div>

          {/* Main Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : displayData.length === 0 ? (
            <Card>
              <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
                {brokerData.length === 0
                  ? "Belum ada data. Paste data broker di atas untuk memulai."
                  : "Tidak ada data sesuai filter."}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-xs text-muted-foreground">
                  {activeDate} — {displayData.length} saham (filter: {selectedBrokerFilter === "all" ? "Semua" : selectedBrokerFilter})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Ticker</TableHead>
                        {selectedBrokerFilter === "all" && <TableHead className="text-[10px]">Broker</TableHead>}
                        <TableHead className="text-[10px] text-right">Buy Value</TableHead>
                        <TableHead className="text-[10px] text-right">Sell Value</TableHead>
                        <TableHead className="text-[10px] text-right">Net Value</TableHead>
                        <TableHead className="text-[10px] text-center">vs Saham</TableHead>
                        <TableHead className="text-[10px] text-center">vs AK</TableHead>
                        <TableHead className="text-[10px] text-center">Ratio</TableHead>
                        <TableHead className="text-[10px] text-center">Streak</TableHead>
                        <TableHead className="text-[10px] text-center">Rev</TableHead>
                        <TableHead className="text-[10px] text-center">Score</TableHead>
                        <TableHead className="text-[10px] text-right">Buy Avg</TableHead>
                        <TableHead className="text-[10px] text-center">Bandar</TableHead>
                        <TableHead className="text-[10px] text-center">Pattern</TableHead>
                        <TableHead className="text-[10px]">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayData.map(r => {
                        const s = r.score;
                        const scr = s?.score_total ?? 0;
                        const bColor = activeBrokers.find(b => b.broker_code === r.broker_code)?.color || "#00D4FF";
                        return (
                          <>
                            <TableRow
                              key={r.id}
                              className={cn("cursor-pointer hover:bg-muted/30", rowBg(scr, r.net_value))}
                              onClick={() => setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker)}
                            >
                              <TableCell className="font-mono font-bold text-xs text-primary">{r.ticker}</TableCell>
                              {selectedBrokerFilter === "all" && (
                                <TableCell>
                                  <Badge className="text-[8px] px-1.5 py-0" style={{ backgroundColor: `${bColor}20`, color: bColor, borderColor: `${bColor}50` }}>
                                    {r.broker_code}
                                  </Badge>
                                </TableCell>
                              )}
                              <TableCell className="text-right font-mono text-[10px] text-green-400">{formatVal(r.buy_value)}</TableCell>
                              <TableCell className="text-right font-mono text-[10px] text-red-400">{formatVal(r.sell_value)}</TableCell>
                              <TableCell className={cn("text-right font-mono text-[10px] font-bold", r.net_value > 0 ? "text-green-400" : "text-red-400")}>
                                {r.net_value > 0 ? "+" : ""}{formatVal(r.net_value)}
                              </TableCell>
                              <TableCell className="text-center">{tagVsSahamBadge(s?.tag_vs_saham || "NORMAL", s)}</TableCell>
                              <TableCell className="text-center">{tagVsAkBadge(s?.tag_vs_ak || "NORMAL")}</TableCell>
                              <TableCell className="text-center font-mono text-[10px]">{s ? `${(s.buy_vs_avg_ratio ?? 0).toFixed(1)}x` : "—"}</TableCell>
                              <TableCell className="text-center text-[10px]">
                                {s && s.streak_beli > 0 && <span className="text-green-400">↑{s.streak_beli}h</span>}
                                {s && s.streak_jual > 0 && <span className="text-red-400">↓{s.streak_jual}h</span>}
                                {(!s || (s.streak_beli === 0 && s.streak_jual === 0)) && "—"}
                              </TableCell>
                              <TableCell className="text-center text-[10px]">
                                {s?.is_reversal_buy && <span className="text-blue-400">🔄</span>}
                                {s?.is_reversal_sell && <span className="text-red-400">🔄</span>}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center gap-1">
                                  <Progress value={scr} className="h-1.5 w-12" />
                                  <span className={cn("text-[10px] font-bold", scoreColor(scr))}>{scr}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-mono text-[10px]">{r.buy_avg ? r.buy_avg.toLocaleString("id-ID") : "—"}</TableCell>
                              <TableCell className="text-center">
                                {r.bandar ? (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[8px]">🎯 T{r.bandar.tier}</Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs">Bandar Tier {r.bandar.tier} | Rank #{r.bandar.rank_score}</TooltipContent>
                                  </Tooltip>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="text-center">
                                {patternBadge(combinedPatternMap.get(r.ticker) ?? "NORMAL")}
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={e => { e.stopPropagation(); setExpandedTicker(expandedTicker === r.ticker ? null : r.ticker); }}>📈</Button>
                              </TableCell>
                            </TableRow>
                            {expandedTicker === r.ticker && (
                              <TableRow key={`${r.id}-expand`}>
                                <TableCell colSpan={selectedBrokerFilter === "all" ? 15 : 14} className="p-0">
                                  <TickerDetail ticker={r.ticker} history={tickerHistoryData} scoreHistory={tickerScoreData} bandarItems={bandarItems} brokerColor={brokerColor} allBrokerHistory={tickerAllBrokerHistory} combinedHistory={tickerCombinedHistory} activeBrokers={activeBrokers} />
                                </TableCell>
                              </TableRow>
                            )}
                          </>
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
    </>
  );
}

const BROKER_LINE_COLORS = ["#3B82F6", "#F59E0B", "#A855F7", "#F97316", "#EF4444", "#10B981"];

function OverlayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const cumNet = payload.find((p: any) => p.dataKey === "cumNet");
  const avgBuy = payload.find((p: any) => p.dataKey === "avgBuy");
  const close = payload.find((p: any) => p.dataKey === "close");
  const avgVal = avgBuy?.value;
  const closeVal = close?.value;
  let diffPct = null;
  if (avgVal && closeVal && avgVal > 0) {
    diffPct = ((closeVal - avgVal) / avgVal) * 100;
  }
  return (
    <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
      <p className="font-bold text-foreground mb-1">{label}</p>
      {cumNet && <p style={{ color: "#00FF88" }}>Cum Net: {cumNet.value > 0 ? "+" : ""}{cumNet.value.toFixed(2)}B</p>}
      {avgBuy && avgVal != null && <p style={{ color: "#FFD700" }}>Avg Buy: Rp {avgVal.toLocaleString("id-ID")}</p>}
      {close && closeVal != null && <p style={{ color: "#FFFFFF" }}>Close: Rp {closeVal.toLocaleString("id-ID")}</p>}
      {diffPct != null && <p className={diffPct >= 0 ? "text-green-400" : "text-red-400"}>Selisih: {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%</p>}
    </div>
  );
}

function TickerDetail({ ticker, history, scoreHistory, bandarItems, brokerColor, allBrokerHistory, combinedHistory, activeBrokers }: {
  ticker: string;
  history: any[];
  scoreHistory: any[];
  bandarItems: any[];
  brokerColor: string;
  allBrokerHistory: any[];
  combinedHistory: CombinedDateRow[];
  activeBrokers: any[];
}) {
  const [priceData, setPriceData] = useState<Record<string, number>>({});
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [viewMode, setViewMode] = useState<"gabungan" | "perbroker">("gabungan");
  const [periodFilter, setPeriodFilter] = useState<"5H" | "10H" | "20H" | "custom" | null>(null);
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [activeLines, setActiveLines] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (history.length === 0) return;
    let cancelled = false;
    setLoadingPrice(true);
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("yahoo-finance-ohlcv", { body: { ticker, count: 500 } });
        if (cancelled) return;
        if (data?.candles) {
          const map: Record<string, number> = {};
          for (const c of data.candles) {
            const d = new Date(c.time * 1000).toISOString().split("T")[0];
            map[d] = c.close;
          }
          setPriceData(map);
        }
      } catch {}
      if (!cancelled) setLoadingPrice(false);
    })();
    return () => { cancelled = true; };
  }, [ticker, history.length]);

  if (history.length === 0) {
    return <div className="p-4 text-xs text-muted-foreground">Belum ada riwayat untuk {ticker}</div>;
  }

  // Period filter helper — applied to chart + table only, not to stats
  const applyPeriodFilter = <T extends { tanggal: string }>(data: T[]): T[] => {
    if (!periodFilter) return data;
    if (periodFilter === "custom") {
      if (!customFrom && !customTo) return data;
      return data.filter(r =>
        (!customFrom || r.tanggal >= customFrom) &&
        (!customTo || r.tanggal <= customTo)
      );
    }
    const n = periodFilter === "5H" ? 5 : periodFilter === "10H" ? 10 : 20;
    const uniqueDates = [...new Set(data.map(r => r.tanggal))].sort();
    if (uniqueDates.length <= n) return data;
    const cutoff = uniqueDates[uniqueDates.length - n];
    return data.filter(r => r.tanggal >= cutoff);
  };

  const filteredHistory = applyPeriodFilter(history);
  const filteredCombinedRows = [...applyPeriodFilter(combinedHistory)].reverse();

  const chartData = filteredHistory.map((h: any) => ({
    date: h.tanggal.slice(5),
    buy: (h.buy_value ?? 0) / 1e9,
    sell: -((h.sell_value ?? 0) / 1e9),
    net: h.net_value / 1e9,
  }));

  let cumNet = 0;
  const filteredOverlayData = filteredHistory.map((h: any) => {
    cumNet += h.net_value;
    return {
      date: h.tanggal.slice(5),
      cumNet: cumNet / 1e9,
      avgBuy: h.buy_avg ?? null,
      close: priceData[h.tanggal] ?? null,
    };
  });

  // Unfiltered overlay — used only for lastEntry/insightText (full history)
  let cumNetFull = 0;
  const overlayDataFull = history.map((h: any) => {
    cumNetFull += h.net_value;
    return {
      date: h.tanggal.slice(5),
      cumNet: cumNetFull / 1e9,
      avgBuy: h.buy_avg ?? null,
      close: priceData[h.tanggal] ?? null,
    };
  });

  const lastEntry = overlayDataFull[overlayDataFull.length - 1];
  let insightText = "";
  let insightColor = "text-muted-foreground";
  if (lastEntry?.avgBuy && lastEntry?.close) {
    const pct = ((lastEntry.close - lastEntry.avgBuy) / lastEntry.avgBuy) * 100;
    if (Math.abs(pct) <= 2) {
      insightText = `⚠️ Harga mendekati avg buy (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
      insightColor = "text-yellow-400";
    } else if (pct > 0) {
      insightText = `✅ Profit +${pct.toFixed(1)}% — waspadai distribusi`;
      insightColor = "text-green-400";
    } else {
      insightText = `⏳ Rugi ${pct.toFixed(1)}% — belum distribusi`;
      insightColor = "text-blue-400";
    }
  }

  const totalDays = history.length;
  const netBuyDays = history.filter((h: any) => h.net_value > 0).length;
  const totalCumNet = history.reduce((s: number, h: any) => s + h.net_value, 0);

  const formatVal = (v: number | null) => {
    if (v == null) return "—";
    const abs = Math.abs(v);
    if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toLocaleString("id-ID");
  };

  // Kolom broker dinamis dari allBrokerHistory
  const brokerCodes = [...new Set(allBrokerHistory.map((r: any) => r.broker_code as string))].sort();

  // Line helpers
  const isLineActive = (bc: string) => activeLines[bc] !== false;
  const getBrokerLineColor = (bc: string, idx: number): string =>
    activeBrokers.find((b: any) => b.broker_code === bc)?.color
    ?? BROKER_LINE_COLORS[idx % BROKER_LINE_COLORS.length];

  // Enhanced chart data: one entry per date, combined buy/sell bars + per-broker cumulative net lines
  const filteredAllBroker = applyPeriodFilter(allBrokerHistory);
  const allFilteredDates = [...new Set(filteredAllBroker.map((r: any) => r.tanggal as string))].sort();
  const _brokerCumAcc: Record<string, number> = {};
  const enhancedChartData = allFilteredDates.map(date => {
    const dateRows = filteredAllBroker.filter((r: any) => r.tanggal === date);
    const entry: Record<string, any> = {
      date: date.slice(5),
      buy: dateRows.reduce((s: number, r: any) => s + (r.buy_value ?? 0), 0) / 1e9,
      sell: -(dateRows.reduce((s: number, r: any) => s + (r.sell_value ?? 0), 0) / 1e9),
    };
    for (const bc of brokerCodes) {
      const row = dateRows.find((r: any) => r.broker_code === bc);
      if (row) _brokerCumAcc[bc] = (_brokerCumAcc[bc] ?? 0) + row.net_value;
      entry[`cum_${bc}`] = (_brokerCumAcc[bc] ?? 0) / 1e9;
    }
    return entry;
  });

  return (
    <div className="p-4 space-y-4 bg-muted/10 border-t border-border/30">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-primary">{ticker} — Riwayat</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {([null, "5H", "10H", "20H"] as const).map(p => (
              <Button
                key={p ?? "all"}
                size="sm"
                variant={periodFilter === p ? "default" : "outline"}
                className="h-7 text-[10px] px-2"
                onClick={() => setPeriodFilter(p)}
              >{p ?? "All"}</Button>
            ))}
            <Button
              size="sm"
              variant={periodFilter === "custom" ? "default" : "outline"}
              className="h-7 text-[10px] px-2"
              onClick={() => setPeriodFilter("custom")}
            >Custom</Button>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={viewMode === "gabungan" ? "default" : "outline"}
              className="h-7 text-[10px] px-3"
              onClick={() => setViewMode("gabungan")}
            >Gabungan</Button>
            <Button
              size="sm"
              variant={viewMode === "perbroker" ? "default" : "outline"}
              className="h-7 text-[10px] px-3"
              onClick={() => setViewMode("perbroker")}
            >Per Broker</Button>
          </div>
        </div>
      </div>

      {periodFilter === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-muted-foreground">Dari:</span>
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-[10px] text-foreground"
          />
          <span className="text-[10px] text-muted-foreground">Sampai:</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-[10px] text-foreground"
          />
        </div>
      )}

      {/* === COMBINED VIEW === */}
      {viewMode === "gabungan" && (
        filteredCombinedRows.length === 0 ? (
          <div className="text-xs text-muted-foreground">Belum ada data gabungan untuk {ticker}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Tanggal</TableHead>
                  {brokerCodes.map(bc => (
                    <TableHead key={bc} className="text-[10px] text-right">{bc} Net</TableHead>
                  ))}
                  <TableHead className="text-[10px] text-right font-semibold">Combined Net</TableHead>
                  <TableHead className="text-[10px] text-center">Pattern</TableHead>
                  <TableHead className="text-[10px] text-center">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCombinedRows.map(r => {
                  const patternEl = r.combinedNet > 0
                    ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[8px]">Akumulasi</Badge>
                    : r.combinedNet < 0
                    ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[8px]">Distribusi</Badge>
                    : <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-[8px]">Neutral</Badge>;
                  return (
                    <TableRow key={r.tanggal} className={r.combinedNet < 0 ? "bg-red-500/5" : r.hasDivergence ? "bg-orange-500/5" : ""}>
                      <TableCell className="font-mono text-[10px]">{r.tanggal.slice(5)}</TableCell>
                      {brokerCodes.map(bc => {
                        const val = r.brokerBreakdown[bc];
                        const bColor = activeBrokers.find((b: any) => b.broker_code === bc)?.color;
                        return (
                          <TableCell key={bc} className={cn(
                            "text-right font-mono text-[10px]",
                            val == null ? "text-muted-foreground"
                              : val > 0 ? "text-green-400"
                              : val < 0 ? "text-red-400"
                              : "text-muted-foreground"
                          )} style={bColor && val != null ? { color: val > 0 ? bColor : undefined } : undefined}>
                            {val != null ? `${val > 0 ? "+" : ""}${formatVal(val)}` : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className={cn(
                        "text-right font-mono text-[10px] font-bold",
                        r.combinedNet > 0 ? "text-green-400" : r.combinedNet < 0 ? "text-red-400" : "text-muted-foreground"
                      )}>
                        {r.combinedNet > 0 ? "+" : ""}{formatVal(r.combinedNet)}
                      </TableCell>
                      <TableCell className="text-center">{patternEl}</TableCell>
                      <TableCell className="text-center text-[10px]">
                        {r.hasDivergence && <span title="Broker berbeda arah">⚠️</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )
      )}

      {/* === PER BROKER VIEW (existing charts) === */}
      {viewMode === "perbroker" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">Buy vs Sell + Cum Net Broker (Miliar)</p>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={enhancedChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                    <RechartsTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10 }} />
                    <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Bar dataKey="buy" fill="hsl(142 76% 36%)" name="Buy" />
                    <Bar dataKey="sell" fill="hsl(0 84% 60%)" name="Sell" />
                    {brokerCodes.map((bc, idx) =>
                      isLineActive(bc) ? (
                        <Line
                          key={bc}
                          type="monotone"
                          dataKey={`cum_${bc}`}
                          stroke={getBrokerLineColor(bc, idx)}
                          strokeWidth={1.5}
                          dot={false}
                          name={`${bc} Cum`}
                          connectNulls
                        />
                      ) : null
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {brokerCodes.length > 0 && (
                <div className="flex items-center gap-3 flex-wrap mt-1.5">
                  <span className="text-[10px] text-muted-foreground">Lines:</span>
                  {brokerCodes.map((bc, idx) => {
                    const color = getBrokerLineColor(bc, idx);
                    return (
                      <label key={bc} className="flex items-center gap-1 text-[10px] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isLineActive(bc)}
                          onChange={e => setActiveLines(prev => ({ ...prev, [bc]: e.target.checked }))}
                          className="h-3 w-3"
                        />
                        <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
                        <span style={{ color }}>{bc}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">
                Cum Net + Avg Buy + Close {loadingPrice && <Loader2 className="h-3 w-3 inline ml-1 animate-spin" />}
              </p>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={filteredOverlayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "#00FF88" }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "#FFD700" }} />
                    <RechartsTooltip content={<OverlayTooltip />} />
                    <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                    <Line yAxisId="left" type="monotone" dataKey="cumNet" stroke="#00FF88" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="avgBuy" stroke="#FFD700" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="close" stroke="#FFFFFF" strokeWidth={1.5} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {insightText && <div className={cn("text-[10px] mt-1 p-1.5 rounded bg-muted/30", insightColor)}>{insightText}</div>}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><span className="text-muted-foreground">Total hari:</span> <span className="font-bold">{totalDays}</span></div>
            <div><span className="text-muted-foreground">Net beli:</span> <span className="font-bold text-green-400">{netBuyDays} ({totalDays > 0 ? Math.round(netBuyDays / totalDays * 100) : 0}%)</span></div>
            <div><span className="text-muted-foreground">Cum net:</span> <span className={cn("font-bold", totalCumNet > 0 ? "text-green-400" : "text-red-400")}>{formatVal(totalCumNet)}</span></div>
          </div>
          <div className="text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1">
            Data tersedia: {history.map((h: any) => {
              const d = new Date(h.tanggal + "T00:00:00");
              return `${d.getDate()} ${["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][d.getMonth()]}`;
            }).join(" | ")} ({history.length} hari)
          </div>
          {history.length < 3 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-2 text-xs text-yellow-400">
              ⚠️ Data terbatas ({history.length} hari) — benchmark kurang akurat
            </div>
          )}
        </>
      )}
    </div>
  );
}
