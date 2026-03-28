import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WrScannerItem } from "@/hooks/useWrScanner";
import { PARAM_LABELS } from "@/lib/paramCalculator";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Props {
  data: WrScannerItem[];
}

type ParamKey = "param_pr" | "param_v_ma20" | "param_ma_plus" | "param_l_pl" | "param_h_ph" | "param_ol_hc" | "param_c_vwap" | "param_v_ma5";

const PARAM_KEYS: ParamKey[] = [
  "param_pr", "param_v_ma20", "param_ma_plus", "param_l_pl",
  "param_h_ph", "param_ol_hc", "param_c_vwap", "param_v_ma5",
];

const PARAM_DISPLAY: Record<ParamKey, string> = {
  param_pr: "Prev Red",
  param_v_ma20: "V > MA20",
  param_ma_plus: "MA Bullish",
  param_l_pl: "L > Prev L",
  param_h_ph: "H > Prev H",
  param_ol_hc: "Gap Up",
  param_c_vwap: "C > VWAP",
  param_v_ma5: "V > MA5",
};

export default function ParameterCorrelation({ data }: Props) {
  // Only use items that have been backtested AND have param data
  const backtested = useMemo(
    () => data.filter(d => (d.status === "WIN" || d.status === "LOSE") && d.param_count != null),
    [data]
  );

  // SECTION A: Per-parameter correlation
  const paramStats = useMemo(() => {
    if (backtested.length === 0) return [];

    return PARAM_KEYS.map(key => {
      const trueItems = backtested.filter(d => (d as any)[key] === true);
      const falseItems = backtested.filter(d => (d as any)[key] === false);
      const trueWins = trueItems.filter(d => d.result === "WIN").length;
      const falseWins = falseItems.filter(d => d.result === "WIN").length;
      const trueWR = trueItems.length > 0 ? (trueWins / trueItems.length) * 100 : 0;
      const falseWR = falseItems.length > 0 ? (falseWins / falseItems.length) * 100 : 0;
      const diff = trueWR - falseWR;
      const impact = Math.abs(diff) < 5 ? "neutral" : diff > 0 ? "positive" : "negative";

      return {
        key,
        label: PARAM_DISPLAY[key],
        trueTotal: trueItems.length,
        trueWins,
        trueWR,
        falseTotal: falseItems.length,
        falseWins,
        falseWR,
        diff,
        impact,
      };
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [backtested]);

  // SECTION B: Count vs WIN%
  const countStats = useMemo(() => {
    if (backtested.length === 0) return [];

    const groups: Record<number, { total: number; wins: number; gainSum: number; gainCount: number }> = {};
    for (let i = 0; i <= 8; i++) groups[i] = { total: 0, wins: 0, gainSum: 0, gainCount: 0 };

    for (const item of backtested) {
      const c = item.param_count ?? 0;
      groups[c].total++;
      if (item.result === "WIN") {
        groups[c].wins++;
        if (item.pct_open_to_high != null) {
          groups[c].gainSum += item.pct_open_to_high;
          groups[c].gainCount++;
        }
      }
    }

    return Object.entries(groups)
      .map(([count, g]) => ({
        count: Number(count),
        total: g.total,
        wins: g.wins,
        winRate: g.total > 0 ? (g.wins / g.total) * 100 : 0,
        avgGain: g.gainCount > 0 ? g.gainSum / g.gainCount : 0,
      }))
      .filter(g => g.total > 0)
      .sort((a, b) => b.count - a.count);
  }, [backtested]);

  // SECTION C: Best 2-3 param combinations
  const bestCombos = useMemo(() => {
    if (backtested.length < 5) return [];

    const combos: { keys: ParamKey[]; label: string; total: number; wins: number; winRate: number }[] = [];

    // Generate 2-combinations
    for (let i = 0; i < PARAM_KEYS.length; i++) {
      for (let j = i + 1; j < PARAM_KEYS.length; j++) {
        const k1 = PARAM_KEYS[i], k2 = PARAM_KEYS[j];
        const matching = backtested.filter(d => (d as any)[k1] && (d as any)[k2]);
        if (matching.length >= 5) {
          const wins = matching.filter(d => d.result === "WIN").length;
          combos.push({
            keys: [k1, k2],
            label: `${PARAM_DISPLAY[k1]} + ${PARAM_DISPLAY[k2]}`,
            total: matching.length,
            wins,
            winRate: (wins / matching.length) * 100,
          });
        }
      }
    }

    // Generate 3-combinations
    for (let i = 0; i < PARAM_KEYS.length; i++) {
      for (let j = i + 1; j < PARAM_KEYS.length; j++) {
        for (let k = j + 1; k < PARAM_KEYS.length; k++) {
          const k1 = PARAM_KEYS[i], k2 = PARAM_KEYS[j], k3 = PARAM_KEYS[k];
          const matching = backtested.filter(d => (d as any)[k1] && (d as any)[k2] && (d as any)[k3]);
          if (matching.length >= 5) {
            const wins = matching.filter(d => d.result === "WIN").length;
            combos.push({
              keys: [k1, k2, k3],
              label: `${PARAM_DISPLAY[k1]} + ${PARAM_DISPLAY[k2]} + ${PARAM_DISPLAY[k3]}`,
              total: matching.length,
              wins,
              winRate: (wins / matching.length) * 100,
            });
          }
        }
      }
    }

    return combos.sort((a, b) => b.winRate - a.winRate).slice(0, 20);
  }, [backtested]);

  // SECTION D: Auto insights
  const insights = useMemo(() => {
    if (paramStats.length === 0) return null;

    const bestParam = paramStats[0];
    const worstParam = paramStats[paramStats.length - 1];
    const bestCombo = bestCombos.length > 0 ? bestCombos[0] : null;
    const neutralParam = paramStats.find(p => p.impact === "neutral");

    return { bestParam, worstParam, bestCombo, neutralParam };
  }, [paramStats, bestCombos]);

  if (backtested.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6 text-center text-muted-foreground">
          <p className="text-sm">Belum ada data backtest dengan parameter. Jalankan backtest setelah import dari screener BPJS untuk melihat korelasi parameter.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = countStats.map(c => ({ name: `${c.count}`, winRate: +c.winRate.toFixed(1) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-foreground">📊 Korelasi Parameter vs WIN/LOSE</h2>
        <Badge variant="secondary" className="text-[10px]">{backtested.length} sinyal</Badge>
      </div>

      <p className="text-xs text-muted-foreground -mt-4">
        Catatan: Fitur korelasi ini adalah insight <strong>tambahan</strong>. Sistem WR Scanner dan statistik WIN/LOSE yang sudah ada tidak berubah.
      </p>

      {/* SECTION D: Insight Otomatis */}
      {insights && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">💡 Insight Otomatis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {insights.bestParam && insights.bestParam.diff !== 0 && (
              <p>
                <span className="font-semibold">Parameter paling berpengaruh:</span>{" "}
                <span className="text-primary font-bold">{insights.bestParam.label}</span>
                {" "}— Meningkatkan WIN% sebesar{" "}
                <span className={insights.bestParam.diff > 0 ? "text-green-500 font-bold" : "text-red-500 font-bold"}>
                  {insights.bestParam.diff > 0 ? "+" : ""}{insights.bestParam.diff.toFixed(1)}%
                </span>
              </p>
            )}
            {insights.bestCombo && (
              <p>
                <span className="font-semibold">Kombinasi terbaik:</span>{" "}
                <span className="text-primary font-bold">{insights.bestCombo.label}</span>
                {" "}— WIN% <span className="text-green-500 font-bold">{insights.bestCombo.winRate.toFixed(1)}%</span> dari {insights.bestCombo.total} sinyal
              </p>
            )}
            {insights.neutralParam && (
              <p>
                <span className="font-semibold">Parameter tidak relevan:</span>{" "}
                <span className="text-muted-foreground">{insights.neutralParam.label}</span>
                {" "}— Selisih WIN% hanya {Math.abs(insights.neutralParam.diff).toFixed(1)}% (hampir netral)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* SECTION A: Per-parameter table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Section A — Korelasi Per Parameter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-left font-semibold">Parameter</th>
                  <th className="p-2 text-center font-semibold">TRUE Total</th>
                  <th className="p-2 text-center font-semibold">WIN (TRUE)</th>
                  <th className="p-2 text-center font-semibold">WIN% (TRUE)</th>
                  <th className="p-2 text-center font-semibold">FALSE Total</th>
                  <th className="p-2 text-center font-semibold">WIN (FALSE)</th>
                  <th className="p-2 text-center font-semibold">WIN% (FALSE)</th>
                  <th className="p-2 text-center font-semibold">Selisih</th>
                  <th className="p-2 text-center font-semibold">Impact</th>
                </tr>
              </thead>
              <tbody>
                {paramStats.map((p) => (
                  <tr key={p.key} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="p-2 font-medium text-foreground">{p.label}</td>
                    <td className="p-2 text-center font-mono">{p.trueTotal}</td>
                    <td className="p-2 text-center font-mono text-green-500">{p.trueWins}</td>
                    <td className="p-2 text-center font-mono font-bold">{p.trueWR.toFixed(1)}%</td>
                    <td className="p-2 text-center font-mono">{p.falseTotal}</td>
                    <td className="p-2 text-center font-mono text-green-500">{p.falseWins}</td>
                    <td className="p-2 text-center font-mono font-bold">{p.falseWR.toFixed(1)}%</td>
                    <td className={cn("p-2 text-center font-mono font-bold",
                      p.diff > 5 ? "text-green-500" : p.diff < -5 ? "text-red-500" : "text-muted-foreground"
                    )}>
                      {p.diff > 0 ? "+" : ""}{p.diff.toFixed(1)}%
                    </td>
                    <td className="p-2 text-center">
                      {p.impact === "positive" ? "↑ Positif" : p.impact === "negative" ? "↓ Negatif" : "➡️ Netral"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* SECTION B: Count vs WIN% */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Section B — Jumlah Parameter vs WIN Rate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-center font-semibold">Jml Parameter</th>
                  <th className="p-2 text-center font-semibold">Total Sinyal</th>
                  <th className="p-2 text-center font-semibold">WIN</th>
                  <th className="p-2 text-center font-semibold">WIN%</th>
                  <th className="p-2 text-center font-semibold">Avg % Gain (WIN)</th>
                </tr>
              </thead>
              <tbody>
                {countStats.map((c) => (
                  <tr key={c.count} className={cn("border-b border-border/50",
                    c.winRate >= 70 ? "bg-green-500/5" : c.winRate >= 50 ? "bg-yellow-500/5" : ""
                  )}>
                    <td className="p-2 text-center font-mono font-bold">{c.count}/8</td>
                    <td className="p-2 text-center font-mono">{c.total}</td>
                    <td className="p-2 text-center font-mono text-green-500">{c.wins}</td>
                    <td className={cn("p-2 text-center font-mono font-bold",
                      c.winRate >= 70 ? "text-green-500" : c.winRate >= 50 ? "text-yellow-600" : "text-red-500"
                    )}>
                      {c.winRate.toFixed(1)}%
                    </td>
                    <td className="p-2 text-center font-mono text-green-500">{c.avgGain > 0 ? c.avgGain.toFixed(2) + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {chartData.length > 1 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" label={{ value: "Jumlah Parameter", position: "insideBottom", offset: -5, fontSize: 11 }} tick={{ fontSize: 11 }} />
                  <YAxis label={{ value: "WIN%", angle: -90, position: "insideLeft", fontSize: 11 }} tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(v: number) => [`${v}%`, "WIN Rate"]}
                  />
                  <Line type="monotone" dataKey="winRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION C: Best Combinations */}
      {bestCombos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Section C — Kombinasi Parameter Terbaik</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[10px] text-muted-foreground mb-3">Minimal 5 sinyal. Diurutkan berdasarkan WIN% tertinggi.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-2 text-left font-semibold">Kombinasi</th>
                    <th className="p-2 text-center font-semibold">Sinyal</th>
                    <th className="p-2 text-center font-semibold">WIN</th>
                    <th className="p-2 text-center font-semibold">WIN%</th>
                  </tr>
                </thead>
                <tbody>
                  {bestCombos.map((c, i) => (
                    <tr key={i} className={cn("border-b border-border/50",
                      c.winRate >= 70 ? "bg-green-500/5" : c.winRate >= 50 ? "bg-yellow-500/5" : ""
                    )}>
                      <td className="p-2 font-medium text-foreground">{c.label}</td>
                      <td className="p-2 text-center font-mono">{c.total}</td>
                      <td className="p-2 text-center font-mono text-green-500">{c.wins}</td>
                      <td className={cn("p-2 text-center font-mono font-bold",
                        c.winRate >= 70 ? "text-green-500" : c.winRate >= 50 ? "text-yellow-600" : "text-red-500"
                      )}>
                        {c.winRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
