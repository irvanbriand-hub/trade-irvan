import { useState, useMemo } from "react";
import { useTrades, useDeleteTrade, useUpdateTrade } from "@/hooks/useTrades";
import { useCategories } from "@/hooks/useCategories";
import { calculatePositions } from "@/lib/positionCalculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Pencil, ArrowUp, ArrowDown, CalendarIcon, X, Search } from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth, subMonths } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import type { DisplayMode } from "@/hooks/useEquityToggle";

const formatRupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

interface TradeHistoryProps {
  displayMode?: DisplayMode;
  formatValue?: (rupiah: number, mode: DisplayMode) => string;
}

type SortKey = "trade_date" | "ticker" | "trade_type" | "price" | "lots" | "total_value" | "fee" | "total_amount" | "avgBuy" | "pl" | "plPct" | "category" | "notes";
type SortDir = "asc" | "desc";

export function TradeHistory({ displayMode = "rp", formatValue }: TradeHistoryProps) {
  const { data: trades, isLoading } = useTrades();
  const { data: categories } = useCategories();
  const deleteTrade = useDeleteTrade();
  const updateTrade = useUpdateTrade();

  // Filters
  const [searchTicker, setSearchTicker] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [filterPL, setFilterPL] = useState<"ALL" | "PROFIT" | "LOSS">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("trade_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Edit modal
  const [editTrade, setEditTrade] = useState<any>(null);
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editPrice, setEditPrice] = useState("");
  const [editLots, setEditLots] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fmt = (val: number) => {
    if (formatValue && displayMode) return formatValue(val, displayMode);
    return formatRupiah(val);
  };

  // Compute avg buy at each trade for P/L display
  const tradesWithPL = useMemo(() => {
    if (!trades) return [];

    // Calculate running avg buy price at each SELL
    const sorted = [...trades].sort((a, b) => {
      const dc = a.trade_date.localeCompare(b.trade_date);
      if (dc !== 0) return dc;
      if (a.created_at && b.created_at) return a.created_at.localeCompare(b.created_at);
      return 0;
    });

    // Use positionCalculator to get closed trades
    const result = calculatePositions(sorted);
    const closedMap = new Map<string, { costBasis: number; sellAmount: number; realizedPL: number }>();
    
    // Map closed trades by matching sell trade index
    let sellIdx: Record<string, number> = {};
    for (const ct of result.closedTrades) {
      const key = ct.ticker;
      if (!sellIdx[key]) sellIdx[key] = 0;
      sellIdx[key]++;
    }

    // Build a map: for each SELL trade (by id), find matching closed trade
    const sellTradesByTicker: Record<string, any[]> = {};
    for (const t of sorted) {
      if (t.trade_type === "SELL") {
        if (!sellTradesByTicker[t.ticker]) sellTradesByTicker[t.ticker] = [];
        sellTradesByTicker[t.ticker].push(t);
      }
    }

    const closedByTradeId = new Map<string, { costBasis: number; realizedPL: number; avgBuyAtSell: number }>();
    const closedByTicker: Record<string, number> = {};
    for (const ct of result.closedTrades) {
      if (!closedByTicker[ct.ticker]) closedByTicker[ct.ticker] = 0;
      const idx = closedByTicker[ct.ticker];
      const sellTrades = sellTradesByTicker[ct.ticker];
      if (sellTrades && sellTrades[idx]) {
        const avgBuyAtSell = ct.sellLots > 0 ? ct.costBasis / (ct.sellLots * 100) : 0;
        closedByTradeId.set(sellTrades[idx].id, {
          costBasis: ct.costBasis,
          realizedPL: ct.realizedPL,
          avgBuyAtSell,
        });
      }
      closedByTicker[ct.ticker]++;
    }

    return trades.map((t: any) => {
      const closed = closedByTradeId.get(t.id);
      return {
        ...t,
        avgBuyAtSell: closed?.avgBuyAtSell ?? null,
        realizedPL: closed?.realizedPL ?? null,
        realizedPLPct: closed && closed.costBasis > 0
          ? ((closed.realizedPL / closed.costBasis) * 100)
          : null,
      };
    });
  }, [trades]);

  // Apply filters
  const filteredTrades = useMemo(() => {
    let result = [...tradesWithPL];

    if (searchTicker) {
      result = result.filter(t => t.ticker.toLowerCase().includes(searchTicker.toLowerCase()));
    }
    if (filterType !== "ALL") {
      result = result.filter(t => t.trade_type === filterType);
    }
    if (filterCategories.length > 0) {
      result = result.filter(t => filterCategories.includes(t.category_id || ""));
    }
    if (dateFrom) {
      result = result.filter(t => t.trade_date >= format(dateFrom, "yyyy-MM-dd"));
    }
    if (dateTo) {
      result = result.filter(t => t.trade_date <= format(dateTo, "yyyy-MM-dd"));
    }
    if (filterPL === "PROFIT") {
      result = result.filter(t => t.trade_type === "SELL" && (t.realizedPL ?? 0) >= 0);
    } else if (filterPL === "LOSS") {
      result = result.filter(t => t.trade_type === "SELL" && (t.realizedPL ?? 0) < 0);
    }

    // Sort
    result.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "trade_date": av = a.trade_date; bv = b.trade_date; break;
        case "ticker": av = a.ticker; bv = b.ticker; break;
        case "trade_type": av = a.trade_type; bv = b.trade_type; break;
        case "price": av = Number(a.price); bv = Number(b.price); break;
        case "lots": av = a.lots; bv = b.lots; break;
        case "total_value": av = Number(a.total_value || a.price * a.lots * 100); bv = Number(b.total_value || b.price * b.lots * 100); break;
        case "fee": av = Number(a.fee || 0); bv = Number(b.fee || 0); break;
        case "total_amount": av = Number(a.total_amount || 0); bv = Number(b.total_amount || 0); break;
        case "avgBuy": av = a.avgBuyAtSell ?? 0; bv = b.avgBuyAtSell ?? 0; break;
        case "pl": av = a.realizedPL ?? 0; bv = b.realizedPL ?? 0; break;
        case "plPct": av = a.realizedPLPct ?? 0; bv = b.realizedPLPct ?? 0; break;
        case "category": av = a.trading_categories?.name || ""; bv = b.trading_categories?.name || ""; break;
        case "notes": av = a.notes || ""; bv = b.notes || ""; break;
        default: av = a.trade_date; bv = b.trade_date;
      }
      if (typeof av === "string") {
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [tradesWithPL, searchTicker, filterType, filterCategories, dateFrom, dateTo, filterPL, sortKey, sortDir]);

  // Summary stats
  const summary = useMemo(() => {
    const buyTrades = filteredTrades.filter(t => t.trade_type === "BUY");
    const sellTrades = filteredTrades.filter(t => t.trade_type === "SELL");
    const totalBuyAmount = buyTrades.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const totalSellAmount = sellTrades.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const totalFee = filteredTrades.reduce((s, t) => s + Number(t.fee || 0), 0);
    const totalRealizedPL = sellTrades.reduce((s, t) => s + (t.realizedPL ?? 0), 0);
    const wins = sellTrades.filter(t => (t.realizedPL ?? 0) >= 0).length;
    const losses = sellTrades.filter(t => (t.realizedPL ?? 0) < 0).length;
    const totalCostBasis = sellTrades.reduce((s, t) => {
      const cb = t.avgBuyAtSell ? t.avgBuyAtSell * t.lots * 100 : 0;
      return s + cb;
    }, 0);
    const plPct = totalCostBasis > 0 ? (totalRealizedPL / totalCostBasis) * 100 : 0;

    return {
      total: filteredTrades.length,
      buyCount: buyTrades.length, buyAmount: totalBuyAmount,
      sellCount: sellTrades.length, sellAmount: totalSellAmount,
      totalFee, totalRealizedPL, plPct,
      wins, losses, winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
    };
  }, [filteredTrades]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortHeader = ({ label, sKey, className = "" }: { label: string; sKey: SortKey; className?: string }) => (
    <th className={cn("py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors", className)}
      onClick={() => handleSort(sKey)}>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === sKey && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );

  const openEditModal = (t: any) => {
    setEditTrade(t);
    setEditDate(new Date(t.trade_date + "T00:00:00"));
    setEditPrice(String(t.price));
    setEditLots(String(t.lots));
    setEditCategoryId(t.category_id || "");
    setEditNotes(t.notes || "");
  };

  const editPriceNum = parseFloat(editPrice) || 0;
  const editLotsNum = parseInt(editLots) || 0;
  const editTotalValue = editPriceNum * editLotsNum * 100;
  const editFeeRate = editTrade?.trade_type === "BUY" ? 0.0015 : 0.0025;
  const editFee = editTotalValue * editFeeRate;
  const editTotalAmount = editTrade?.trade_type === "BUY" ? editTotalValue + editFee : editTotalValue - editFee;

  const handleSaveEdit = () => {
    if (!editTrade) return;
    updateTrade.mutate({
      id: editTrade.id,
      trade_date: format(editDate, "yyyy-MM-dd"),
      price: editPriceNum,
      lots: editLotsNum,
      category_id: editCategoryId || null,
      notes: editNotes || null,
      fee: editFee,
      total_value: editTotalValue,
      total_amount: editTotalAmount,
    }, {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Transaksi berhasil diperbarui" });
        setEditTrade(null);
      },
      onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteTrade.mutate(deleteId, {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Transaksi berhasil dihapus" });
        setDeleteId(null);
      },
    });
  };

  const resetFilters = () => {
    setSearchTicker("");
    setFilterType("ALL");
    setFilterCategories([]);
    setDateFrom(undefined);
    setDateTo(undefined);
    setFilterPL("ALL");
  };

  const setDateShortcut = (type: string) => {
    const now = new Date();
    setDateTo(now);
    switch (type) {
      case "today": setDateFrom(startOfDay(now)); break;
      case "week": setDateFrom(startOfWeek(now, { weekStartsOn: 1 })); break;
      case "month": setDateFrom(startOfMonth(now)); break;
      case "3month": setDateFrom(subMonths(now, 3)); break;
      case "all": setDateFrom(undefined); setDateTo(undefined); break;
    }
  };

  const hasFilters = searchTicker || filterType !== "ALL" || filterCategories.length > 0 || dateFrom || dateTo || filterPL !== "ALL";

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Riwayat Trading</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Ticker</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input placeholder="Cari..." value={searchTicker} onChange={e => setSearchTicker(e.target.value.toUpperCase())}
                  className="h-8 text-xs pl-7 w-28" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Tipe</label>
              <div className="flex gap-0.5">
                {(["ALL", "BUY", "SELL"] as const).map(t => (
                  <Button key={t} variant={filterType === t ? "default" : "outline"} size="sm"
                    className={cn("h-8 text-[10px] px-2", filterType === t && t === "BUY" && "bg-gain hover:bg-gain/80",
                      filterType === t && t === "SELL" && "bg-loss hover:bg-loss/80")}
                    onClick={() => setFilterType(t)}>
                    {t === "ALL" ? "Semua" : t}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Kategori</label>
              <Select value={filterCategories[0] || "all"} onValueChange={v => setFilterCategories(v === "all" ? [] : [v])}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue placeholder="Semua" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Dari</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 text-xs w-28 justify-start">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {dateFrom ? format(dateFrom, "dd/MM/yy") : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Sampai</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 text-xs w-28 justify-start">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {dateTo ? format(dateTo, "dd/MM/yy") : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Shortcut</label>
              <div className="flex gap-0.5">
                {[["Hari Ini", "today"], ["Minggu", "week"], ["Bulan", "month"], ["3 Bln", "3month"], ["Semua", "all"]].map(([l, v]) => (
                  <Button key={v} variant="outline" size="sm" className="h-8 text-[10px] px-1.5" onClick={() => setDateShortcut(v)}>{l}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">P/L</label>
              <div className="flex gap-0.5">
                {(["ALL", "PROFIT", "LOSS"] as const).map(t => (
                  <Button key={t} variant={filterPL === t ? "default" : "outline"} size="sm"
                    className={cn("h-8 text-[10px] px-2", filterPL === t && t === "PROFIT" && "bg-gain hover:bg-gain/80",
                      filterPL === t && t === "LOSS" && "bg-loss hover:bg-loss/80")}
                    onClick={() => setFilterPL(t)}>
                    {t === "ALL" ? "Semua" : t === "PROFIT" ? "Profit" : "Loss"}
                  </Button>
                ))}
              </div>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
                <X className="h-3 w-3 mr-1" /> Reset
              </Button>
            )}
          </div>

          {/* Table */}
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Memuat...</p>
          ) : filteredTrades.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <SortHeader label="Tanggal" sKey="trade_date" className="text-left" />
                    <SortHeader label="Ticker" sKey="ticker" className="text-left" />
                    <SortHeader label="Tipe" sKey="trade_type" className="text-center" />
                    <SortHeader label="Harga" sKey="price" className="text-right" />
                    <SortHeader label="Lot" sKey="lots" className="text-right" />
                    <SortHeader label="Nilai" sKey="total_value" className="text-right" />
                    <SortHeader label="Fee" sKey="fee" className="text-right" />
                    <SortHeader label="Total" sKey="total_amount" className="text-right" />
                    <SortHeader label="Avg Buy" sKey="avgBuy" className="text-right" />
                    <SortHeader label="P/L Rp" sKey="pl" className="text-right" />
                    <SortHeader label="P/L %" sKey="plPct" className="text-right" />
                    <SortHeader label="Kategori" sKey="category" className="text-left" />
                    <SortHeader label="Notes" sKey="notes" className="text-left" />
                    <th className="py-2 px-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((t: any) => (
                    <tr key={t.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-2 px-2 whitespace-nowrap">{t.trade_date}</td>
                      <td className="py-2 px-2 font-bold font-mono-data">{t.ticker}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.trade_type === "BUY" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
                          {t.trade_type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono-data">{Number(t.price).toLocaleString("id-ID")}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{t.lots}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{fmt(Number(t.total_value || t.price * t.lots * 100))}</td>
                      <td className="py-2 px-2 text-right font-mono-data text-muted-foreground">{formatRupiah(Number(t.fee || 0))}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{fmt(Number(t.total_amount || 0))}</td>
                      <td className="py-2 px-2 text-right font-mono-data">
                        {t.trade_type === "SELL" && t.avgBuyAtSell !== null
                          ? t.avgBuyAtSell.toLocaleString("id-ID", { maximumFractionDigits: 0 }) : "—"}
                      </td>
                      <td className={cn("py-2 px-2 text-right font-mono-data",
                        t.trade_type === "SELL" && t.realizedPL !== null && (t.realizedPL >= 0 ? "text-gain" : "text-loss"))}>
                        {t.trade_type === "SELL" && t.realizedPL !== null ? fmt(t.realizedPL) : "—"}
                      </td>
                      <td className={cn("py-2 px-2 text-right font-mono-data",
                        t.trade_type === "SELL" && t.realizedPLPct !== null && (t.realizedPLPct >= 0 ? "text-gain" : "text-loss"))}>
                        {t.trade_type === "SELL" && t.realizedPLPct !== null
                          ? `${t.realizedPLPct >= 0 ? "+" : ""}${t.realizedPLPct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground truncate max-w-[80px]">{t.trading_categories?.name || "—"}</td>
                      <td className="py-2 px-2 text-muted-foreground truncate max-w-[80px]">{t.notes || "—"}</td>
                      <td className="py-2 px-2">
                        <div className="flex gap-0.5 justify-center">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditModal(t)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(t.id)}>
                            <Trash2 className="h-3 w-3 text-loss" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">Belum ada data trading</p>
          )}

          {/* Summary */}
          {filteredTrades.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-border">
              <div className="text-xs"><span className="text-muted-foreground">Total: </span><span className="font-semibold">{summary.total}</span></div>
              <div className="text-xs"><span className="text-muted-foreground">BUY: </span><span className="font-semibold">{summary.buyCount}x | {formatRupiah(summary.buyAmount)}</span></div>
              <div className="text-xs"><span className="text-muted-foreground">SELL: </span><span className="font-semibold">{summary.sellCount}x | {formatRupiah(summary.sellAmount)}</span></div>
              <div className="text-xs"><span className="text-muted-foreground">Fee: </span><span className="font-semibold">{formatRupiah(summary.totalFee)}</span></div>
              <div className="text-xs">
                <span className="text-muted-foreground">R. P/L: </span>
                <span className={cn("font-semibold", summary.totalRealizedPL >= 0 ? "text-gain" : "text-loss")}>
                  {fmt(summary.totalRealizedPL)} | {summary.plPct >= 0 ? "+" : ""}{summary.plPct.toFixed(2)}%
                </span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">W/L: </span>
                <span className="font-semibold text-gain">{summary.wins}W</span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-semibold text-loss">{summary.losses}L</span>
                <span className="text-muted-foreground"> ({summary.winRate.toFixed(0)}%)</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTrade} onOpenChange={o => !o && setEditTrade(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit Transaksi — {editTrade?.ticker} ({editTrade?.trade_type})</DialogTitle>
            <DialogDescription className="text-xs">Perubahan ini akan mempengaruhi kalkulasi portfolio dan P/L.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tanggal</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 text-xs justify-start">
                    <CalendarIcon className="h-3 w-3 mr-1" />
                    {format(editDate, "dd MMM yyyy", { locale: idLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editDate} onSelect={d => d && setEditDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Harga/Lembar</label>
                <Input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="h-9 text-xs font-mono-data" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Lot</label>
                <Input type="number" value={editLots} onChange={e => setEditLots(e.target.value)} className="h-9 text-xs font-mono-data" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Kategori</label>
              <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                <SelectContent>
                  {categories?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="text-xs min-h-[50px]" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs p-2 bg-muted rounded">
              <div><span className="text-muted-foreground">Nilai: </span><span className="font-mono-data">{formatRupiah(editTotalValue)}</span></div>
              <div><span className="text-muted-foreground">Fee: </span><span className="font-mono-data">{formatRupiah(editFee)}</span></div>
              <div><span className="text-muted-foreground">Total: </span><span className="font-mono-data font-semibold">{formatRupiah(editTotalAmount)}</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditTrade(null)}>Batal</Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={updateTrade.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Hapus Transaksi?</DialogTitle>
            <DialogDescription className="text-xs">Data P/L dan portfolio akan direcalculate otomatis.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteTrade.isPending}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
