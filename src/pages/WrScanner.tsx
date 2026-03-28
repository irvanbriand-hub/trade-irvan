import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  CalendarIcon, Loader2, PlayCircle, Filter, Star, Trash2,
  TrendingUp, TrendingDown, Clock, BarChart3, Pencil, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  useWrScanner,
  useUpdateWrScannerBacktest,
  useDeleteWrScanner,
  type WrScannerItem,
} from "@/hooks/useWrScanner";
import { useWatchlistRekomendasi } from "@/hooks/useWatchlistRekomendasi";
import { useCategories } from "@/hooks/useCategories";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { WrScannerCalendar } from "@/components/WrScannerCalendar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import CombinationAnalysis from "@/components/CombinationAnalysis";
import WlAnalysis from "@/components/WlAnalysis";
import ParameterCorrelation from "@/components/ParameterCorrelation";

export default function WrScanner() {
  const { data: wrItems = [], isLoading } = useWrScanner();
  const { data: wlItems = [] } = useWatchlistRekomendasi();
  const { data: categories = [] } = useCategories();
  const updateBacktest = useUpdateWrScannerBacktest();
  const deleteMutation = useDeleteWrScanner();

  // Filters
  const [filterDate, setFilterDate] = useState<string>("");
  const [filterScreener, setFilterScreener] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("OPEN");
  const [showWlOnly, setShowWlOnly] = useState(false);
  const [selectedScreenerCard, setSelectedScreenerCard] = useState<string | null>(null);

  // Backtest modal
  const [backtestOpen, setBacktestOpen] = useState(false);
  const [backtestDate, setBacktestDate] = useState<Date>(new Date());
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestProgress, setBacktestProgress] = useState(0);
  const [backtestCounter, setBacktestCounter] = useState("");
  const [backtestSummary, setBacktestSummary] = useState<{
    total: number; win: number; lose: number; failed: number; date: string;
  } | null>(null);

  // Edit single row
  const [editItem, setEditItem] = useState<WrScannerItem | null>(null);
  const [editImportDate, setEditImportDate] = useState<Date>(new Date());
  const [editBacktestDate, setEditBacktestDate] = useState<Date>(new Date());
  const [isEditRecalc, setIsEditRecalc] = useState(false);

  // Bulk edit
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkFromDate, setBulkFromDate] = useState<Date>(new Date());
  const [bulkToDate, setBulkToDate] = useState<Date>(new Date());
  const [bulkBacktestDate, setBulkBacktestDate] = useState<Date>(new Date());
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkCounter, setBulkCounter] = useState("");

  // WL ticker map
  const wlTickerSet = useMemo(() => new Set(wlItems.map(w => w.ticker)), [wlItems]);
  const wlTickerCatMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const w of wlItems) {
      const catName = w.category_id ? categories.find(c => c.id === w.category_id)?.name || "WL" : "WL";
      map[w.ticker] = catName;
    }
    return map;
  }, [wlItems, categories]);

  // All unique screener names from data
  const allScreeners = useMemo(() => {
    const set = new Set<string>();
    for (const item of wrItems) {
      for (const s of item.screener_names) set.add(s);
    }
    return Array.from(set).sort();
  }, [wrItems]);

  // All unique import dates
  const allDates = useMemo(() => {
    const set = new Set<string>();
    for (const item of wrItems) set.add(item.tanggal_import);
    return Array.from(set).sort().reverse();
  }, [wrItems]);

  // Filtered data
  const filteredData = useMemo(() => {
    let data = wrItems;
    if (filterDate) data = data.filter(d => d.tanggal_import === filterDate);
    if (filterScreener !== "all") data = data.filter(d => d.screener_names.includes(filterScreener));
    if (selectedScreenerCard) data = data.filter(d => 
      selectedScreenerCard === "__overall__" ? d.status !== "OPEN" : d.screener_names.includes(selectedScreenerCard)
    );
    if (filterStatus !== "all") data = data.filter(d => d.status === filterStatus);
    if (showWlOnly) data = data.filter(d => wlTickerSet.has(d.ticker));
    return data;
  }, [wrItems, filterDate, filterScreener, filterStatus, showWlOnly, wlTickerSet, selectedScreenerCard]);

  // === BACKTEST ===
  const handleBacktest = async () => {
    const openItems = wrItems.filter(d => d.status === "OPEN");
    if (openItems.length === 0) {
      toast({ title: "Tidak ada data OPEN", description: "Semua data sudah di-backtest", variant: "destructive" });
      return;
    }

    setIsBacktesting(true);
    setBacktestProgress(0);
    setBacktestCounter(`Memproses 0 dari ${openItems.length} saham...`);
    setBacktestOpen(false);

    const dateStr = format(backtestDate, "yyyy-MM-dd");
    const tickers = openItems.map(d => d.ticker);

    // Build importDates map: ticker -> tanggal_import
    const importDates: Record<string, string> = {};
    for (const item of openItems) {
      importDates[item.ticker] = item.tanggal_import;
    }

    try {
      // Fetch in batches of 20
      const BATCH = 20;
      const allResults: Record<string, { close_import: number | null; high: number | null; status?: string; message?: string; next_trading_day?: string | null; error?: string }> = {};
      
      for (let i = 0; i < tickers.length; i += BATCH) {
        const batch = tickers.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("yahoo-finance-backtest", {
          body: { tickers: batch, backtestDate: dateStr, importDates },
        });
        if (error) throw error;
        if (data?.results) {
          Object.assign(allResults, data.results);
        }
        const processed = Math.min(i + BATCH, tickers.length);
        setBacktestProgress(Math.round((processed / tickers.length) * 100));
        setBacktestCounter(`Memproses ${processed} dari ${tickers.length} saham...`);
      }

      // Process results
      const updates: Parameters<typeof updateBacktest.mutateAsync>[0] = [];
      let winCount = 0, loseCount = 0, failedCount = 0, pendingCount = 0;

      for (const item of openItems) {
        const result = allResults[item.ticker];
        if (!result) {
          failedCount++;
          updates.push({
            id: item.id, close_import: null, high_price: null,
            pct_open_to_high: null, result: null, status: "OPEN",
            tanggal_backtest: dateStr, notes: "Gagal fetch data",
          });
          continue;
        }

        // Handle PENDING and MARKET_OPEN statuses
        if (result.status === 'PENDING' || result.status === 'MARKET_OPEN') {
          pendingCount++;
          const statusLabel = result.status === 'MARKET_OPEN' ? '🔄 MARKET OPEN' : '⏳ PENDING';
          updates.push({
            id: item.id,
            close_import: result.close_import,
            high_price: null,
            pct_open_to_high: null,
            result: null,
            status: "OPEN",
            tanggal_backtest: dateStr,
            notes: `${statusLabel}: ${result.message || 'Menunggu data'}`,
          });
          continue;
        }

        if (result.close_import == null || result.high == null) {
          failedCount++;
          updates.push({
            id: item.id, close_import: null, high_price: null,
            pct_open_to_high: null, result: null, status: "OPEN",
            tanggal_backtest: dateStr, notes: "Gagal fetch data",
          });
          continue;
        }

        const pct = ((result.high - result.close_import) / result.close_import) * 100;
        const isWin = result.high >= result.close_import * 1.02;

        if (isWin) winCount++;
        else loseCount++;

        updates.push({
          id: item.id,
          close_import: result.close_import,
          high_price: result.high,
          pct_open_to_high: Math.round(pct * 100) / 100,
          result: isWin ? "WIN" : "LOSE",
          status: isWin ? "WIN" : "LOSE",
          tanggal_backtest: dateStr,
          notes: null,
        });
      }

      await updateBacktest.mutateAsync(updates);

      const pendingMsg = pendingCount > 0 ? ` | ${pendingCount} pending (market belum close)` : "";
      setBacktestSummary({
        total: openItems.length,
        win: winCount,
        lose: loseCount,
        failed: failedCount,
        date: dateStr + pendingMsg,
      });
    } catch (e: any) {
      toast({ title: "Error backtest", description: e.message, variant: "destructive" });
    } finally {
      setIsBacktesting(false);
      setBacktestProgress(0);
      setBacktestCounter("");
    }
  };

  // === EDIT SINGLE ROW & RECALCULATE ===
  const handleEditRecalc = async () => {
    if (!editItem) return;
    setIsEditRecalc(true);
    const newImport = format(editImportDate, "yyyy-MM-dd");
    const newBacktest = format(editBacktestDate, "yyyy-MM-dd");

    try {
      const { data, error } = await supabase.functions.invoke("yahoo-finance-backtest", {
        body: {
          tickers: [editItem.ticker],
          backtestDate: newBacktest,
          importDates: { [editItem.ticker]: newImport },
        },
      });
      if (error) throw error;

      const result = data?.results?.[editItem.ticker];
      if (!result || result.close_import == null || result.high == null) {
        toast({ title: "Gagal fetch data", description: result?.error || "Data tidak tersedia", variant: "destructive" });
        setIsEditRecalc(false);
        return;
      }

      const pct = ((result.high - result.close_import) / result.close_import) * 100;
      const isWin = result.high >= result.close_import * 1.02;

      const { error: updateError } = await supabase
        .from("wr_scanner" as any)
        .update({
          tanggal_import: newImport,
          tanggal_backtest: newBacktest,
          close_import: result.close_import,
          high_price: result.high,
          pct_open_to_high: Math.round(pct * 100) / 100,
          result: isWin ? "WIN" : "LOSE",
          status: isWin ? "WIN" : "LOSE",
        } as any)
        .eq("id", editItem.id);
      if (updateError) throw updateError;

      toast({ title: `${editItem.ticker} diupdate`, description: `Close Import: ${result.close_import}, High: ${result.high}, ${isWin ? "WIN" : "LOSE"}` });
      setEditItem(null);
      // Refresh data
      await updateBacktest.mutateAsync([{
        id: editItem.id,
        close_import: result.close_import,
        high_price: result.high,
        pct_open_to_high: Math.round(pct * 100) / 100,
        result: isWin ? "WIN" : "LOSE",
        status: isWin ? "WIN" : "LOSE",
        tanggal_backtest: newBacktest,
      }]);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsEditRecalc(false);
    }
  };

  // === BULK EDIT ===
  const handleBulkEdit = async () => {
    const fromStr = format(bulkFromDate, "yyyy-MM-dd");
    const toStr = format(bulkToDate, "yyyy-MM-dd");
    const btStr = format(bulkBacktestDate, "yyyy-MM-dd");

    const matchingItems = wrItems.filter(d => d.tanggal_import === fromStr);
    if (matchingItems.length === 0) {
      toast({ title: "Tidak ada data", description: `Tidak ada data dengan tanggal import ${fromStr}`, variant: "destructive" });
      return;
    }

    setIsBulkEditing(true);
    setBulkProgress(0);
    setBulkCounter(`Memproses 0 dari ${matchingItems.length} saham...`);
    setBulkEditOpen(false);

    try {
      const tickers = matchingItems.map(d => d.ticker);
      const importDates: Record<string, string> = {};
      for (const t of tickers) importDates[t] = toStr;

      // Fetch in batches of 20
      const BATCH = 20;
      const allResults: Record<string, { close_import: number | null; high: number | null; error?: string }> = {};

      for (let i = 0; i < tickers.length; i += BATCH) {
        const batch = tickers.slice(i, i + BATCH);
        const { data, error } = await supabase.functions.invoke("yahoo-finance-backtest", {
          body: { tickers: batch, backtestDate: btStr, importDates },
        });
        if (error) throw error;
        if (data?.results) Object.assign(allResults, data.results);
        const processed = Math.min(i + BATCH, tickers.length);
        setBulkProgress(Math.round((processed / tickers.length) * 100));
        setBulkCounter(`Memproses ${processed} dari ${tickers.length} saham...`);
      }

      // Update each item
      const updates: Parameters<typeof updateBacktest.mutateAsync>[0] = [];
      let winCount = 0, loseCount = 0, failedCount = 0;

      for (const item of matchingItems) {
        const r = allResults[item.ticker];
        // Update tanggal_import first
        await supabase.from("wr_scanner" as any).update({ tanggal_import: toStr } as any).eq("id", item.id);

        if (!r || r.close_import == null || r.high == null) {
          failedCount++;
          updates.push({
            id: item.id, close_import: null, high_price: null,
            pct_open_to_high: null, result: null, status: "OPEN",
            tanggal_backtest: btStr, notes: "Gagal fetch data",
          });
          continue;
        }

        const pct = ((r.high - r.close_import) / r.close_import) * 100;
        const isWin = r.high >= r.close_import * 1.02;
        if (isWin) winCount++; else loseCount++;

        updates.push({
          id: item.id, close_import: r.close_import, high_price: r.high,
          pct_open_to_high: Math.round(pct * 100) / 100,
          result: isWin ? "WIN" : "LOSE", status: isWin ? "WIN" : "LOSE",
          tanggal_backtest: btStr, notes: null,
        });
      }

      await updateBacktest.mutateAsync(updates);

      setBacktestSummary({
        total: matchingItems.length, win: winCount, lose: loseCount,
        failed: failedCount, date: `${fromStr} → ${toStr} (BT: ${btStr})`,
      });
    } catch (e: any) {
      toast({ title: "Error bulk edit", description: e.message, variant: "destructive" });
    } finally {
      setIsBulkEditing(false);
      setBulkProgress(0);
      setBulkCounter("");
    }
  };

  // === STATISTICS ===
  const screenerStats = useMemo(() => {
    const stats: Record<string, { name: string; total: number; win: number; lose: number; winPcts: number[]; equityCurve: number[] }> = {};

    // Overall
    stats["__overall__"] = { name: "Overall", total: 0, win: 0, lose: 0, winPcts: [], equityCurve: [] };

    for (const item of wrItems) {
      if (item.status === "OPEN") continue;

      // Overall
      stats["__overall__"].total++;
      if (item.result === "WIN") {
        stats["__overall__"].win++;
        if (item.pct_open_to_high != null) stats["__overall__"].winPcts.push(item.pct_open_to_high);
      } else {
        stats["__overall__"].lose++;
      }
      const lastOverall = stats["__overall__"].equityCurve;
      const prevOverall = lastOverall.length > 0 ? lastOverall[lastOverall.length - 1] : 0;
      lastOverall.push(prevOverall + (item.result === "WIN" ? 1 : -1));

      // Per screener
      for (const s of item.screener_names) {
        if (!stats[s]) stats[s] = { name: s, total: 0, win: 0, lose: 0, winPcts: [], equityCurve: [] };
        stats[s].total++;
        if (item.result === "WIN") {
          stats[s].win++;
          if (item.pct_open_to_high != null) stats[s].winPcts.push(item.pct_open_to_high);
        } else {
          stats[s].lose++;
        }
        const last = stats[s].equityCurve;
        const prev = last.length > 0 ? last[last.length - 1] : 0;
        last.push(prev + (item.result === "WIN" ? 1 : -1));
      }
    }

    return stats;
  }, [wrItems]);

  const formatNum = (n: number) => n.toLocaleString("id-ID");

  const resultBadge = (status: string, notes?: string | null) => {
    if (status === "WIN") return <Badge className="bg-gain/20 text-gain border-gain/30 text-[10px]">✅ WIN</Badge>;
    if (status === "LOSE") return <Badge className="bg-loss/20 text-loss border-loss/30 text-[10px]">❌ LOSE</Badge>;
    if (notes?.includes("PENDING")) return <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-600">⏳ PENDING</Badge>;
    if (notes?.includes("MARKET OPEN")) return <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-600">🔄 MARKET OPEN</Badge>;
    return <Badge variant="secondary" className="text-[10px]">⚪ OPEN</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">Data WR Scanner</h1>
        <Button onClick={() => setBacktestOpen(true)} disabled={isBacktesting || isBulkEditing} size="sm">
          <PlayCircle className="h-4 w-4 mr-2" />
          Backtest Open
        </Button>
        <Button onClick={() => setBulkEditOpen(true)} disabled={isBacktesting || isBulkEditing} size="sm" variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Bulk Edit Tanggal
        </Button>
      </div>

      {/* Backtest Progress */}
      {isBacktesting && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">{backtestCounter}</span>
          </div>
          <Progress value={backtestProgress} className="h-2" />
        </div>
      )}

      {/* Bulk Edit Progress */}
      {isBulkEditing && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">{bulkCounter}</span>
          </div>
          <Progress value={bulkProgress} className="h-2" />
        </div>
      )}

      {/* Backtest Date Picker Modal */}
      <Dialog open={backtestOpen} onOpenChange={setBacktestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih Tanggal Backtest</DialogTitle>
            <DialogDescription>
              Pilih tanggal trading untuk mengambil data Open & High price dari Yahoo Finance.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={backtestDate}
              onSelect={(d) => d && setBacktestDate(d)}
              className="p-3 pointer-events-auto"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBacktestOpen(false)}>Batal</Button>
            <Button onClick={handleBacktest}>Start Backtest</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backtest Summary */}
      <Dialog open={!!backtestSummary} onOpenChange={() => setBacktestSummary(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Backtest Selesai!</DialogTitle>
          </DialogHeader>
          {backtestSummary && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-muted-foreground">Tanggal: <span className="text-foreground font-mono">{backtestSummary.date}</span></p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{backtestSummary.total}</p>
                  <p className="text-xs text-muted-foreground">Total Diproses</p>
                </div>
                <div className="rounded-lg bg-gain/10 p-3 text-center">
                  <p className="text-2xl font-bold text-gain">{backtestSummary.win}</p>
                  <p className="text-xs text-muted-foreground">WIN</p>
                </div>
                <div className="rounded-lg bg-loss/10 p-3 text-center">
                  <p className="text-2xl font-bold text-loss">{backtestSummary.lose}</p>
                  <p className="text-xs text-muted-foreground">LOSE</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{backtestSummary.failed}</p>
                  <p className="text-xs text-muted-foreground">Gagal Fetch</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setBacktestSummary(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Edit Tanggal Import</DialogTitle>
            <DialogDescription>
              Ubah tanggal import untuk semua data dalam satu tanggal sekaligus, lalu recalculate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Ubah semua data dengan tanggal import:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(bulkFromDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={bulkFromDate} onSelect={(d) => d && setBulkFromDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Menjadi tanggal import:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(bulkToDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={bulkToDate} onSelect={(d) => d && setBulkToDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tanggal Backtest:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(bulkBacktestDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={bulkBacktestDate} onSelect={(d) => d && setBulkBacktestDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">
              {wrItems.filter(d => d.tanggal_import === format(bulkFromDate, "yyyy-MM-dd")).length} data akan diupdate
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)}>Batal</Button>
            <Button onClick={handleBulkEdit}>Konfirmasi & Recalculate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Single Row Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editItem?.ticker}</DialogTitle>
            <DialogDescription>
              Ubah tanggal import & backtest, lalu recalculate dari Yahoo Finance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tanggal Import:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(editImportDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editImportDate} onSelect={(d) => d && setEditImportDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tanggal Backtest:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(editBacktestDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editBacktestDate} onSelect={(d) => d && setEditBacktestDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)} disabled={isEditRecalc}>Batal</Button>
            <Button onClick={handleEditRecalc} disabled={isEditRecalc}>
              {isEditRecalc && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan & Recalculate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TABS */}
      <Tabs defaultValue="data" className="space-y-6">
        <TabsList>
          <TabsTrigger value="data">Data Scanner</TabsTrigger>
          <TabsTrigger value="kombinasi">Kombinasi Screener</TabsTrigger>
          <TabsTrigger value="korelasi-param">Korelasi Parameter</TabsTrigger>
          <TabsTrigger value="wl-analisis">Analisis WL Rekomendasi</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-6">
          {/* WR Scanner Calendar */}
          <WrScannerCalendar data={wrItems} />

          {/* STATISTICS SECTION - Clickable cards */}
          {Object.keys(screenerStats).length > 0 && wrItems.some(d => d.status !== "OPEN") && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" /> Statistik WR Per Screener
                </h2>
                {selectedScreenerCard && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedScreenerCard(null)}>
                    ✕ Reset Filter
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {screenerStats["__overall__"] && (
                  <StatCard
                    key="__overall__"
                    stat={screenerStats["__overall__"]}
                    isOverall
                    isSelected={selectedScreenerCard === "__overall__"}
                    onClick={() => setSelectedScreenerCard(selectedScreenerCard === "__overall__" ? null : "__overall__")}
                  />
                )}
                {Object.entries(screenerStats)
                  .filter(([k]) => k !== "__overall__")
                  .sort(([, a], [, b]) => b.total - a.total)
                  .map(([key, stat]) => (
                    <StatCard
                      key={key}
                      stat={stat}
                      isSelected={selectedScreenerCard === key}
                      onClick={() => setSelectedScreenerCard(selectedScreenerCard === key ? null : key)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
            </div>
            <Select value={filterDate || "all"} onValueChange={(v) => setFilterDate(v === "all" ? "" : v)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Tanggal Import" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tanggal</SelectItem>
                {allDates.map(d => (
                  <SelectItem key={d} value={d}>{format(new Date(d), "dd/MM/yyyy")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterScreener} onValueChange={setFilterScreener}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue placeholder="Screener" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Screener</SelectItem>
                {allScreeners.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="OPEN">OPEN</SelectItem>
                <SelectItem value="WIN">WIN</SelectItem>
                <SelectItem value="LOSE">LOSE</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="wr-wl-filter" checked={showWlOnly} onCheckedChange={setShowWlOnly} />
              <Label htmlFor="wr-wl-filter" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                <Star className="h-3 w-3" /> Hanya WL
              </Label>
            </div>
            {selectedScreenerCard && (
              <Badge variant="secondary" className="text-xs">
                📊 {selectedScreenerCard === "__overall__" ? "Overall" : selectedScreenerCard}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filteredData.length} data</span>
          </div>

          {/* DATA TABLE */}
          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Memuat data...</div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              {wrItems.length === 0 ? "Belum ada data WR Scanner. Import dari Screener terlebih dahulu." : "Tidak ada data sesuai filter."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Tgl Import</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Tgl Backtest</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Ticker</th>
                    <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Screener</th>
                    <th className="p-3 text-right text-xs font-semibold uppercase text-muted-foreground">Close Import</th>
                    <th className="p-3 text-right text-xs font-semibold uppercase text-muted-foreground">High</th>
                    <th className="p-3 text-right text-xs font-semibold uppercase text-muted-foreground">% Gain</th>
                    <th className="p-3 text-center text-xs font-semibold uppercase text-muted-foreground">Result</th>
                    <th className="p-3 text-center text-xs font-semibold uppercase text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((item, i) => (
                    <tr key={item.id} className={cn("border-b border-border/50 transition-colors hover:bg-accent/50", i % 2 === 0 ? "bg-card" : "bg-card/50")}>
                      <td className="p-3 text-xs font-mono text-muted-foreground">{format(new Date(item.tanggal_import), "dd/MM/yy")}</td>
                      <td className="p-3 text-xs font-mono text-muted-foreground">{item.tanggal_backtest ? format(new Date(item.tanggal_backtest), "dd/MM/yy") : "—"}</td>
                      <td className="p-3 font-bold font-mono text-foreground">{item.ticker}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {item.screener_names.map(s => (
                            <Badge key={s} variant="secondary" className="text-[9px] px-1.5 py-0.5 whitespace-nowrap">{s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-xs">{item.close_import != null ? formatNum(item.close_import) : "—"}</td>
                      <td className="p-3 text-right font-mono text-xs">{item.high_price != null ? formatNum(item.high_price) : "—"}</td>
                      <td className={cn("p-3 text-right font-mono text-xs font-semibold",
                        item.pct_open_to_high != null && item.pct_open_to_high >= 2 ? "text-gain" : item.pct_open_to_high != null ? "text-loss" : ""
                      )}>
                        {item.pct_open_to_high != null ? `${item.pct_open_to_high.toFixed(2)}%` : "—"}
                      </td>
                      <td className="p-3 text-center">{resultBadge(item.status, item.notes)}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                            setEditItem(item);
                            setEditImportDate(new Date(item.tanggal_import + "T00:00:00"));
                            setEditBacktestDate(item.tanggal_backtest ? new Date(item.tanggal_backtest + "T00:00:00") : new Date());
                          }}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteMutation.mutate(item.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-loss" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="kombinasi" className="space-y-6">
          <CombinationAnalysis
            data={wrItems}
            wlTickerSet={wlTickerSet}
            wlTickerCatMap={wlTickerCatMap}
          />
        </TabsContent>

        <TabsContent value="korelasi-param" className="space-y-6">
          <ParameterCorrelation data={wrItems} />
        </TabsContent>

        <TabsContent value="wl-analisis" className="space-y-6">
          <WlAnalysis data={wrItems} wlTickerCatMap={wlTickerCatMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ stat, isOverall, isSelected, onClick }: {
  stat: { name: string; total: number; win: number; lose: number; winPcts: number[]; equityCurve: number[] };
  isOverall?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const winRate = stat.total > 0 ? ((stat.win / stat.total) * 100).toFixed(1) : "0";
  const avgGain = stat.winPcts.length > 0
    ? (stat.winPcts.reduce((a, b) => a + b, 0) / stat.winPcts.length).toFixed(2)
    : "0";

  const chartData = stat.equityCurve.map((v, i) => ({ idx: i + 1, equity: v }));

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isOverall && "border-primary/30 bg-primary/5",
        isSelected && "ring-2 ring-primary shadow-lg"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {isOverall ? <BarChart3 className="h-4 w-4 text-primary" /> : null}
          {stat.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">{stat.total}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="text-lg font-bold text-gain">{stat.win}</p>
            <p className="text-[10px] text-muted-foreground">WIN</p>
          </div>
          <div>
            <p className="text-lg font-bold text-loss">{stat.lose}</p>
            <p className="text-[10px] text-muted-foreground">LOSE</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{winRate}%</p>
            <p className="text-[10px] text-muted-foreground">WR</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Avg % Gain (WIN): <span className="text-gain font-mono font-semibold">{avgGain}%</span>
        </p>
        {chartData.length > 1 && (
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="idx" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "11px",
                  }}
                  formatter={(v: number) => [v, "Equity"]}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
