import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { WrScannerItem } from "@/hooks/useWrScanner";
import { useIHSG, type IHSGDayData } from "@/hooks/useIHSG";

interface DayData {
  date: string;
  items: WrScannerItem[];
  wins: number;
  losses: number;
  winRate: number;
  avgPct: number;
}

interface WrScannerCalendarProps {
  data: WrScannerItem[];
}

export function WrScannerCalendar({ data }: WrScannerCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const { data: ihsgMap } = useIHSG(currentMonth);

  // Group by tanggal_backtest
  const dayDataMap = useMemo(() => {
    const map = new Map<string, DayData>();
    for (const item of data) {
      if (!item.tanggal_backtest || item.status === "OPEN") continue;
      const key = item.tanggal_backtest;
      if (!map.has(key)) {
        map.set(key, { date: key, items: [], wins: 0, losses: 0, winRate: 0, avgPct: 0 });
      }
      const day = map.get(key)!;
      day.items.push(item);
      if (item.result === "WIN") day.wins++;
      else day.losses++;
    }
    // Compute winRate & avgPct
    for (const [, day] of map) {
      const total = day.wins + day.losses;
      day.winRate = total > 0 ? (day.wins / total) * 100 : 0;
      const pcts = day.items.filter(i => i.pct_open_to_high != null).map(i => i.pct_open_to_high!);
      day.avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
    }
    return map;
  }, [data]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  // Monthly summary
  const monthlySummary = useMemo(() => {
    const monthStr = format(currentMonth, "yyyy-MM");
    let totalItems = 0, wins = 0, losses = 0, backtestDays = 0;
    const pcts: number[] = [];
    for (const [dateKey, day] of dayDataMap) {
      if (!dateKey.startsWith(monthStr)) continue;
      backtestDays++;
      totalItems += day.items.length;
      wins += day.wins;
      losses += day.losses;
      day.items.forEach(i => { if (i.pct_open_to_high != null) pcts.push(i.pct_open_to_high); });
    }
    const total = wins + losses;
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const avgPct = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
    // Win days (>=70% WR)
    let winDays = 0, loseDays = 0;
    for (const [dateKey, day] of dayDataMap) {
      if (!dateKey.startsWith(monthStr)) continue;
      if (day.winRate >= 70) winDays++;
      else loseDays++;
    }
    return { backtestDays, totalItems, wins, losses, winRate, avgPct, winDays, loseDays };
  }, [dayDataMap, currentMonth]);

  const months = Array.from({ length: 12 }, (_, i) => i);
  const currentYear = currentMonth.getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  // Gradient helper: winRate 0-100 → red to green
  const getGradientStyle = (winRate: number) => {
    if (winRate >= 70) {
      // Green gradient - more intense as higher
      const intensity = Math.min((winRate - 70) / 30, 1);
      const alpha = 0.15 + intensity * 0.35;
      return { backgroundColor: `hsla(142, 71%, 45%, ${alpha})` };
    } else {
      // Red gradient - more intense as lower
      const intensity = Math.min((70 - winRate) / 70, 1);
      const alpha = 0.15 + intensity * 0.35;
      return { backgroundColor: `hsla(0, 84%, 60%, ${alpha})` };
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" /> Kalender Backtest
      </h2>

      {/* Navigation */}
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

      {/* Calendar Grid */}
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
              const hasData = dayData && dayData.items.length > 0;
              const ihsg = ihsgMap?.get(dateKey);

              return (
                <div
                  key={dateKey}
                  onClick={() => hasData ? setSelectedDay(dayData) : null}
                  className={cn(
                    "min-h-[80px] md:min-h-[100px] border-r border-b border-border last:border-r-0 p-1 transition-colors",
                    hasData && "cursor-pointer hover:opacity-80",
                    isToday(day) && "ring-1 ring-inset ring-primary/50"
                  )}
                  style={hasData ? getGradientStyle(dayData.winRate) : undefined}
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
                  {hasData && (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-foreground/80">{dayData.items.length} saham</div>
                      <div className="text-[10px]">
                        <span className="text-gain font-semibold">{dayData.wins}W</span>{" "}
                        <span className="text-loss font-semibold">{dayData.losses}L</span>
                      </div>
                      <div className={cn(
                        "text-[10px] font-bold font-mono",
                        dayData.winRate >= 70 ? "text-gain" : "text-loss"
                      )}>
                        WR {dayData.winRate.toFixed(0)}%
                      </div>
                      <div className="text-[10px] font-mono text-foreground/70">
                        avg {dayData.avgPct.toFixed(1)}%
                      </div>
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
          <CardTitle className="text-sm">Ringkasan {format(currentMonth, "MMMM yyyy", { locale: localeId })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <MiniStat label="Hari Backtest" value={String(monthlySummary.backtestDays)} />
            <MiniStat label="Total Saham" value={String(monthlySummary.totalItems)} />
            <MiniStat label="WIN" value={String(monthlySummary.wins)} color="gain" />
            <MiniStat label="LOSE" value={String(monthlySummary.losses)} color="loss" />
            <MiniStat label="Win Rate" value={`${monthlySummary.winRate.toFixed(1)}%`} color={monthlySummary.winRate >= 70 ? "gain" : "loss"} />
            <MiniStat label="Avg % Gain" value={`${monthlySummary.avgPct.toFixed(2)}%`} color={monthlySummary.avgPct >= 2 ? "gain" : "loss"} />
            <MiniStat label="Hari WIN" value={String(monthlySummary.winDays)} color="gain" />
            <MiniStat label="Hari LOSE" value={String(monthlySummary.loseDays)} color="loss" />
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
                  <span>Backtest {format(new Date(selectedDay.date), "EEEE, d MMMM yyyy", { locale: localeId })}</span>
                  <div className="flex items-center gap-2 text-sm font-normal">
                    <Badge variant="outline">{selectedDay.items.length} saham</Badge>
                    <Badge className="bg-gain/20 text-gain border-gain/30">{selectedDay.wins} WIN</Badge>
                    <Badge className="bg-loss/20 text-loss border-loss/30">{selectedDay.losses} LOSE</Badge>
                    <Badge className={cn(
                      selectedDay.winRate >= 70 ? "bg-gain/20 text-gain border-gain/30" : "bg-loss/20 text-loss border-loss/30"
                    )}>
                      WR {selectedDay.winRate.toFixed(1)}%
                    </Badge>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left p-2">Ticker</th>
                      <th className="text-left p-2">Screener</th>
                      <th className="text-left p-2">WL</th>
                      <th className="text-right p-2">Close Import</th>
                      <th className="text-right p-2">High</th>
                      <th className="text-right p-2">% Gain</th>
                      <th className="text-center p-2">Result</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDay.items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="p-2 font-bold font-mono">{item.ticker}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {item.screener_names.map(s => (
                              <Badge key={s} variant="secondary" className="text-[9px] px-1 py-0">{s}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-2">
                          {item.wl_kategori ? (
                            <Badge className="text-[9px] px-1 py-0 bg-primary/10 text-primary border-primary/20">{item.wl_kategori}</Badge>
                          ) : "—"}
                        </td>
                        <td className="p-2 text-right font-mono">{item.close_import != null ? Number(item.close_import).toLocaleString("id-ID") : "—"}</td>
                        <td className="p-2 text-right font-mono">{item.high_price != null ? Number(item.high_price).toLocaleString("id-ID") : "—"}</td>
                        <td className={cn("p-2 text-right font-mono font-semibold",
                          item.pct_open_to_high != null && item.pct_open_to_high >= 2 ? "text-gain" : "text-loss"
                        )}>
                          {item.pct_open_to_high != null ? `${item.pct_open_to_high.toFixed(2)}%` : "—"}
                        </td>
                        <td className="p-2 text-center">
                          {item.result === "WIN" ? (
                            <Badge className="bg-gain/20 text-gain border-gain/30 text-[10px]">WIN</Badge>
                          ) : (
                            <Badge className="bg-loss/20 text-loss border-loss/30 text-[10px]">LOSE</Badge>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground max-w-[120px] truncate">{item.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-border pt-3 mt-2">
                <span className="text-muted-foreground">
                  Avg % Gain: <span className="font-mono font-semibold">{selectedDay.avgPct.toFixed(2)}%</span>
                </span>
                <span className={cn("font-bold font-mono", selectedDay.winRate >= 70 ? "text-gain" : "text-loss")}>
                  Win Rate: {selectedDay.winRate.toFixed(1)}% ({selectedDay.winRate >= 70 ? "WIN DAY ✅" : "LOSE DAY ❌"})
                </span>
              </div>
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
