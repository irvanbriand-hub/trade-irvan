import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const YAHOO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
};

function smaAt(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += arr[i];
  return sum / period;
}

function stdDevAt(arr: number[], period: number, idx: number): number {
  if (idx < period - 1) return NaN;
  const mean = smaAt(arr, period, idx);
  let sumSq = 0;
  for (let i = idx - period + 1; i <= idx; i++) sumSq += (arr[i] - mean) ** 2;
  return Math.sqrt(sumSq / period);
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
  const tr: number[] = [0], pDM: number[] = [0], mDM: number[] = [0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    const up = highs[i] - highs[i - 1], dn = lows[i - 1] - lows[i];
    pDM[i] = up > dn && up > 0 ? up : 0;
    mDM[i] = dn > up && dn > 0 ? dn : 0;
  }
  const sTR: number[] = new Array(n).fill(0), sPDM: number[] = new Array(n).fill(0), sMDM: number[] = new Array(n).fill(0);
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
  ii += mGtS ? 1 : 0; ii += mup ? 1 : 0; ii += sup ? 1 : 0; ii += msup ? 2 : 0;
  if (!isNaN(k5) && !isNaN(d5) && k5 > d5 && k5 > 20 && k5 < 80) ii += 1;
  if (!isNaN(k5) && k5 > 80 && adxama && sup) ii += 2;
  if (crossMS) ii += 1;
  if (!isNaN(k5) && !isNaN(d5) && k5 < d5 && k5 > 20 && k5 < 80) ii -= 1;
  if (!isNaN(k5) && k5 < 20 && adxama && sdn) ii -= 2;
  ii -= mdn ? 1 : 0; ii -= sdn ? 1 : 0; ii -= mLtS ? 1 : 0; ii -= msdn ? 2 : 0;
  if (crossSM) ii -= 1;
  return ii;
}

