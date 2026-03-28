// Parameter Correlation Calculator for BPJS Screener
// CATATAN: Ini adalah KORELASI TAMBAHAN. Sistem WR Scanner, backtest, dan statistik WIN/LOSE yang sudah ada TIDAK BERUBAH.

import type { ScreenerStockData } from "@/lib/screenerStore";

export interface ParamResult {
  pr: boolean;       // prev_close < prev_open (candle kemarin bearish)
  v_ma20: boolean;   // volume > SMA(volume, 20)
  ma_plus: boolean;  // MA3 > MA5 > MA10 > MA20 (aligned bullish)
  l_pl: boolean;     // low > prev_low
  h_ph: boolean;     // high > prev_high
  ol_hc: boolean;    // open > prev_close (gap up)
  c_vwap: boolean;   // close > vwap where vwap = (high+low+close)/3
  v_ma5: boolean;    // volume > SMA(volume, 5)
  count: number;
}

export const PARAM_LABELS: { key: keyof Omit<ParamResult, "count">; label: string; shortLabel: string }[] = [
  { key: "pr", label: "Prev Red (Bearish)", shortLabel: "PR" },
  { key: "v_ma20", label: "V > MA20 Vol", shortLabel: "V>MA20" },
  { key: "ma_plus", label: "MA Bullish Aligned", shortLabel: "MA+" },
  { key: "l_pl", label: "L > Prev Low", shortLabel: "L>PL" },
  { key: "h_ph", label: "H > Prev High", shortLabel: "H>PH" },
  { key: "ol_hc", label: "Gap Up (O > PrevC)", shortLabel: "GapUp" },
  { key: "c_vwap", label: "C > VWAP", shortLabel: "C>VWAP" },
  { key: "v_ma5", label: "V > MA5 Vol", shortLabel: "V>MA5" },
];

export function calcParams(data: ScreenerStockData): ParamResult {
  const pr = data.prevClose < data.prevOpen;
  const v_ma20 = data.smaVol20 > 0 && data.volume > data.smaVol20;
  const ma_plus = data.sma3 > 0 && data.sma5 > 0 && data.sma10 > 0 && data.sma20 > 0 &&
    data.sma3 > data.sma5 && data.sma5 > data.sma10 && data.sma10 > data.sma20;
  const l_pl = data.low > data.prevLow && data.prevLow > 0;
  const h_ph = data.high > data.prevHigh && data.prevHigh > 0;
  const ol_hc = data.open > data.prevClose && data.prevClose > 0;
  const vwap = (data.high + data.low + data.close) / 3;
  const c_vwap = data.close > vwap;
  const v_ma5 = data.smaVol5 > 0 && data.volume > data.smaVol5;

  const params = [pr, v_ma20, ma_plus, l_pl, h_ph, ol_hc, c_vwap, v_ma5];
  const count = params.filter(Boolean).length;

  return { pr, v_ma20, ma_plus, l_pl, h_ph, ol_hc, c_vwap, v_ma5, count };
}

export function getParamDetails(data: ScreenerStockData): {
  key: string; label: string; value: boolean; detail: string;
}[] {
  const vwap = (data.high + data.low + data.close) / 3;
  const smaVol5 = data.smaVol5 || 0;
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
  const fmtV = (n: number) => {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "M lot";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "K lot";
    return fmt(n);
  };

  return [
    { key: "pr", label: "Prev Red", value: data.prevClose < data.prevOpen, detail: `Close ${fmt(data.prevClose)} ${data.prevClose < data.prevOpen ? "<" : "≥"} Open ${fmt(data.prevOpen)}` },
    { key: "v_ma20", label: "V > MA20", value: data.smaVol20 > 0 && data.volume > data.smaVol20, detail: `${fmtV(data.volume)} ${data.volume > data.smaVol20 ? ">" : "≤"} ${fmtV(data.smaVol20)}` },
    { key: "ma_plus", label: "MA Bullish", value: data.sma3 > data.sma5 && data.sma5 > data.sma10 && data.sma10 > data.sma20, detail: `MA3=${fmt(data.sma3)} MA5=${fmt(data.sma5)} MA10=${fmt(data.sma10)} MA20=${fmt(data.sma20)}` },
    { key: "l_pl", label: "L > Prev L", value: data.low > data.prevLow && data.prevLow > 0, detail: `${fmt(data.low)} ${data.low > data.prevLow ? ">" : "≤"} ${fmt(data.prevLow)}` },
    { key: "h_ph", label: "H > Prev H", value: data.high > data.prevHigh && data.prevHigh > 0, detail: `${fmt(data.high)} ${data.high > data.prevHigh ? ">" : "≤"} ${fmt(data.prevHigh)}` },
    { key: "ol_hc", label: "Gap Up", value: data.open > data.prevClose && data.prevClose > 0, detail: `Open ${fmt(data.open)} ${data.open > data.prevClose ? ">" : "≤"} PrevClose ${fmt(data.prevClose)}` },
    { key: "c_vwap", label: "C > VWAP", value: data.close > vwap, detail: `${fmt(data.close)} ${data.close > vwap ? ">" : "≤"} ${fmt(vwap)}` },
    { key: "v_ma5", label: "V > MA5", value: smaVol5 > 0 && data.volume > smaVol5, detail: `${fmtV(data.volume)} ${data.volume > smaVol5 ? ">" : "≤"} ${fmtV(smaVol5)}` },
  ];
}

export function getParamBadgeColor(count: number): string {
  if (count >= 7) return "bg-amber-500/20 text-amber-600 border-amber-500/30";
  if (count >= 5) return "bg-green-500/20 text-green-600 border-green-500/30";
  if (count >= 3) return "bg-yellow-500/20 text-yellow-700 border-yellow-500/30";
  return "bg-muted text-muted-foreground border-border";
}

export function getParamScoreBonus(count: number): number {
  if (count >= 7) return 4;
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  return 1;
}
