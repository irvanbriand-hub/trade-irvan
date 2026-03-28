import { mockStocks } from "@/data/mockStocks";
import { TrendingUp, TrendingDown, BarChart3, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketOverview() {
  const gainers = mockStocks.filter((s) => s.changePct > 0).length;
  const losers = mockStocks.filter((s) => s.changePct < 0).length;
  const totalVol = mockStocks.reduce((a, s) => a + s.volume, 0);
  const avgPER = mockStocks.reduce((a, s) => a + s.per, 0) / mockStocks.length;

  const stats = [
    { label: "Menguat", value: gainers.toString(), icon: TrendingUp, color: "text-gain" },
    { label: "Melemah", value: losers.toString(), icon: TrendingDown, color: "text-loss" },
    { label: "Total Volume", value: (totalVol / 1_000_000).toFixed(0) + "M", icon: BarChart3, color: "text-foreground" },
    { label: "Avg PER", value: avgPER.toFixed(1) + "x", icon: Activity, color: "text-foreground" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-border bg-card p-3 gradient-card">
          <div className="flex items-center gap-2 mb-1">
            <s.icon className={cn("h-4 w-4", s.color)} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
          <p className={cn("text-xl font-bold font-mono", s.color)}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}