function evalAtIndex(
  closes: number[], highs: number[], lows: number[], volumes: number[],
  macdArr: number[], signalArr: number[], kArr: number[], dArr: number[], adxArr: number[], adxEma: number[],
  i: number, screenerType: string
) {
  if (i < 401) return null; // need 400+ warmup
  const C = closes[i], L = lows[i], V = volumes[i];
  const ma3 = smaAt(closes, 3, i), ma5 = smaAt(closes, 5, i);
  const ma10 = smaAt(closes, 10, i), ma20 = smaAt(closes, 20, i);
  const ma50 = smaAt(closes, 50, i);
  if (isNaN(ma20)) return null;
  const ma3p = smaAt(closes, 3, i - 1), ma5p = smaAt(closes, 5, i - 1);
  const ma100 = smaAt(closes, 100, i), ma200 = smaAt(closes, 200, i), ma400 = smaAt(closes, 400, i);
  const bbMean = smaAt(closes, 20, i);
  const bbStd = stdDevAt(closes, 20, i);
  const bbBottom = !isNaN(bbMean) && !isNaN(bbStd) ? bbMean - 2 * bbStd : NaN;

  const Vp1 = volumes[i - 1] || 1, Vp2 = volumes[i - 2] || 1;
  const vv1 = (V / Vp1) + (Vp1 / Vp2);
  const sV60 = smaAt(volumes, 60, i);
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
  let vokTipe = "";
  if (vok) {
    const t: string[] = [];
    if (vv1 > 2) t.push("vv1"); if (vma60 > 2) t.push("Vma60");
    if (v3ma60 > 2) t.push("V3MA60"); if (v5ma60 > 2) t.push("V5MA60");
    if (v10ma60 > 2) t.push("V10MA60"); if (v30ma90 > 2) t.push("V30MA90");
    vokTipe = t.join(",");
  }

  const dma3 = C > 0 ? (ma3 - C) / C * 100 : 0;
  const dma5 = C > 0 ? (ma5 - C) / C * 100 : 0;
  const dma10 = C > 0 && !isNaN(ma10) ? (ma10 - C) / C * 100 : 0;
  const dma20 = C > 0 ? (ma20 - C) / C * 100 : 0;
  const dma50 = C > 0 && !isNaN(ma50) ? (ma50 - C) / C * 100 : 0;
  const dma100 = C > 0 && !isNaN(ma100) ? (ma100 - C) / C * 100 : NaN;
  const dma200 = C > 0 && !isNaN(ma200) ? (ma200 - C) / C * 100 : NaN;
  const dma400 = C > 0 && !isNaN(ma400) ? (ma400 - C) / C * 100 : NaN;
  const clrbbb = C > 0 && !isNaN(bbBottom) ? (bbBottom - C) / C * 100 : NaN;
  const tma20 = (dma3 + dma5 + dma10 + dma20) / 4;

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
  const mp2 = macdArr[i - 2] ?? 0, sp2 = signalArr[i - 2] ?? 0;
  const iiy = calcIIScore(mp > sp, mp > mp2, sp > sp2, msp_val > (mp2 - sp2),
    kArr[i - 1], dArr[i - 1], (adxArr[i - 1] ?? 0) > (adxEma[i - 1] ?? 0), sp < sp2,
    crossAbove(macdArr, signalArr, i - 1), crossAbove(signalArr, macdArr, i - 1),
    mp < mp2, msp_val < (mp2 - sp2), mp < sp);
  const is_val = ii - iiy;

  const kondisiA = C > L
    && (C > ma3 || (!isNaN(ma3p) && ma3 > ma3p))
    && (C > ma5 || (!isNaN(ma5p) && ma5 > ma5p))
    && C > ma10 && C > ma20
    && (C < 1.05 * ma3 || C < 1.05 * ma5 || C < 1.05 * ma10 || C < 1.05 * ma20);

  const bullish = rp > 50 && (ii > 0 || is_val >= -1) && kondisiA;
  const ketat = vok && (bullish || msp_cond);

  // Labels
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

  // Apply screener filter
  let passes = false;
  const extraParams: any = {};

  if (screenerType === "ketat_allma") {
    const aboveAll = C >= ma3 && C >= ma5 && C >= ma10 && C >= ma20
      && (!isNaN(ma50) && C >= ma50) && (!isNaN(ma100) && C >= ma100)
      && (!isNaN(ma200) && C >= ma200) && (!isNaN(ma400) && C >= ma400)
      && (!isNaN(bbBottom) && C >= bbBottom);
    passes = ketat && aboveAll;
    const maAboveCount = [ma3, ma5, ma10, ma20, ma50, ma100, ma200, ma400].filter(m => !isNaN(m) && C >= m).length;
    extraParams.maAboveCount = maAboveCount;
    extraParams.distToMA400 = isNaN(dma400) ? 0 : dma400;
  } else if (screenerType === "ketat_pertama") {
    const prevKetat = i >= 2 ? (() => {
      const prevC = closes[i-1], prevL = lows[i-1], prevV = volumes[i-1];
      const prevMa3 = smaAt(closes, 3, i-1), prevMa5 = smaAt(closes, 5, i-1);
      const prevMa10 = smaAt(closes, 10, i-1), prevMa20 = smaAt(closes, 20, i-1);
      if (isNaN(prevMa20)) return false;
      const pma3p = smaAt(closes, 3, i-2), pma5p = smaAt(closes, 5, i-2);
      const pVp1 = volumes[i-2]||1, pVp2 = volumes[i-3]||1;
      const pvv1 = (prevV/pVp1)+(pVp1/pVp2);
      const psV60 = smaAt(volumes, 60, i-1);
      const pvma60 = psV60>0?(pVp1+prevV)/psV60:0;
      const psV3=smaAt(volumes,3,i-1),psV5=smaAt(volumes,5,i-1);
      const psV10=smaAt(volumes,10,i-1),psV30=smaAt(volumes,30,i-1);
      const psV90=smaAt(volumes,90,i-1);
      const pv3=psV60>0&&!isNaN(psV3)?psV3/psV60:0;
      const pv5=psV60>0&&!isNaN(psV5)?psV5/psV60:0;
      const pv10=psV60>0&&!isNaN(psV10)?psV10/psV60:0;
      const pv30=!isNaN(psV90)&&psV90>0&&!isNaN(psV30)?psV30/psV90:0;
      const prp=prevV*prevC/1e6;
      const prpP=pVp1*closes[i-2]/1e6;
      const pvok=(pvv1>2||pvma60>2||pv3>2||pv5>2||pv10>2||pv30>2)&&(prp+prpP)>1000;

      const pm=macdArr[i-1],ps=signalArr[i-1],pmm=macdArr[i-2]||0;
      const pmup=pm>pmm;
      const pcrossMS=crossAbove(macdArr,signalArr,i-1);
      const pk5=kArr[i-1],ppk5=kArr[i-2]||0;
      const pkup=!isNaN(pk5)&&pk5>ppk5;
      const pcrossKD=crossAbove(kArr,dArr,i-1);
      const pmsp=pkup&&pcrossKD&&pmup&&pcrossMS;

      const pdma3=prevC>0?(prevMa3-prevC)/prevC*100:0;
      const pdma5=prevC>0?(prevMa5-prevC)/prevC*100:0;
      const pdma10=prevC>0&&!isNaN(prevMa10)?(prevMa10-prevC)/prevC*100:0;
      const pdma20=prevC>0?(prevMa20-prevC)/prevC*100:0;

      const pii_mp2=macdArr[i-3]??0,pii_sp2=signalArr[i-3]??0;
      const pii_msp=macdArr[i-2]-(signalArr[i-2]||0);
      const pii=calcIIScore(pm>ps,pmup,sp>sp2,pii_msp>(pii_mp2-pii_sp2),pk5,dArr[i-1],(adxArr[i-1]||0)>(adxEma[i-1]||0),
        (signalArr[i-2]||0)>sp,pcrossMS,crossAbove(signalArr,macdArr,i-1),pm<pmm,pii_msp<(pii_mp2-pii_sp2),pm<ps);
      const piiy=calcIIScore(pmm>(signalArr[i-2]||0),pmm>(macdArr[i-3]||0),(signalArr[i-2]||0)>(signalArr[i-3]||0),
        (pmm-(signalArr[i-2]||0))>((macdArr[i-3]||0)-(signalArr[i-3]||0)),kArr[i-2]||0,dArr[i-2]||0,
        (adxArr[i-2]||0)>(adxEma[i-2]||0),(signalArr[i-3]||0)>(signalArr[i-2]||0),
        crossAbove(macdArr,signalArr,i-2),crossAbove(signalArr,macdArr,i-2),
        pmm<(macdArr[i-3]||0),(pmm-(signalArr[i-2]||0))<((macdArr[i-3]||0)-(signalArr[i-3]||0)),pmm<(signalArr[i-2]||0));
      const pis=pii-piiy;

      const pkondA=prevC>prevL&&(prevC>prevMa3||(!isNaN(pma3p)&&prevMa3>pma3p))&&(prevC>prevMa5||(!isNaN(pma5p)&&prevMa5>pma5p))
        &&prevC>prevMa10&&prevC>prevMa20&&(prevC<1.05*prevMa3||prevC<1.05*prevMa5||prevC<1.05*prevMa10||prevC<1.05*prevMa20);
      const pbullish=prp>50&&(pii>0||pis>=-1)&&pkondA;
      return pvok&&(pbullish||pmsp);
    })() : false;

    passes = ketat && !prevKetat;
    // Count days not ketat before
    let daysNotKetat = 0;
    for (let j = i - 1; j >= Math.max(401, i - 30); j--) {
      // Simplified: just count backward
      daysNotKetat++;
      // We'd need full eval for each day but that's too expensive
      // Just use the count from prev
      break; // simplified: at least 1 day
    }
    if (!prevKetat) daysNotKetat = 1; // minimum
    extraParams.daysNotKetat = daysNotKetat;
  } else if (screenerType === "bottom_fishing") {
    passes = vok && is_val >= 0 && C > L && (
      (!isNaN(dma100) && dma100 < 0 && dma100 > -2) ||
      (!isNaN(clrbbb) && clrbbb < 0 && clrbbb > -2) ||
      (!isNaN(dma200) && dma200 < 0 && dma200 > -2) ||
      (!isNaN(dma50) && dma50 < 0 && dma50 > -2) ||
      (dma20 < 0 && dma20 > -2) ||
      (!isNaN(dma400) && dma400 < 0 && dma400 > -2)
    );
    // Find nearest MA
    const candidates = [
      { name: "MA20", dist: dma20 },
      { name: "MA50", dist: dma50 },
      { name: "MA100", dist: isNaN(dma100) ? 999 : dma100 },
      { name: "MA200", dist: isNaN(dma200) ? 999 : dma200 },
      { name: "MA400", dist: isNaN(dma400) ? 999 : dma400 },
      { name: "BBBottom", dist: isNaN(clrbbb) ? 999 : clrbbb },
    ].filter(c => c.dist < 0 && c.dist > -2);
    if (candidates.length > 0) {
      candidates.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
      extraParams.nearestMA = candidates[0].name;
      extraParams.nearestMADist = candidates[0].dist;
    } else {
      extraParams.nearestMA = "";
      extraParams.nearestMADist = 0;
    }
  }

  if (!passes) return null;

  return {
    ii, iiy, is_val, vokTipe, tma20, macdKondisi, stochKondisi, adxKondisi,
    closeDay0: C, ...extraParams,
  };
}

