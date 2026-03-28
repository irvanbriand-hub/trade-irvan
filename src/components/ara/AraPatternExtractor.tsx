import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { sma, ema, bollingerBands, calcMACD, calcStochastic } from "@/lib/chartIndicators";

interface Props {
  onComplete: (count: number) => void;
  onGoNext: () => void;
}

function calcRSI(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function getRsiZone(rsi: number): string {
  if (rsi <= 30) return "OVERSOLD";
  if (rsi < 40) return "<40";
  if (rsi <= 60) return "40-60";
  if (rsi <= 70) return "60-70";
  return "OVERBOUGHT";
}

function getMacdStatus(macdLine: number | null, macdSignal: number | null, prevMacd: number | null, prevSignal: number | null): string {
  if (macdLine == null || macdSignal == null) return "BEARISH";
  if (prevMacd != null && prevSignal != null) {
    if (prevMacd <= prevSignal && macdLine > macdSignal) return "BULLISH_CROSS";
    if (prevMacd >= prevSignal && macdLine < macdSignal) return "BEARISH_CROSS";
  }
  return macdLine > macdSignal ? "BULLISH" : "BEARISH";
}

function getBBPosition(close: number, top: number | null, mid: number | null, bottom: number | null): string {
  if (top == null || mid == null || bottom == null) return "MID";
  if (close > top) return "ABOVE_TOP";
  if (close > (top + mid) / 2) return "NEAR_TOP";
  if (close < bottom) return "BELOW_BOTTOM";
  if (close < (bottom + mid) / 2) return "NEAR_BOTTOM";
  return "MID";
}

export default function AraPatternExtractor({ onComplete, onGoNext }: Props) {
  const [running, setRunning] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [done, setDone] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const cancelRef = useRef(false);

  async function startExtract() {
    setRunning(true);
    setProcessed(0);
    setDone(false);
    cancelRef.current = false;

    // Delete old patterns
    await supabase.from("ara_pre_pattern").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // Fetch all ARA events
    let allEvents: any[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from("ara_events").select("*").range(from, from + 999).order("tanggal_ara");
      if (!data || data.length === 0) break;
      allEvents = allEvents.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    setTotalEvents(allEvents.length);

    // Group by ticker
    const byTicker: Record<string, any[]> = {};
    for (const e of allEvents) {
      if (!byTicker[e.ticker]) byTicker[e.ticker] = [];
      byTicker[e.ticker].push(e);
    }

    const tickers = Object.keys(byTicker);
    const allPatterns: any[] = [];
    const batchSize = 5;

    for (let i = 0; i < tickers.length; i += batchSize) {
      if (cancelRef.current) break;
      const batch = tickers.slice(i, i + batchSize);

      const promises = batch.map(async (ticker) => {
        try {
          const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
            body: { ticker: ticker + ".JK", count: 500 },
          });
          if (error || !data?.candles?.length) return [];

          const candles = data.candles
            .filter((c: any) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)
            .sort((a: any, b: any) => a.time - b.time);

          if (candles.length < 50) return [];

          const closes = candles.map((c: any) => c.close);
          const highs = candles.map((c: any) => c.high);
          const lows = candles.map((c: any) => c.low);
          const opens = candles.map((c: any) => c.open);
          const volumes = candles.map((c: any) => c.volume);

          const sma5 = sma(closes, 5);
          const sma20 = sma(closes, 20);
          const sma50 = sma(closes, 50);
          const rsiArr = calcRSI(closes, 14);
          const macdData = calcMACD(closes);
          const bb = bollingerBands(closes, 20, 2);
          const volSma5 = sma(volumes, 5);
          const volSma20 = sma(volumes, 20);

          // Build date->index map
          const dateMap: Record<string, number> = {};
          for (let j = 0; j < candles.length; j++) {
            const d = new Date((candles[j].time + 7 * 3600) * 1000);
            dateMap[d.toISOString().slice(0, 10)] = j;
          }

          const patterns: any[] = [];
          for (const event of byTicker[ticker]) {
            const araIdx = dateMap[event.tanggal_ara];
            if (araIdx == null) continue;

            // Find D-1, D-2, D-3 (previous trading days)
            const prevDays: number[] = [];
            for (let k = araIdx - 1; k >= 0 && prevDays.length < 3; k--) {
              prevDays.push(k);
            }

            for (let dayOffset = 0; dayOffset < prevDays.length; dayOffset++) {
              const idx = prevDays[dayOffset];
              const hari = -(dayOffset + 1);
              const c = candles[idx];
              const prevC = idx > 0 ? candles[idx - 1] : c;
              const pctChg = prevC.close > 0 ? ((c.close - prevC.close) / prevC.close) * 100 : 0;

              const candleColor = c.close > c.open ? "GREEN" : c.close < c.open ? "RED" : "DOJI";
              const gapType = c.open > prevC.close * 1.001 ? "UP" : c.open < prevC.close * 0.999 ? "DOWN" : "FLAT";

              const ml = macdData.macdLine[idx];
              const ms = macdData.signalLine[idx];
              const mh = macdData.histogram[idx];
              const prevMl = idx > 0 ? macdData.macdLine[idx - 1] : null;
              const prevMs = idx > 0 ? macdData.signalLine[idx - 1] : null;

              patterns.push({
                ara_event_id: event.id,
                ticker,
                tanggal_ara: event.tanggal_ara,
                hari,
                open: c.open,
                high: c.high,
                low: c.low,
                close: c.close,
                volume: c.volume,
                value: c.close * c.volume,
                pct_change: pctChg,
                candle_color: candleColor,
                gap_type: gapType,
                sma5: sma5[idx],
                sma20: sma20[idx],
                sma50: sma50[idx],
                close_vs_sma5: sma5[idx] != null ? (c.close >= sma5[idx]! ? "ABOVE" : "BELOW") : null,
                close_vs_sma20: sma20[idx] != null ? (c.close >= sma20[idx]! ? "ABOVE" : "BELOW") : null,
                close_vs_sma50: sma50[idx] != null ? (c.close >= sma50[idx]! ? "ABOVE" : "BELOW") : null,
                rsi: rsiArr[idx],
                rsi_zone: getRsiZone(rsiArr[idx]),
                macd_line: ml,
                macd_signal: ms,
                macd_histogram: mh,
                macd_status: getMacdStatus(ml, ms, prevMl, prevMs),
                bb_position: getBBPosition(c.close, bb.top[idx], bb.mid[idx], bb.bottom[idx]),
                volume_vs_ma5: volSma5[idx] != null && volSma5[idx]! > 0 ? c.volume / volSma5[idx]! : null,
                volume_vs_ma20: volSma20[idx] != null && volSma20[idx]! > 0 ? c.volume / volSma20[idx]! : null,
                volume_spike: volSma20[idx] != null && volSma20[idx]! > 0 ? c.volume > volSma20[idx]! * 2 : false,
              });
            }
          }
          return patterns;
        } catch {
          return [];
        }
      });

      const results = await Promise.all(promises);
      for (const pats of results) {
        allPatterns.push(...pats);
      }
      const processedEvents = allEvents.filter(e => batch.includes(e.ticker) || tickers.slice(0, i).includes(e.ticker)).length;
      setProcessed(Math.min(i + batchSize, tickers.length));
    }

    // Insert patterns
    for (let i = 0; i < allPatterns.length; i += 100) {
      await supabase.from("ara_pre_pattern").insert(allPatterns.slice(i, i + 100));
    }

    setSavedCount(allPatterns.length);
    setDone(true);
    setRunning(false);
    onComplete(allPatterns.length);
  }

  const pct = totalEvents > 0 ? Math.round((processed / Object.keys({}).length) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔧</div>
          <h3 className="text-lg font-bold">Ekstrak Pola Pre-ARA</h3>
          <p className="text-sm text-muted-foreground">
            Menghitung parameter teknikal D-1, D-2, D-3 sebelum setiap ARA event
          </p>
        </div>

        {!running && !done && (
          <div className="text-center">
            <Button onClick={startExtract} size="lg">🔧 Mulai Ekstraksi Pola</Button>
          </div>
        )}

        {running && (
          <div className="space-y-3">
            <Progress value={totalEvents > 0 ? (processed / totalEvents) * 100 : 0} className="h-3" />
            <p className="text-sm text-muted-foreground text-center">
              Mengekstrak pola pre-ARA... Memproses ticker: {processed}
            </p>
            <div className="text-center">
              <button onClick={() => { cancelRef.current = true; }} className="text-xs text-muted-foreground hover:text-destructive underline">Batalkan</button>
            </div>
          </div>
        )}

        {done && (
          <div className="space-y-4 text-center">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-1">
              <p className="text-green-600 dark:text-green-400 font-bold">✅ Ekstraksi selesai!</p>
              <p className="text-sm">Total pola tersimpan: <strong>{savedCount}</strong> records</p>
              <p className="text-sm text-muted-foreground">Siap untuk analisa</p>
            </div>
            <Button onClick={onGoNext}>▶ Analisa Pola →</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
