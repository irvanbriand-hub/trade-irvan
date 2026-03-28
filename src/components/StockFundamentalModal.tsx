import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Building2, BarChart3 } from "lucide-react";

interface FundamentalData {
  name: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  per: number | null;
  pbv: number | null;
  eps: number | null;
  roe: number | null;
  revenue: number | null;
  netProfit: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  price: number | null;
  error?: string;
}

interface Props {
  ticker: string | null;
  onClose: () => void;
}

const formatBigNum = (n: number | null) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1e12) return `Rp ${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(2)}M`;
  return `Rp ${n.toLocaleString("id-ID")}`;
};

const formatPercent = (n: number | null) => {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(2)}%`;
};

const formatNum = (n: number | null, dec = 2) => {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("id-ID", { maximumFractionDigits: dec });
};

export function StockFundamentalModal({ ticker, onClose }: Props) {
  const [data, setData] = useState<FundamentalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setData(null);

    supabase.functions
      .invoke("yahoo-finance-fundamental", { body: { ticker } })
      .then(({ data: d, error: e }) => {
        if (e) {
          setError(e.message);
        } else if (d?.error && !d?.name) {
          setError(d.error);
        } else {
          setData(d);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker]);

  const rows: [string, string][] = data
    ? [
        ["Nama Perusahaan", data.name || "—"],
        ["Sektor", data.sector || "—"],
        ["Industri", data.industry || "—"],
        ["Harga", data.price ? `Rp ${formatNum(data.price, 0)}` : "—"],
        ["Market Cap", formatBigNum(data.marketCap)],
        ["PER", formatNum(data.per)],
        ["PBV", formatNum(data.pbv)],
        ["EPS", formatNum(data.eps)],
        ["ROE", formatPercent(data.roe)],
        ["Revenue", formatBigNum(data.revenue)],
        ["Net Profit", formatBigNum(data.netProfit)],
        ["Dividend Yield", formatPercent(data.dividendYield)],
        ["52W High", data.fiftyTwoWeekHigh ? `Rp ${formatNum(data.fiftyTwoWeekHigh, 0)}` : "—"],
        ["52W Low", data.fiftyTwoWeekLow ? `Rp ${formatNum(data.fiftyTwoWeekLow, 0)}` : "—"],
      ]
    : [];

  return (
    <Dialog open={!!ticker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <span>Data Fundamental — {ticker}</span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        )}

        {error && !data && (
          <div className="py-6 text-center text-sm text-destructive">{error}</div>
        )}

        {data && (
          <>
            {data.error && (
              <p className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2 mb-2">
                ⚠️ {data.error}
              </p>
            )}
            <div className="divide-y divide-border">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between py-2.5 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-foreground font-medium">{value}</span>
                </div>
              ))}
            </div>

            {data.fiftyTwoWeekHigh && data.fiftyTwoWeekLow && data.price && (
              <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground mb-2">52 Week Range</p>
                <div className="relative h-2 bg-muted rounded-full">
                  <div
                    className="absolute h-2 bg-primary rounded-full"
                    style={{
                      left: "0%",
                      width: `${Math.min(100, Math.max(0, ((data.price - data.fiftyTwoWeekLow) / (data.fiftyTwoWeekHigh - data.fiftyTwoWeekLow)) * 100))}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <TrendingDown className="h-3 w-3" />
                    {formatNum(data.fiftyTwoWeekLow, 0)}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <TrendingUp className="h-3 w-3" />
                    {formatNum(data.fiftyTwoWeekHigh, 0)}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
