// Shared backtest engine used by HistoricalBacktest, Screener popup, and Analisa Historis

import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getBacktestTiming, getWIBNow, formatDateStr } from "@/lib/backtestTiming";

// ========== INDICATOR HELPERS ==========

export function calcSMA(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += arr[i];
  return sum / period;
}

export function calcEMA(arr: number[], period: number): number[] {
  const ema: number[] = new Array(arr.length).fill(NaN);
  if (arr.length < period) return ema;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += arr[i];
  ema[period - 1] = sum / period;
  const k = 2 / (period + 1);
  for (let i = period; i < arr.length; i++) {
    ema[i] = arr[i] * k + ema[i - 1] * (1 - k);
  }
  return ema;
}

export function calcBB(closes: number[], period: number, mult: number, idx: number) {
  if (idx < period - 1) return { mean: NaN, top: NaN, bottom: NaN, bandwidth: NaN };
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += closes[i];
  const mean = sum / period;
  let sqSum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sqSum += (closes[i] - mean) ** 2;
  const std = Math.sqrt(sqSum / period);
  const top = mean + mult * std;
  const bottom = mean - mult * std;
  const bandwidth = mean > 0 ? (top - bottom) / mean : 0;
  return { mean, top, bottom, bandwidth };
}

export function calcLLV(lows: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let min = Infinity;
  for (let i = idx - period + 1; i <= idx; i++) {
    if (lows[i] < min) min = lows[i];
  }
  return min;
}

// ========== TYPES ==========

export interface BacktestSignalParams {
  pr: boolean;
  v_ma20: boolean;
  ma_plus: boolean;
  l_pl: boolean;
  h_ph: boolean;
  ol_hc: boolean;
  c_vwap: boolean;
  v_ma5: boolean;
  count: number;
}

export interface BacktestSignal {
  date: string;
  dateTs: number;
  screener: string;
  close: number;
  highNextDay: number | null;
  pctCloseToHigh: number | null;
  result: "WIN" | "LOSE" | "N/A" | "PENDING" | "MARKET_OPEN";
  statusMessage?: string;
  params?: BacktestSignalParams;
}

export interface BacktestScreenerStats {
  name: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgGainWin: number;
  bestTrade: number;
  worstTrade: number;
  lastSignalDate: string;
  equityCurve: { idx: number; value: number }[];
}

export const SCREENER_NAMES = [
  "BB MID BOUNCE",
  "BB BOTTOM REVERSAL",
  "MA50 BOUNCE",
  "MA200 BOUNCE",
  "V1 — Volume Breakout",
  "V1.2 — Pullback After Spike",
  "V2 — Big Move Breakout",
];

// ========== CORE BACKTEST ==========

export interface BacktestResult {
  signals: BacktestSignal[];
  companyName: string;
  periodStart: string;
  periodEnd: string;
  totalTradingDays: number;
}

