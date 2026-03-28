import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

// WMA calculation
function calcWMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0, weightSum = 0;
    for (let j = 0; j < period; j++) {
      const weight = j + 1;
      sum += data[i - period + 1 + j] * weight;
      weightSum += weight;
    }
    result[i] = sum / weightSum;
  }
  return result;
}

// HMA = WMA(2*WMA(close,n/2) - WMA(close,n), sqrt(n))
function calcHMA(closes: number[], period: number): number[] {
  const halfPeriod = Math.max(Math.floor(period / 2), 1);
  const sqrtPeriod = Math.max(Math.round(Math.sqrt(period)), 1);
  const wmaHalf = calcWMA(closes, halfPeriod);
  const wmaFull = calcWMA(closes, period);
  const step1: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    step1.push(isNaN(wmaHalf[i]) || isNaN(wmaFull[i]) ? NaN : 2 * wmaHalf[i] - wmaFull[i]);
  }
  return calcWMA(step1.map(v => isNaN(v) ? 0 : v), sqrtPeriod);
}

function calcSMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j];
    result[i] = sum / period;
  }
  return result;
}

function calcEMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const k = 2 / (period + 1);
  let started = false;
  for (let i = 0; i < data.length; i++) {
    if (isNaN(data[i])) continue;
    if (!started) { result[i] = data[i]; started = true; }
    else result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change; else avgLoss += Math.abs(change);
  }
  avgGain /= period; avgLoss /= period;
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (change > 0 ? change : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (change < 0 ? Math.abs(change) : 0)) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsi;
}

interface Candle {
  time: number;
  open: number; high: number; low: number; close: number;
  volume: number;
}

