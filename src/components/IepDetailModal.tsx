import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sun } from "lucide-react";
import { runIepBacktest, type IepBacktestResult, type IepBucketStat } from "@/hooks/useIepBacktest";
import { cn } from "@/lib/utils";

interface Props {
  ticker: string | null;
  onClose: () => void;
}

// ===== Summary card per versi =====
function StatCard({ label, stat }: { label: string; stat: IepBucketStat }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px]">
        <div>
          <p className="text-muted-foreground">Signal</p>
          <p className="font-mono font-bold">{stat.signal}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Buy</p>
          <p className="font-mono font-bold text-green-500">{stat.buy}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Skip</p>
          <p className="font-mono font-bold text-muted-foreground">{stat.skip}</p>
        </div>
        <div>
          <p className="text-muted-foreground">TP</p>
          <p className="font-mono font-bold text-green-500">{stat.tp}</p>
        </div>
        <div>
          <p className="text-muted-foreground">SL</p>
          <p className="font-mono font-bold text-red-500">{stat.sl}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Hold</p>
          <p className="font-mono font-bold text-yellow-600">{stat.hold}</p>
        </div>
      </div>
      <div className="border-t border-border pt-2 space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Win Rate</span>
          <span className={cn(
            "font-mono font-bold",
            stat.winRate === null ? "text-muted-foreground"
              : stat.winRate >= 70 ? "text-green-500"
              : stat.winRate >= 50 ? "text-yellow-600"
              : "text-red-500"
          )}>
            {stat.winRate !== null ? `${stat.winRate.toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Avg Return</span>
          <span className={cn(
            "font-mono font-bold",
            stat.avgReturn === null ? "text-muted-foreground"
              : stat.avgReturn >= 0 ? "text-green-500"
              : "text-red-500"
          )}>
            {stat.avgReturn !== null ? `${stat.avgReturn.toFixed(2)}%` : "—"}
          </span>
        </div>
        <div className="flex justify-between text-[10px]">
          <span className="text-muted-foreground">Avg Max Gain</span>
          <span className="font-mono text-muted-foreground">
            {stat.avgMaxGain !== null ? `${stat.avgMaxGain.toFixed(2)}%` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ===== Satu baris bucket =====
interface BucketRowProps {
  label: string;
  firstDate: string | null;
  stat: IepBucketStat;
  colorClass: string;
  isBest: boolean;
}

function BucketRow({ label, firstDate, stat, colorClass, isBest }: BucketRowProps) {
  return (
    <tr className={cn(
      "border-b border-border/50 transition-colors",
      colorClass,
      isBest && "ring-1 ring-inset ring-yellow-400/70 bg-yellow-500/10"
    )}>
      <td className="px-2 py-1.5 font-mono font-bold text-[10px] whitespace-nowrap">
        {label}
        {isBest && <span className="ml-1 text-yellow-500">⭐</span>}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
        {firstDate || "—"}
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-[10px]">
        {stat.signal}/{stat.buy}/{stat.skip}
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-[10px]">
        <span className="text-green-500">{stat.tp}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-red-500">{stat.sl}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-yellow-600">{stat.hold}</span>
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className={cn(
          "font-mono text-[10px]",
          stat.winRate === null ? "text-muted-foreground"
            : stat.winRate >= 70 ? "text-green-500 font-bold"
            : stat.winRate >= 50 ? "text-yellow-600"
            : "text-red-500"
        )}>
          {stat.winRate !== null ? `${stat.winRate.toFixed(1)}%` : "—"}
        </span>
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
        {stat.avgGap !== null ? `${stat.avgGap.toFixed(2)}%` : "—"}
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground">
        {stat.avgMaxGain !== null ? `${stat.avgMaxGain.toFixed(2)}%` : "—"}
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className={cn(
          "font-mono text-[10px]",
          stat.avgReturn === null ? "text-muted-foreground"
            : stat.avgReturn >= 0 ? "text-green-500"
            : "text-red-500"
        )}>
          {stat.avgReturn !== null ? `${stat.avgReturn.toFixed(2)}%` : "—"}
        </span>
      </td>
    </tr>
  );
}

// ===== Main Modal =====
export function IepDetailModal({ ticker, onClose }: Props) {
  const [result, setResult] = useState<IepBacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch saat ticker berubah, gunakan cache dari runIepBacktest
  useEffect(() => {
    if (!ticker) return;
    setResult(null);
    setError(null);
    setIsLoading(true);
    runIepBacktest(ticker)
      .then(setResult)
      .catch(e => setError(e.message || "Gagal mengambil data"))
      .finally(() => setIsLoading(false));
  }, [ticker]);

  return (
    <Dialog open={!!ticker} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-lg">{ticker}</span>
            <Badge className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
              <Sun className="h-3 w-3 mr-1" />🌅 Beli Pagi Jual Pagi
            </Badge>
            {result && (
              <span className="text-xs font-normal text-muted-foreground">
                {result.totalBars} bar historis
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            <span className="ml-3 text-sm text-muted-foreground">Mengambil data historis...</span>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        )}

        {/* Content */}
        {result && !isLoading && (
          <div className="space-y-5 mt-1">

            {/* Section 1 — Summary Cards */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Ringkasan Keseluruhan
              </p>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="ALL" stat={result.summary.all} />
                <StatCard label="V2.1" stat={result.summary.v21} />
                <StatCard label="V2.2" stat={result.summary.v22} />
              </div>
            </div>

            {/* Best Bucket highlight */}
            {result.bestBucket && (
              <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-3 py-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-yellow-600">⭐ Best Bucket</span>
                <Badge className="text-[10px] bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                  Gap {result.bestBucket.label}
                </Badge>
                <Badge className={cn(
                  "text-[10px]",
                  result.bestBucket.version === "v21"
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/30"
                    : "bg-green-500/10 text-green-600 border-green-500/30"
                )}>
                  {result.bestBucket.version.toUpperCase()}
                </Badge>
                <span className={cn(
                  "text-xs font-mono font-bold",
                  result.bestBucket.winRate >= 70 ? "text-green-500"
                    : result.bestBucket.winRate >= 50 ? "text-yellow-600"
                    : "text-red-500"
                )}>
                  WR {result.bestBucket.winRate.toFixed(1)}%
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  Avg Return {result.bestBucket.avgReturn.toFixed(2)}%
                </span>
              </div>
            )}

            {/* Section 2 — Bucket Detail Table */}
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Detail per Gap Bucket
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full" style={{ minWidth: 540 }}>
                  <thead>
                    <tr className="bg-muted/70 border-b border-border">
                      {["Gap", "Tgl Pertama", "Sig/Buy/Skip", "TP/SL/Hold", "WR", "Avg Gap", "Avg MaxGain", "Avg Return"].map(h => (
                        <th key={h} className="px-2 py-2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider text-center first:text-left whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* V2.1 section */}
                    <tr className="bg-blue-500/5 border-b border-blue-500/20">
                      <td colSpan={8} className="px-2 py-1.5 text-[9px] font-semibold text-blue-600 uppercase tracking-wider">
                        V2.1 — Breakout dari bawah SMA5 (kemarin di bawah MA5)
                      </td>
                    </tr>
                    {result.buckets.map(b => {
                      if (b.v21.signal === 0) return null;
                      const isBest = result.bestBucket?.bucket === b.bucket && result.bestBucket?.version === "v21";
                      return (
                        <BucketRow
                          key={`v21-${b.bucket}`}
                          label={b.label}
                          firstDate={b.firstDate}
                          stat={b.v21}
                          colorClass="bg-blue-500/5"
                          isBest={isBest}
                        />
                      );
                    })}
                    {result.buckets.every(b => b.v21.signal === 0) && (
                      <tr className="bg-blue-500/5">
                        <td colSpan={8} className="px-2 py-2 text-center text-[10px] text-muted-foreground italic">
                          Tidak ada sinyal V2.1 dalam periode ini
                        </td>
                      </tr>
                    )}

                    {/* V2.2 section */}
                    <tr className="bg-green-500/5 border-b border-green-500/20 border-t border-t-border">
                      <td colSpan={8} className="px-2 py-1.5 text-[9px] font-semibold text-green-600 uppercase tracking-wider">
                        V2.2 — Sudah di atas SMA5 (kemarin sudah di atas MA5)
                      </td>
                    </tr>
                    {result.buckets.map(b => {
                      if (b.v22.signal === 0) return null;
                      const isBest = result.bestBucket?.bucket === b.bucket && result.bestBucket?.version === "v22";
                      return (
                        <BucketRow
                          key={`v22-${b.bucket}`}
                          label={b.label}
                          firstDate={b.firstDate}
                          stat={b.v22}
                          colorClass="bg-green-500/5"
                          isBest={isBest}
                        />
                      );
                    })}
                    {result.buckets.every(b => b.v22.signal === 0) && (
                      <tr className="bg-green-500/5">
                        <td colSpan={8} className="px-2 py-2 text-center text-[10px] text-muted-foreground italic">
                          Tidak ada sinyal V2.2 dalam periode ini
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 3 — Catatan */}
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-600 mb-1">⚠️ Catatan Penting</p>
              <p className="text-[10px] text-muted-foreground">
                Data historis ±2 tahun ({result.totalBars} bar trading).
              </p>
              <p className="text-[10px] text-muted-foreground">
                Strategi ini <span className="font-semibold text-foreground">BERBEDA</span> dari screener Beli Sore Jual Pagi.
              </p>
              <p className="text-[10px] text-muted-foreground">
                IEP = harga Open hari entry. TP/SL dihitung dari Open hari itu.
              </p>
              <p className="text-[10px] text-muted-foreground">
                TP dinamis: gap ≤1% → TP 3%, gap ≤2% → TP 2.5%, gap &gt;2% → TP 2.0%.
                Hard SL: {result.params.slPercent}%.
                Min Jump: {result.params.minJumpPct}%.
                Min Value: {(result.params.minValue / 1_000_000_000).toFixed(1)}M.
              </p>
            </div>

          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
