import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

// ===== INDICATOR HELPERS (same as sk-screener) =====
function smaAt(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += arr[i];
  return sum / period;
}

function emaArr(arr: number[], period: number): number[] {
  const r: number[] = new Array(arr.length);
  if (arr.length === 0) return r;
  const k = 2 / (period + 1);
  r[0] = arr[0];
  for (let i = 1; i < arr.length; i++) r[i] = arr[i] * k + r[i - 1] * (1 - k);
  return r;
}

function calcMACD(closes: number[]) {
  const ema12 = emaArr(closes, 12);
  const ema26 = emaArr(closes, 26);
  const macd: number[] = [];
  for (let i = 0; i < closes.length; i++) macd[i] = ema12[i] - ema26[i];
  const signal = emaArr(macd, 9);
  return { macd, signal };
}

function calcStoch(closes: number[], highs: number[], lows: number[], kPeriod: number, kSmooth: number, dSmooth: number) {
  const n = closes.length;
  const rawK: number[] = new Array(n).fill(NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  const kLine: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < kPeriod - 1 + kSmooth - 1) continue;
    let sum = 0, cnt = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) {
      if (!isNaN(rawK[j])) { sum += rawK[j]; cnt++; }
    }
    if (cnt === kSmooth) kLine[i] = sum / cnt;
  }
  const dLine: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) {
      if (j >= 0 && !isNaN(kLine[j])) { sum += kLine[j]; cnt++; }
    }
    if (cnt === dSmooth) dLine[i] = sum / cnt;
  }
  return { k: kLine, d: dLine };
}

function calcADX(closes: number[], highs: number[], lows: number[], period: number) {
  const n = closes.length;
  const tr: number[] = [0];
  const pDM: number[] = [0];
  const mDM: number[] = [0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    const up = highs[i] - highs[i - 1];
    const dn = lows[i - 1] - lows[i];
    pDM[i] = up > dn && up > 0 ? up : 0;
    mDM[i] = dn > up && dn > 0 ? dn : 0;
  }
  const sTR: number[] = new Array(n).fill(0);
  const sPDM: number[] = new Array(n).fill(0);
  const sMDM: number[] = new Array(n).fill(0);
  if (n <= period) return { adx: new Array(n).fill(0) };
  let sumTR = 0, sumP = 0, sumM = 0;
  for (let i = 1; i <= period; i++) { sumTR += tr[i]; sumP += pDM[i]; sumM += mDM[i]; }
  sTR[period] = sumTR; sPDM[period] = sumP; sMDM[period] = sumM;
  for (let i = period + 1; i < n; i++) {
    sTR[i] = sTR[i - 1] - sTR[i - 1] / period + tr[i];
    sPDM[i] = sPDM[i - 1] - sPDM[i - 1] / period + pDM[i];
    sMDM[i] = sMDM[i - 1] - sMDM[i - 1] / period + mDM[i];
  }
  const dx: number[] = new Array(n).fill(0);
  for (let i = period; i < n; i++) {
    const pDI = sTR[i] > 0 ? (sPDM[i] / sTR[i]) * 100 : 0;
    const mDI = sTR[i] > 0 ? (sMDM[i] / sTR[i]) * 100 : 0;
    const s = pDI + mDI;
    dx[i] = s > 0 ? (Math.abs(pDI - mDI) / s) * 100 : 0;
  }
  const adx: number[] = new Array(n).fill(0);
  const adxStart = period * 2;
  if (adxStart < n) {
    let s = 0;
    for (let i = period; i < adxStart; i++) s += dx[i];
    adx[adxStart - 1] = s / period;
    for (let i = adxStart; i < n; i++) adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
  }
  return { adx };
}

function crossAbove(a: number[], b: number[], idx: number): boolean {
  if (idx < 1 || isNaN(a[idx]) || isNaN(b[idx]) || isNaN(a[idx - 1]) || isNaN(b[idx - 1])) return false;
  return a[idx] > b[idx] && a[idx - 1] <= b[idx - 1];
}