export async function runBacktestForTicker(
  ticker: string,
  onProgress?: (pct: number) => void
): Promise<BacktestResult> {
  const t = ticker.trim().toUpperCase();
  onProgress?.(20);

  const { data, error } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
    body: { ticker: t, count: 600 },
  });

  if (error || !data?.candles?.length) {
    throw new Error("Gagal mengambil data historis untuk " + t);
  }

  onProgress?.(40);

  const candles = data.candles as { time: number; open: number; high: number; low: number; close: number; volume: number }[];
  candles.sort((a, b) => a.time - b.time);

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const values = candles.map(c => c.close * c.volume);

  const ema10 = calcEMA(closes, 10);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);

  const now = new Date();
  const oneYearAgoTs = Math.floor(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime() / 1000);

  let startIdx = candles.findIndex(c => c.time >= oneYearAgoTs);
  if (startIdx < 0) startIdx = 0;
  startIdx = Math.max(startIdx, 200);

  const periodStartDate = new Date(candles[startIdx].time * 1000);
  const periodEndDate = new Date(candles[candles.length - 1].time * 1000);

  onProgress?.(60);

  const allSignals: BacktestSignal[] = [];

  for (let i = startIdx; i < candles.length; i++) {
    const c = closes[i];
    const h = highs[i];
    const l = lows[i];
    const v = volumes[i];
    const val = values[i];
    const prevC = closes[i - 1];
    const prevH = highs[i - 1];
    const prevL = lows[i - 1];
    const prevV = volumes[i - 1];
    const prev2C = closes[i - 2];
    const prev2H = highs[i - 2];
    const prev3C = closes[i - 3];

    const sma5 = calcSMA(closes, 5, i);
    const sma50 = calcSMA(closes, 50, i);
    const sma200 = calcSMA(closes, 200, i);
    const bb = calcBB(closes, 20, 2, i);
    const prevBb = calcBB(closes, 20, 2, i - 1);
    const llvLow5 = calcLLV(lows, 5, i);

    const e10 = ema10[i];
    const e20 = ema20[i];
    const e50 = ema50[i];

    const screenerHits: string[] = [];

    // BB MID BOUNCE
    if (
      !isNaN(bb.mean) && !isNaN(e10) && !isNaN(e20) && !isNaN(e50) &&
      c >= bb.mean * 0.98 && c <= bb.mean * 1.02 &&
      e10 > e20 && e20 > e50 &&
      bb.bandwidth >= 0.1 && c > bb.mean
    ) screenerHits.push("BB MID BOUNCE");

    // BB BOTTOM REVERSAL
    if (
      !isNaN(prevBb.bottom) &&
      prevL < prevBb.bottom && prevC < prevBb.bottom &&
      c > bb.bottom && v > prevV && h > prevH && c > prevC
    ) screenerHits.push("BB BOTTOM REVERSAL");

    // MA50 BOUNCE
    if (
      !isNaN(sma50) && !isNaN(llvLow5) &&
      llvLow5 > sma50 && c >= sma50 * 0.99 && c <= sma50 * 1.02
    ) screenerHits.push("MA50 BOUNCE");

    // MA200 BOUNCE
    if (
      !isNaN(sma200) && !isNaN(llvLow5) &&
      llvLow5 > sma200 && c >= sma200 * 0.99 && c <= sma200 * 1.02
    ) screenerHits.push("MA200 BOUNCE");

    // V1
    if (v > prevV && c > prevC && c > sma5 && val > 5_000_000_000)
      screenerHits.push("V1 — Volume Breakout");

    // V1.2
    if (
      !isNaN(sma5) &&
      c > sma5 && prevC > calcSMA(closes, 5, i - 1) &&
      prev2C > calcSMA(closes, 5, i - 2) &&
      prev2H / prev3C >= 1.1 && prevC < prev2C && c < prevC && val > 1_000_000_000
    ) screenerHits.push("V1.2 — Pullback After Spike");

    // V2
    if (v > prevV && c > prevC && c > sma5 && h / prevC >= 1.10 && val > 5_000_000_000)
      screenerHits.push("V2 — Big Move Breakout");

    // Compute 8 parameters for this candle
    let signalParams: BacktestSignalParams | undefined;
    if (screenerHits.length > 0) {
      const o = candles[i].open;
      const prevO = candles[i - 1].open;
      const sma3 = calcSMA(closes, 3, i);
      const sma5c = calcSMA(closes, 5, i);
      const sma10 = calcSMA(closes, 10, i);
      const sma20 = calcSMA(closes, 20, i);
      const smaVol20 = calcSMA(volumes, 20, i);
      const smaVol5 = calcSMA(volumes, 5, i);

      const pr = prevC < prevO;
      const v_ma20 = !isNaN(smaVol20) && smaVol20 > 0 && v > smaVol20;
      const ma_plus = !isNaN(sma3) && !isNaN(sma5c) && !isNaN(sma10) && !isNaN(sma20) &&
        sma3 > sma5c && sma5c > sma10 && sma10 > sma20;
      const l_pl = l > prevL && prevL > 0;
      const h_ph = h > prevH && prevH > 0;
      const ol_hc = o > prevC && prevC > 0;
      const vwap = (h + l + c) / 3;
      const c_vwap = c > vwap;
      const v_ma5p = !isNaN(smaVol5) && smaVol5 > 0 && v > smaVol5;
      const params = [pr, v_ma20, ma_plus, l_pl, h_ph, ol_hc, c_vwap, v_ma5p];
      const count = params.filter(Boolean).length;
      signalParams = { pr, v_ma20, ma_plus, l_pl, h_ph, ol_hc, c_vwap, v_ma5: v_ma5p, count };
    }

    for (const screener of screenerHits) {
      const signalDate = format(new Date(candles[i].time * 1000), "yyyy-MM-dd");
      const hasNextCandle = i + 1 < candles.length;
      const highNextDay = hasNextCandle ? highs[i + 1] : null;

      // Build a set of trading dates from candle timestamps for timing checks
      const tradingDatesSet = new Set<string>();
      for (const candle of candles) {
        const d = new Date(candle.time * 1000 + 7 * 3600000);
        tradingDatesSet.add(formatDateStr(d));
      }

      // Check timing for the last few signals (recent ones may be PENDING/MARKET_OPEN)
      const timing = getBacktestTiming(signalDate, tradingDatesSet);

      let result: BacktestSignal["result"];
      let pct: number | null = null;
      let statusMessage: string | undefined;

      if (!timing.canCalculate) {
        // Signal is too recent — next trading day hasn't closed yet
        result = timing.status === "MARKET_OPEN" ? "MARKET_OPEN" : "PENDING";
        statusMessage = timing.message;
      } else if (highNextDay == null) {
        result = "N/A";
      } else {
        pct = ((highNextDay - c) / c) * 100;
        result = highNextDay >= c * 1.02 ? "WIN" : "LOSE";
      }

      allSignals.push({
        date: signalDate,
        dateTs: candles[i].time,
        screener,
        close: c,
        highNextDay,
        pctCloseToHigh: pct,
        result,
        statusMessage,
        params: signalParams,
      });
    }
  }

  onProgress?.(100);

  return {
    signals: allSignals,
    companyName: data.companyName || t,
    periodStart: format(periodStartDate, "yyyy-MM-dd"),
    periodEnd: format(periodEndDate, "yyyy-MM-dd"),
    totalTradingDays: candles.length - startIdx,
  };
}

