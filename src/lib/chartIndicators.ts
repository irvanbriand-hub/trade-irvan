// Shared chart indicator calculations

export function sma(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    result.push(sum / period);
  }
  return result;
}

export function ema(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      result.push(sum / period);
      continue;
    }
    result.push(data[i] * k + (result[i - 1] ?? data[i]) * (1 - k));
  }
  return result;
}

export function bollingerBands(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const top: (number | null)[] = [];
  const bottom: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) { top.push(null); bottom.push(null); continue; }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mid[i]!) ** 2;
    const std = Math.sqrt(variance / period);
    top.push(mid[i]! + mult * std);
    bottom.push(mid[i]! - mult * std);
  }
  return { top, mid, bottom };
}

export function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) macdLine.push(emaFast[i]! - emaSlow[i]!);
    else macdLine.push(null);
  }
  const validMacd = macdLine.map(v => v ?? 0);
  const signalLine = ema(validMacd, signal);
  const histogram: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] != null && signalLine[i] != null) histogram.push(macdLine[i]! - signalLine[i]!);
    else histogram.push(null);
  }
  return { macdLine, signalLine, histogram };
}

export function calcStochastic(closes: number[], highs: number[], lows: number[], kPeriod = 15, kSmooth = 3, dSmooth = 3) {
  const n = closes.length;
  const rawK: (number | null)[] = new Array(n).fill(null);
  for (let i = kPeriod - 1; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  // K = SMA(rawK, kSmooth)
  const kLine: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < kPeriod - 1 + kSmooth - 1) continue;
    let sum = 0, cnt = 0;
    for (let j = i - kSmooth + 1; j <= i; j++) {
      if (rawK[j] != null) { sum += rawK[j]!; cnt++; }
    }
    if (cnt === kSmooth) kLine[i] = sum / cnt;
  }
  // D = SMA(K, dSmooth)
  const dLine: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - dSmooth + 1; j <= i; j++) {
      if (j >= 0 && kLine[j] != null) { sum += kLine[j]!; cnt++; }
    }
    if (cnt === dSmooth) dLine[i] = sum / cnt;
  }
  return { k: kLine, d: dLine };
}

export function calcADX(closes: number[], highs: number[], lows: number[], period = 13) {
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
  if (n <= period) return new Array(n).fill(0);
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
    let s2 = 0;
    for (let i = period; i < adxStart; i++) s2 += dx[i];
    adx[adxStart - 1] = s2 / period;
    for (let i = adxStart; i < n; i++) {
      adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period;
    }
  }
  return adx;
}

export function calcIIScoreArray(closes: number[], highs: number[], lows: number[]) {
  const n = closes.length;
  const macdData = calcMACD(closes);
  const stoch = calcStochastic(closes, highs, lows, 15, 3, 3);
  const adxArr = calcADX(closes, highs, lows, 13);
  const adxEma = ema(adxArr, 2);
  
  const iiArr: (number | null)[] = new Array(n).fill(null);
  const isArr: (number | null)[] = new Array(n).fill(null);
  
  for (let i = 1; i < n; i++) {
    const m = macdData.macdLine[i];
    const s = macdData.signalLine[i];
    const mp = macdData.macdLine[i - 1];
    const sp = macdData.signalLine[i - 1];
    if (m == null || s == null || mp == null || sp == null) continue;
    
    const k5 = stoch.k[i];
    const d5 = stoch.d[i];
    if (k5 == null || d5 == null) continue;
    
    const ms = m - s;
    const msp = mp - sp;
    const mup = m > mp;
    const mdn = m < mp;
    const sup = s > sp;
    const sdn = s < sp;
    const msup = ms > msp;
    const msdn = ms < msp;
    const adxama = adxArr[i] > (adxEma[i] ?? 0);
    
    // Cross detection
    const mp2 = i >= 2 ? macdData.macdLine[i - 1] : null;
    const sp2 = i >= 2 ? macdData.signalLine[i - 1] : null;
    const crossMS = mp2 != null && sp2 != null && m > s && mp2 <= sp2;
    const crossSM = mp2 != null && sp2 != null && s > m && sp2 <= mp2;
    
    let ii = 0;
    ii += m > s ? 1 : 0;
    ii += mup ? 1 : 0;
    ii += sup ? 1 : 0;
    ii += msup ? 2 : 0;
    if (k5 > d5 && k5 > 20 && k5 < 80) ii += 1; // ku1+ku2 = 0.5+0.5
    if (k5 > 80 && adxama && sup) ii += 2; // ku3
    if (crossMS) ii += 1;
    if (k5 < d5 && k5 > 20 && k5 < 80) ii -= 1; // kd1+kd2
    if (k5 < 20 && adxama && sdn) ii -= 2; // kd3
    ii -= mdn ? 1 : 0;
    ii -= sdn ? 1 : 0;
    ii -= m < s ? 1 : 0;
    ii -= msdn ? 2 : 0;
    if (crossSM) ii -= 1;
    
    iiArr[i] = ii;
    if (iiArr[i - 1] != null) {
      isArr[i] = ii - iiArr[i - 1]!;
    }
  }
  
  // MA5 of II
  const iiMA5: (number | null)[] = new Array(n).fill(null);
  for (let i = 4; i < n; i++) {
    let sum = 0, cnt = 0;
    for (let j = i - 4; j <= i; j++) {
      if (iiArr[j] != null) { sum += iiArr[j]!; cnt++; }
    }
    if (cnt === 5) iiMA5[i] = sum / 5;
  }
  
  return { ii: iiArr, is: isArr, iiMA5 };
}

