import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

interface BucketAccum {
  signal: number;
  buy: number;
  skip: number;
  tp: number;
  sl: number;
  hold: number;
  sumGap: number;
  sumMaxGain: number;
  sumReturn: number;
  firstDate: string | null;
}

function emptyAccum(): BucketAccum {
  return { signal: 0, buy: 0, skip: 0, tp: 0, sl: 0, hold: 0, sumGap: 0, sumMaxGain: 0, sumReturn: 0, firstDate: null };
}

function calcStats(accum: BucketAccum) {
  const { signal, buy, skip, tp, sl, hold, sumGap, sumMaxGain, sumReturn } = accum;
  const winRate = (tp + sl) > 0 ? (tp / (tp + sl)) * 100 : null;
  const avgGap = buy > 0 ? sumGap / buy : null;
  const avgMaxGain = buy > 0 ? sumMaxGain / buy : null;
  const avgReturn = buy > 0 ? sumReturn / buy : null;
  return { signal, buy, skip, tp, sl, hold, winRate, avgGap, avgMaxGain, avgReturn };
}

function updateAccum(
  accum: BucketAccum,
  isBuy: boolean,
  iepGapPct: number,
  maxGainPct: number,
  finalReturn: number,
  result: 'TP' | 'SL' | 'HOLD' | 'SKIP',
  date: string
) {
  accum.signal++;
  if (!accum.firstDate) accum.firstDate = date;
  if (isBuy) {
    accum.buy++;
    accum.sumGap += iepGapPct;
    accum.sumMaxGain += maxGainPct;
    accum.sumReturn += finalReturn;
    if (result === 'TP') accum.tp++;
    else if (result === 'SL') accum.sl++;
    else accum.hold++;
  } else {
    accum.skip++;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { ticker, params = {} } = body;

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'ticker required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const minJumpPct: number = params.minJumpPct ?? 10.0;
    const minValue: number = params.minValue ?? 5_000_000_000;
    const slPercent: number = params.slPercent ?? 5.0;
    const hardSLPct = slPercent;

    const upperTicker = ticker.toUpperCase();
    const symbol = upperTicker.endsWith('.JK') ? upperTicker : `${upperTicker}.JK`;

    // Pull 2 year daily OHLCV — same pattern as yahoo-finance-ohlcv
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`;
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Yahoo Finance HTTP ${resp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp || result.timestamp.length === 0) {
      return new Response(JSON.stringify({ error: 'No data from Yahoo Finance' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators?.quote?.[0];
    const rawOpens: (number | null)[] = quote?.open || [];
    const rawHighs: (number | null)[] = quote?.high || [];
    const rawLows: (number | null)[] = quote?.low || [];
    const rawCloses: (number | null)[] = quote?.close || [];
    const rawVolumes: (number | null)[] = quote?.volume || [];

    // Build clean candles array (filter nulls)
    const candles: {
      time: number;
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (
        rawOpens[i] != null &&
        rawHighs[i] != null &&
        rawLows[i] != null &&
        rawCloses[i] != null &&
        rawVolumes[i] != null
      ) {
        const d = new Date(timestamps[i] * 1000);
        candles.push({
          time: timestamps[i],
          date: d.toISOString().slice(0, 10),
          open: rawOpens[i] as number,
          high: rawHighs[i] as number,
          low: rawLows[i] as number,
          close: rawCloses[i] as number,
          volume: rawVolumes[i] as number,
        });
      }
    }
    candles.sort((a, b) => a.time - b.time);

    const totalBars = candles.length;

    // Calculate SMA5 for each candle
    // sma5[i] = avg(close[i-4]..close[i])
    const sma5: number[] = new Array(totalBars).fill(NaN);
    for (let i = 4; i < totalBars; i++) {
      sma5[i] = (
        candles[i].close +
        candles[i - 1].close +
        candles[i - 2].close +
        candles[i - 3].close +
        candles[i - 4].close
      ) / 5;
    }

    // Accumulators per bucket
    // V2.1 and V2.2 are mutually exclusive
    const bucketsV21 = new Map<number, BucketAccum>();
    const bucketsV22 = new Map<number, BucketAccum>();
    const summaryV21 = emptyAccum();
    const summaryV22 = emptyAccum();

    // Process signals: candle i is signal bar, candle i+1 is entry bar
    // Need i >= 5 so sma5[i] and sma5[i-1] are both valid (sma5 valid from index 4)
    // Need i+1 < totalBars so entry candle exists
    for (let i = 5; i < totalBars - 1; i++) {
      if (isNaN(sma5[i]) || isNaN(sma5[i - 1])) continue;

      const c = candles[i];
      const prev = candles[i - 1];
      const next = candles[i + 1];

      // Base conditions (Pine Script logic)
      const volUp = c.volume > prev.volume;
      const closeUp = c.close > prev.close;
      const aboveMA5 = c.close > sma5[i];
      const bigValue = c.close * c.volume > minValue;
      const jumpByClose = c.close >= prev.close * (1 + minJumpPct / 100);

      const baseCondition = volUp && closeUp && aboveMA5 && bigValue && jumpByClose;
      if (!baseCondition) continue;

      // V2.1: baru breakout dari bawah SMA5 (kemarin di bawah SMA5)
      const isV21 = prev.close < sma5[i - 1];
      // V2.2: sudah di atas SMA5 (kemarin sudah di atas SMA5)
      const isV22 = prev.close >= sma5[i - 1];

      if (!isV21 && !isV22) continue;

      // Entry on next candle (i+1)
      const iepGapPct = (next.open / c.close - 1) * 100;
      const isBuy = next.open >= c.close;
      const gapBucket = Math.floor(Math.max(iepGapPct, 0));

      let tradeResult: 'TP' | 'SL' | 'HOLD' | 'SKIP' = 'SKIP';
      let maxGainPct = 0;
      let finalReturn = 0;

      if (isBuy) {
        const entryPrice = next.open;

        // Dynamic TP based on gap size
        let tpDyn: number;
        if (iepGapPct <= 1.0) tpDyn = 3.0;
        else if (iepGapPct <= 2.0) tpDyn = 2.5;
        else tpDyn = 2.0;

        maxGainPct = (next.high / entryPrice - 1) * 100;
        const lowRetPct = (next.low / entryPrice - 1) * 100;

        if (maxGainPct >= tpDyn) {
          tradeResult = 'TP';
          finalReturn = tpDyn;
        } else if (lowRetPct < -hardSLPct) {
          tradeResult = 'SL';
          finalReturn = -hardSLPct;
        } else {
          tradeResult = 'HOLD';
          finalReturn = (next.close / entryPrice - 1) * 100;
        }
      }

      const signalDate = c.date;

      // Accumulate into correct version bucket
      if (isV21) {
        if (!bucketsV21.has(gapBucket)) bucketsV21.set(gapBucket, emptyAccum());
        updateAccum(bucketsV21.get(gapBucket)!, isBuy, iepGapPct, maxGainPct, finalReturn, tradeResult, signalDate);
        updateAccum(summaryV21, isBuy, iepGapPct, maxGainPct, finalReturn, tradeResult, signalDate);
      }

      if (isV22) {
        if (!bucketsV22.has(gapBucket)) bucketsV22.set(gapBucket, emptyAccum());
        updateAccum(bucketsV22.get(gapBucket)!, isBuy, iepGapPct, maxGainPct, finalReturn, tradeResult, signalDate);
        updateAccum(summaryV22, isBuy, iepGapPct, maxGainPct, finalReturn, tradeResult, signalDate);
      }
    }

    // Collect all unique bucket numbers
    const allBucketNums = new Set<number>([...bucketsV21.keys(), ...bucketsV22.keys()]);

    // Build buckets output sorted ascending by bucket number
    const buckets = [...allBucketNums].sort((a, b) => a - b).map(bucketNum => {
      const v21 = bucketsV21.get(bucketNum) || emptyAccum();
      const v22 = bucketsV22.get(bucketNum) || emptyAccum();

      // Combine both versions for "all" stats in this bucket
      const allAccum: BucketAccum = {
        signal: v21.signal + v22.signal,
        buy: v21.buy + v22.buy,
        skip: v21.skip + v22.skip,
        tp: v21.tp + v22.tp,
        sl: v21.sl + v22.sl,
        hold: v21.hold + v22.hold,
        sumGap: v21.sumGap + v22.sumGap,
        sumMaxGain: v21.sumMaxGain + v22.sumMaxGain,
        sumReturn: v21.sumReturn + v22.sumReturn,
        firstDate:
          v21.firstDate && v22.firstDate
            ? v21.firstDate < v22.firstDate ? v21.firstDate : v22.firstDate
            : v21.firstDate || v22.firstDate,
      };

      return {
        bucket: bucketNum,
        label: `${bucketNum}~${bucketNum + 1}`,
        firstDate: allAccum.firstDate,
        v21: calcStats(v21),
        v22: calcStats(v22),
        all: calcStats(allAccum),
      };
    });

    // Summary "all" = v21 + v22 combined
    const summaryAll: BucketAccum = {
      signal: summaryV21.signal + summaryV22.signal,
      buy: summaryV21.buy + summaryV22.buy,
      skip: summaryV21.skip + summaryV22.skip,
      tp: summaryV21.tp + summaryV22.tp,
      sl: summaryV21.sl + summaryV22.sl,
      hold: summaryV21.hold + summaryV22.hold,
      sumGap: summaryV21.sumGap + summaryV22.sumGap,
      sumMaxGain: summaryV21.sumMaxGain + summaryV22.sumMaxGain,
      sumReturn: summaryV21.sumReturn + summaryV22.sumReturn,
      firstDate: null,
    };

    // Best bucket: buyCount >= 2, highest winRate, tiebreak avgReturn
    // Check across all bucket × version combinations
    let bestBucket: {
      bucket: number;
      label: string;
      version: string;
      winRate: number;
      avgReturn: number;
    } | null = null;

    for (const b of buckets) {
      for (const version of ['v21', 'v22'] as const) {
        const stat = b[version];
        if (stat.buy >= 2 && stat.winRate !== null) {
          if (
            !bestBucket ||
            stat.winRate > bestBucket.winRate ||
            (stat.winRate === bestBucket.winRate && (stat.avgReturn ?? 0) > bestBucket.avgReturn)
          ) {
            bestBucket = {
              bucket: b.bucket,
              label: b.label,
              version,
              winRate: stat.winRate,
              avgReturn: stat.avgReturn ?? 0,
            };
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        ticker: upperTicker,
        totalBars,
        summary: {
          all: calcStats(summaryAll),
          v21: calcStats(summaryV21),
          v22: calcStats(summaryV22),
        },
        buckets,
        bestBucket,
        params: { minJumpPct, minValue, slPercent },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('IEP Backtest error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
