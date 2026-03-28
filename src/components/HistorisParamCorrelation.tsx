import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BacktestSignal, BacktestSignalParams } from "@/lib/backtestEngine";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Props {
  signals: BacktestSignal[];
}

type ParamKey = keyof Omit<BacktestSignalParams, "count">;

const PARAM_KEYS: ParamKey[] = ["pr", "v_ma20", "ma_plus", "l_pl", "h_ph", "ol_hc", "c_vwap", "v_ma5"];

const PARAM_DISPLAY: Record<ParamKey, string> = {
  pr: "Prev Red",
  v_ma20: "V > MA20",
  ma_plus: "MA Bullish",
  l_pl: "L > Prev L",
  h_ph: "H > Prev H",
  ol_hc: "Gap Up",
  c_vwap: "C > VWAP",
  v_ma5: "V > MA5",
};

export default function HistorisParamCorrelation({ signals }: Props) {
  const evaluated = useMemo(
    () => signals.filter(s => s.params && (s.result === "WIN" || s.result === "LOSE")),
    [signals]
  );

  const totalWithParams = useMemo(
    () => signals.filter(s => s.params),
    [signals]
  );

  const paramStats = useMemo(() => {
    if (evaluated.length === 0) return [];
    return PARAM_KEYS.map(key => {
      const trueItems = evaluated.filter(s => s.params![key] === true);
      const falseItems = evaluated.filter(s => s.params![key] === false);
      const trueWins = trueItems.filter(s => s.result === "WIN").length;
      const falseWins = falseItems.filter(s => s.result === "WIN").length;
      const trueWR = trueItems.length > 0 ? (trueWins / trueItems.length) * 100 : 0;
      const falseWR = falseItems.length > 0 ? (falseWins / falseItems.length) * 100 : 0;
      const truePct = totalWithParams.length > 0 ? (trueItems.length / totalWithParams.length) * 100 : 0;
      const diff = trueWR - falseWR;
      const impact = Math.abs(diff) < 5 ? "neutral" : diff > 0 ? "positive" : "negative";
      return { key, label: PARAM_DISPLAY[key], trueTotal: trueItems.length, trueWins, trueWR, falseTotal: falseItems.length, falseWins, falseWR, truePct, diff, impact };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [evaluated, totalWithParams]);

  const countStats = useMemo(() => {
    if (evaluated.length === 0) return [];
    const groups: Record<number, { total: number; wins: number }> = {};
    for (let i = 0; i <= 8; i++) groups[i] = { total: 0, wins: 0 };
    for (const s of evaluated) {
      const c = s.params!.count;
      groups[c].total++;
      if (s.result === "WIN") groups[c].wins++;
    }
    return Object.entries(groups)
      .map(([count, g]) => ({ count: Number(count), total: g.total, wins: g.wins, winRate: g.total > 0 ? (g.wins / g.total) * 100 : 0 }))
      .filter(g => g.total > 0)
      .sort((a, b) => b.count - a.count);
  }, [evaluated]);

  const insights = useMemo(() => {
    if (paramStats.length === 0) return null;
    const best = paramStats[0];
    const worst = paramStats[paramStats.length - 1];
    const neutral = paramStats.find(p => p.impact === "neutral");
    return { best, worst, neutral };
  }, [paramStats]);

  if (evaluated.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
          <p className="text-sm">Belum ada data sinyal historis dengan parameter. Generate analisa terlebih dahulu.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = countStats.map(c => ({ name: `${c.count}`, winRate: +c.winRate.toFixed(1) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-foreground">📊 Korelasi Parameter vs WIN/LOSE</h2>
        <Badge variant="secondary" className="text-[10px]">{evaluated.length} sinyal</Badge>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-2">
        Catatan: Ini adalah data korelasi <strong>tambahan</strong> — tidak mengubah sistem WR yang sudah ada.
      </p>

      {/* Insight */}
      {insights && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">💡 Insight Otomatis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-[11px]">
            {insights.best && insights.best.diff !== 0 && (
              <p>
                <span className="font-semibold">Parameter paling berpengaruh:</span>{" "}
                <span className="text-primary font-bold">{insights.best.label}</span>
                {" "}— Meningkatkan WIN% sebesar{" "}
                <span className={insights.best.diff > 0 ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                  {insights.best.diff > 0 ? "+" : ""}{insights.best.diff.toFixed(1)}%
                </span>
              </p>
            )}
            {insights.neutral && (
              <p>
                <span className="font-semibold">Parameter tidak relevan:</span>{" "}
                <span className="text-muted-foreground">{insights.neutral.label}</span>
                {" "}— Selisih WIN% hanya {Math.abs(insights.neutral.diff).toFixed(1)}% (hampir netral)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per-parameter table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs">Korelasi Per Parameter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-1.5 text-left font-semibold">Parameter</th>
                  <th className="p-1.5 text-center font-semibold">% TRUE</th>
                  <th className="p-1.5 text-center font-semibold">WIN% (TRUE)</th>
                  <th className="p-1.5 text-center font-semibold">WIN% (FALSE)</th>
                  <th className="p-1.5 text-center font-semibold">Selisih</th>
                  <th className="p-1.5 text-center font-semibold">Impact</th>
                </tr>
              </thead>
              <tbody>
                {paramStats.map(p => (
                  <tr key={p.key} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="p-1.5 font-medium text-foreground">{p.label}</td>
                    <td className="p-1.5 text-center font-mono">{p.truePct.toFixed(0)}%</td>
                    <td className="p-1.5 text-center font-mono font-bold">{p.trueWR.toFixed(1)}%</td>
                    <td className="p-1.5 text-center font-mono font-bold">{p.falseWR.toFixed(1)}%</td>
                    <td className={cn("p-1.5 text-center font-mono font-bold",
                      p.diff > 5 ? "text-green-500" : p.diff < -5 ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {p.diff > 0 ? "+" : ""}{p.diff.toFixed(1)}%
                    </td>
                    <td className="p-1.5 text-center">
                      {p.impact === "positive" ? "↑ Positif" : p.impact === "negative" ? "↓ Negatif" : "➡️ Netral"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Count vs WIN% */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs">Jumlah Parameter vs WIN Rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-1.5 text-center font-semibold">Jml Param</th>
                  <th className="p-1.5 text-center font-semibold">Total</th>
                  <th className="p-1.5 text-center font-semibold">WIN</th>
                  <th className="p-1.5 text-center font-semibold">WIN%</th>
                </tr>
              </thead>
              <tbody>
                {countStats.map(c => (
                  <tr key={c.count} className={cn("border-b border-border/50",
                    c.winRate >= 70 ? "bg-green-500/5" : c.winRate >= 50 ? "bg-yellow-500/5" : ""
                  )}>
                    <td className="p-1.5 text-center font-mono font-bold">{c.count}/8</td>
                    <td className="p-1.5 text-center font-mono">{c.total}</td>
                    <td className="p-1.5 text-center font-mono text-green-500">{c.wins}</td>
                    <td className={cn("p-1.5 text-center font-mono font-bold",
                      c.winRate >= 70 ? "text-green-500" : c.winRate >= 50 ? "text-yellow-600" : "text-red-500"
                    )}>
                      {c.winRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {chartData.length > 1 && (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" label={{ value: "Jumlah Parameter", position: "insideBottom", offset: -5, fontSize: 10 }} tick={{ fontSize: 10 }} />
                  <YAxis label={{ value: "WIN%", angle: -90, position: "insideLeft", fontSize: 10 }} tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "10px" }}
                    formatter={(v: number) => [`${v}%`, "WIN Rate"]}
                  />
                  <Line type="monotone" dataKey="winRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