export interface SignalMarker {
  time: string;
  position: 'belowBar' | 'aboveBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  text: string;
  size: number;
}

export function calcSignals(
  closes: number[], highs: number[], lows: number[], opens: number[], volumes: number[],
  times: number[], toTimeFn: (ts: number) => string
): SignalMarker[] {
  const n = closes.length;
  const markers: SignalMarker[] = [];
  
  const macdData = calcMACD(closes);
  const stoch = calcStochastic(closes, highs, lows, 15, 3, 3);
  const adxArr = calcADX(closes, highs, lows, 13);
  const adxEma = ema(adxArr, 2);
  
  // Pre-compute MAs for AboveAllMA check
  const ma3 = sma(closes, 3);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma100 = sma(closes, 100);
  const ma200 = sma(closes, 200);
  const bb = bollingerBands(closes, 20, 2);
  
  for (let i = 2; i < n; i++) {
    const C = closes[i], V = volumes[i];
    const Vp1 = volumes[i - 1] || 1, Vp2 = volumes[i - 2] || 1;
    const vv0 = V / Vp1;
    const vv1 = (V / Vp1) + (Vp1 / Vp2);
    const sV60val = sma(volumes.slice(0, i + 1), 60);
    const sv60 = sV60val[i] ?? 1;
    const vm60 = sv60 > 0 ? V / sv60 : 0;
    const rp = V * C / 1_000_000;
    
    const vok = (vv1 > 2 || vm60 > 2) && rp > 0.1;
    
    const m = macdData.macdLine[i];
    const s = macdData.signalLine[i];
    const mp = macdData.macdLine[i - 1];
    const sp = macdData.signalLine[i - 1];
    if (m == null || s == null || mp == null || sp == null) continue;
    
    const mup = m > mp;
    const mdn = m < mp;
    const sup = s > sp;
    const sdn = s < sp;
    const ms = m - s;
    const msp = mp - sp;
    const msup = ms > msp;
    const crossMS = mp <= sp && m > s;
    const crossSM = sp <= mp && s > m;
    
    const k5 = stoch.k[i];
    const d5 = stoch.d[i];
    const k5p = stoch.k[i - 1];
    const adxama = adxArr[i] > (adxEma[i] ?? 0);
    const kup = k5 != null && k5p != null && k5 > k5p;
    const crossKD = k5 != null && d5 != null && k5p != null && stoch.d[i - 1] != null && k5 > d5 && k5p <= stoch.d[i - 1]!;
    
    // BULLISH = mup AND (crossMS OR msup) AND sup
    const bullish = mup && (crossMS || msup) && sup;
    // MSP = kup AND crossKD AND mup AND crossMS
    const mspCond = kup && crossKD && mup && crossMS;
    
    // SAFEBULL 
    const safebull = bullish && adxama && k5 != null && k5 > 20;
    // SAFEMSP
    const safemsp = mspCond && adxama;
    
    const t = toTimeFn(times[i]);
    
    // SUPERKETAT: VOK AND (SAFEBULL OR SAFEMSP)
    if (vok && (safebull || safemsp)) {
      markers.push({ time: t, position: 'belowBar', color: '#00FF00', shape: 'arrowUp', text: 'SK', size: 2 });
    }
    // KETAT: VOK AND (BULLISH OR MSP) — but not already SK
    else if (vok && (bullish || mspCond)) {
      markers.push({ time: t, position: 'belowBar', color: '#FFD700', shape: 'arrowUp', text: 'KT', size: 2 });
    }
    
    // MACD Golden Cross
    if (crossMS && mup) {
      markers.push({ time: t, position: 'belowBar', color: '#00FF00', shape: 'circle', text: 'GC', size: 1 });
    }
    // MACD Death Cross
    if (crossSM && mdn) {
      markers.push({ time: t, position: 'aboveBar', color: '#FF6B9D', shape: 'circle', text: 'DC', size: 1 });
    }
    
    // ABOVEALLMA
    if (
      ma3[i] != null && ma5[i] != null && ma10[i] != null && ma20[i] != null &&
      ma50[i] != null && ma100[i] != null && ma200[i] != null && bb.bottom[i] != null &&
      C >= ma3[i]! && C >= ma5[i]! && C >= ma10[i]! && C >= ma20[i]! &&
      C >= ma50[i]! && C >= ma100[i]! && C >= ma200[i]! && C >= bb.bottom[i]!
    ) {
      // Only add if no other marker already at belowBar for this time
      if (!markers.find(mk => mk.time === t && mk.position === 'belowBar' && (mk.text === 'SK' || mk.text === 'KT'))) {
        markers.push({ time: t, position: 'belowBar', color: '#87CEEB', shape: 'circle', text: 'AA', size: 1 });
      }
    }
  }
  
  // Sort by time
  markers.sort((a, b) => a.time.localeCompare(b.time));
  return markers;
}