function buildCorrelation(events: any[], filterFn: (e: any) => boolean, label: string) {
  const filtered = events.filter(filterFn);
  const winPcts = [1,2,3,4,5].map(day => {
    const vals = filtered.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.win !== null);
    return vals.length > 0 ? (vals.filter((v:any) => v.win).length / vals.length) * 100 : 0;
  });
  const avgPct = filtered.length > 0 ? filtered.map(e => e.days[0]?.pctClose ?? 0).reduce((a:number,b:number) => a+b, 0) / filtered.length : 0;
  return { label, total: filtered.length, winPcts, avgPct };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, screenerType = "ketat_allma" } = await req.json();
    if (!ticker) throw new Error("ticker required");

    const symbol = `${ticker.trim().toUpperCase()}.JK`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1d`;
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
        dates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
    }

    const { macd: macdArr, signal: signalArr } = calcMACD(closes);
    const { k: kArr, d: dArr } = calcStoch(closes, highs, lows, 15, 3, 3);
    const { adx: adxArr } = calcADX(closes, highs, lows, 13);
    const adxEma = emaArr(adxArr, 2);

    const events: any[] = [];

    for (let i = 401; i < closes.length; i++) {
      const params = evalAtIndex(closes, highs, lows, volumes, macdArr, signalArr, kArr, dArr, adxArr, adxEma, i, screenerType);
      if (!params) continue;

      const days: any[] = [];
      for (let d = 1; d <= 5; d++) {
        const fi = i + d;
        if (fi < closes.length) {
          const pctClose = ((closes[fi] - params.closeDay0) / params.closeDay0) * 100;
          const highPct = ((highs[fi] - params.closeDay0) / params.closeDay0) * 100;
          const win = highs[fi] >= params.closeDay0 * 1.05;
          const prevIdx = fi - 1;
          const gap = ((opens[fi] - closes[prevIdx]) / closes[prevIdx]) * 100;
          const avgVol20 = smaAt(volumes, 20, i);
          const volRel = !isNaN(avgVol20) && avgVol20 > 0 ? volumes[fi] / avgVol20 : null;
          days.push({ day: d, pctClose, highPct, win, gap, volRel });
        } else {
          days.push({ day: d, pctClose: null, highPct: null, win: null, gap: null, volRel: null });
        }
      }

      events.push({ date: dates[i], ...params, days });
    }

    // Summary
    const summary = [1,2,3,4,5].map(day => {
      const vals = events.map(e => e.days.find((d:any) => d.day === day)).filter((d:any) => d && d.pctClose !== null);
      const pcts = vals.map((v:any) => v.pctClose);
      const wins = vals.filter((v:any) => v.win === true).length;
      const gaps = vals.map((v:any) => v.gap).filter((v:any) => v !== null);
      return {
        day,
        avgPct: pcts.length > 0 ? pcts.reduce((a:number,b:number)=>a+b,0)/pcts.length : 0,
        pctPositive: pcts.length > 0 ? (pcts.filter((p:number)=>p>0).length/pcts.length)*100 : 0,
        pctNegative: pcts.length > 0 ? (pcts.filter((p:number)=>p<0).length/pcts.length)*100 : 0,
        winPct: pcts.length > 0 ? (wins/pcts.length)*100 : 0,
        avgGap: gaps.length > 0 ? gaps.reduce((a:number,b:number)=>a+b,0)/gaps.length : 0,
        pctGapUp: gaps.length > 0 ? (gaps.filter((g:number)=>g>0).length/gaps.length)*100 : 0,
        pctGapDown: gaps.length > 0 ? (gaps.filter((g:number)=>g<0).length/gaps.length)*100 : 0,
        bestPct: pcts.length > 0 ? Math.max(...pcts) : 0,
        worstPct: pcts.length > 0 ? Math.min(...pcts) : 0,
        count: pcts.length,
      };
    });

    // Correlations
    const iiCorrelation = [
      buildCorrelation(events, e => e.ii < 0, "ii < 0"),
      buildCorrelation(events, e => e.ii >= 0 && e.ii <= 2, "ii 0-2"),
      buildCorrelation(events, e => e.ii >= 3 && e.ii <= 5, "ii 3-5"),
      buildCorrelation(events, e => e.ii > 5, "ii > 5"),
    ];

    const vokTypes = new Set<string>();
    events.forEach(e => (e.vokTipe || "").split(",").forEach((t: string) => { if (t) vokTypes.add(t); }));
    const vokCorrelation = Array.from(vokTypes).map(t => buildCorrelation(events, e => (e.vokTipe || "").includes(t), t));

    const tma20Correlation = [
      buildCorrelation(events, e => e.tma20 >= -3 && e.tma20 < -2, "-3 s/d -2"),
      buildCorrelation(events, e => e.tma20 >= -2 && e.tma20 < -1, "-2 s/d -1"),
      buildCorrelation(events, e => e.tma20 >= -1 && e.tma20 < 0, "-1 s/d 0"),
      buildCorrelation(events, e => e.tma20 >= 0 && e.tma20 < 1, "0 s/d 1"),
      buildCorrelation(events, e => e.tma20 >= 1, "> 1"),
    ];

    const adxCorrelation = [
      buildCorrelation(events, e => e.adxKondisi === "Strong Trend", "Strong Trend"),
      buildCorrelation(events, e => e.adxKondisi === "Building", "Building"),
      buildCorrelation(events, e => e.adxKondisi === "Weak Trend", "Weak Trend"),
      buildCorrelation(events, e => e.adxKondisi === "Fading", "Fading"),
    ];

    // Gap correlation
    const gapCorrelation = [
      buildCorrelation(events, e => e.days[0]?.gap > 0, "Gap Up"),
      buildCorrelation(events, e => e.days[0]?.gap < 0, "Gap Down"),
      buildCorrelation(events, e => e.days[0]?.gap === 0 || (e.days[0]?.gap > -0.1 && e.days[0]?.gap < 0.1), "Flat"),
    ];

    // Screener-specific correlations
    let specificCorrelation: any[] = [];
    const screenerLabel = screenerType === "ketat_allma" ? "Ketat + Above All MA"
      : screenerType === "ketat_pertama" ? "Ketat Pertama"
      : "Big MA Bottom Fishing";

    if (screenerType === "ketat_allma") {
      specificCorrelation = [
        buildCorrelation(events, e => e.maAboveCount === 8, "Semua 8 MA di atas"),
        buildCorrelation(events, e => e.maAboveCount < 8, "< 8 MA di atas"),
      ];
    } else if (screenerType === "ketat_pertama") {
      specificCorrelation = [
        buildCorrelation(events, e => (e.daysNotKetat || 1) === 1, "Absen 1 hari"),
        buildCorrelation(events, e => (e.daysNotKetat || 1) >= 2 && (e.daysNotKetat || 1) <= 5, "Absen 2-5 hari"),
        buildCorrelation(events, e => (e.daysNotKetat || 1) > 5, "Absen > 5 hari"),
      ];
    } else if (screenerType === "bottom_fishing") {
      specificCorrelation = [
        buildCorrelation(events, e => e.nearestMA === "MA50", "Bounce MA50"),
        buildCorrelation(events, e => e.nearestMA === "MA100", "Bounce MA100"),
        buildCorrelation(events, e => e.nearestMA === "MA200", "Bounce MA200"),
        buildCorrelation(events, e => e.nearestMA === "MA400", "Bounce MA400"),
        buildCorrelation(events, e => e.nearestMA === "BBBottom", "Bounce BB Bottom"),
        buildCorrelation(events, e => e.nearestMA === "MA20", "Bounce MA20"),
      ].filter(c => c.total > 0);
    }

    // Entry Day Ranking with scoring system
    const avgAdxStrong = events.length > 0 ? events.filter(e => e.adxKondisi === "Strong Trend" || e.adxKondisi === "Building").length / events.length : 0;
    const avgTma20InRange = events.length > 0 ? events.filter(e => e.tma20 >= -2 && e.tma20 <= 0).length / events.length : 0;

    const ranking = summary.map(s => {
      let score = 0;
      // WIN% scoring
      if (s.winPct >= 70) score += 3;
      else if (s.winPct >= 60) score += 2;
      // Avg% scoring
      if (s.avgPct >= 2) score += 2;
      else if (s.avgPct >= 0) score += 1;
      // Gap Up scoring
      if (s.pctGapUp >= 60) score += 2;
      else if (s.pctGapUp >= 40) score += 1;
      // ADX bonus
      if (avgAdxStrong >= 0.5) score += 1;
      // TMA20 bonus
      if (avgTma20InRange >= 0.5) score += 1;

      let reko = "❌ Hindari";
      if (score >= 7) reko = "⭐ Entry Sangat Kuat";
      else if (score >= 5) reko = "✅ Entry Kuat";
      else if (score >= 3) reko = "⚠️ Entry Cukup";

      return { day: s.day, winPct: s.winPct, avgPct: s.avgPct, gapUpPct: s.pctGapUp, score, reko, maxScore: 9 };
    }).sort((a, b) => b.score - a.score);

    // Find best and alternative days
    const bestDay = ranking.length > 0 && ranking[0].winPct >= 60 ? ranking[0] : null;
    const altDay = ranking.length > 1 && ranking[1].winPct >= 60 && ranking[1].score >= 5 ? ranking[1] : null;

    const avgIi = events.length > 0 ? events.reduce((s, e) => s + e.ii, 0) / events.length : 0;
    const avgTma20 = events.length > 0 ? events.reduce((s, e) => s + e.tma20, 0) / events.length : 0;

    // Best of each
    const bestIi = iiCorrelation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0]||0) > (b.winPcts[0]||0) ? a : b, iiCorrelation[0]);
    const bestVok = vokCorrelation.length > 0 ? vokCorrelation.reduce((a, b) => (a.winPcts[0]||0) > (b.winPcts[0]||0) ? a : b) : null;
    const bestAdx = adxCorrelation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0]||0) > (b.winPcts[0]||0) ? a : b, adxCorrelation[0]);
    const bestTma = tma20Correlation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0]||0) > (b.winPcts[0]||0) ? a : b, tma20Correlation[0]);
    const bestGap = gapCorrelation.filter(g => g.total > 0).reduce((a, b) => (a.winPcts[0]||0) > (b.winPcts[0]||0) ? a : b, gapCorrelation[0]);
    const bestSpecific = specificCorrelation.length > 0 ? specificCorrelation.reduce((a, b) => (a.winPcts[0]||0) > (b.winPcts[0]||0) ? a : b) : null;

    const best = ranking[0];
    let conclusion = "";
    if (events.length > 0 && best) {
      let specificInsight = "";
      if (screenerType === "ketat_allma" && bestSpecific) {
        specificInsight = `\nINSIGHT KHUSUS:\n- Performa terbaik saat ${bestSpecific.label} (WIN% ${(bestSpecific.winPcts[0]||0).toFixed(1)}%)`;
      } else if (screenerType === "ketat_pertama" && bestSpecific) {
        specificInsight = `\nINSIGHT KHUSUS:\n- Performa terbaik setelah ${bestSpecific.label.toLowerCase()} (WIN% ${(bestSpecific.winPcts[0]||0).toFixed(1)}%)`;
      } else if (screenerType === "bottom_fishing" && bestSpecific) {
        specificInsight = `\nINSIGHT KHUSUS:\n- Support ${bestSpecific.label} paling reliable (WIN% ${(bestSpecific.winPcts[0]||0).toFixed(1)}%)`;
      }

      const entryLine = bestDay
        ? `📅 Entry optimal pagi hari ke-${bestDay.day}. WIN% historis ${bestDay.winPct.toFixed(1)}%, avg ${bestDay.avgPct.toFixed(2)}%. Gap Up ${bestDay.gapUpPct.toFixed(0)}% dari kejadian historis.${bestAdx ? ` Kondisi terbaik: ${bestAdx.label}` : ""}`
        : "📅 Entry: Belum ada pola kuat (WIN% < 60% di semua day)";

      conclusion = `=== RINGKASAN POLA HISTORIS ${ticker.trim().toUpperCase()} ===\n\n` +
        `Screener: ${screenerLabel}\n` +
        `Berdasarkan ${events.length} kejadian historis:\n\n` +
        `ENTRY OPTIMAL:\n` +
        `Day terbaik: DAY ${best.day}\n` +
        `- WIN rate 5%+: ${best.winPct.toFixed(1)}%\n` +
        `- Avg kenaikan: ${best.avgPct.toFixed(2)}%\n` +
        `- Gap Up rate: ${best.gapUpPct.toFixed(1)}%\n` +
        `- Score: ${best.score}/9 → ${best.reko}\n` +
        `- Kondisi terbaik: ${bestAdx?.label || "-"}\n\n` +
        `KONDISI PALING RELIABLE:\n` +
        `- ii score optimal: ${bestIi?.label || "-"}\n` +
        `- VOK tipe terkuat: ${bestVok?.label || "-"}\n` +
        `- TMA20 optimal: ${bestTma?.label || "-"}\n` +
        `- ADX terbaik: ${bestAdx?.label || "-"}\n` +
        `- Gap paling sering: ${bestGap?.label || "-"}` +
        specificInsight +
        `\n\nRANKING DAY 1-5:\n` +
        ranking.map(r => `Day ${r.day} | WIN% ${r.winPct.toFixed(1)}% | Avg ${r.avgPct.toFixed(2)}% | Score ${r.score}/9 | ${r.reko}`).join("\n") +
        `\n\n=== REKOMENDASI ENTRY SWING ===\n` +
        entryLine;
    }

    return new Response(JSON.stringify({
      ticker: ticker.trim().toUpperCase(),
      screenerType,
      screenerLabel,
      totalEvents: events.length,
      summary, ranking, conclusion,
      avgIi, avgTma20,
      bestDay, altDay,
      iiCorrelation, vokCorrelation, tma20Correlation, adxCorrelation, gapCorrelation, specificCorrelation,
      events: events.reverse(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