// ========== STATS HELPERS ==========

export function calcScreenerStats(signals: BacktestSignal[], screenerNames?: string[]): BacktestScreenerStats[] {
  const names = screenerNames || SCREENER_NAMES;
  return names.map(name => {
    const s = signals.filter(sig => sig.screener === name && sig.result !== "N/A" && sig.result !== "PENDING" && sig.result !== "MARKET_OPEN");
    const wins = s.filter(x => x.result === "WIN");
    const losses = s.filter(x => x.result === "LOSE");
    const winPcts = wins.map(x => x.pctCloseToHigh!);
    const allPcts = s.map(x => x.pctCloseToHigh!);

    let equity = 0;
    const equityCurve = s.map((sig, idx) => {
      equity += sig.result === "WIN" ? 1 : -1;
      return { idx: idx + 1, value: equity };
    });

    const lastSig = s.length > 0 ? s.sort((a, b) => b.dateTs - a.dateTs)[0].date : "";

    return {
      name,
      total: s.length,
      wins: wins.length,
      losses: losses.length,
      winRate: s.length > 0 ? (wins.length / s.length) * 100 : 0,
      avgGainWin: winPcts.length > 0 ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : 0,
      bestTrade: allPcts.length > 0 ? Math.max(...allPcts) : 0,
      worstTrade: allPcts.length > 0 ? Math.min(...allPcts) : 0,
      lastSignalDate: lastSig,
      equityCurve,
    };
  });
}
