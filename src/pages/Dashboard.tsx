import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTrades } from "@/hooks/useTrades";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useCategories } from "@/hooks/useCategories";
import { useBandarmology } from "@/hooks/useBandarmology";
import { useAccumWatch } from "@/hooks/useAccumWatch";
import { useWrScanner } from "@/hooks/useWrScanner";
import { useModalSummary } from "@/hooks/useModalTransactions";
import { useEquityToggle, useEquityCalc, type DisplayMode } from "@/hooks/useEquityToggle";
import { useIHSG } from "@/hooks/useIHSG";
import { DisplayModeToggle } from "@/components/DisplayModeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calculatePositions } from "@/lib/positionCalculator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  TrendingUp, TrendingDown, DollarSign, Target, BarChart3,
  RefreshCw, ChevronDown, Award, AlertTriangle, Activity,
  Briefcase, ArrowRight, Zap, Eye, Clock, Wallet,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  Area, AreaChart, ReferenceLine, Legend, ComposedChart,
} from "recharts";
import { cn } from "@/lib/utils";

type PeriodFilter = "today" | "week" | "month" | "3month" | "all";
type ChartPeriod = "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

function getChartDateStart(p: ChartPeriod): string {
  const now = new Date();
  let start: Date;
  switch (p) {
    case "1W": start = new Date(now); start.setDate(now.getDate() - 7); break;
    case "1M": start = new Date(now); start.setMonth(now.getMonth() - 1); break;
    case "3M": start = new Date(now); start.setMonth(now.getMonth() - 3); break;
    case "YTD": start = new Date(now.getFullYear(), 0, 1); break;
    case "1Y": start = new Date(now); start.setFullYear(now.getFullYear() - 1); break;
    default: return "2020-01-01";
  }
  return start.toISOString().split("T")[0];
}

function getDateRange(period: PeriodFilter): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  let start: Date;
  switch (period) {
    case "today": start = now; break;
    case "week": start = new Date(now); start.setDate(now.getDate() - 7); break;
    case "month": start = new Date(now); start.setMonth(now.getMonth() - 1); break;
    case "3month": start = new Date(now); start.setMonth(now.getMonth() - 3); break;
    default: start = new Date("2020-01-01");
  }
  return { start: start.toISOString().split("T")[0], end };
}

