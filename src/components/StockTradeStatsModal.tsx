import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTrades } from "@/hooks/useTrades";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, TrendingUp, TrendingDown, Activity, Shield, Target,
} from "lucide-react";

interface Props {
  ticker: string | null;
  currentPrice?: number | null;
  onClose: () => void;
}

/** IDX tick size rules */
function getTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

const formatRupiah = (val: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

const formatPct = (val: number) => `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;

const BUY_FEE_PCT = 0.0015; // 0.15% buy fee
const SELL_FEE_PCT = 0.0025; // 0.25% sell fee (incl. tax)
const DEFAULT_CAPITAL = 5_000_000;

export function StockTradeStatsModal({ ticker, currentPrice, onClose }: Props) {
  const { data: allTrades, isLoading } = useTrades();
  const [entryPrice, setEntryPrice] = useState("");
  const [ma50, setMa50] = useState<number | null>(null);
  const [ma200, setMa200] = useState<number | null>(null);
  const [loadingMA, setLoadingMA] = useState(false);

  // Auto-fill entry price with current price & reset on ticker change
  useEffect(() => {
    if (!ticker) return;
    setLoadingMA(true);
    setMa50(null);
    setMa200(null);
    setEntryPrice(currentPrice ? String(currentPrice) : "");

    supabase.functions
      .invoke("yahoo-finance-history", { body: { ticker, range: "1y", interval: "1d" } })
      .then(({ data }) => {
        if (data?.ma50) setMa50(Math.round(data.ma50));
        if (data?.ma200) setMa200(Math.round(data.ma200));
      })
      .finally(() => setLoadingMA(false));
  }, [ticker, currentPrice]);

  const stats = useMemo(() => {
    if (!ticker || !allTrades) return null;

    const trades = allTrades.filter((t: any) => t.ticker === ticker);
    if (trades.length === 0) return null;

    const buyTrades = trades.filter((t: any) => t.trade_type === "BUY");
    const sellTrades = trades.filter((t: any) => t.trade_type === "SELL");

    const totalBuy = buyTrades.length;
    const totalSell = sellTrades.length;

    const avgBuyPrice = totalBuy > 0
      ? buyTrades.reduce((sum: number, t: any) => sum + Number(t.price), 0) / totalBuy
      : 0;

    let winCount = 0;
    let lossCount = 0;
    let maxWin = 0;
    let maxLoss = 0;
    let totalWinPct = 0;
    let totalLossPct = 0;

    for (const sell of sellTrades) {
      const pctChange = avgBuyPrice > 0
        ? ((Number(sell.price) - avgBuyPrice) / avgBuyPrice) * 100
        : 0;

      if (pctChange > 0) {
        winCount++;
        totalWinPct += pctChange;
        const pl = (Number(sell.price) - avgBuyPrice) * sell.lots * 100;
        if (pl > maxWin) maxWin = pl;
      } else if (pctChange < 0) {
        lossCount++;
        totalLossPct += Math.abs(pctChange);
        const pl = (Number(sell.price) - avgBuyPrice) * sell.lots * 100;
        if (pl < maxLoss) maxLoss = pl;
      }
    }

    const winRate = totalSell > 0 ? (winCount / totalSell) * 100 : 0;
    const avgWinPct = winCount > 0 ? totalWinPct / winCount : 0;
    const avgLossPct = lossCount > 0 ? totalLossPct / lossCount : 0;

    // Avg estimated P/L % = winRate * avgWin - lossRate * avgLoss
    const lossRate = totalSell > 0 ? (lossCount / totalSell) * 100 : 0;
    const avgEstPL = (winRate / 100) * avgWinPct - (lossRate / 100) * avgLossPct;

    return {
      totalTrades: trades.length,
      winCount,
      lossCount,
      winRate,
      maxWin,
      maxLoss,
      avgWinPct,
      avgLossPct,
      avgEstPL,
      totalSell,
    };
  }, [ticker, allTrades]);

  // SL calculations
  const slLevels = useMemo(() => {
    const price = Number(entryPrice);
    if (!price || price <= 0) return [];

    const levels: { label: string; slPrice: number; lossPct: number; estLoss: number }[] = [];

    const calcLoss = (slPrice: number) => {
      const lossPct = ((price - slPrice) / price) * 100;
      const shares = Math.floor(DEFAULT_CAPITAL / (price * (1 + BUY_FEE_PCT)));
      const buyTotal = shares * price * (1 + BUY_FEE_PCT);
      const sellTotal = shares * slPrice * (1 - SELL_FEE_PCT);
      const estLoss = sellTotal - buyTotal;
      return { lossPct, estLoss };
    };

    // MA50
    if (ma50 && ma50 < price) {
      const slPrice = ma50 - 1;
      const { lossPct, estLoss } = calcLoss(slPrice);
      levels.push({ label: "SL MA50", slPrice, lossPct, estLoss });
    }

    // MA200
    if (ma200 && ma200 < price) {
      const slPrice = ma200 - 1;
      const { lossPct, estLoss } = calcLoss(slPrice);
      levels.push({ label: "SL MA200", slPrice, lossPct, estLoss });
    }

    // Percentage SLs
    for (const pct of [1, 2, 3]) {
      const slPrice = Math.round(price * (1 - pct / 100));
      const { lossPct, estLoss } = calcLoss(slPrice);
      levels.push({ label: `SL ${pct}%`, slPrice, lossPct, estLoss });
    }

    return levels;
  }, [entryPrice, ma50, ma200]);

  return (
    <Dialog open={!!ticker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span>Statistik Trading — {ticker}</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm text-muted-foreground py-6 text-center">Memuat data...</p>
        )}

        {!isLoading && !stats && (
          <div className="py-8 text-center">
            <Activity className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Belum ada riwayat trading untuk {ticker}</p>
          </div>
        )}

        {stats && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border p-3 text-center">
                <TrendingUp className="h-4 w-4 mx-auto text-gain mb-1" />
                <p className="text-lg font-bold text-gain">{stats.winCount}</p>
                <p className="text-[10px] text-muted-foreground">Win</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <TrendingDown className="h-4 w-4 mx-auto text-loss mb-1" />
                <p className="text-lg font-bold text-loss">{stats.lossCount}</p>
                <p className="text-[10px] text-muted-foreground">Loss</p>
              </div>
              <div className="rounded-lg border border-border p-3 text-center">
                <Target className="h-4 w-4 mx-auto text-primary mb-1" />
                <p className="text-lg font-bold text-foreground">{formatPct(stats.avgEstPL)}</p>
                <p className="text-[10px] text-muted-foreground">Avg Est P/L</p>
              </div>
            </div>

            {/* Win Rate Bar */}
            {stats.totalSell > 0 && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted-foreground">Win Rate</span>
                  <span className="font-bold text-foreground">{stats.winRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gain rounded-full transition-all"
                    style={{ width: `${stats.winRate}%` }}
                  />
                </div>
              </div>
            )}

            {/* Avg Win/Loss % */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gain/20 bg-gain/5 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Avg Win %</p>
                <p className="text-sm font-bold font-mono text-gain">
                  {stats.avgWinPct > 0 ? `+${stats.avgWinPct.toFixed(2)}%` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-loss/20 bg-loss/5 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Avg Loss %</p>
                <p className="text-sm font-bold font-mono text-loss">
                  {stats.avgLossPct > 0 ? `-${stats.avgLossPct.toFixed(2)}%` : "—"}
                </p>
              </div>
            </div>

            {/* Max Win/Loss */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-gain/20 bg-gain/5 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Max Win</p>
                <p className="text-sm font-bold font-mono text-gain">
                  {stats.maxWin > 0 ? `+${formatRupiah(stats.maxWin)}` : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-loss/20 bg-loss/5 p-3">
                <p className="text-[10px] text-muted-foreground mb-1">Max Loss</p>
                <p className="text-sm font-bold font-mono text-loss">
                  {stats.maxLoss < 0 ? formatRupiah(stats.maxLoss) : "—"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SL/TP Suggestion Section - always show when ticker is set */}
        <div className="space-y-3 border-t border-border pt-4 mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Saran SL (Stop Loss)</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Harga Entry:</label>
            <div className="flex items-center gap-1 flex-1">
              <button
                type="button"
                onClick={() => {
                  const p = Number(entryPrice);
                  if (p > 0) setEntryPrice(String(p - getTickSize(p)));
                }}
                className="h-8 w-8 rounded border border-border bg-muted hover:bg-accent flex items-center justify-center text-sm font-bold text-foreground shrink-0"
              >
                −
              </button>
              <Input
                type="number"
                placeholder="Harga beli"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                className="h-8 text-sm text-center"
              />
              <button
                type="button"
                onClick={() => {
                  const p = Number(entryPrice);
                  if (p > 0) setEntryPrice(String(p + getTickSize(p)));
                }}
                className="h-8 w-8 rounded border border-border bg-muted hover:bg-accent flex items-center justify-center text-sm font-bold text-foreground shrink-0"
              >
                +
              </button>
            </div>
          </div>

          {loadingMA && (
            <p className="text-xs text-muted-foreground">Memuat MA50 & MA200...</p>
          )}

          {!loadingMA && (ma50 || ma200) && (
            <div className="flex gap-3 text-xs text-muted-foreground">
              {ma50 && <span>MA50: <span className="font-mono text-foreground">{ma50.toLocaleString("id-ID")}</span></span>}
              {ma200 && <span>MA200: <span className="font-mono text-foreground">{ma200.toLocaleString("id-ID")}</span></span>}
            </div>
          )}

          {slLevels.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">
                Estimasi modal Rp {DEFAULT_CAPITAL.toLocaleString("id-ID")} (fee beli {(BUY_FEE_PCT * 100).toFixed(2)}% + fee jual {(SELL_FEE_PCT * 100).toFixed(2)}%)
              </p>
              {slLevels.map((sl) => (
                <div
                  key={sl.label}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-loss/5 border border-loss/20"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground">{sl.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      @ {sl.slPrice.toLocaleString("id-ID")} ({sl.lossPct.toFixed(2)}%)
                    </p>
                  </div>
                  <p className="text-sm font-bold font-mono text-loss">
                    {formatRupiah(sl.estLoss)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {entryPrice && slLevels.length === 0 && !loadingMA && (
            <p className="text-xs text-muted-foreground text-center py-2">
              MA berada di atas harga entry, hanya SL persentase yang tersedia
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