function analyzeStock(candles: Candle[]) {
  if (candles.length < 60) return null;

  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;

  // Tengah & AO/AC
  const tengah = highs.map((h, i) => (h + lows[i]) / 2);
  const maTengah5 = calcSMA(tengah, 5);
  const maTengah34 = calcSMA(tengah, 34);
  const ao: number[] = maTengah5.map((v, i) => isNaN(v) || isNaN(maTengah34[i]) ? NaN : v - maTengah34[i]);
  const maAo5 = calcSMA(ao.map(v => isNaN(v) ? 0 : v), 5);
  const ac: number[] = ao.map((v, i) => isNaN(v) || isNaN(maAo5[i]) ? NaN : v - maAo5[i]);

  // HMA5
  const hma5 = calcHMA(closes, 5);

  // SMA
  const ma8 = calcSMA(closes, 8);
  const ma21 = calcSMA(closes, 21);
  const ma55 = calcSMA(closes, 55);
  const maV21 = calcSMA(volumes, 21);

  // DV & Likuiditas
  const avgPrices = candles.map(c => (c.open + c.high + c.low + c.close) / 4);
  const dv = avgPrices.map((ap, i) => ap * volumes[i]);
  const maDv21 = calcSMA(dv, 21);

  // Heiken Ashi
  const haClose: number[] = avgPrices.slice();
  const haOpen: number[] = new Array(n).fill(NaN);
  haOpen[0] = (opens[0] + closes[0]) / 2;
  for (let i = 1; i < n; i++) {
    haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
  }

  // RSI
  const rsi = calcRSI(closes);

  // MFI
  const mfi: number[] = candles.map(c => c.volume > 0 ? Math.abs(c.high - c.low) / c.volume : 0);

  const i = n - 1;
  if (i < 1) return null;

  const acCurr = ac[i];
  const acPrev = ac[i - 1];
  const aoCurr = ao[i];
  const aoPrev = ao[i - 1];
  const acNaik = !isNaN(acCurr) && !isNaN(acPrev) && acCurr > acPrev;
  const aoNaik = !isNaN(aoCurr) && !isNaN(aoPrev) && aoCurr > aoPrev;
  const hijau = acNaik && aoNaik;

  const likuid = !isNaN(maDv21[i]) && maDv21[i] > 2500000000;

  const pivot = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
  const target = pivot + (highs[i] - lows[i]);
  const stopLoss = 2 * pivot - highs[i];

  const hma5Val = hma5[i];
  const haCloseVal = haClose[i];
  const haOpenVal = haOpen[i];

  // BUY conditions
  const buyK1 = acNaik && likuid && pivot > lows[i];
  const buyK2 = acNaik && likuid && closes[i] === opens[i] && closes[i] > hma5Val;
  const buyK3 = acNaik && likuid && closes[i] > opens[i] && closes[i] > hma5Val && haCloseVal >= haOpenVal;
  
  // SELL conditions
  const sellK1 = closes[i] < opens[i - 1];
  const sellK2 = haCloseVal < haOpenVal && hma5Val > closes[i];

  let sinyal: 'BELI' | 'JUAL' | 'PERIKSA' = 'PERIKSA';
  if (sellK1 || sellK2) sinyal = 'JUAL';
  else if (buyK1 || buyK2 || buyK3) sinyal = 'BELI';

  // Performance
  const dailyPct = i >= 1 && closes[i - 1] > 0 ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : 0;
  const weeklyPct = i >= 5 && closes[i - 5] > 0 ? ((closes[i] - closes[i - 5]) / closes[i - 5]) * 100 : 0;
  const monthlyPct = i >= 22 && closes[i - 22] > 0 ? ((closes[i] - closes[i - 22]) / closes[i - 22]) * 100 : 0;
  const yearlyPct = i >= 244 && closes[i - 244] > 0 ? ((closes[i] - closes[i - 244]) / closes[i - 244]) * 100 : null;

  // MFI color
  let mfiColor = 'PaleGreen';
  if (i >= 1 && mfi[i - 1] > 0) {
    const mfiRoc = (mfi[i] - mfi[i - 1]) / mfi[i - 1];
    const volRoc = volumes[i - 1] > 0 ? (volumes[i] - volumes[i - 1]) / volumes[i - 1] : 0;
    if (mfiRoc > 0 && volRoc > 0) mfiColor = 'PaleGreen';
    else if (mfiRoc < 0 && volRoc < 0) mfiColor = 'Red';
    else if (mfiRoc > 0 && volRoc < 0) mfiColor = 'Blue';
    else if (mfiRoc < 0 && volRoc > 0) mfiColor = 'Pink';
  }

  // Filter: dailyPct > 0 AND volume > 1250000
  const passFilter = dailyPct > 0 && volumes[i] > 1250000;

  return {
    close: closes[i],
    open: opens[i],
    high: highs[i],
    low: lows[i],
    volume: volumes[i],
    value: dv[i],
    sinyal,
    buyK1, buyK2, buyK3,
    sellK1, sellK2,
    acNaik, aoNaik, hijau, likuid,
    ao: aoCurr,
    ac: acCurr,
    hma5: hma5Val,
    haClose: haCloseVal,
    haOpen: haOpenVal,
    haStatus: haCloseVal >= haOpenVal ? 'BULLISH' : 'BEARISH',
    pivot, target, stopLoss,
    ma8: ma8[i], ma21: ma21[i], ma55: ma55[i],
    maV21: maV21[i],
    rsi: rsi[i],
    dailyPct, weeklyPct, monthlyPct, yearlyPct,
    mfiColor,
    passFilter,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers, mode } = await req.json();

    if (!tickers || !Array.isArray(tickers)) {
      return new Response(JSON.stringify({ error: 'tickers array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const ticker of tickers) {
      const upper = ticker.toUpperCase().trim();
      const symbol = upper.endsWith('.JK') ? upper : `${upper}.JK`;

      try {
        const range = mode === 'history' ? '2y' : '2y';
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
        const resp = await fetch(url, { headers });
        if (!resp.ok) continue;

        const data = await resp.json();
        const r = data.chart?.result?.[0];
        if (!r) continue;

        const quote = r.indicators?.quote?.[0];
        const timestamps = r.timestamp || [];
        const candles: Candle[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const o = quote?.open?.[i], h = quote?.high?.[i], l = quote?.low?.[i], c = quote?.close?.[i], v = quote?.volume?.[i];
          if (o != null && h != null && l != null && c != null && o > 0 && h > 0 && l > 0 && c > 0) {
            candles.push({ time: timestamps[i], open: o, high: h, low: l, close: c, volume: v || 0 });
          }
        }

        if (mode === 'history') {
          // Return all candles for historical analysis
          const analysis = analyzeHistorical(candles);
          results.push({
            ticker: upper.replace('.JK', ''),
            name: r.meta?.shortName || r.meta?.longName || upper.replace('.JK', ''),
            signals: analysis,
          });
        } else {
          const result = analyzeStock(candles);
          if (result) {
            results.push({
              ticker: upper.replace('.JK', ''),
              name: r.meta?.shortName || r.meta?.longName || upper.replace('.JK', ''),
              ...result,
            });
          }
        }
      } catch (e) {
        console.error(`Error processing ${ticker}:`, e);
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Jendral Hunter error:', error);
    return new Response(JSON.stringify({ error: error.message, results: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function analyzeHistorical(candles: Candle[]) {
  if (candles.length < 60) return [];

  const opens = candles.map(c => c.open);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const n = candles.length;

  const tengah = highs.map((h, i) => (h + lows[i]) / 2);
  const maTengah5 = calcSMA(tengah, 5);
  const maTengah34 = calcSMA(tengah, 34);
  const ao: number[] = maTengah5.map((v, i) => isNaN(v) || isNaN(maTengah34[i]) ? NaN : v - maTengah34[i]);
  const maAo5 = calcSMA(ao.map(v => isNaN(v) ? 0 : v), 5);
  const ac: number[] = ao.map((v, i) => isNaN(v) || isNaN(maAo5[i]) ? NaN : v - maAo5[i]);
  const hma5 = calcHMA(closes, 5);
  const ma8 = calcSMA(closes, 8);
  const avgPrices = candles.map(c => (c.open + c.high + c.low + c.close) / 4);
  const dv = avgPrices.map((ap, i) => ap * volumes[i]);
  const maDv21 = calcSMA(dv, 21);
  const haClose: number[] = avgPrices.slice();
  const haOpen: number[] = new Array(n).fill(NaN);
  haOpen[0] = (opens[0] + closes[0]) / 2;
  for (let i = 1; i < n; i++) haOpen[i] = (haOpen[i - 1] + haClose[i - 1]) / 2;
  const rsi = calcRSI(closes);

  const signals: any[] = [];

  // Start from index 55+ for warmup
  for (let i = 55; i < n; i++) {
    const acCurr = ac[i], acPrev = ac[i - 1];
    const aoCurr = ao[i], aoPrev = ao[i - 1];
    const acNaik = !isNaN(acCurr) && !isNaN(acPrev) && acCurr > acPrev;
    const aoNaik = !isNaN(aoCurr) && !isNaN(aoPrev) && aoCurr > aoPrev;
    const likuid = !isNaN(maDv21[i]) && maDv21[i] > 2500000000;
    const pivot = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
    const hma5Val = hma5[i];
    const haCloseVal = haClose[i];
    const haOpenVal = haOpen[i];

    const buyK1 = acNaik && likuid && pivot > lows[i];
    const buyK2 = acNaik && likuid && closes[i] === opens[i] && closes[i] > hma5Val;
    const buyK3 = acNaik && likuid && closes[i] > opens[i] && closes[i] > hma5Val && haCloseVal >= haOpenVal;

    const dailyPct = closes[i - 1] > 0 ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : 0;
    const passFilter = dailyPct > 0 && volumes[i] > 1250000;

    if ((buyK1 || buyK2 || buyK3) && passFilter) {
      // Check D+1, D+2, D+3 outcomes
      const highD1 = i + 1 < n ? highs[i + 1] : null;
      const highD2 = i + 2 < n ? highs[i + 2] : null;
      const highD3 = i + 3 < n ? highs[i + 3] : null;
      const closeD1 = i + 1 < n ? closes[i + 1] : null;

      const winBSJP = highD1 != null && highD1 >= closes[i] * 1.02;
      const winSwing = (highD1 != null && highD1 >= closes[i] * 1.05) ||
                       (highD2 != null && highD2 >= closes[i] * 1.05) ||
                       (highD3 != null && highD3 >= closes[i] * 1.05);

      const pctD1 = highD1 != null ? ((highD1 - closes[i]) / closes[i]) * 100 : null;
      const pctD2 = highD2 != null ? ((highD2 - closes[i]) / closes[i]) * 100 : null;
      const pctD3 = highD3 != null ? ((highD3 - closes[i]) / closes[i]) * 100 : null;
      const closeReturnD1 = closeD1 != null ? ((closeD1 - closes[i]) / closes[i]) * 100 : null;

      signals.push({
        date: candles[i].time,
        close: closes[i],
        buyK1, buyK2, buyK3,
        ao: aoCurr, ac: acCurr,
        hma5: hma5Val,
        haStatus: haCloseVal >= haOpenVal ? 'BULLISH' : 'BEARISH',
        rsi: rsi[i],
        volume: volumes[i],
        highD1, highD2, highD3,
        pctD1, pctD2, pctD3,
        closeReturnD1,
        winBSJP, winSwing,
      });
    }
  }

  return signals;
}
