import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DisplayModeToggle } from "@/components/DisplayModeToggle";
import { cn } from "@/lib/utils";
import { useTrades } from "@/hooks/useTrades";
import { useIHSG } from "@/hooks/useIHSG";
import { useEquityToggle, useEquityCalc, type DisplayMode } from "@/hooks/useEquityToggle";
import { calculatePositions } from "@/lib/positionCalculator";

interface DayData {
  date: string;
  trades: any[];
  totalPL: number;
  totalPLPct: number;
  wins: number;
  losses: number;
}

interface TradingCalendarProps {
  displayMode?: DisplayMode;
}

export function TradingCalendar({ displayMode: externalMode }: TradingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const { data: trades } = useTrades();
  const { data: ihsgMap } = useIHSG(currentMonth);
  const { mode: internalMode, toggle } = useEquityToggle();
  const { formatValue, formatRupiah: fmtRp } = useEquityCalc();

  const mode = externalMode || internalMode;

  const dayDataMap = useMemo(() => {
    if (!trades) return new Map<string, DayData>();

    const result = calculatePositions(trades);
    const map = new Map<string, DayData>();

    // Build avg price lookup from closed trades (FIFO-based)
    // Add closed trades to their sell dates
    for (const c of result.closedTrades) {
      const dateKey = c.date;
      if (!map.has(dateKey)) {
        map.set(dateKey, { date: dateKey, trades: [], totalPL: 0, totalPLPct: 0, wins: 0, losses: 0 });
      }
      const day = map.get(dateKey)!;
      // Find the original sell trade to get full info
      const origTrade = trades.find((t: any) => t.trade_type === "SELL" && t.ticker === c.ticker && t.trade_date === c.date && t.lots === c.sellLots);
      const avgBuyPrice = c.costBasis / (c.sellLots * 100);
      const plPct = c.costBasis > 0 ? (c.realizedPL / c.costBasis) * 100 : 0;
      day.trades.push({
        ...(origTrade || { ticker: c.ticker, trade_type: "SELL", trade_date: c.date, lots: c.sellLots, price: c.sellAmount / (c.sellLots * 100) }),
        avgBuyPrice,
        plRupiah: c.realizedPL,
        plPct,
        buyFee: 0,
        sellFee: 0,
      });
      day.totalPL += c.realizedPL;
      if (c.realizedPL > 0) day.wins++;
      else day.losses++;
    }

    // Add BUY trades
    const sortedTrades = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
    for (const t of sortedTrades) {
      if (t.trade_type !== "BUY") continue;
      const dateKey = t.trade_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, { date: dateKey, trades: [], totalPL: 0, totalPLPct: 0, wins: 0, losses: 0 });
      }
      const day = map.get(dateKey)!;
      const alreadyAdded = day.trades.some((tr: any) => tr.id === t.id);
      if (!alreadyAdded) {
        day.trades.push({ ...t, plRupiah: 0, plPct: 0 });
      }
    }

    for (const [, day] of map) {
      const sellTrades = day.trades.filter((t: any) => t.trade_type === "SELL");
      const totalCostBasis = sellTrades.reduce((s: number, t: any) => s + (t.avgBuyPrice || 0) * t.lots * 100, 0);
      day.totalPLPct = totalCostBasis > 0 ? (day.totalPL / totalCostBasis) * 100 : 0;
    }

    return map;
  }, [trades]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const monthlySummary = useMemo(() => {
    let tradingDays = 0, totalTrades = 0, wins = 0, losses = 0, totalPL = 0;
    const monthStr = format(currentMonth, "yyyy-MM");

    for (const [dateKey, day] of dayDataMap) {
      if (!dateKey.startsWith(monthStr)) continue;
      tradingDays++;
      totalTrades += day.trades.length;
      wins += day.wins;
      losses += day.losses;
      totalPL += day.totalPL;
    }

    const closedTrades = wins + losses;
    const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;
    return { tradingDays, totalTrades, wins, losses, winRate, totalPL };
  }, [dayDataMap, currentMonth]);

  const formatPL = (val: number) => formatValue(val, mode);
  const formatRupiah = (val: number) => fmtRp(val);

  const months = Array.from({ length: 12 }, (_, i) => i);
  const currentYear = currentMonth.getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={String(currentMonth.getMonth())} onValueChange={(v) => setCurrentMonth(new Date(currentMonth.getFullYear(), Number(v), 1))}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={String(m)}>{format(new Date(2024, m, 1), "MMMM", { locale: localeId })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(currentMonth.getFullYear())} onValueChange={(v) => setCurrentMonth(new Date(Number(v), currentMonth.getMonth(), 1))}>
            <SelectTrigger className="w-[80px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentMonth(new Date())}>
          <CalendarDays className="h-3 w-3 mr-1" /> Hari Ini
        </Button>
      </div>

      <Card className="border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b border-border">
            {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r border-border last:border-r-0">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] md:min-h-[100px] border-r border-b border-border last:border-r-0 bg-muted/20" />
            ))}
            {daysInMonth.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayData = dayDataMap.get(dateKey);
              const hasActivity = dayData && dayData.trades.length > 0;
              const hasSells = dayData && (dayData.wins > 0 || dayData.losses > 0);
              const isProfit = dayData && dayData.totalPL > 0;
              const isLoss = dayData && dayData.totalPL < 0;
              const ihsg = ihsgMap?.get(dateKey);

              return (
                <div
                  key={dateKey}
                  onClick={() => hasActivity ? setSelectedDay(dayData) : null}
                  className={cn(
                    "min-h-[80px] md:min-h-[100px] border-r border-b border-border last:border-r-0 p-1 transition-colors",
                    hasActivity && "cursor-pointer hover:bg-accent/50",
                    hasSells && isProfit && "bg-gain/5",
                    hasSells && isLoss && "bg-loss/5",
                    isToday(day) && "ring-1 ring-inset ring-primary/50"
                  )}
                >
                  <div className={cn(
                    "text-xs font-medium mb-0.5",
                    isToday(day) ? "text-primary font-bold" : "text-muted-foreground"
                  )}>
                    {format(day, "d")}
                  </div>
                  {ihsg && (
                    <div className={cn(
                      "text-[9px] font-mono leading-tight",
                      ihsg.changePct >= 0 ? "text-gain" : "text-loss"
                    )}>
                      IHSG {ihsg.close.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                      <br />
                      {ihsg.changePct >= 0 ? "+" : ""}{ihsg.changePct.toFixed(2)}%
                    </div>
                  )}
                  {hasActivity && (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-muted-foreground">{dayData.trades.length} trade{dayData.trades.length > 1 ? "s" : ""}</div>
                      {hasSells && (
                        <>
                          <div className="text-[10px]">
                            <span className="text-gain">{dayData.wins}W</span>{" "}
                            <span className="text-loss">{dayData.losses}L</span>
                          </div>
                          <div className={cn("text-[10px] font-bold font-mono", dayData.totalPL >= 0 ? "text-gain" : "text-loss")}>
                            {formatPL(dayData.totalPL)}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Summary */}
      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ringkasan Bulan {format(currentMonth, "MMMM yyyy", { locale: localeId })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStat label="Hari Trading" value={String(monthlySummary.tradingDays)} />
            <MiniStat label="Total Trades" value={String(monthlySummary.totalTrades)} />
            <MiniStat label="Win" value={String(monthlySummary.wins)} color="gain" />
            <MiniStat label="Lose" value={String(monthlySummary.losses)} color="loss" />
            <MiniStat label="Win Rate" value={`${monthlySummary.winRate.toFixed(1)}%`} color={monthlySummary.winRate >= 50 ? "gain" : "loss"} />
            <MiniStat label="Total P/L" value={formatPL(monthlySummary.totalPL)} color={monthlySummary.totalPL >= 0 ? "gain" : "loss"} />
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedDay && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
                  <span>{format(new Date(selectedDay.date), "EEEE, d MMMM yyyy", { locale: localeId })}</span>
                  <div className="flex items-center gap-2 text-sm font-normal">
                    <Badge variant="outline">{selectedDay.trades.length} trades</Badge>
                    {(selectedDay.wins > 0 || selectedDay.losses > 0) && (
                      <>
                        <Badge className="bg-gain/20 text-gain border-gain/30">{selectedDay.wins}W</Badge>
                        <Badge className="bg-loss/20 text-loss border-loss/30">{selectedDay.losses}L</Badge>
                        <Badge className={cn(
                          selectedDay.totalPL >= 0 ? "bg-gain/20 text-gain border-gain/30" : "bg-loss/20 text-loss border-loss/30"
                        )}>
                          {formatPL(selectedDay.totalPL)}
                        </Badge>
                      </>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-2">Ticker</th>
                      <th className="text-left p-2">Kategori</th>
                      <th className="text-left p-2">Jenis</th>
                      <th className="text-right p-2">Harga Beli</th>
                      <th className="text-right p-2">Harga Jual</th>
                      <th className="text-right p-2">Lot</th>
                      <th className="text-right p-2">Fee</th>
                      <th className="text-right p-2">P/L</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDay.trades.map((t: any) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="p-2 font-bold font-mono">{t.ticker}</td>
                        <td className="p-2">{t.trading_categories?.name || "-"}</td>
                        <td className="p-2">
                          <Badge variant="outline" className={cn(
                            t.trade_type === "BUY" ? "text-gain border-gain/30" : "text-loss border-loss/30"
                          )}>
                            {t.trade_type}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-mono">{t.avgBuyPrice ? Math.round(t.avgBuyPrice).toLocaleString("id-ID") : "-"}</td>
                        <td className="p-2 text-right font-mono">{t.trade_type === "SELL" ? Number(t.price).toLocaleString("id-ID") : "-"}</td>
                        <td className="p-2 text-right font-mono">{t.lots}</td>
                        <td className="p-2 text-right font-mono">{t.trade_type === "SELL" ? formatRupiah((t.buyFee || 0) + (t.sellFee || 0)) : formatRupiah(Number(t.fee || 0))}</td>
                        <td className={cn("p-2 text-right font-mono font-semibold", t.plRupiah > 0 ? "text-gain" : t.plRupiah < 0 ? "text-loss" : "text-muted-foreground")}>
                          {t.trade_type === "SELL" ? formatPL(t.plRupiah) : "-"}
                        </td>
                        <td className="p-2 text-muted-foreground max-w-[120px] truncate">{t.notes || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(selectedDay.wins > 0 || selectedDay.losses > 0) && (
                <div className="flex items-center justify-between text-xs border-t border-border pt-3 mt-2">
                  <span className="text-muted-foreground">
                    Total Fee: {formatRupiah(selectedDay.trades.filter((t: any) => t.trade_type === "SELL").reduce((s: number, t: any) => s + (t.buyFee || 0) + (t.sellFee || 0), 0))}
                  </span>
                  <span className={cn("font-bold font-mono", selectedDay.totalPL >= 0 ? "text-gain" : "text-loss")}>
                    Total P/L: {formatPL(selectedDay.totalPL)}
                  </span>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: "gain" | "loss" }) {
  return (
    <div className="bg-accent/30 rounded-lg p-3 border border-border">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-sm font-bold font-mono", color === "gain" ? "text-gain" : color === "loss" ? "text-loss" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}
