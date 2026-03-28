/**
 * Evaluates a parsed formula against OHLCV candle data.
 * Converts formula string into a callable function that returns boolean.
 */

import { calcSMA, calcEMA, calcBB, calcLLV } from "./backtestEngine";

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ========== INDICATOR CACHE ==========
interface IndicatorCache {
  ema: Map<number, number[]>;
  // sma/bb/llv computed on-the-fly
}

function buildCache(closes: number[], volumes: number[]): IndicatorCache {
  return {
    ema: new Map(),
  };
}

function getEMA(cache: IndicatorCache, arr: number[], period: number): number[] {
  if (!cache.ema.has(period)) {
    cache.ema.set(period, calcEMA(arr, period));
  }
  return cache.ema.get(period)!;
}

// ========== MACD ==========
function calcMACD(closes: number[], fast: number, slow: number) {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = emaFast.map((f, i) => (isNaN(f) || isNaN(emaSlow[i])) ? NaN : f - emaSlow[i]);
  return macdLine;
}

function calcMACDSignal(closes: number[], fast: number, slow: number, signal: number) {
  const macdLine = calcMACD(closes, fast, slow);
  const validMacd = macdLine.filter(v => !isNaN(v));
  if (validMacd.length < signal) return { macd: macdLine, signal: macdLine.map(() => NaN), histogram: macdLine.map(() => NaN) };
  const signalLine = calcEMA(macdLine.map(v => isNaN(v) ? 0 : v), signal);
  const histogram = macdLine.map((m, i) => (isNaN(m) || isNaN(signalLine[i])) ? NaN : m - signalLine[i]);
  return { macd: macdLine, signal: signalLine, histogram };
}

// ========== RSI ==========
function calcRSI(closes: number[], period: number): number[] {
  const rsi = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;
  
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gainSum += diff; else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

// ========== STOCHASTIC ==========
function calcStochK(highs: number[], lows: number[], closes: number[], period: number, kSmooth: number): number[] {
  const rawK = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  if (kSmooth <= 1) return rawK;
  // SMA smooth
  const smoothed = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (isNaN(rawK[i])) continue;
    const s = calcSMA(rawK, kSmooth, i);
    smoothed[i] = s;
  }
  return smoothed;
}

