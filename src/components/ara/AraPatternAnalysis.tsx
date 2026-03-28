import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PatternRow {
  id: string;
  ara_event_id: string;
  ticker: string;
  tanggal_ara: string;
  hari: number;
  candle_color: string;
  gap_type: string;
  close_vs_sma5: string;
  close_vs_sma20: string;
  close_vs_sma50: string;
  rsi_zone: string;
  macd_status: string;
  bb_position: string;
  volume_spike: boolean;
  volume_vs_ma20: number;
  pct_change: number;
}

interface FreqItem {
  param: string;
  count: number;
  pct: number;
  note: string;
}

interface ComboItem {
  combo: string[];
  count: number;
  support: number;
  label: string;
}

export default function AraPatternAnalysis() {
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayTab, setDayTab] = useState("-1");
  const [savedPatterns, setSavedPatterns] = useState<string[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    // Fetch all patterns and events (paginated)
    let allPatterns: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from("ara_pre_pattern").select("*").range(from, from + 999);
      if (!data || data.length === 0) break;
      allPatterns = allPatterns.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    
    let allEvents: any[] = [];
    from = 0;
    while (true) {
      const { data } = await supabase.from("ara_events").select("*").range(from, from + 999);
      if (!data || data.length === 0) break;
      allEvents = allEvents.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    setPatterns(allPatterns);
    setEvents(allEvents);
    setLoading(false);
  }

  // Section A - Stats
  const stats = useMemo(() => {
    if (events.length === 0) return null;
    const tickerCounts: Record<string, number> = {};
    const monthCounts: Record<string, number> = {};
    let totalPct = 0;

    for (const e of events) {
      tickerCounts[e.ticker] = (tickerCounts[e.ticker] || 0) + 1;
      const month = e.tanggal_ara?.slice(0, 7);
      if (month) monthCounts[month] = (monthCounts[month] || 0) + 1;
      totalPct += e.pct_change || 0;
    }

    const topTicker = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1])[0];
    const topMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];

    return {
      total: events.length,
      topTicker: topTicker ? `${topTicker[0]} (${topTicker[1]}x)` : "-",
      topMonth: topMonth ? `${topMonth[0]} (${topMonth[1]}x)` : "-",
      avgPct: (totalPct / events.length).toFixed(1),
    };
  }, [events]);

  // Section B - Frequency per day
  const freqData = useMemo(() => {
    const hari = parseInt(dayTab);
    const dayPatterns = patterns.filter(p => p.hari === hari);
    if (dayPatterns.length === 0) return [];

    const total = dayPatterns.length;
    const params: { key: string; label: string; check: (p: PatternRow) => boolean }[] = [
      { key: "green", label: "Candle Hijau", check: (p) => p.candle_color === "GREEN" },
      { key: "red", label: "Candle Merah", check: (p) => p.candle_color === "RED" },
      { key: "vol_spike", label: "Volume Spike (>2x MA20)", check: (p) => p.volume_spike === true },
      { key: "gap_up", label: "Gap Up", check: (p) => p.gap_type === "UP" },
      { key: "gap_down", label: "Gap Down", check: (p) => p.gap_type === "DOWN" },
      { key: "c_sma5", label: "Close > SMA5", check: (p) => p.close_vs_sma5 === "ABOVE" },
      { key: "c_sma20", label: "Close > SMA20", check: (p) => p.close_vs_sma20 === "ABOVE" },
      { key: "c_sma50", label: "Close > SMA50", check: (p) => p.close_vs_sma50 === "ABOVE" },
      { key: "rsi_os", label: "RSI Oversold (<30)", check: (p) => p.rsi_zone === "OVERSOLD" },
      { key: "rsi_ob", label: "RSI Overbought (>70)", check: (p) => p.rsi_zone === "OVERBOUGHT" },
      { key: "rsi_40", label: "RSI < 40", check: (p) => p.rsi_zone === "OVERSOLD" || p.rsi_zone === "<40" },
      { key: "macd_bull", label: "MACD Bullish", check: (p) => p.macd_status === "BULLISH" || p.macd_status === "BULLISH_CROSS" },
      { key: "macd_cross", label: "MACD Bullish Cross", check: (p) => p.macd_status === "BULLISH_CROSS" },
      { key: "bb_top", label: "BB Near/Above Top", check: (p) => p.bb_position === "ABOVE_TOP" || p.bb_position === "NEAR_TOP" },
      { key: "bb_bot", label: "BB Near/Below Bottom", check: (p) => p.bb_position === "BELOW_BOTTOM" || p.bb_position === "NEAR_BOTTOM" },
      { key: "pct_pos", label: "% Change Positif", check: (p) => (p.pct_change || 0) > 0 },
    ];

    return params.map(p => {
      const count = dayPatterns.filter(p.check).length;
      const pct = (count / total) * 100;
      return {
        param: p.label,
        count,
        pct,
        note: pct >= 60 ? "↑ Kuat" : pct >= 40 ? "→ Netral" : "↓ Lemah",
      } as FreqItem;
    }).sort((a, b) => b.pct - a.pct);
  }, [patterns, dayTab]);

  // Section C - Combination analysis
  const combos = useMemo(() => {
    const d1Patterns = patterns.filter(p => p.hari === -1);
    if (d1Patterns.length === 0) return [];

    const total = d1Patterns.length;
    const featureExtractors: { key: string; label: string; check: (p: PatternRow) => boolean }[] = [
      { key: "GRN", label: "Candle Hijau", check: (p) => p.candle_color === "GREEN" },
      { key: "VSPK", label: "Vol Spike", check: (p) => p.volume_spike === true },
      { key: "GUP", label: "Gap Up", check: (p) => p.gap_type === "UP" },
      { key: "SMA5", label: "C>SMA5", check: (p) => p.close_vs_sma5 === "ABOVE" },
      { key: "SMA20", label: "C>SMA20", check: (p) => p.close_vs_sma20 === "ABOVE" },
      { key: "SMA50", label: "C>SMA50", check: (p) => p.close_vs_sma50 === "ABOVE" },
      { key: "MBULL", label: "MACD Bull", check: (p) => p.macd_status === "BULLISH" || p.macd_status === "BULLISH_CROSS" },
      { key: "PCTPOS", label: "% Positif", check: (p) => (p.pct_change || 0) > 0 },
    ];

    // Generate features per pattern
    const featureSets = d1Patterns.map(p => {
      return featureExtractors.filter(f => f.check(p)).map(f => f.key);
    });

    // Generate 2 and 3 combos
    const comboCounts: Record<string, number> = {};
    for (const features of featureSets) {
      // 2-combos
      for (let i = 0; i < features.length; i++) {
        for (let j = i + 1; j < features.length; j++) {
          const key = [features[i], features[j]].sort().join("+");
          comboCounts[key] = (comboCounts[key] || 0) + 1;
        }
        // 3-combos
        for (let j = i + 1; j < features.length; j++) {
          for (let k = j + 1; k < features.length; k++) {
            const key = [features[i], features[j], features[k]].sort().join("+");
            comboCounts[key] = (comboCounts[key] || 0) + 1;
          }
        }
      }
    }

    const labelMap: Record<string, string> = {};
    for (const f of featureExtractors) labelMap[f.key] = f.label;

    return Object.entries(comboCounts)
      .map(([key, count]) => ({
        combo: key.split("+"),
        count,
        support: (count / total) * 100,
        label: key.split("+").map(k => labelMap[k] || k).join(" + "),
      }))
      .filter(c => c.count >= 3)
      .sort((a, b) => b.support - a.support)
      .slice(0, 20);
  }, [patterns]);

  // Section E - Heatmap data
  const heatmapData = useMemo(() => {
    const params = [
      { label: "Candle Hijau", check: (p: PatternRow) => p.candle_color === "GREEN" },
      { label: "Vol Spike", check: (p: PatternRow) => p.volume_spike === true },
      { label: "Gap Up", check: (p: PatternRow) => p.gap_type === "UP" },
      { label: "C>SMA5", check: (p: PatternRow) => p.close_vs_sma5 === "ABOVE" },
      { label: "C>SMA20", check: (p: PatternRow) => p.close_vs_sma20 === "ABOVE" },
      { label: "MACD Bull", check: (p: PatternRow) => p.macd_status === "BULLISH" || p.macd_status === "BULLISH_CROSS" },
      { label: "RSI<40", check: (p: PatternRow) => p.rsi_zone === "OVERSOLD" || p.rsi_zone === "<40" },
      { label: "% Positif", check: (p: PatternRow) => (p.pct_change || 0) > 0 },
    ];

    return params.map(param => {
      const row: any = { param: param.label };
      for (const day of [-1, -2, -3]) {
        const dayP = patterns.filter(p => p.hari === day);
        const total = dayP.length || 1;
        const count = dayP.filter(param.check).length;
        row[`D${day}`] = Math.round((count / total) * 100);
      }
      return row;
    });
  }, [patterns]);

  if (loading) {
    return (
      <Card><CardContent className="p-6 text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Memuat data pola...</p>
      </CardContent></Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card><CardContent className="p-6 text-center text-muted-foreground">
        Belum ada data ARA. Jalankan Scan Historis dan Ekstrak Pola terlebih dahulu.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section A - Statistik Umum */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total ARA Events", value: stats.total },
            { label: "Saham Paling Sering ARA", value: stats.topTicker },
            { label: "Bulan Terbanyak ARA", value: stats.topMonth },
            { label: "Rata-rata % Gain", value: `${stats.avgPct}%` },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-lg font-bold text-foreground">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Section B - Frekuensi Parameter */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">📊 Frekuensi Parameter Pre-ARA</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={dayTab} onValueChange={setDayTab}>
            <TabsList>
              <TabsTrigger value="-1">D-1</TabsTrigger>
              <TabsTrigger value="-2">D-2</TabsTrigger>
              <TabsTrigger value="-3">D-3</TabsTrigger>
            </TabsList>
            <TabsContent value={dayTab}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parameter</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="text-right">% Muncul</TableHead>
                    <TableHead className="text-right">Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freqData.map((f) => (
                    <TableRow key={f.param}>
                      <TableCell className="font-medium">{f.param}</TableCell>
                      <TableCell className="text-right">{f.count}</TableCell>
                      <TableCell className="text-right font-bold">{f.pct.toFixed(1)}%</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={f.pct >= 60 ? "default" : f.pct >= 40 ? "secondary" : "outline"} className="text-xs">
                          {f.note}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Section C - Kombinasi Pola Terbaik */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🔗 Kombinasi Pola Terbaik (D-1)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kombinasi</TableHead>
                <TableHead className="text-right">Kejadian</TableHead>
                <TableHead className="text-right">Support %</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combos.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{c.label}</TableCell>
                  <TableCell className="text-right">{c.count}</TableCell>
                  <TableCell className="text-right font-bold">{c.support.toFixed(1)}%</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={savedPatterns.includes(c.label) ? "secondary" : "outline"}
                      className="text-xs h-7"
                      onClick={() => {
                        setSavedPatterns(prev =>
                          prev.includes(c.label) ? prev.filter(p => p !== c.label) : [...prev, c.label]
                        );
                      }}
                    >
                      {savedPatterns.includes(c.label) ? "✅ Tersimpan" : "💾 Simpan"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section D - Win Rate Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">📈 Support % per Pola (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combos.slice(0, 10)} layout="vertical" margin={{ left: 120 }}>
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Bar dataKey="support" radius={[0, 4, 4, 0]}>
                  {combos.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={`hsl(var(--primary))`} opacity={1 - i * 0.07} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Section E - Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">🗺️ Heatmap Parameter vs Hari</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parameter</TableHead>
                <TableHead className="text-center">D-1</TableHead>
                <TableHead className="text-center">D-2</TableHead>
                <TableHead className="text-center">D-3</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {heatmapData.map((row) => (
                <TableRow key={row.param}>
                  <TableCell className="font-medium text-sm">{row.param}</TableCell>
                  {([-1, -2, -3] as const).map((day) => {
                    const val = row[`D${day}`];
                    const bg = val >= 60 ? "bg-green-500/30" : val >= 40 ? "bg-yellow-500/20" : "bg-red-500/10";
                    return (
                      <TableCell key={day} className={`text-center font-bold ${bg}`}>
                        {val}%
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