function calcIIScore(
  mGtS: boolean, mup: boolean, sup: boolean, msup: boolean,
  k5: number, d5: number, adxama: boolean, sdn: boolean,
  crossMS: boolean, crossSM: boolean, mdn: boolean, msdn: boolean, mLtS: boolean
): number {
  let ii = 0;
  ii += mGtS ? 1 : 0;
  ii += mup ? 1 : 0;
  ii += sup ? 1 : 0;
  ii += msup ? 2 : 0;
  if (!isNaN(k5) && !isNaN(d5) && k5 > d5 && k5 > 20 && k5 < 80) ii += 1;
  if (!isNaN(k5) && k5 > 80 && adxama && sup) ii += 2;
  if (crossMS) ii += 1;
  if (!isNaN(k5) && !isNaN(d5) && k5 < d5 && k5 > 20 && k5 < 80) ii -= 1;
  if (!isNaN(k5) && k5 < 20 && adxama && sdn) ii -= 2;
  ii -= mdn ? 1 : 0;
  ii -= sdn ? 1 : 0;
  ii -= mLtS ? 1 : 0;
  ii -= msdn ? 2 : 0;
  if (crossSM) ii -= 1;
  return ii;
}

// Evaluate Superketat at index i, return params or null
function evalSuperketat(
  closes: number[], highs: number[], lows: number[], opens: number[], volumes: number[],
  macdArr: number[], signalArr: number[], kArr: number[], dArr: number[], adxArr: number[], adxEma: number[],
  i: number
) {
  if (i < 91) return null; // need enough warmup
  const C = closes[i], L = lows[i], V = volumes[i];
  const ma3 = smaAt(closes, 3, i);
  const ma5 = smaAt(closes, 5, i);
  const ma10 = smaAt(closes, 10, i);
  const ma20 = smaAt(closes, 20, i);
  const ma50 = smaAt(closes, 50, i);
  if (isNaN(ma20)) return null;

  const ma3p = smaAt(closes, 3, i - 1);
  const ma5p = smaAt(closes, 5, i - 1);

  const Vp1 = volumes[i - 1] || 1, Vp2 = volumes[i - 2] || 1;
  const vv0 = V / Vp1;
  const vv1 = (V / Vp1) + (Vp1 / Vp2);
  const sV60 = smaAt(volumes, 60, i);
  const vm60 = sV60 > 0 ? V / sV60 : 0;
  const vma60 = sV60 > 0 ? (Vp1 + V) / sV60 : 0;
  const sV3 = smaAt(volumes, 3, i), sV5 = smaAt(volumes, 5, i);
  const sV10 = smaAt(volumes, 10, i), sV30 = smaAt(volumes, 30, i);
  const sV90 = smaAt(volumes, 90, i);
  const v3ma60 = sV60 > 0 && !isNaN(sV3) ? sV3 / sV60 : 0;
  const v5ma60 = sV60 > 0 && !isNaN(sV5) ? sV5 / sV60 : 0;
  const v10ma60 = sV60 > 0 && !isNaN(sV10) ? sV10 / sV60 : 0;
  const v30ma90 = !isNaN(sV90) && sV90 > 0 && !isNaN(sV30) ? sV30 / sV90 : 0;

  const rp = V * C / 1_000_000;
  const rpP = Vp1 * closes[i - 1] / 1_000_000;

  const vok = (vv1 > 2 || vma60 > 2 || v3ma60 > 2 || v5ma60 > 2 || v10ma60 > 2 || v30ma90 > 2) && (rp + rpP) > 1000;
  if (!vok) return null;

  // VV0VV1 Confluence
  const isConfluence = (vv0 > 2 || vv1 > 2) && vm60 > 2 && rp > 0.1;

  let vokTipe = "";
  const t: string[] = [];
  if (vv1 > 2) t.push("vv1");
  if (vma60 > 2) t.push("Vma60");
  if (v3ma60 > 2) t.push("V3MA60");
  if (v5ma60 > 2) t.push("V5MA60");
  if (v10ma60 > 2) t.push("V10MA60");
  if (v30ma90 > 2) t.push("V30MA90");
  vokTipe = t.join(",");

  const dma3 = C > 0 ? (ma3 - C) / C * 100 : 0;
  const dma5 = C > 0 ? (ma5 - C) / C * 100 : 0;
  const dma10 = C > 0 && !isNaN(ma10) ? (ma10 - C) / C * 100 : 0;
  const dma20 = C > 0 ? (ma20 - C) / C * 100 : 0;
  const dma50 = C > 0 && !isNaN(ma50) ? (ma50 - C) / C * 100 : 0;
  const tma20 = (dma3 + dma5 + dma10 + dma20) / 4;
  const tma50 = (dma3 + dma5 + dma10 + dma20 + dma50) / 5;

  const m = macdArr[i], s = signalArr[i], ms = m - s;
  const mp = macdArr[i - 1], sp = signalArr[i - 1], msp_val = mp - sp;
  const mup = m > mp, mdn = m < mp;
  const msup = ms > msp_val, msdn = ms < msp_val;
  const sup = s > sp, sdn = s < sp;
  const crossMS = crossAbove(macdArr, signalArr, i);
  const crossSM = crossAbove(signalArr, macdArr, i);

  const k5 = kArr[i], d5 = dArr[i];
  const kup = !isNaN(k5) && !isNaN(kArr[i - 1]) && k5 > kArr[i - 1];
  const crossKD = crossAbove(kArr, dArr, i);
  const msp_cond = kup && crossKD && mup && crossMS;

  const adx13 = adxArr[i];
  const adxama = adx13 > adxEma[i];

  const ii = calcIIScore(m > s, mup, sup, msup, k5, d5, adxama, sdn, crossMS, crossSM, mdn, msdn, m < s);

  // Previous day ii
  const mp2 = macdArr[i - 2] ?? 0, sp2 = signalArr[i - 2] ?? 0;
  const mupP = mp > mp2, mdnP = mp < mp2;
  const supP = sp > sp2, sdnP = sp < sp2;
  const msupP = msp_val > (mp2 - sp2), msdnP = msp_val < (mp2 - sp2);
  const crossMSP = crossAbove(macdArr, signalArr, i - 1);
  const crossSMP = crossAbove(signalArr, macdArr, i - 1);
  const adxamaP = (adxArr[i - 1] ?? 0) > (adxEma[i - 1] ?? 0);
  const k5p = kArr[i - 1], d5p = dArr[i - 1];
  const iiy = calcIIScore(mp > sp, mupP, supP, msupP, k5p, d5p, adxamaP, sdnP, crossMSP, crossSMP, mdnP, msdnP, mp < sp);
  const is_val = ii - iiy;

  // KONDISI A
  const kondisiA = C > L
    && (C > ma3 || (!isNaN(ma3p) && ma3 > ma3p))
    && (C > ma5 || (!isNaN(ma5p) && ma5 > ma5p))
    && C > ma10 && C > ma20
    && (C < 1.05 * ma3 || C < 1.05 * ma5 || C < 1.05 * ma10 || C < 1.05 * ma20);

  const bullish = rp > 50 && (ii > 0 || is_val >= -1) && kondisiA;
  const safebull = bullish && (
    (tma20 > -3 && C > ma3 && C > ma5 && C > ma10 && C > ma20)
    || (!isNaN(ma50) && tma50 > -3 && C > ma3 && C > ma5 && C > ma10 && C > ma20 && C > ma50)
  );
  const safemsp = msp_cond && dma3 > -3 && dma3 < 0;

  if (!(safebull || safemsp)) return null;

  let jalur = safebull && safemsp ? "KEDUANYA" : safebull ? "SAFEBULL" : "SAFEMSP";

  let macdKondisi = "Bearish";
  if (crossMS) macdKondisi = "Bullish Cross";
  else if (m > s && mup) macdKondisi = "Bullish";
  else if (m > s && mdn) macdKondisi = "Weakening";

  let stochKondisi = "Bearish";
  if (crossKD) stochKondisi = "Golden Cross";
  else if (!isNaN(k5) && k5 > 80) stochKondisi = "Overbought";
  else if (!isNaN(k5) && k5 < 20) stochKondisi = "Oversold";
  else if (!isNaN(k5) && !isNaN(d5) && k5 > d5 && k5 >= 20 && k5 <= 80) stochKondisi = "Bullish";

  let adxKondisi = "Fading";
  if (adx13 > 25 && adxama) adxKondisi = "Strong Trend";
  else if (adx13 < 25 && adxama) adxKondisi = "Building";
  else if (adx13 < 20) adxKondisi = "Weak Trend";

  return { ii, iiy, is_val, jalur, vokTipe, tma20, tma50, macdKondisi, stochKondisi, adxKondisi, safebull, safemsp, isConfluence, vv0, vv1: vv1, vm60, rp };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    if (!ticker) throw new Error("ticker required");

    const symbol = `${ticker.trim().toUpperCase()}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
    const resp = await fetch(url, { headers: YAHOO_HEADERS });
    if (!resp.ok) throw new Error(`Yahoo returned ${resp.status}`);
    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("No data");

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) throw new Error("No quote data");

    const closes: number[] = [], highs: number[] = [], lows: number[] = [], opens: number[] = [], volumes: number[] = [];
    const dates: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = quote.close?.[i], h = quote.high?.[i], l = quote.low?.[i], o = quote.open?.[i], v = quote.volume?.[i];
      if (c > 0 && h > 0 && l > 0 && o > 0 && v != null) {
        closes.push(c); highs.push(h); lows.push(l); opens.push(o); volumes.push(v);
        const d = new Date(timestamps[i] * 1000);
        dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    }

    // Pre-compute all indicators
    const { macd: macdArr, signal: signalArr } = calcMACD(closes);
    const { k: kArr, d: dArr } = calcStoch(closes, highs, lows, 15, 3, 3);
    const { adx: adxArr } = calcADX(closes, highs, lows, 13);
    const adxEma = emaArr(adxArr, 2);

    const events: any[] = [];

    for (let i = 91; i < closes.length; i++) {
      const params = evalSuperketat(closes, highs, lows, opens, volumes, macdArr, signalArr, kArr, dArr, adxArr, adxEma, i);
      if (!params) continue;

      const closeDay0 = closes[i];
      const days: any[] = [];
      for (let d = 1; d <= 5; d++) {
        const fi = i + d;
        if (fi < closes.length) {
          const pctClose = ((closes[fi] - closeDay0) / closeDay0) * 100;
          const highPct = ((highs[fi] - closeDay0) / closeDay0) * 100;
          const win = highs[fi] >= closeDay0 * 1.05;
          const prevIdx = fi - 1;
          const gap = ((opens[fi] - closes[prevIdx]) / closes[prevIdx]) * 100;
          const avgVol20 = smaAt(volumes, 20, i);
          const volRel = !isNaN(avgVol20) && avgVol20 > 0 ? volumes[fi] / avgVol20 : null;
          days.push({ day: d, pctClose, highPct, win, gap, volRel });
        } else {
          days.push({ day: d, pctClose: null, highPct: null, win: null, gap: null, volRel: null });
        }
      }

      events.push({
        date: dates[i],
        closeDay0,
        ii: params.ii,
        iiy: params.iiy,
        is_val: params.is_val,
        jalur: params.jalur,
        vokTipe: params.vokTipe,
        tma20: params.tma20,
        tma50: params.tma50,
        macdKondisi: params.macdKondisi,
        stochKondisi: params.stochKondisi,
        adxKondisi: params.adxKondisi,
        isConfluence: params.isConfluence,
        vv0: params.vv0,
        vv1: params.vv1,
        vm60: params.vm60,
        rp: params.rp,
        days,
      });
    }

    // Build summary per day
    const summary = [1, 2, 3, 4, 5].map(day => {
      const vals = events.map(e => e.days.find((d: any) => d.day === day)).filter((d: any) => d && d.pctClose !== null);
      const pcts = vals.map((v: any) => v.pctClose);
      const wins = vals.filter((v: any) => v.win === true).length;
      const gaps = vals.map((v: any) => v.gap).filter((v: any) => v !== null);
      const gapUps = gaps.filter((g: number) => g > 0).length;
      const gapDowns = gaps.filter((g: number) => g < 0).length;

      return {
        day,
        avgPct: pcts.length > 0 ? pcts.reduce((a: number, b: number) => a + b, 0) / pcts.length : 0,
        pctPositive: pcts.length > 0 ? (pcts.filter((p: number) => p > 0).length / pcts.length) * 100 : 0,
        pctNegative: pcts.length > 0 ? (pcts.filter((p: number) => p < 0).length / pcts.length) * 100 : 0,
        winPct: pcts.length > 0 ? (wins / pcts.length) * 100 : 0,
        avgGap: gaps.length > 0 ? gaps.reduce((a: number, b: number) => a + b, 0) / gaps.length : 0,
        pctGapUp: gaps.length > 0 ? (gapUps / gaps.length) * 100 : 0,
        pctGapDown: gaps.length > 0 ? (gapDowns / gaps.length) * 100 : 0,
        bestPct: pcts.length > 0 ? Math.max(...pcts) : 0,
        worstPct: pcts.length > 0 ? Math.min(...pcts) : 0,
        count: pcts.length,
      };
    });

    // Avg ii and tma20 across events
    const avgIi = events.length > 0 ? events.reduce((s, e) => s + e.ii, 0) / events.length : 0;
    const avgTma20 = events.length > 0 ? events.reduce((s, e) => s + e.tma20, 0) / events.length : 0;

    // Correlation: ii score groups
    const iiGroups = [
      { label: "ii < 0", filter: (e: any) => e.ii < 0 },
      { label: "ii 0-2", filter: (e: any) => e.ii >= 0 && e.ii <= 2 },
      { label: "ii 3-5", filter: (e: any) => e.ii >= 3 && e.ii <= 5 },
      { label: "ii > 5", filter: (e: any) => e.ii > 5 },
    ];
    const iiCorrelation = iiGroups.map(g => {
      const filtered = events.filter(g.filter);
      const winPcts = [1,2,3,4,5].map(day => {
        const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
        return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
      });
      const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
      return { label: g.label, total: filtered.length, winPcts, avgPct };
    });

    // Correlation: VOK tipe
    const vokTypes = new Set<string>();
    events.forEach(e => (e.vokTipe || "").split(",").forEach((t: string) => { if (t) vokTypes.add(t); }));
    const vokCorrelation = Array.from(vokTypes).map(tipe => {
      const filtered = events.filter(e => (e.vokTipe || "").includes(tipe));
      const winPcts = [1,2,3,4,5].map(day => {
        const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
        return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
      });
      const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
      return { label: tipe, total: filtered.length, winPcts, avgPct };
    });

    // Correlation: jalur
    const jalurGroups = [
      { label: "SAFEBULL", filter: (e: any) => e.jalur === "SAFEBULL" },
      { label: "SAFEMSP", filter: (e: any) => e.jalur === "SAFEMSP" },
      { label: "KEDUANYA", filter: (e: any) => e.jalur === "KEDUANYA" },
    ];
    const jalurCorrelation = jalurGroups.map(g => {
      const filtered = events.filter(g.filter);
      const winPcts = [1,2,3,4,5].map(day => {
        const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
        return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
      });
      const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
      return { label: g.label, total: filtered.length, winPcts, avgPct };
    });

    // Correlation: TMA20
    const tma20Groups = [
      { label: "-3 s/d -2", filter: (e: any) => e.tma20 >= -3 && e.tma20 < -2 },
      { label: "-2 s/d -1", filter: (e: any) => e.tma20 >= -2 && e.tma20 < -1 },
      { label: "-1 s/d 0", filter: (e: any) => e.tma20 >= -1 && e.tma20 < 0 },
      { label: "0 s/d 1", filter: (e: any) => e.tma20 >= 0 && e.tma20 < 1 },
      { label: "> 1", filter: (e: any) => e.tma20 >= 1 },
    ];
    const tma20Correlation = tma20Groups.map(g => {
      const filtered = events.filter(g.filter);
      const winPcts = [1,2,3,4,5].map(day => {
        const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
        return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
      });
      const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
      return { label: g.label, total: filtered.length, winPcts, avgPct };
    });

    // Correlation: ADX
    const adxGroups = [
      { label: "Strong Trend", filter: (e: any) => e.adxKondisi === "Strong Trend" },
      { label: "Building", filter: (e: any) => e.adxKondisi === "Building" },
      { label: "Weak Trend", filter: (e: any) => e.adxKondisi === "Weak Trend" },
      { label: "Fading", filter: (e: any) => e.adxKondisi === "Fading" },
    ];
    const adxCorrelation = adxGroups.map(g => {
      const filtered = events.filter(g.filter);
      const winPcts = [1,2,3,4,5].map(day => {
        const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
        return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
      });
      const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
      return { label: g.label, total: filtered.length, winPcts, avgPct };
    });

    // Confluence correlation
    const confluenceGroups = [
      { label: "🔥 SK+VOL (Confluence)", filter: (e: any) => e.isConfluence === true },
      { label: "SK saja", filter: (e: any) => !e.isConfluence },
    ];
    const confluenceCorrelation = confluenceGroups.map(g => {
      const filtered = events.filter(g.filter);
      const winPcts = [1,2,3,4,5].map(day => {
        const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
        return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
      });
      const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
      return { label: g.label, total: filtered.length, winPcts, avgPct };
    });

    // Ranking
    const ranking = summary.map(s => {
      const score = s.winPct * 0.5 + Math.max(0, s.avgPct * 10) * 0.3 + (s.pctPositive > 50 ? 20 : 0) * 0.2;
      let reko = "❌ Hindari";
      if (score >= 40) reko = "⭐ Terbaik";
      else if (score >= 25) reko = "✅ Oke";
      else if (score >= 15) reko = "⚠️ Cukup";
      return { day: s.day, winPct: s.winPct, avgPct: s.avgPct, score, reko };
    }).sort((a, b) => b.score - a.score);

    // Best jalur
    const bestJalur = jalurCorrelation.length > 0 ? jalurCorrelation.reduce((a, b) => (a.winPcts[0] || 0) > (b.winPcts[0] || 0) ? a : b) : null;
    const bestIi = iiCorrelation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0] || 0) > (b.winPcts[0] || 0) ? a : b, iiCorrelation[0]);
    const bestVok = vokCorrelation.length > 0 ? vokCorrelation.reduce((a, b) => (a.winPcts[0] || 0) > (b.winPcts[0] || 0) ? a : b) : null;
    const bestAdx = adxCorrelation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0] || 0) > (b.winPcts[0] || 0) ? a : b, adxCorrelation[0]);
    const bestTma = tma20Correlation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0] || 0) > (b.winPcts[0] || 0) ? a : b, tma20Correlation[0]);

    const best = ranking[0];

    // Confluence effect text
    const confSK = confluenceCorrelation.find(c => c.label.includes("Confluence"));
    const confOnly = confluenceCorrelation.find(c => c.label === "SK saja");
    let confluenceEffect = "";
    if (confSK && confOnly && confSK.total > 0 && confOnly.total > 0) {
      const diffs = [1,2,3,4,5].map((d,i) => (confSK.winPcts[i] - confOnly.winPcts[i]));
      const avgDiff = diffs.reduce((a,b) => a+b, 0) / 5;
      confluenceEffect = `\n\nCONFLUENCE EFFECT (${confSK.total} kejadian SK+VOL vs ${confOnly.total} SK saja):\n` +
        [1,2,3,4,5].map((d,i) => `WIN% Day${d}: ${confSK.winPcts[i].toFixed(1)}% vs SK saja ${confOnly.winPcts[i].toFixed(1)}%`).join("\n") +
        `\n→ Confluence ${avgDiff >= 0 ? "meningkatkan" : "tidak meningkatkan"} WR rata-rata sebesar ${Math.abs(avgDiff).toFixed(1)}%`;
    }

    let conclusion = "";
    if (events.length > 0 && best) {
      conclusion = `=== RINGKASAN POLA HISTORIS ${ticker.trim().toUpperCase()} ===\n\n` +
        `Berdasarkan ${events.length} kejadian Superketat:\n\n` +
        `ENTRY OPTIMAL:\n` +
        `Day terbaik: DAY ${best.day}\n` +
        `- WIN rate 5%+: ${best.winPct.toFixed(1)}%\n` +
        `- Avg kenaikan: ${best.avgPct.toFixed(2)}%\n` +
        `- Avg ii score: ${avgIi.toFixed(1)}\n\n` +
        `KONDISI PALING RELIABLE:\n` +
        `- Jalur terbaik: ${bestJalur?.label || "-"} (WIN% ${(bestJalur?.winPcts[0] || 0).toFixed(1)}%)\n` +
        `- ii score optimal: ${bestIi?.label || "-"}\n` +
        `- VOK tipe terkuat: ${bestVok?.label || "-"}\n` +
        `- TMA20 optimal: ${bestTma?.label || "-"}\n` +
        `- ADX terbaik: ${bestAdx?.label || "-"}` +
        confluenceEffect;
    }

    return new Response(JSON.stringify({
      ticker: ticker.trim().toUpperCase(),
      totalEvents: events.length,
      summary,
      ranking,
      conclusion,
      avgIi,
      avgTma20,
      iiCorrelation,
      vokCorrelation,
      jalurCorrelation,
      tma20Correlation,
      adxCorrelation,
      confluenceCorrelation,
      events: events.reverse(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
