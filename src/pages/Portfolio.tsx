import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useTrades } from "@/hooks/useTrades";
import { useEquityToggle, useEquityCalc } from "@/hooks/useEquityToggle";
import { DisplayModeToggle } from "@/components/DisplayModeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Briefcase, DollarSign, Trophy, AlertTriangle, Search, X, ArrowUp, ArrowDown } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4", "#e11d48"];

type SortKey = "ticker" | "name" | "lots" | "shares" | "avgBuy" | "currentPrice" | "buyCost" | "marketValue" | "plRp" | "plPct" | "contribution" | "firstBuyDate" | "holdDays";
type SortDir = "asc" | "desc";

export default function Portfolio() {
  const {
    portfolioPositions, closedPositions,
    totalPortfolioValue, totalUnrealizedPL, totalRealizedPL,
    isLoading,
  } = usePortfolio();
  const { data: trades } = useTrades();
  const navigate = useNavigate();

  const { mode, toggle } = useEquityToggle();
  const { formatValue, formatRupiah } = useEquityCalc();

  // Filters
  const [searchTicker, setSearchTicker] = useState("");
  const [filterPL, setFilterPL] = useState<"ALL" | "PROFIT" | "LOSS">("ALL");
  const [filterContrib, setFilterContrib] = useState<"ALL" | "5" | "10" | "20">("ALL");
  const [filterHold, setFilterHold] = useState<"ALL" | "7" | "7-30" | "30">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("contribution");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Enrich positions with first buy date, hold days, contribution, name
  const enrichedPositions = useMemo(() => {
    if (!portfolioPositions.length) return [];
    const totalMV = portfolioPositions.reduce((s, p) => s + p.currentPrice * p.totalLots * 100, 0);

    return portfolioPositions.map(p => {
      const tickerTrades = trades?.filter((t: any) => t.ticker === p.ticker && t.trade_type === "BUY")
        .sort((a: any, b: any) => a.trade_date.localeCompare(b.trade_date)) || [];
      const firstBuyDate = tickerTrades[0]?.trade_date || "";
      const holdDays = firstBuyDate ? Math.floor((Date.now() - new Date(firstBuyDate + "T00:00:00").getTime()) / 86400000) : 0;
      const shares = p.totalLots * 100;
      const buyCost = p.totalBuyCost;
      const marketValue = p.currentPrice * shares;
      const contribution = totalMV > 0 ? (marketValue / totalMV) * 100 : 0;

      return {
        ...p,
        shares,
        buyCost,
        marketValue,
        contribution,
        firstBuyDate,
        holdDays,
        name: "", // Yahoo doesn't always return name in portfolio hook
      };
    });
  }, [portfolioPositions, trades]);

  // Apply filters
  const filteredPositions = useMemo(() => {
    let result = [...enrichedPositions];
    if (searchTicker) result = result.filter(p => p.ticker.toLowerCase().includes(searchTicker.toLowerCase()));
    if (filterPL === "PROFIT") result = result.filter(p => p.unrealizedPL >= 0);
    if (filterPL === "LOSS") result = result.filter(p => p.unrealizedPL < 0);
    if (filterContrib !== "ALL") {
      const min = Number(filterContrib);
      result = result.filter(p => p.contribution >= min);
    }
    if (filterHold !== "ALL") {
      if (filterHold === "7") result = result.filter(p => p.holdDays < 7);
      else if (filterHold === "7-30") result = result.filter(p => p.holdDays >= 7 && p.holdDays <= 30);
      else if (filterHold === "30") result = result.filter(p => p.holdDays > 30);
    }

    result.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "ticker": av = a.ticker; bv = b.ticker; break;
        case "lots": av = a.totalLots; bv = b.totalLots; break;
        case "shares": av = a.shares; bv = b.shares; break;
        case "avgBuy": av = a.avgBuyPrice; bv = b.avgBuyPrice; break;
        case "currentPrice": av = a.currentPrice; bv = b.currentPrice; break;
        case "buyCost": av = a.buyCost; bv = b.buyCost; break;
        case "marketValue": av = a.marketValue; bv = b.marketValue; break;
        case "plRp": av = a.unrealizedPL; bv = b.unrealizedPL; break;
        case "plPct": av = a.unrealizedPLPercent; bv = b.unrealizedPLPercent; break;
        case "contribution": av = a.contribution; bv = b.contribution; break;
        case "firstBuyDate": av = a.firstBuyDate; bv = b.firstBuyDate; break;
        case "holdDays": av = a.holdDays; bv = b.holdDays; break;
        default: av = a.contribution; bv = b.contribution;
      }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [enrichedPositions, searchTicker, filterPL, filterContrib, filterHold, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
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

  const totalBuyCost = enrichedPositions.reduce((s, p) => s + p.buyCost, 0);
  const totalMarketValue = enrichedPositions.reduce((s, p) => s + p.marketValue, 0);
  const totalUnrealizedPLPct = totalBuyCost > 0 ? ((totalUnrealizedPL / totalBuyCost) * 100) : 0;

  const bestPerformer = enrichedPositions.length > 0
    ? enrichedPositions.reduce((best, p) => p.unrealizedPLPercent > best.unrealizedPLPercent ? p : best)
    : null;
  const worstPerformer = enrichedPositions.length > 0
    ? enrichedPositions.reduce((worst, p) => p.unrealizedPLPercent < worst.unrealizedPLPercent ? p : worst)
    : null;
  const biggestPosition = enrichedPositions.length > 0
    ? enrichedPositions.reduce((big, p) => p.contribution > big.contribution ? p : big)
    : null;

  const donutData = enrichedPositions.map(p => ({ name: p.ticker, value: p.marketValue, contribution: p.contribution }));

  const hasFilters = searchTicker || filterPL !== "ALL" || filterContrib !== "ALL" || filterHold !== "ALL";
  const resetFilters = () => { setSearchTicker(""); setFilterPL("ALL"); setFilterContrib("ALL"); setFilterHold("ALL"); };

  const fmtPL = (val: number) => formatValue(val, mode);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
        <DisplayModeToggle mode={mode} onToggle={toggle} />
      </div>

      {/* 6 Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="gradient-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1"><Briefcase className="h-3 w-3" />Nilai Beli</div>
            <p className="text-sm font-bold font-mono-data">{formatRupiah(totalBuyCost)}</p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1"><DollarSign className="h-3 w-3" />Nilai Pasar</div>
            <p className="text-sm font-bold font-mono-data">{formatRupiah(totalMarketValue)}</p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1">
              {totalUnrealizedPL >= 0 ? <TrendingUp className="h-3 w-3 text-gain" /> : <TrendingDown className="h-3 w-3 text-loss" />}
              Unrealized P/L
            </div>
            <p className={cn("text-sm font-bold font-mono-data", totalUnrealizedPL >= 0 ? "text-gain" : "text-loss")}>
              {fmtPL(totalUnrealizedPL)}
            </p>
            <p className={cn("text-[10px] font-mono-data", totalUnrealizedPLPct >= 0 ? "text-gain" : "text-loss")}>
              {totalUnrealizedPLPct >= 0 ? "+" : ""}{totalUnrealizedPLPct.toFixed(2)}%
            </p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1"><Briefcase className="h-3 w-3" />Posisi Terbesar</div>
            <p className="text-sm font-bold font-mono-data">{biggestPosition?.ticker || "—"}</p>
            <p className="text-[10px] text-muted-foreground">{biggestPosition ? `${biggestPosition.contribution.toFixed(1)}%` : ""}</p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1"><Trophy className="h-3 w-3 text-gain" />Best Performer</div>
            <p className="text-sm font-bold font-mono-data text-gain">{bestPerformer?.ticker || "—"}</p>
            <p className="text-[10px] text-gain">{bestPerformer ? `+${bestPerformer.unrealizedPLPercent.toFixed(2)}%` : ""}</p>
          </CardContent>
        </Card>
        <Card className="gradient-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-1 text-muted-foreground text-[10px] mb-1"><AlertTriangle className="h-3 w-3 text-loss" />Worst Performer</div>
            <p className="text-sm font-bold font-mono-data text-loss">{worstPerformer?.ticker || "—"}</p>
            <p className="text-[10px] text-loss">{worstPerformer ? `${worstPerformer.unrealizedPLPercent.toFixed(2)}%` : ""}</p>
          </CardContent>
        </Card>
      </div>

      {/* Donut Chart */}
      {donutData.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Alokasi Portfolio</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                    paddingAngle={2} label={({ name, payload }) => `${name} ${(payload as any)?.contribution?.toFixed(1) ?? 0}%`}>
                    {donutData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatRupiah(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Open Position</CardTitle></CardHeader>
        <CardContent className="space-y-3">
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
              <label className="text-[10px] text-muted-foreground">P/L</label>
              <div className="flex gap-0.5">
                {(["ALL", "PROFIT", "LOSS"] as const).map(t => (
                  <Button key={t} variant={filterPL === t ? "default" : "outline"} size="sm"
                    className={cn("h-8 text-[10px] px-2", filterPL === t && t === "PROFIT" && "bg-gain hover:bg-gain/80",
                      filterPL === t && t === "LOSS" && "bg-loss hover:bg-loss/80")}
                    onClick={() => setFilterPL(t)}>
                    {t === "ALL" ? "Semua" : t === "PROFIT" ? "Profit" : "Rugi"}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Kontribusi</label>
              <div className="flex gap-0.5">
                {([["ALL", "Semua"], ["5", ">5%"], ["10", ">10%"], ["20", ">20%"]] as const).map(([v, l]) => (
                  <Button key={v} variant={filterContrib === v ? "default" : "outline"} size="sm"
                    className="h-8 text-[10px] px-2" onClick={() => setFilterContrib(v as any)}>{l}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Hold</label>
              <div className="flex gap-0.5">
                {([["ALL", "Semua"], ["7", "<7hr"], ["7-30", "7-30hr"], ["30", ">30hr"]] as const).map(([v, l]) => (
                  <Button key={v} variant={filterHold === v ? "default" : "outline"} size="sm"
                    className="h-8 text-[10px] px-2" onClick={() => setFilterHold(v as any)}>{l}</Button>
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
            <p className="text-muted-foreground text-sm">Memuat data harga...</p>
          ) : filteredPositions.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <SortHeader label="Ticker" sKey="ticker" className="text-left" />
                    <SortHeader label="Lot" sKey="lots" className="text-right" />
                    <SortHeader label="Lembar" sKey="shares" className="text-right" />
                    <SortHeader label="Avg Buy" sKey="avgBuy" className="text-right" />
                    <SortHeader label="Harga Skrg" sKey="currentPrice" className="text-right" />
                    <SortHeader label="Nilai Beli" sKey="buyCost" className="text-right" />
                    <SortHeader label="Nilai Pasar" sKey="marketValue" className="text-right" />
                    <SortHeader label="Unr. P/L Rp" sKey="plRp" className="text-right" />
                    <SortHeader label="Unr. P/L %" sKey="plPct" className="text-right" />
                    <SortHeader label="Kontribusi" sKey="contribution" className="text-right" />
                    <SortHeader label="Beli Pertama" sKey="firstBuyDate" className="text-left" />
                    <SortHeader label="Hold" sKey="holdDays" className="text-right" />
                    <th className="py-2 px-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.map(p => (
                    <tr key={p.ticker} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-2 px-2 font-bold font-mono-data">{p.ticker}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{p.totalLots}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{p.shares.toLocaleString("id-ID")}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{p.avgBuyPrice.toLocaleString("id-ID", { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{p.currentPrice > 0 ? p.currentPrice.toLocaleString("id-ID") : "N/A"}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{formatRupiah(p.buyCost)}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{formatRupiah(p.marketValue)}</td>
                      <td className={cn("py-2 px-2 text-right font-mono-data", p.unrealizedPL >= 0 ? "text-gain" : "text-loss")}>
                        {fmtPL(p.unrealizedPL)}
                      </td>
                      <td className={cn("py-2 px-2 text-right font-mono-data", p.unrealizedPLPercent >= 0 ? "text-gain" : "text-loss")}>
                        {p.unrealizedPLPercent >= 0 ? "+" : ""}{p.unrealizedPLPercent.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2 text-right font-mono-data">{p.contribution.toFixed(1)}%</td>
                      <td className="py-2 px-2 whitespace-nowrap">{p.firstBuyDate || "—"}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{p.holdDays}hr</td>
                      <td className="py-2 px-2 text-center">
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                          onClick={() => navigate("/journal")}>
                          Lihat Jurnal
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">Tidak ada posisi terbuka</p>
          )}
        </CardContent>
      </Card>

      {/* Closed Positions */}
      <Card className="border-border">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Realized P/L (Posisi Tertutup)</CardTitle></CardHeader>
        <CardContent>
          {closedPositions.length > 0 ? (
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2">Ticker</th>
                    <th className="text-right py-2 px-2">Total Beli</th>
                    <th className="text-right py-2 px-2">Total Jual</th>
                    <th className="text-right py-2 px-2">Realized P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map(p => (
                    <tr key={p.ticker} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="py-2 px-2 font-bold font-mono-data">{p.ticker}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{formatRupiah(p.totalBuyAmount)}</td>
                      <td className="py-2 px-2 text-right font-mono-data">{formatRupiah(p.totalSellAmount)}</td>
                      <td className={cn("py-2 px-2 text-right font-mono-data", p.realizedPL >= 0 ? "text-gain" : "text-loss")}>
                        {fmtPL(p.realizedPL)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">Belum ada posisi yang ditutup</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
