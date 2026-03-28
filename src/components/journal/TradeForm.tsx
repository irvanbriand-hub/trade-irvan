import { useState, useMemo } from "react";
import { useAddTrade } from "@/hooks/useTrades";
import { useCategories } from "@/hooks/useCategories";
import { useActivePositions } from "@/hooks/useActivePositions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CalendarIcon, Plus, ArrowUpCircle, ArrowDownCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const formatRupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

export function TradeForm() {
  const { data: categories } = useCategories();
  const { positions } = useActivePositions();
  const addTrade = useAddTrade();

  const [date, setDate] = useState<Date>(new Date());
  const [ticker, setTicker] = useState("");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [price, setPrice] = useState("");
  const [lots, setLots] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [notes, setNotes] = useState("");

  // Selected position for SELL
  const selectedPosition = useMemo(
    () => positions.find((p) => p.ticker === ticker),
    [positions, ticker]
  );

  const priceNum = parseFloat(price) || 0;
  const lotsNum = parseInt(lots) || 0;
  const totalValue = priceNum * lotsNum * 100;
  const feeRate = tradeType === "BUY" ? 0.0015 : 0.0025;
  const fee = totalValue * feeRate;
  const totalAmount = tradeType === "BUY" ? totalValue + fee : totalValue - fee;

  // Realized P/L calculation for SELL
  const realizedPL = useMemo(() => {
    if (tradeType !== "SELL" || !selectedPosition || lotsNum <= 0 || priceNum <= 0) return null;
    const sellValue = priceNum * lotsNum * 100;
    const sellFee = sellValue * 0.0025;
    const totalReceived = sellValue - sellFee;
    const buyCostForLots = selectedPosition.avgBuyPrice * lotsNum * 100;
    // Proportional buy fee
    const proportionalBuyFee = selectedPosition.totalLots > 0
      ? (selectedPosition.totalBuyFee * lotsNum) / (selectedPosition.totalLots + lotsNum) // approximate total lots before sell
      : 0;
    // Use simpler: buy cost portion = avg buy price * lots * 100
    // Plus proportional buy fee
    return totalReceived - buyCostForLots - proportionalBuyFee;
  }, [tradeType, selectedPosition, lotsNum, priceNum]);

  const lotsError = useMemo(() => {
    if (tradeType !== "SELL" || !selectedPosition) return null;
    if (lotsNum > selectedPosition.totalLots) return `Maks ${selectedPosition.totalLots} lot`;
    return null;
  }, [tradeType, selectedPosition, lotsNum]);

  const handleTypeChange = (type: "BUY" | "SELL") => {
    setTradeType(type);
    setTicker("");
    setPrice("");
    setLots("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !price || !lots) {
      toast({ title: "Error", description: "Ticker, harga, dan lot wajib diisi", variant: "destructive" });
      return;
    }
    if (lotsError) {
      toast({ title: "Error", description: lotsError, variant: "destructive" });
      return;
    }

    addTrade.mutate(
      {
        trade_date: format(date, "yyyy-MM-dd"),
        ticker: ticker.toUpperCase(),
        trade_type: tradeType,
        price: priceNum,
        lots: lotsNum,
        category_id: categoryId || null,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast({ title: "Berhasil", description: `Trade ${tradeType} ${ticker.toUpperCase()} berhasil ditambahkan` });
          setTicker("");
          setPrice("");
          setLots("");
          setNotes("");
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Input Trading Baru</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Date */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tanggal</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-xs h-9")}>
                    <CalendarIcon className="mr-1 h-3 w-3" />
                    {format(date, "dd MMM yyyy", { locale: idLocale })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Ticker - BUY: text input, SELL: dropdown */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ticker</label>
              {tradeType === "BUY" ? (
                <Input
                  placeholder="BBCA"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="h-9 text-xs"
                />
              ) : (
                <Select value={ticker} onValueChange={setTicker}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pilih saham" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">Tidak ada posisi aktif</div>
                    ) : (
                      positions.map((p) => (
                        <SelectItem key={p.ticker} value={p.ticker}>
                          {p.ticker} — {p.totalLots} lot
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Type */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Jenis</label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={tradeType === "BUY" ? "default" : "outline"}
                  size="sm"
                  className={`flex-1 h-9 text-xs ${tradeType === "BUY" ? "bg-gain hover:bg-gain/80 text-primary-foreground" : ""}`}
                  onClick={() => handleTypeChange("BUY")}
                >
                  <ArrowUpCircle className="h-3 w-3 mr-1" />
                  BUY
                </Button>
                <Button
                  type="button"
                  variant={tradeType === "SELL" ? "default" : "outline"}
                  size="sm"
                  className={`flex-1 h-9 text-xs ${tradeType === "SELL" ? "bg-loss hover:bg-loss/80 text-destructive-foreground" : ""}`}
                  onClick={() => handleTypeChange("SELL")}
                >
                  <ArrowDownCircle className="h-3 w-3 mr-1" />
                  SELL
                </Button>
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Kategori</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Position info for SELL */}
          {tradeType === "SELL" && selectedPosition && (
            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg border border-border text-xs">
              <Info className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex gap-6">
                <div>
                  <span className="text-muted-foreground">Avg Buy: </span>
                  <span className="font-mono-data font-semibold text-foreground">
                    {selectedPosition.avgBuyPrice.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lot Tersedia: </span>
                  <span className="font-mono-data font-semibold text-foreground">{selectedPosition.totalLots}</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Price */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Harga/Lembar (Rp)</label>
              <Input
                type="number"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-9 text-xs font-mono-data"
              />
            </div>

            {/* Lots */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Jumlah Lot</label>
              <Input
                type="number"
                placeholder="0"
                value={lots}
                onChange={(e) => setLots(e.target.value)}
                className={cn("h-9 text-xs font-mono-data", lotsError && "border-destructive")}
                max={tradeType === "SELL" && selectedPosition ? selectedPosition.totalLots : undefined}
              />
              {lotsError && <p className="text-[10px] text-destructive">{lotsError}</p>}
            </div>

            {/* Calculated fields */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Total Nilai</label>
              <div className="h-9 px-3 flex items-center bg-muted rounded-md text-xs font-mono-data text-foreground">
                {formatRupiah(totalValue)}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Fee ({tradeType === "BUY" ? "0.15%" : "0.25%"})
              </label>
              <div className="h-9 px-3 flex items-center bg-muted rounded-md text-xs font-mono-data text-foreground">
                {formatRupiah(fee)}
              </div>
            </div>
          </div>

          {/* Total */}
          <div className="flex items-center justify-between p-3 bg-accent/50 rounded-lg border border-border">
            <span className="text-sm text-muted-foreground">
              {tradeType === "BUY" ? "Total Bayar" : "Total Terima"}
            </span>
            <span className={`text-lg font-bold font-mono-data ${tradeType === "BUY" ? "text-loss" : "text-gain"}`}>
              {formatRupiah(totalAmount)}
            </span>
          </div>

          {/* Realized P/L for SELL */}
          {tradeType === "SELL" && realizedPL !== null && (
            <div className="flex items-center justify-between p-3 bg-accent/50 rounded-lg border border-border">
              <span className="text-sm text-muted-foreground">Realized P/L</span>
              <span className={`text-lg font-bold font-mono-data ${realizedPL >= 0 ? "text-gain" : "text-loss"}`}>
                {realizedPL >= 0 ? "+" : ""}{formatRupiah(realizedPL)}
              </span>
            </div>
          )}

          {/* Notes */}
          <Textarea
            placeholder="Catatan (opsional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs min-h-[60px]"
          />

          <Button type="submit" className="w-full" disabled={addTrade.isPending || !!lotsError}>
            <Plus className="h-4 w-4 mr-1" />
            Simpan Trade
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
