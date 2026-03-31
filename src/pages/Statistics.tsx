import { useMemo, useState } from "react";
import { useTrades } from "@/hooks/useTrades";
import { useCategories } from "@/hooks/useCategories";
import { calculatePositions } from "@/lib/positionCalculator";
import { useEquityToggle, useEquityCalc } from "@/hooks/useEquityToggle";
import { DisplayModeToggle } from "@/components/DisplayModeToggle";
import { TradingCalendar } from "@/components/TradingCalendar";
import { StampDutySection } from "@/components/StampDutySection";
import { TickerSummarySection } from "@/components/statistics/TickerSummarySection";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, Target, BarChart3, DollarSign,
  Award, AlertTriangle, Activity,
} from "lucide-react";

export default function Statistics() {
  const { data: trades } = useTrades();
  const { data: categories } = useCategories();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const { mode, toggle } = useEquityToggle();
  const { formatValue, formatRupiah } = useEquityCalc();

  const stats = useMemo(() => {
    if (!trades || trades.length === 0) return null;

    const filteredTrades = selectedCategory === "all"
      ? trades
      : trades.filter((t: any) => t.category_id === selectedCategory);

    const result = calculatePositions(filteredTrades);

    let totalProfit = 0;
    let totalLoss = 0;
    let winCount = 0;
    let lossCount = 0;

    // Aggregate per ticker for display
    const tickerPL: Record<string, number> = {};
    for (const c of result.closedTrades) {
      tickerPL[c.ticker] = (tickerPL[c.ticker] || 0) + c.realizedPL;
      if (c.realizedPL >= 0) { totalProfit += c.realizedPL; winCount++; }
      else { totalLoss += Math.abs(c.realizedPL); lossCount++; }
    }

    const tradeResults = Object.entries(tickerPL).map(([ticker, pl]) => ({ ticker, pl }));

    const totalTrades = filteredTrades.length;
    const totalClosedTrades = winCount + lossCount;
    const winRate = totalClosedTrades > 0 ? (winCount / totalClosedTrades) * 100 : 0;
    const avgProfit = winCount > 0 ? totalProfit / winCount : 0;
    const avgLoss = lossCount > 0 ? totalLoss / lossCount : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
    const totalEquity = totalProfit - totalLoss;

    return {
      totalTrades, totalClosedTrades, winCount, lossCount, winRate,
      avgProfit, avgLoss, profitFactor, totalProfit, totalLoss, totalEquity,
      tradeResults,
    };
  }, [trades, selectedCategory]);

  const fmtPL = (val: number) => formatValue(val, mode);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Statistik</h1>
        <DisplayModeToggle mode={mode} onToggle={toggle} />
      </div>

      <TradingCalendar displayMode={mode} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Ringkasan Trading</h2>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[200px] text-xs h-9">
            <SelectValue placeholder="Semua Kategori" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Kategori</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!stats ? (
        <Card className="border-border">
          <CardContent className="py-12 text-center text-muted-foreground">
            Belum ada data trading untuk ditampilkan
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={BarChart3} label="Total Trading" value={`${stats.totalTrades}`} />
            <StatCard icon={Target} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} color={stats.winRate >= 50 ? "gain" : "loss"} />
            <StatCard icon={Award} label="Total Menang" value={`${stats.winCount}`} color="gain" />
            <StatCard icon={AlertTriangle} label="Total Kalah" value={`${stats.lossCount}`} color="loss" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={TrendingUp} label="Avg Profit" value={fmtPL(stats.avgProfit)} color="gain" />
            <StatCard icon={TrendingDown} label="Avg Loss" value={fmtPL(stats.avgLoss)} color="loss" />
            <StatCard icon={Activity} label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} />
            <StatCard icon={DollarSign} label="Total Equity" value={fmtPL(stats.totalEquity)} color={stats.totalEquity >= 0 ? "gain" : "loss"} />
          </div>

          <TickerSummarySection
            trades={trades}
            selectedCategory={selectedCategory}
            mode={mode}
            formatValue={formatValue}
            formatRupiah={formatRupiah}
          />
        </>
      )}

      <StampDutySection />
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType; label: string; value: string; color?: "gain" | "loss";
}) {
  return (
    <Card className="gradient-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <p className={`text-lg font-bold font-mono-data ${
          color === "gain" ? "text-gain" : color === "loss" ? "text-loss" : "text-foreground"
        }`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
