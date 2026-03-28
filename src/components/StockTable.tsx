import { type Stock } from "@/data/mockStocks";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Props {
  stocks: Stock[];
  title: string;
  onTickerClick?: (stock: Stock) => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("id-ID");
}

export function StockTable({ stocks, title, onTickerClick }: Props) {
  if (stocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">Tidak ada saham yang cocok</p>
        <p className="text-sm mt-1">Pilih modul screening lain</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <span className="text-xs font-mono text-muted-foreground">{stocks.length} saham</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Ticker</th>
              <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">Nama</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Harga</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Chg%</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">Vol</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">PER</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">PBV</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">ROE%</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">Div%</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">D/E</th>
              <th className="text-right p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden xl:table-cell">RSI</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock, i) => (
              <tr
                key={stock.ticker}
                className={cn(
                  "border-b border-border/50 transition-colors hover:bg-accent/50",
                  i % 2 === 0 ? "bg-card" : "bg-card/50"
                )}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-bold font-mono text-foreground cursor-pointer hover:text-primary transition-colors"
                      onClick={() => onTickerClick?.(stock)}
                    >
                      {stock.ticker}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hidden sm:inline">
                      {stock.sector}
                    </span>
                  </div>
                </td>
                <td className="p-3 text-muted-foreground text-xs hidden sm:table-cell">{stock.name}</td>
                <td className="p-3 text-right font-mono font-semibold text-foreground">
                  {stock.price.toLocaleString("id-ID")}
                </td>
                <td className="p-3 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-mono font-semibold text-xs",
                      stock.changePct > 0 ? "text-gain" : stock.changePct < 0 ? "text-loss" : "text-muted-foreground"
                    )}
                  >
                    {stock.changePct > 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : stock.changePct < 0 ? (
                      <ArrowDownRight className="h-3 w-3" />
                    ) : null}
                    {stock.changePct > 0 ? "+" : ""}
                    {stock.changePct.toFixed(2)}%
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-muted-foreground text-xs hidden md:table-cell">
                  {formatNumber(stock.volume)}
                </td>
                <td className="p-3 text-right font-mono text-xs hidden md:table-cell">
                  <span className={cn(stock.per < 10 ? "text-gain" : stock.per > 25 ? "text-loss" : "text-foreground")}>
                    {stock.per.toFixed(1)}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-xs hidden lg:table-cell">
                  <span className={cn(stock.pbv < 1.5 ? "text-gain" : stock.pbv > 5 ? "text-loss" : "text-foreground")}>
                    {stock.pbv.toFixed(1)}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-xs hidden lg:table-cell">
                  <span className={cn(stock.roe > 20 ? "text-gain" : stock.roe < 10 ? "text-loss" : "text-foreground")}>
                    {stock.roe.toFixed(1)}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-xs hidden xl:table-cell">
                  <span className={cn(stock.dividendYield > 5 ? "text-gain" : "text-foreground")}>
                    {stock.dividendYield.toFixed(1)}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-xs hidden xl:table-cell">
                  <span className={cn(stock.debtToEquity < 0.5 ? "text-gain" : stock.debtToEquity > 2 ? "text-loss" : "text-foreground")}>
                    {stock.debtToEquity.toFixed(1)}
                  </span>
                </td>
                <td className="p-3 text-right font-mono text-xs hidden xl:table-cell">
                  <span className={cn(
                    stock.rsi > 70 ? "text-loss" : stock.rsi < 30 ? "text-gain" : "text-foreground"
                  )}>
                    {stock.rsi}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