// ========== ADX ==========
function calcADX(highs: number[], lows: number[], closes: number[], period: number = 14) {
  const len = closes.length;
  const pdx = new Array(len).fill(NaN);
  const ndx = new Array(len).fill(NaN);
  const adxArr = new Array(len).fill(NaN);
  
  if (len < period + 1) return { adx: adxArr, pdx, ndx };
  
  const tr: number[] = [0];
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  
  for (let i = 1; i < len; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  let atr = 0, aPlusDM = 0, aMinusDM = 0;
  for (let i = 1; i <= period; i++) {
    atr += tr[i]; aPlusDM += plusDM[i]; aMinusDM += minusDM[i];
  }
  
  for (let i = period; i < len; i++) {
    if (i > period) {
      atr = atr - atr / period + tr[i];
      aPlusDM = aPlusDM - aPlusDM / period + plusDM[i];
      aMinusDM = aMinusDM - aMinusDM / period + minusDM[i];
    }
    pdx[i] = atr > 0 ? (aPlusDM / atr) * 100 : 0;
    ndx[i] = atr > 0 ? (aMinusDM / atr) * 100 : 0;
    const dx = (pdx[i] + ndx[i]) > 0 ? Math.abs(pdx[i] - ndx[i]) / (pdx[i] + ndx[i]) * 100 : 0;
    if (i === period) {
      adxArr[i] = dx;
    } else if (!isNaN(adxArr[i - 1])) {
      adxArr[i] = (adxArr[i - 1] * (period - 1) + dx) / period;
    }
  }
  
  return { adx: adxArr, pdx, ndx };
}

// ========== HHV ==========
function calcHHV(highs: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let max = -Infinity;
  for (let i = idx - period + 1; i <= idx; i++) {
    if (highs[i] > max) max = highs[i];
  }
  return max;
}

// ========== FORMULA EVALUATOR ==========

/**
 * Compiles a formula string into a function that evaluates against candle data at index i.
 * Returns a function: (i: number) => boolean
 */
export function compileFormula(
  formula: string,
  candles: CandleData[]
): (i: number) => boolean {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const opens = candles.map(c => c.open);
  const volumes = candles.map(c => c.volume);
  const values = candles.map(c => c.close * c.volume);

  // Pre-compute indicators
  const rsi14 = calcRSI(closes, 14);
  const { macd: macd12_26, signal: macdSig, histogram: macdHist } = calcMACDSignal(closes, 12, 26, 9);
  const stochK14 = calcStochK(highs, lows, closes, 14, 3);
  const stochD14 = calcSMA.length > 0 ? (() => {
    const k = calcStochK(highs, lows, closes, 14, 3);
    const d = new Array(closes.length).fill(NaN);
    for (let idx = 0; idx < closes.length; idx++) d[idx] = calcSMA(k, 3, idx);
    return d;
  })() : [];
  const { adx: adx14, pdx: pdx14, ndx: ndx14 } = calcADX(highs, lows, closes, 14);

  // Build evaluation function
  return (i: number): boolean => {
    if (i < 1) return false;

    // Build context object
    const ctx: Record<string, number> = {
      open: opens[i], high: highs[i], low: lows[i], close: closes[i],
      volume: volumes[i], value: values[i],
      prev_open: opens[i - 1] ?? 0, prev_high: highs[i - 1] ?? 0,
      prev_low: lows[i - 1] ?? 0, prev_close: closes[i - 1] ?? 0,
      prev_volume: volumes[i - 1] ?? 0,
      prev_2_close: closes[i - 2] ?? 0, prev_3_close: closes[i - 3] ?? 0,
      prev_2_high: highs[i - 2] ?? 0, prev_2_low: lows[i - 2] ?? 0,
      // Bollinger default (20,2)
      bb_top: calcBB(closes, 20, 2, i).top,
      bb_mid: calcBB(closes, 20, 2, i).mean,
      bb_bottom: calcBB(closes, 20, 2, i).bottom,
      bb_bandwidth: calcBB(closes, 20, 2, i).bandwidth,
      // MACD defaults
      macd: macd12_26[i] ?? NaN,
      macd_signal: macdSig[i] ?? NaN,
      macd_histogram: macdHist[i] ?? NaN,
      // Stochastic defaults
      stoch_k: stochK14[i] ?? NaN,
      stoch_d: stochD14[i] ?? NaN,
      // Oscillators
      rsi: rsi14[i] ?? NaN,
      adx: adx14[i] ?? NaN,
      pdx: pdx14[i] ?? NaN,
      ndx: ndx14[i] ?? NaN,
    };

    // Function resolver
    const resolveFunc = (name: string, args: number[]): number => {
      switch (name) {
        case "sma": return calcSMA(closes, args[0], i);
        case "ema": return getEMA(buildCache(closes, volumes), closes, args[0])[i] ?? NaN;
        case "sma_vol": return calcSMA(volumes, args[0], i);
        case "bb_top": return calcBB(closes, args[0] || 20, args[1] || 2, i).top;
        case "bb_mid": return calcBB(closes, args[0] || 20, args[1] || 2, i).mean;
        case "bb_bottom": return calcBB(closes, args[0] || 20, args[1] || 2, i).bottom;
        case "rsi": return calcRSI(closes, args[0] || 14)[i] ?? NaN;
        case "hhv": return calcHHV(highs, args[0], i);
        case "llv": return calcLLV(lows, args[0], i);
        case "macd": return calcMACD(closes, args[0] || 12, args[1] || 26)[i] ?? NaN;
        case "macd_signal": return calcMACDSignal(closes, args[0] || 12, args[1] || 26, args[2] || 9).signal[i] ?? NaN;
        case "macd_histogram": return calcMACDSignal(closes, args[0] || 12, args[1] || 26, args[2] || 9).histogram[i] ?? NaN;
        case "stoch_k": return calcStochK(highs, lows, closes, args[0] || 14, args[1] || 3)[i] ?? NaN;
        case "stoch_d": {
          const k = calcStochK(highs, lows, closes, args[0] || 14, args[1] || 3);
          return calcSMA(k, args[2] || 3, i);
        }
        case "cross": return NaN; // handled separately
        default: return NaN;
      }
    };

    // Simple expression evaluator via string transformation
    try {
      let expr = formula.toLowerCase()
        .replace(/\/\/.*$/gm, "") // remove comments
        .replace(/\n/g, " ");
      
      // Replace AND/OR/NOT
      expr = expr.replace(/\bAND\b/gi, "&&");
      expr = expr.replace(/\bOR\b/gi, "||");
      expr = expr.replace(/\bNOT\b/gi, "!");

      // Replace function calls: func(args) → resolveFunc("func", [args])
      expr = expr.replace(/(\w+)\(([^)]*)\)/g, (_match, fname, argsStr) => {
        const fn = fname.toLowerCase();
        if (EVAL_FUNCTIONS.has(fn)) {
          const args = argsStr.split(",").map((a: string) => a.trim()).filter((a: string) => a);
          const numArgs = args.map((a: string) => {
            const n = parseFloat(a);
            return isNaN(n) ? 0 : n;
          });
          const result = resolveFunc(fn, numArgs);
          return isNaN(result) ? "NaN" : result.toString();
        }
        return "NaN";
      });

      // Replace keywords with values
      // Sort by length desc to avoid partial matches
      const sortedKeys = Object.keys(ctx).sort((a, b) => b.length - a.length);
      for (const key of sortedKeys) {
        const val = ctx[key];
        const regex = new RegExp(`\\b${key}\\b`, "g");
        expr = expr.replace(regex, isNaN(val) ? "NaN" : val.toString());
      }

      // Safety: only allow numbers, operators, parens, NaN, whitespace
      const safeExpr = expr.replace(/[^0-9.eE+\-*/()&|!=<>?\s:NaN]/g, "");
      
      // Evaluate
      const fn = new Function(`"use strict"; try { return !!(${safeExpr}); } catch { return false; }`);
      return fn();
    } catch {
      return false;
    }
  };
}

const EVAL_FUNCTIONS = new Set([
  "sma", "ema", "sma_vol", "bb_top", "bb_bottom", "bb_mid",
  "rsi", "hhv", "llv", "macd", "macd_signal", "macd_histogram",
  "stoch_k", "stoch_d", "cross",
]);

/**
 * Evaluate formula for all candles, return indices where formula is true.
 * startIdx = minimum index to start evaluation (warmup period).
 */
export function evaluateFormulaOnCandles(
  formula: string,
  candles: CandleData[],
  startIdx: number = 200
): number[] {
  const evalFn = compileFormula(formula, candles);
  const results: number[] = [];
  const start = Math.max(startIdx, 50);
  for (let i = start; i < candles.length; i++) {
    if (evalFn(i)) results.push(i);
  }
  return results;
}
