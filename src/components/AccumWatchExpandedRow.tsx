import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BandarmologyRow } from "@/hooks/useBandarmology";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

const tierColors: Record<string, string> = {
  S: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  A: "bg-green-500/10 text-green-400 border-green-500/30",
  B: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  C: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
};

const formatValue = (v: number | null) => {
  if (v == null) return "—";
  if (v >= 1e9) return `Rp ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toFixed(1)}M`;
  return `Rp ${v.toLocaleString("id-ID")}`;
};

interface Props {
  ticker: string;
  getTickerHistory: (ticker: string) => BandarmologyRow[];
  bandarData: BandarmologyRow | null;
}

export default function AccumWatchExpandedRow({ ticker, getTickerHistory, bandarData }: Props) {
  const history = useMemo(() => getTickerHistory(ticker), [ticker, getTickerHistory]);
  const latest = history[history.length - 1] || bandarData;
  const prev = history.length >= 2 ? history[history.length - 2] : null;

  const chartData = useMemo(() =>
    history.map(h => ({
      date: h.tanggal_data.slice(5),
      fullDate: h.tanggal_data,
      rank: h.rank_score,
      composite: h.composite_pct,
      streak: h.streak,
      tier: h.tier,
    })),
    [history]
  );

  const rankDelta = (latest?.rank_score != null && prev?.rank_score != null)
    ? prev.rank_score - latest.rank_score
    : null;

  return (
    <div className="p-4 space-y-4">
      {/* SECTION A — Rank Chart */}
      {chartData.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">📈 Rank History</p>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis reversed domain={[1, 50]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10 }}
                  formatter={(value: any, name: string) => {
                    if (name === "rank") return [`#${value}`, "Rank"];
                    return [value, name];
                  }}
                  labelFormatter={(label, payload) => {
                    const d = payload?.[0]?.payload;
                    if (!d) return label;
                    return `${d.fullDate} | Comp: ${d.composite?.toFixed(1) || "—"}% | Str: ${d.streak || "—"} | ${d.tier}`;
                  }}
                />
                <ReferenceLine y={20} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label={{ value: "Top 20", fill: "hsl(var(--destructive))", fontSize: 9 }} />
                <Line type="monotone" dataKey="rank" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* SECTION B — Detail Data */}
      {latest && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground mb-2">📊 Data Detail</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <DetailItem label="Composite%" value={latest.composite_pct != null ? `${latest.composite_pct.toFixed(1)}%` : "—"} highlight={(latest.composite_pct || 0) >= 60} />
            <DetailItem label="Daily%" value={latest.daily_pct != null ? `${latest.daily_pct.toFixed(1)}%` : "—"} positive={(latest.daily_pct || 0) > 0} negative={(latest.daily_pct || 0) < 0} />
            <DetailItem label="Weekly%" value={latest.weekly_pct != null ? `${latest.weekly_pct.toFixed(1)}%` : "—"} positive={(latest.weekly_pct || 0) > 0} negative={(latest.weekly_pct || 0) < 0} />
            <DetailItem label="Top1% (Broker)" value={latest.top1_pct != null ? `${latest.top1_pct.toFixed(1)}% (${latest.top1_broker})` : "—"} />
            <DetailItem label="Value" value={formatValue(latest.value)} />
            <DetailItem label="Streak" value={latest.streak != null ? `${latest.streak}d↑` : "—"} />
            <DetailItem label="Tier" value={latest.tier} badge tierColors={tierColors} />
            <DetailItem label="Pattern" value={latest.pattern || "—"} />
            <DetailItem
              label="Rank Hari Ini"
              value={latest.rank_score != null ? `#${latest.rank_score}` : "—"}
              extra={rankDelta != null ? (rankDelta > 0 ? `↑${rankDelta}` : rankDelta < 0 ? `↓${Math.abs(rankDelta)}` : "➡️") : undefined}
              extraColor={rankDelta != null ? (rankDelta > 0 ? "text-green-500" : rankDelta < 0 ? "text-red-500" : "") : ""}
            />
            <DetailItem label="Status SK" value="❌ Belum SK" />
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value, highlight, positive, negative, badge, tierColors, extra, extraColor }: {
  label: string;
  value: string;
  highlight?: boolean;
  positive?: boolean;
  negative?: boolean;
  badge?: boolean;
  tierColors?: Record<string, string>;
  extra?: string;
  extraColor?: string;
}) {
  return (
    <div className="bg-background/50 rounded p-2">
      <p className="text-muted-foreground text-[9px]">{label}</p>
      <div className="flex items-center gap-1">
        {badge && tierColors ? (
          <Badge variant="outline" className={cn("text-[8px] font-bold", tierColors[value])}>{value}</Badge>
        ) : (
          <p className={cn(
            "font-mono font-bold text-xs",
            highlight && "text-green-500",
            positive && "text-green-500",
            negative && "text-red-500",
          )}>{value}</p>
        )}
        {extra && <span className={cn("text-[10px] font-mono", extraColor)}>{extra}</span>}
      </div>
    </div>
  );
}