function useSectionCollapse(key: string, defaultOpen = true) {
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(`dashboard-section-${key}`);
    return saved !== null ? saved === "true" : defaultOpen;
  });
  const toggle = useCallback((val: boolean) => {
    setOpen(val);
    localStorage.setItem(`dashboard-section-${key}`, String(val));
  }, [key]);
  return { open, toggle };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: trades } = useTrades();
  const { data: categories } = useCategories();
  const {
    portfolioPositions, closedPositions,
    totalPortfolioValue, totalUnrealizedPL, totalRealizedPL,
  } = usePortfolio();
  const { items: bandarItems, getLatestForDate, getTodayData } = useBandarmology();
  const { items: accumItems, getWatching, getConfirmed } = useAccumWatch();
  const { data: wrScannerItems } = useWrScanner();
  const { totalTopUp, totalWithdraw, modalBersih: modalBersihSummary, lastTransaction, getModalBersihUntil } = useModalSummary();
  const { data: ihsgMap } = useIHSG(new Date());

  const { mode, toggle: toggleMode } = useEquityToggle();
  const { formatValue, formatRupiah, totalEquity, modalBersih, returnPct } = useEquityCalc();

  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("3M");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // SK Monitoring
  const { data: skItems } = useQuery({
    queryKey: ["sk_monitoring_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sk_monitoring").select("*").eq("status", "MONITORING");
      if (error) throw error;
      return data || [];
    },
  });

  // Swing Monitoring
  const { data: swingItems } = useQuery({
    queryKey: ["swing_monitoring_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("swing_monitoring").select("*").eq("status", "MONITORING");
      if (error) throw error;
      return data || [];
    },
  });

  const refreshAll = () => {
    queryClient.invalidateQueries();
  };

  // Filter trades by period & category
  const filteredTrades = useMemo(() => {
    if (!trades) return [];
    const { start, end } = getDateRange(period);
    return trades.filter((t: any) => {
      const inPeriod = t.trade_date >= start && t.trade_date <= end;
      const inCategory = selectedCategories.length === 0 || selectedCategories.includes(t.category_id);
      return inPeriod && inCategory;
    });
  }, [trades, period, selectedCategories]);

  // Compute stats from filtered trades using FIFO
  const stats = useMemo(() => {
    const result = calculatePositions(filteredTrades);

    let totalProfit = 0, totalLoss = 0, winCount = 0, lossCount = 0;
    const tradeResults: { ticker: string; pl: number; date: string }[] = [];
    const categoryPL: Record<string, number> = {};

    for (const c of result.closedTrades) {
      tradeResults.push({ ticker: c.ticker, pl: c.realizedPL, date: c.date });
      const cat = c.categoryName || "Tanpa Kategori";
      categoryPL[cat] = (categoryPL[cat] || 0) + c.realizedPL;
      if (c.realizedPL >= 0) { totalProfit += c.realizedPL; winCount++; }
      else { totalLoss += Math.abs(c.realizedPL); lossCount++; }
    }

    const totalTrades = filteredTrades.length;
    const closedCount = winCount + lossCount;
    const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;
    const avgProfit = winCount > 0 ? totalProfit / winCount : 0;
    const avgLoss = lossCount > 0 ? totalLoss / lossCount : 0;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
    const realizedPL = totalProfit - totalLoss;

    const sorted = [...tradeResults].sort((a, b) => b.pl - a.pl);
    const best = sorted[0] || null;
    const worst = sorted[sorted.length - 1] || null;

    // Daily P/L for charts - aggregate closed trade P/L by date
    const dailyPL: Record<string, number> = {};
    for (const c of result.closedTrades) {
      dailyPL[c.date] = (dailyPL[c.date] || 0) + c.realizedPL;
    }

    // Equity curve
    const allDates = Object.keys(dailyPL).sort();
    let cumulativeEquity = modalBersih;
    const equityCurve = allDates.map(date => {
      cumulativeEquity += dailyPL[date];
      return { date, equity: cumulativeEquity };
    });

    const categoryData = Object.entries(categoryPL)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalTrades, winCount, lossCount, winRate, avgProfit, avgLoss,
      profitFactor, realizedPL, best, worst, dailyPL, equityCurve, categoryData,
    };
  }, [filteredTrades, modalBersih]);

  const fmtPL = (val: number) => formatValue(val, mode);

  // Section collapse
  const s0 = useSectionCollapse("equityVsIhsg");
  const s1 = useSectionCollapse("portfolio");
  const s2 = useSectionCollapse("activity");
  const s3 = useSectionCollapse("charts");
  const s4 = useSectionCollapse("screener");
  const s5 = useSectionCollapse("bandarmology");
  const s6 = useSectionCollapse("monitoring");

  // Bandarmology snapshot
  const todayBandar = getTodayData();
  const tierS = todayBandar.filter(b => b.tier === "S").slice(0, 5);
  const newTop20 = todayBandar.filter(b => b.is_new_entry).slice(0, 5);
  const watching = getWatching();
  const confirmed = getConfirmed();

  // Equity vs IHSG chart data — uses chartPeriod (separate from global filter)
  const equityVsIhsg = useMemo(() => {
    if (!trades || !ihsgMap || ihsgMap.size === 0) return null;

    const start = getChartDateStart(chartPeriod);
    const result = calculatePositions(trades);

    // Use IHSG dates as the timeline (trading days only)
    const ihsgDates: string[] = [];
    for (const [d] of ihsgMap) {
      if (d >= start) ihsgDates.push(d);
    }
    ihsgDates.sort();
    if (ihsgDates.length === 0) return null;

    // Pre-compute cumulative realized P/L by date
    const plByDate: Record<string, number> = {};
    for (const c of result.closedTrades) {
      plByDate[c.date] = (plByDate[c.date] || 0) + c.realizedPL;
    }
    const allPlDates = Object.keys(plByDate).sort();

    // Realized P/L before period start
    let prePL = 0;
    for (const c of result.closedTrades) {
      if (c.date < start) prePL += c.realizedPL;
    }

    // Compute equity for each IHSG date
    // equity = modal bersih until date + cumulative realized PL until date
    // (no unrealized since we don't have historical prices)
    let startModal = getModalBersihUntil(start);
    
    // Fallback: if no modal transactions, use total buy cost as proxy capital
    if (startModal <= 0) {
      let totalBuyCost = 0;
      for (const t of (trades || [])) {
        if (t.trade_type === "BUY") totalBuyCost += (t.lots || 0) * 100 * (t.price || 0);
      }
      if (totalBuyCost > 0) startModal = totalBuyCost;
    }
    
    const startEquity = startModal + prePL;
    if (startEquity <= 0) return null;

    let runningPL = prePL;
    let plIdx = 0;
    // advance plIdx past pre-period dates
    while (plIdx < allPlDates.length && allPlDates[plIdx] < start) plIdx++;

    const ihsgStart = ihsgMap.get(ihsgDates[0])?.close || 0;
    if (ihsgStart <= 0) return null;

    const chartData: any[] = [];

    for (const date of ihsgDates) {
      // Add any realized PL on or before this date
      while (plIdx < allPlDates.length && allPlDates[plIdx] <= date) {
        runningPL += plByDate[allPlDates[plIdx]];
        plIdx++;
      }
      let modalNow = getModalBersihUntil(date);
      if (modalNow <= 0) modalNow = startModal; // use same fallback
      const equity = modalNow + runningPL;
      const eqPct = ((equity - startEquity) / startEquity) * 100;

      const ihsg = ihsgMap.get(date);
      const ihsgPct = ihsg ? ((ihsg.close - ihsgStart) / ihsgStart) * 100 : null;

      chartData.push({
        date,
        portfolioPct: Math.round(eqPct * 100) / 100,
        ihsgPct: ihsgPct !== null ? Math.round(ihsgPct * 100) / 100 : undefined,
        equityRp: equity,
        ihsgClose: ihsg?.close,
      });
    }

    const lastPoint = chartData[chartData.length - 1];
    const equityReturn = lastPoint?.portfolioPct || 0;
    const ihsgReturn = lastPoint?.ihsgPct || 0;
    const alpha = equityReturn - ihsgReturn;

    // Pearson correlation on daily changes
    const paired = chartData.filter(d => d.ihsgPct !== undefined);
    let correlation = 0;
    if (paired.length > 2) {
      // Use day-over-day changes for correlation
      const eqChanges: number[] = [];
      const ihChanges: number[] = [];
      for (let i = 1; i < paired.length; i++) {
        eqChanges.push(paired[i].portfolioPct - paired[i - 1].portfolioPct);
        ihChanges.push(paired[i].ihsgPct - paired[i - 1].ihsgPct);
      }
      if (eqChanges.length > 1) {
        const meanEq = eqChanges.reduce((a, b) => a + b, 0) / eqChanges.length;
        const meanIh = ihChanges.reduce((a, b) => a + b, 0) / ihChanges.length;
        let num = 0, denEq = 0, denIh = 0;
        for (let i = 0; i < eqChanges.length; i++) {
          const dE = eqChanges[i] - meanEq;
          const dI = ihChanges[i] - meanIh;
          num += dE * dI;
          denEq += dE * dE;
          denIh += dI * dI;
        }
        const den = Math.sqrt(denEq * denIh);
        correlation = den > 0 ? (num / den) * 100 : 0;
      }
    }

    const correlationLabel = Math.abs(correlation) > 70 ? "Bergerak sama dengan IHSG" : Math.abs(correlation) > 30 ? "Korelasi sedang" : "Independen dari IHSG";

    return { chartData, equityReturn, ihsgReturn, alpha, correlation, correlationLabel, startDate: ihsgDates[0] };
  }, [trades, ihsgMap, chartPeriod, getModalBersihUntil]);

  // WR Scanner summary
  const todayStr = new Date().toISOString().split("T")[0];
  const latestWr = wrScannerItems?.filter(w => w.status === "OPEN") || [];

  // SK / Swing Monitoring
  const skMon = skItems || [];
  const swMon = swingItems || [];

  return (
    <div className="space-y-4">
      {/* FILTER GLOBAL */}
      <div className="sticky top-14 z-30 bg-background/95 backdrop-blur-sm border-b border-border pb-3 pt-2 -mx-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground mr-2">Dashboard</h1>
            {(["today", "week", "month", "3month", "all"] as PeriodFilter[]).map(p => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPeriod(p)}
              >
                {p === "today" ? "Hari Ini" : p === "week" ? "7 Hari" : p === "month" ? "1 Bulan" : p === "3month" ? "3 Bulan" : "Semua"}
              </Button>
            ))}
            {categories && categories.length > 0 && (
              <Select
                value={selectedCategories.length === 0 ? "all" : selectedCategories[0]}
                onValueChange={(v) => setSelectedCategories(v === "all" ? [] : [v])}
              >
                <SelectTrigger className="h-7 w-[140px] text-xs">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kategori</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DisplayModeToggle mode={mode} onToggle={toggleMode} />
            <Button variant="outline" size="sm" className="h-7" onClick={refreshAll}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* SECTION 0 — CUMULATIVE PORTFOLIO RETURN vs IHSG */}
      <CollapsibleSection title="📈 Cumulative Portfolio Return" {...s0}>
        {equityVsIhsg && equityVsIhsg.chartData.length > 1 ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="bg-accent/30 rounded-lg p-3 border border-border">
                <div className="text-[10px] text-muted-foreground mb-1">Portfolio</div>
                <div className={cn("text-sm font-bold font-mono-data", equityVsIhsg.equityReturn >= 0 ? "text-gain" : "text-loss")}>
                  {equityVsIhsg.equityReturn >= 0 ? "+" : ""}{equityVsIhsg.equityReturn.toFixed(2)}%
                </div>
                <div className="text-[9px] text-muted-foreground">sejak {equityVsIhsg.startDate}</div>
              </div>
              <div className="bg-accent/30 rounded-lg p-3 border border-border">
                <div className="text-[10px] text-muted-foreground mb-1">IHSG</div>
                <div className={cn("text-sm font-bold font-mono-data", equityVsIhsg.ihsgReturn >= 0 ? "text-gain" : "text-loss")}>
                  {equityVsIhsg.ihsgReturn >= 0 ? "+" : ""}{equityVsIhsg.ihsgReturn.toFixed(2)}%
                </div>
                <div className="text-[9px] text-muted-foreground">sejak {equityVsIhsg.startDate}</div>
              </div>
              <div className="bg-accent/30 rounded-lg p-3 border border-border">
                <div className="text-[10px] text-muted-foreground mb-1">Alpha</div>
                <div className={cn("text-sm font-bold font-mono-data", equityVsIhsg.alpha >= 0 ? "text-gain" : "text-loss")}>
                  {equityVsIhsg.alpha >= 0 ? "+" : ""}{equityVsIhsg.alpha.toFixed(2)}%
                  {equityVsIhsg.alpha >= 0 ? " ✅" : " ❌"}
                </div>
                <div className="text-[9px] text-muted-foreground">{equityVsIhsg.alpha >= 0 ? "Outperform" : "Underperform"}</div>
              </div>
              <div className="bg-accent/30 rounded-lg p-3 border border-border">
                <div className="text-[10px] text-muted-foreground mb-1">Korelasi</div>
                <div className="text-sm font-bold font-mono-data text-foreground">
                  {Math.abs(equityVsIhsg.correlation).toFixed(1)}%
                </div>
                <div className="text-[9px] text-muted-foreground">{equityVsIhsg.correlationLabel}</div>
              </div>
            </div>
            <Card className="border-border bg-[hsl(220,20%,8%)]">
              <CardContent className="pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded" style={{ background: "#00FF88" }} />
                      <span className="text-muted-foreground">Portfolio</span>
                      <span className={cn("font-mono-data font-semibold", equityVsIhsg.equityReturn >= 0 ? "text-gain" : "text-loss")}>
                        {equityVsIhsg.equityReturn >= 0 ? "+" : ""}{equityVsIhsg.equityReturn.toFixed(2)}%
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-0.5 rounded" style={{ background: "#A855F7" }} />
                      <span className="text-muted-foreground">IHSG</span>
                      <span className={cn("font-mono-data font-semibold", equityVsIhsg.ihsgReturn >= 0 ? "text-gain" : "text-loss")}>
                        {equityVsIhsg.ihsgReturn >= 0 ? "+" : ""}{equityVsIhsg.ihsgReturn.toFixed(2)}%
                      </span>
                    </span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={equityVsIhsg.chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <defs>
                      <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00FF88" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#00FF88" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 15%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215 15% 40%)" }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(215 15% 40%)" }} tickFormatter={(v) => `${v}%`} width={45} />
                    <ReferenceLine y={0} stroke="hsl(215 15% 30%)" strokeDasharray="5 5" />
                    <Tooltip
                      contentStyle={{ background: "hsl(220 20% 8%)", border: "1px solid hsl(220 14% 20%)", borderRadius: 8, fontSize: 11 }}
                      formatter={(value: any, name: string) => {
                        const v = `${value >= 0 ? "+" : ""}${value}%`;
                        return [v, name === "portfolioPct" ? "Portfolio" : "IHSG"];
                      }}
                      labelFormatter={(label) => `📅 ${label}`}
                    />
                    <Area type="monotone" dataKey="portfolioPct" stroke="#00FF88" strokeWidth={2} fill="url(#portfolioFill)" dot={false} name="portfolioPct" />
                    <Line type="monotone" dataKey="ihsgPct" stroke="#A855F7" strokeWidth={1.5} dot={false} name="ihsgPct" />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-1 mt-2">
                  {(["1W", "1M", "3M", "YTD", "1Y", "ALL"] as ChartPeriod[]).map(p => (
                    <Button
                      key={p}
                      variant={chartPeriod === p ? "default" : "ghost"}
                      size="sm"
                      className="h-6 px-2.5 text-[10px]"
                      onClick={() => setChartPeriod(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="h-[120px] flex items-center justify-center text-muted-foreground text-xs">
            Belum cukup data — tambahkan transaksi modal dan trading untuk melihat perbandingan
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="📊 Portfolio Overview" {...s1}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            icon={Briefcase} label="Total Equity"
            value={formatRupiah(totalEquity)}
            sub={`Modal: ${formatRupiah(modalBersih)} | Return: ${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`}
            color={totalEquity >= modalBersih ? "gain" : "loss"}
          />
          <Card className="gradient-card border-border cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate("/modal-equity")}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <Wallet className="h-4 w-4" /> Modal
              </div>
              <p className="text-lg font-bold font-mono-data text-foreground">{formatRupiah(modalBersihSummary)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {lastTransaction ? `Terakhir: ${lastTransaction.tanggal}` : "Belum ada transaksi"}
              </p>
            </CardContent>
          </Card>
          <SummaryCard
            icon={DollarSign} label="Realized P/L"
            value={fmtPL(totalRealizedPL)}
            sub={`${closedPositions.length} posisi tertutup`}
            color={totalRealizedPL >= 0 ? "gain" : "loss"}
          />
          <SummaryCard
            icon={totalUnrealizedPL >= 0 ? TrendingUp : TrendingDown}
            label="Unrealized P/L"
            value={fmtPL(totalUnrealizedPL)}
            sub={`${portfolioPositions.length} posisi aktif`}
            color={totalUnrealizedPL >= 0 ? "gain" : "loss"}
          />
          <SummaryCard
            icon={Target} label="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            sub={`${stats.winCount}W / ${stats.lossCount}L`}
            color={stats.winRate >= 50 ? "gain" : "loss"}
          />
          <SummaryCard
            icon={Award} label="Best Trade"
            value={stats.best ? `${stats.best.ticker}` : "-"}
            sub={stats.best ? fmtPL(stats.best.pl) : ""}
            color="gain"
          />
          <SummaryCard
            icon={AlertTriangle} label="Worst Trade"
            value={stats.worst ? `${stats.worst.ticker}` : "-"}
            sub={stats.worst ? fmtPL(stats.worst.pl) : ""}
            color="loss"
          />
        </div>
      </CollapsibleSection>

      {/* SECTION 2 — TRADING ACTIVITY */}
      <CollapsibleSection title="📈 Trading Activity" {...s2}>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <MiniStatCard label="Total Trade" value={`${stats.totalTrades}`} />
          <MiniStatCard label="Avg Profit/Win" value={fmtPL(stats.avgProfit)} color="gain" />
          <MiniStatCard label="Avg Loss/Lose" value={fmtPL(stats.avgLoss)} color="loss" />
          <MiniStatCard label="Profit Factor" value={stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)} />
          <MiniStatCard label="Realized P/L Periode" value={fmtPL(stats.realizedPL)} color={stats.realizedPL >= 0 ? "gain" : "loss"} />
          <MiniStatCard label="Portfolio Value" value={formatRupiah(totalPortfolioValue)} />
        </div>
      </CollapsibleSection>

      {/* SECTION 3 — CHARTS */}
      <CollapsibleSection title="📉 Charts" {...s3}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Equity Curve */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">Equity Curve</CardTitle></CardHeader>
            <CardContent>
              {stats.equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={stats.equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} tickFormatter={(v) => `${(v/1e6).toFixed(1)}M`} />
                    <Tooltip contentStyle={{ background: "hsl(220 18% 10%)", border: "1px solid hsl(220 14% 18%)", borderRadius: 8, fontSize: 11 }} />
                    <Line type="monotone" dataKey="equity" stroke="hsl(142 60% 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>

          {/* Daily P/L Bar */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">P/L Harian</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(stats.dailyPL).length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={Object.entries(stats.dailyPL).sort(([a],[b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} />
                    <Tooltip contentStyle={{ background: "hsl(220 18% 10%)", border: "1px solid hsl(220 14% 18%)", borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {Object.entries(stats.dailyPL).sort(([a],[b]) => a.localeCompare(b)).map(([date, value], i) => (
                        <Cell key={i} fill={value >= 0 ? "hsl(142 60% 45%)" : "hsl(0 72% 51%)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>

          {/* Win/Loss Pie */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">Win / Loss</CardTitle></CardHeader>
            <CardContent>
              {(stats.winCount + stats.lossCount) > 0 ? (
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Win", value: stats.winCount },
                          { name: "Loss", value: stats.lossCount },
                        ]}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={75}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill="hsl(142 60% 45%)" />
                        <Cell fill="hsl(0 72% 51%)" />
                      </Pie>
                      <Tooltip contentStyle={{ background: "hsl(220 18% 10%)", border: "1px solid hsl(220 14% 18%)", borderRadius: 8, fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 ml-4">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-gain" />
                      Win: {stats.winCount} ({stats.winRate.toFixed(1)}%)
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full bg-loss" />
                      Loss: {stats.lossCount} ({(100 - stats.winRate).toFixed(1)}%)
                    </div>
                  </div>
                </div>
              ) : <EmptyChart />}
            </CardContent>
          </Card>

          {/* P/L per Kategori */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">P/L per Kategori</CardTitle></CardHeader>
            <CardContent>
              {stats.categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats.categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 14% 18%)" />
                    <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 9, fill: "hsl(215 15% 50%)" }} />
                    <Tooltip contentStyle={{ background: "hsl(220 18% 10%)", border: "1px solid hsl(220 14% 18%)", borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                      {stats.categoryData.map((entry, i) => (
                        <Cell key={i} fill={entry.value >= 0 ? "hsl(142 60% 45%)" : "hsl(0 72% 51%)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>

      {/* SECTION 4 — SCREENER SUMMARY */}
      <CollapsibleSection title="🔍 Screener Summary" {...s4}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniStatCard label="WR Scanner (Open)" value={`${latestWr.length} saham`} />
          <MiniStatCard label="SK Monitoring" value={`${skMon.length} saham`} />
          <MiniStatCard label="Swing Monitoring" value={`${swMon.length} saham`} />
        </div>
        {latestWr.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Top Saham dari WR Scanner</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/wr-scanner")}>
                Lihat Semua <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            <div className="space-y-1">
              {latestWr.slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center justify-between p-2 rounded bg-accent/30 border border-border text-xs">
                  <span className="font-bold font-mono-data">{w.ticker}</span>
                  <div className="flex items-center gap-2">
                    {w.param_count !== null && (
                      <Badge variant="outline" className="text-[10px]">{w.param_count}/8 param</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {(w.screener_names || []).join(", ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/analisa-entry")}>
            <Zap className="h-3 w-3 mr-1" /> Lihat Analisa Entry
          </Button>
        </div>
      </CollapsibleSection>

      {/* SECTION 5 — BANDARMOLOGY SNAPSHOT */}
      <CollapsibleSection title="🏦 Bandarmology Snapshot" {...s5}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Tier S */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">Tier S Hari Ini</CardTitle></CardHeader>
            <CardContent>
              {tierS.length > 0 ? (
                <div className="space-y-1">
                  {tierS.map(b => (
                    <div key={b.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-accent/30">
                      <span className="font-bold font-mono-data">{b.ticker}</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>#{b.rank_score}</span>
                        <span>{b.composite_pct?.toFixed(1)}%</span>
                        {b.streak && <span>🔥{b.streak}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">Belum ada data hari ini</p>}
            </CardContent>
          </Card>

          {/* New Entry */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">Masuk Top 20 Baru</CardTitle></CardHeader>
            <CardContent>
              {newTop20.length > 0 ? (
                <div className="space-y-1">
                  {newTop20.map(b => (
                    <div key={b.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-accent/30">
                      <span className="font-bold font-mono-data">{b.ticker}</span>
                      <Badge className="bg-primary/10 text-primary text-[10px]">NEW</Badge>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">Tidak ada entry baru</p>}
            </CardContent>
          </Card>

          {/* Accum Watch */}
          <Card className="border-border">
            <CardHeader className="pb-2"><CardTitle className="text-xs">Accum Watch</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Total Watching</span><span className="font-bold">{watching.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tier S</span><span className="font-bold">{watching.filter(w => w.tier_saat_masuk === "S").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tier A</span><span className="font-bold">{watching.filter(w => w.tier_saat_masuk === "A").length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Confirmed</span><span className="font-bold text-gain">{confirmed.length}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-3 flex justify-center">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate("/bandarmology")}>
            <Eye className="h-3 w-3 mr-1" /> Lihat Bandarmology
          </Button>
        </div>
      </CollapsibleSection>

      {/* SECTION 6 — MONITORING STATUS */}
      <CollapsibleSection title="📡 Monitoring Status" {...s6}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SK Monitoring */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs">SK Monitoring ({skMon.length})</CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/sk-monitoring")}>
                  Detail <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {skMon.length > 0 ? (
                <div className="space-y-1">
                  {skMon.slice(0, 5).map((s: any) => {
                    const daysSince = Math.floor((Date.now() - new Date(s.tanggal_masuk).getTime()) / 86400000);
                    return (
                      <div key={s.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-accent/30">
                        <span className="font-bold font-mono-data">{s.ticker}</span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>Day {daysSince}</span>
                          {s.jalur_masuk && <Badge variant="outline" className="text-[10px]">{s.jalur_masuk}</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-muted-foreground">Tidak ada monitoring aktif</p>}
            </CardContent>
          </Card>

          {/* Swing Monitoring */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs">Swing Monitoring ({swMon.length})</CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => navigate("/swing-monitoring")}>
                  Detail <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {swMon.length > 0 ? (
                <div className="space-y-1">
                  {swMon.slice(0, 5).map((s: any) => {
                    const daysSince = Math.floor((Date.now() - new Date(s.tanggal_masuk).getTime()) / 86400000);
                    const isOptimal = s.entry_day_rekomendasi && daysSince === s.entry_day_rekomendasi;
                    return (
                      <div key={s.id} className={cn(
                        "flex items-center justify-between text-xs p-1.5 rounded",
                        isOptimal ? "bg-primary/10 border border-primary/30" : "bg-accent/30"
                      )}>
                        <span className="font-bold font-mono-data">{s.ticker}</span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>Day {daysSince}</span>
                          <Badge variant="outline" className="text-[10px]">{s.screener_name}</Badge>
                          {isOptimal && <Badge className="bg-primary/20 text-primary text-[10px]">ENTRY</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-xs text-muted-foreground">Tidak ada monitoring aktif</p>}
            </CardContent>
          </Card>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// --- Shared Components ---

function CollapsibleSection({
  title, open, toggle, children,
}: {
  title: string; open: boolean; toggle: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={toggle}>
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2 px-1 hover:bg-accent/30 rounded-lg transition-colors">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SummaryCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: "gain" | "loss";
}) {
  return (
    <Card className="gradient-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className={cn("h-4 w-4", color === "gain" ? "text-gain" : color === "loss" ? "text-loss" : "")} />
          {label}
        </div>
        <p className={cn("text-lg font-bold font-mono-data", color === "gain" ? "text-gain" : color === "loss" ? "text-loss" : "text-foreground")}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MiniStatCard({ label, value, color }: { label: string; value: string; color?: "gain" | "loss" }) {
  return (
    <div className="bg-accent/30 rounded-lg p-3 border border-border">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-sm font-bold font-mono-data", color === "gain" ? "text-gain" : color === "loss" ? "text-loss" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">
      Belum ada data
    </div>
  );
}
