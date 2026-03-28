import { useState } from "react";
import { useModalTransactions, useAddModalTransaction, useDeleteModalTransaction, useModalSummary } from "@/hooks/useModalTransactions";
import { useEquityCalc } from "@/hooks/useEquityToggle";
import { usePortfolio } from "@/hooks/usePortfolio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { CalendarIcon, Trash2, TrendingUp, TrendingDown, Wallet, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from "recharts";
import { useTrades } from "@/hooks/useTrades";

export default function ModalEquity() {
  const { data: transactions, isLoading } = useModalTransactions();
  const { totalTopUp, totalWithdraw, modalBersih, lastTransaction, getModalBersihUntil } = useModalSummary();
  const { totalEquity, formatRupiah, returnPct } = useEquityCalc();
  const { totalRealizedPL, totalUnrealizedPL } = usePortfolio();
  const addMutation = useAddModalTransaction();
  const deleteMutation = useDeleteModalTransaction();
  const { data: trades } = useTrades();

  const [date, setDate] = useState<Date>(new Date());
  const [tipe, setTipe] = useState<string>("TOP_UP");
  const [jumlah, setJumlah] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    const val = Number(jumlah);
    if (!val || val <= 0) {
      toast({ title: "Jumlah harus lebih dari 0", variant: "destructive" });
      return;
    }
    try {
      await addMutation.mutateAsync({
        tanggal: format(date, "yyyy-MM-dd"),
        tipe,
        jumlah: val,
        notes: notes || undefined,
      });
      toast({ title: "Transaksi modal berhasil disimpan" });
      setJumlah("");
      setNotes("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Transaksi dihapus" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Build equity curve from trades + modal transactions
  const equityCurve = (() => {
    if (!trades || !transactions) return [];
    
    // Collect all unique dates from trades (sells only for realized PL)
    const dateSet = new Set<string>();
    for (const t of trades) dateSet.add(t.trade_date);
    for (const tx of transactions) dateSet.add(tx.tanggal);
    
    const allDates = Array.from(dateSet).sort();
    if (allDates.length === 0) return [];

    // Calculate cumulative realized PL per date
    const tickerPositions: Record<string, { buyLots: number; buyTotalCost: number; sellLots: number; sellTotalReceived: number }> = {};
    const sortedTrades = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    
    const realizedByDate: Record<string, number> = {};
    let cumulativeRealized = 0;

    for (const t of sortedTrades) {
      if (!tickerPositions[t.ticker]) {
        tickerPositions[t.ticker] = { buyLots: 0, buyTotalCost: 0, sellLots: 0, sellTotalReceived: 0 };
      }
      const p = tickerPositions[t.ticker];
      if (t.trade_type === "BUY") {
        p.buyLots += t.lots;
        p.buyTotalCost += Number(t.total_amount || 0);
      } else {
        const costProportion = p.buyLots > 0 ? (t.lots / p.buyLots) * p.buyTotalCost : 0;
        const pl = Number(t.total_amount || 0) - costProportion;
        cumulativeRealized += pl;
        p.sellLots += t.lots;
        p.sellTotalReceived += Number(t.total_amount || 0);
      }
      realizedByDate[t.trade_date] = cumulativeRealized;
    }

    // Fill forward cumulative realized
    let lastRealized = 0;
    return allDates.map(d => {
      if (realizedByDate[d] !== undefined) lastRealized = realizedByDate[d];
      const mb = getModalBersihUntil(d);
      const equity = mb + lastRealized;
      return { date: d, equity, modalBersih: mb, realizedPL: lastRealized };
    });
  })();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Modal & Equity</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="gradient-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Wallet className="h-4 w-4" /> Total Equity
            </div>
            <p className="text-lg font-bold font-mono-data text-foreground">{formatRupiah(totalEquity)}</p>
            <p className={cn("text-[10px] mt-0.5", returnPct >= 0 ? "text-gain" : "text-loss")}>
              Return: {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <ArrowUpCircle className="h-4 w-4 text-gain" /> Modal Bersih
            </div>
            <p className="text-lg font-bold font-mono-data text-foreground">{formatRupiah(modalBersih)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Top Up: {formatRupiah(totalTopUp)} | WD: {formatRupiah(totalWithdraw)}
            </p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              {totalRealizedPL >= 0 ? <TrendingUp className="h-4 w-4 text-gain" /> : <TrendingDown className="h-4 w-4 text-loss" />}
              Realized P/L
            </div>
            <p className={cn("text-lg font-bold font-mono-data", totalRealizedPL >= 0 ? "text-gain" : "text-loss")}>
              {formatRupiah(totalRealizedPL)}
            </p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              {totalUnrealizedPL >= 0 ? <TrendingUp className="h-4 w-4 text-gain" /> : <TrendingDown className="h-4 w-4 text-loss" />}
              Unrealized P/L
            </div>
            <p className={cn("text-lg font-bold font-mono-data", totalUnrealizedPL >= 0 ? "text-gain" : "text-loss")}>
              {formatRupiah(totalUnrealizedPL)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Curve */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Equity Curve</CardTitle>
        </CardHeader>
        <CardContent>
          {equityCurve.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="aboveBaseline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(142 60% 45%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(142 60% 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
                <Tooltip
                  contentStyle={{ background: "hsl(220 18% 10%)", border: "1px solid hsl(220 14% 18%)", borderRadius: 8, fontSize: 11 }}
                  formatter={(value: number, name: string) => [formatRupiah(value), name === "equity" ? "Equity" : name === "modalBersih" ? "Modal Bersih" : "Realized P/L"]}
                />
                <ReferenceLine y={modalBersih} stroke="hsl(215 15% 50%)" strokeDasharray="5 5" label={{ value: "Modal Bersih", fontSize: 10, fill: "hsl(215 15% 50%)" }} />
                <Area type="monotone" dataKey="equity" stroke="hsl(142 60% 45%)" fill="url(#aboveBaseline)" strokeWidth={2} />
                <Line type="monotone" dataKey="modalBersih" stroke="hsl(215 15% 50%)" strokeDasharray="5 5" strokeWidth={1} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground text-xs">
              Tambahkan transaksi modal untuk melihat equity curve
            </div>
          )}
        </CardContent>
      </Card>

      {/* Input Form */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tambah Transaksi Modal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tanggal</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left text-xs h-9">
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {format(date, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipe</label>
              <Select value={tipe} onValueChange={setTipe}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOP_UP">TOP UP</SelectItem>
                  <SelectItem value="WITHDRAW">WITHDRAW</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Jumlah (Rp)</label>
              <Input
                type="number"
                value={jumlah}
                onChange={(e) => setJumlah(e.target.value)}
                placeholder="10000000"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opsional"
                className="h-9 text-xs"
              />
            </div>
            <Button onClick={handleSubmit} disabled={addMutation.isPending} className="h-9 text-xs">
              {addMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Riwayat Transaksi Modal</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          ) : transactions && transactions.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2">Tanggal</th>
                    <th className="text-left py-2 px-2">Tipe</th>
                    <th className="text-right py-2 px-2">Jumlah</th>
                    <th className="text-left py-2 px-2">Notes</th>
                    <th className="text-center py-2 px-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...transactions].sort((a, b) => b.tanggal.localeCompare(a.tanggal)).map((tx) => (
                    <tr key={tx.id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-2 px-2 font-mono-data">{tx.tanggal}</td>
                      <td className="py-2 px-2">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          tx.tipe === "TOP_UP" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                        )}>
                          {tx.tipe === "TOP_UP" ? "TOP UP" : "WITHDRAW"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right font-mono-data font-bold">
                        {formatRupiah(Number(tx.jumlah))}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{tx.notes || "-"}</td>
                      <td className="py-2 px-2 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-loss"
                          onClick={() => handleDelete(tx.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">
              Belum ada transaksi modal. Tambahkan Top Up pertama untuk mulai tracking.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
