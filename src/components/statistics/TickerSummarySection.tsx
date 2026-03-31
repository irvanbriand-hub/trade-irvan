import { useMemo, useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { ChevronDown, Search, X, TrendingUp, TrendingDown, BarChart3, Clock, Trophy, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DisplayMode } from "@/hooks/useEquityToggle";

const LS_KEY = "ticker-summary-open";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TradeHistoryEntry {
  buyDate: string | null;
  sellDate: string;
  lots: number;
  avgBuyPrice: number;
  sellPrice: number;
  plRupiah: number;
  plPct: number;
  isOpen: boolean;
}

interface TickerDetail {
  ticker: string;
  totalPL: number;
  totalCostBasis: number;
  winCount: number;
  lossCount: number;
  totalRawTrades: number;
  avgHoldingDays: number;
  bestTrade: TradeHistoryEntry | null;
  worstTrade: TradeHistoryEntry | null;
  history: TradeHistoryEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtRp = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(val);

const fmtPct = (val: number) =>
  `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;

const fmtDate = (d: string) =>
  format(new Date(d), "d MMM yy", { locale: localeId });

// ─── Compute per-ticker detail (LIFO simulation) ──────────────────────────────
function computeTickerDetail(allTrades: any[], ticker: string): TickerDetail {
  const tickerTrades = [...allTrades]
    .filter((t) => t.ticker === ticker)
    .sort((a, b) => {
      const d = a.trade_date.localeCompare(b.trade_date);
      return d !== 0 ? d : (a.created_at || "").localeCompare(b.created_at || "");
    });

  // LIFO stack simulation (mirrors positionCalculator logic)
  const stack: { lots: number; price: number; date: string; fee: number }[] = [];
  const closedEntries: TradeHistoryEntry[] = [];

  for (const t of tickerTrades) {
    if (t.trade_type === "BUY") {
      stack.push({
        lots: Number(t.lots),
        price: Number(t.price),
        date: t.trade_date,
        fee: Number(t.fee || 0),
      });
    } else {
      let remaining = Number(t.lots);
      let costBasis = 0;
      let buyDate: string | null = null;

      while (remaining > 0 && stack.length > 0) {
        const top = stack[stack.length - 1];
        const matched = Math.min(remaining, top.lots);
        const propFee = top.lots > 0 ? (matched / top.lots) * top.fee : 0;
        costBasis += matched * 100 * top.price + propFee;
        if (buyDate === null) buyDate = top.date; // LIFO: first consumed = most recent buy
        top.lots -= matched;
        top.fee -= propFee;
        remaining -= matched;
        if (top.lots <= 0) stack.pop();
      }

      const sellAmount = Number(t.total_amount) || Number(t.price) * Number(t.lots) * 100;
      const plRupiah = sellAmount - costBasis;
      const avgBuyPrice = Number(t.lots) > 0 ? costBasis / (Number(t.lots) * 100) : 0;

      closedEntries.push({
        buyDate,
        sellDate: t.trade_date,
        lots: Number(t.lots),
        avgBuyPrice,
        sellPrice: Number(t.price),
        plRupiah,
        plPct: costBasis > 0 ? (plRupiah / costBasis) * 100 : 0,
        isOpen: false,
      });
    }
  }

  // Open position (remaining stack layers)
  const openEntries: TradeHistoryEntry[] = [];
  if (stack.length > 0) {
    const totalLots = stack.reduce((s, l) => s + l.lots, 0);
    const totalBuyCost = stack.reduce((s, l) => s + l.lots * 100 * l.price + l.fee, 0);
    const avgBuyPrice = totalLots > 0 ? totalBuyCost / (totalLots * 100) : 0;
    openEntries.push({
      buyDate: stack[0].date,
      sellDate: "Open",
      lots: totalLots,
      avgBuyPrice,
      sellPrice: 0,
      plRupiah: 0,
      plPct: 0,
      isOpen: true,
    });
  }

  // Stats
  const totalPL = closedEntries.reduce((s, h) => s + h.plRupiah, 0);
  const totalCostBasis = closedEntries.reduce((s, h) => s + h.avgBuyPrice * h.lots * 100, 0);
  const wins = closedEntries.filter((h) => h.plRupiah >= 0);
  const losses = closedEntries.filter((h) => h.plRupiah < 0);

  const holdingDays = closedEntries
    .filter((h) => h.buyDate)
    .map((h) => {
      const diff = new Date(h.sellDate).getTime() - new Date(h.buyDate!).getTime();
      return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
    });
  const avgHoldingDays =
    holdingDays.length > 0
      ? holdingDays.reduce((s, d) => s + d, 0) / holdingDays.length
      : 0;

  const sortedByPL = [...closedEntries].sort((a, b) => b.plRupiah - a.plRupiah);
  const bestTrade = sortedByPL[0] ?? null;
  const worstTrade = sortedByPL[sortedByPL.length - 1] ?? null;

  return {
    ticker,
    totalPL,
    totalCostBasis,
    winCount: wins.length,
    lossCount: losses.length,
    totalRawTrades: tickerTrades.length,
    avgHoldingDays,
    bestTrade,
    worstTrade,
    history: [...closedEntries].reverse().concat(openEntries),
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  trades: any[] | undefined;
  selectedCategory: string;
  mode: DisplayMode;
  formatValue: (val: number, mode: DisplayMode) => string;
  formatRupiah: (val: number) => string;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function TickerSummarySection({
  trades,
  selectedCategory,
  mode,
  formatValue,
  formatRupiah,
}: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
  });
  const [search, setSearch] = useState("");
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const toggleOpen = () =>
    setIsOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, String(next)); } catch { /* noop */ }
      return next;
    });

  // Compute ticker list
  const tickerResults = useMemo(() => {
    if (!trades) return [];
    const filtered =
      selectedCategory === "all"
        ? trades
        : trades.filter((t) => t.category_id === selectedCategory);

    const map: Record<string, number> = {};
    for (const t of filtered) {
      if (t.trade_type !== "SELL") continue;
      // Use total_amount (net of sell fee) vs computed cost basis
      // Re-use simplified P/L: just collect by ticker using raw values
      // (Accurate P/L comes from modal; here we just need sorted list)
    }

    // Use positionCalculator-style grouping for correct LIFO P/L
    const tickerSet = new Set<string>(filtered.map((t: any) => t.ticker));
    return [...tickerSet]
      .map((ticker) => ({
        ticker,
        pl: computeTickerDetail(filtered, ticker).totalPL,
      }))
      .filter((r) => r.pl !== 0 || filtered.some((t: any) => t.ticker === r.ticker && t.trade_type === "SELL"))
      .sort((a, b) => b.pl - a.pl);
  }, [trades, selectedCategory]);

  // Search filter
  const filteredResults = useMemo(() => {
    if (!search.trim()) return tickerResults;
    const q = search.trim().toUpperCase();
    return tickerResults.filter((r) => r.ticker.includes(q));
  }, [tickerResults, search]);

  // Detail for selected ticker
  const detail = useMemo<TickerDetail | null>(() => {
    if (!selectedTicker || !trades) return null;
    const filtered =
      selectedCategory === "all"
        ? trades
        : trades.filter((t) => t.category_id === selectedCategory);
    return computeTickerDetail(filtered, selectedTicker);
  }, [selectedTicker, trades, selectedCategory]);

  const fmtPL = (val: number) => formatValue(val, mode);

  return (
    <>
      <Card className="border-border">
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={toggleOpen}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Ringkasan per Saham</span>
            <span className="text-xs text-muted-foreground">
              {tickerResults.length} saham
            </span>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-300",
              isOpen && "rotate-180"
            )}
          />
        </div>

        {/* ── Collapsible content ── */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isOpen ? "max-h-[4000px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <CardContent className="pt-0 pb-4 space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari ticker..."
                className="pl-8 h-8 text-xs"
                onClick={(e) => e.stopPropagation()}
              />
              {search && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); setSearch(""); }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* List */}
            {filteredResults.length === 0 ? (
              <p className="text-center py-4 text-muted-foreground text-sm">
                {search ? "Tidak ada saham ditemukan" : "Belum ada posisi tertutup"}
              </p>
            ) : (
              <div className="space-y-1.5">
                {filteredResults.map((r) => (
                  <div
                    key={r.ticker}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/30 border border-border cursor-pointer hover:bg-accent/60 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setSelectedTicker(r.ticker); }}
                  >
                    <span className="font-bold font-mono text-sm">{r.ticker}</span>
                    <span className={cn("font-mono text-sm font-semibold", r.pl >= 0 ? "text-gain" : "text-loss")}>
                      {fmtPL(r.pl)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* ── Ticker Detail Modal ── */}
      <Dialog open={!!selectedTicker} onOpenChange={(o) => !o && setSelectedTicker(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xl font-bold">{detail.ticker}</span>
                    <div className="flex flex-col">
                      <span className={cn("font-mono text-base font-bold", detail.totalPL >= 0 ? "text-gain" : "text-loss")}>
                        {fmtRp(detail.totalPL)}
                      </span>
                      {detail.totalCostBasis > 0 && (
                        <span className={cn("font-mono text-xs", detail.totalPL >= 0 ? "text-gain" : "text-loss")}>
                          {fmtPct((detail.totalPL / detail.totalCostBasis) * 100)}
                        </span>
                      )}
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* ── Summary Stats ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <MiniStatCard
                  icon={BarChart3}
                  label="Total Transaksi"
                  value={`${detail.totalRawTrades} trade`}
                />
                <MiniStatCard
                  icon={Trophy}
                  label="Win Rate"
                  value={
                    detail.winCount + detail.lossCount > 0
                      ? `${((detail.winCount / (detail.winCount + detail.lossCount)) * 100).toFixed(0)}% (${detail.winCount}W/${detail.lossCount}L)`
                      : "-"
                  }
                  color={
                    detail.winCount + detail.lossCount > 0 && detail.winCount >= detail.lossCount
                      ? "gain"
                      : "loss"
                  }
                />
                <MiniStatCard
                  icon={Clock}
                  label="Avg Holding"
                  value={
                    detail.avgHoldingDays > 0
                      ? `${detail.avgHoldingDays.toFixed(1)} hari`
                      : "-"
                  }
                />
                {detail.bestTrade && (
                  <MiniStatCard
                    icon={TrendingUp}
                    label="Best Trade"
                    value={`${fmtRp(detail.bestTrade.plRupiah)} (${fmtPct(detail.bestTrade.plPct)})`}
                    color="gain"
                  />
                )}
                {detail.worstTrade && detail.worstTrade !== detail.bestTrade && (
                  <MiniStatCard
                    icon={TrendingDown}
                    label="Worst Trade"
                    value={`${fmtRp(detail.worstTrade.plRupiah)} (${fmtPct(detail.worstTrade.plPct)})`}
                    color="loss"
                  />
                )}
                {detail.worstTrade && (
                  <MiniStatCard
                    icon={AlertTriangle}
                    label="Total Closed"
                    value={`${detail.winCount + detail.lossCount} trade`}
                  />
                )}
              </div>

              {/* ── Trade History Table ── */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                      <th className="text-left p-2 font-medium">Tgl Beli</th>
                      <th className="text-left p-2 font-medium">Tgl Jual</th>
                      <th className="text-right p-2 font-medium">Lot</th>
                      <th className="text-right p-2 font-medium">Harga Beli</th>
                      <th className="text-right p-2 font-medium">Harga Jual</th>
                      <th className="text-right p-2 font-medium">P/L (Rp)</th>
                      <th className="text-right p-2 font-medium">P/L (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.history.map((h, i) => (
                      <tr
                        key={i}
                        className={cn(
                          "border-b border-border/50",
                          h.isOpen && "bg-primary/5"
                        )}
                      >
                        <td className="p-2 font-mono text-muted-foreground">
                          {h.buyDate ? fmtDate(h.buyDate) : "-"}
                        </td>
                        <td className="p-2 font-mono">
                          {h.isOpen ? (
                            <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                              Open
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">{fmtDate(h.sellDate)}</span>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">{h.lots}</td>
                        <td className="p-2 text-right font-mono">
                          {Math.round(h.avgBuyPrice).toLocaleString("id-ID")}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {h.isOpen ? "-" : h.sellPrice.toLocaleString("id-ID")}
                        </td>
                        <td className={cn(
                          "p-2 text-right font-mono font-semibold",
                          h.isOpen ? "text-muted-foreground" :
                          h.plRupiah >= 0 ? "text-gain" : "text-loss"
                        )}>
                          {h.isOpen ? "-" : fmtRp(h.plRupiah)}
                        </td>
                        <td className={cn(
                          "p-2 text-right font-mono font-semibold",
                          h.isOpen ? "text-muted-foreground" :
                          h.plPct >= 0 ? "text-gain" : "text-loss"
                        )}>
                          {h.isOpen ? "-" : fmtPct(h.plPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Mini stat card inside modal ─────────────────────────────────────────────
function MiniStatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: "gain" | "loss";
}) {
  return (
    <div className="bg-accent/30 rounded-lg p-3 border border-border">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={cn(
        "text-xs font-semibold font-mono break-all",
        color === "gain" ? "text-gain" : color === "loss" ? "text-loss" : "text-foreground"
      )}>
        {value}
      </p>
    </div>
  );
}
