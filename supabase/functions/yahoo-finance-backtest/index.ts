import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/** Get current WIB time */
function getWIBNow(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 7 * 3600000);
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Find next trading day from timestamps array */
function findNextTradingDayFromTimestamps(
  signalDateStr: string,
  timestamps: number[]
): { nextTradingDay: string | null; nextIdx: number } {
  const signalTs = Math.floor(new Date(signalDateStr + 'T00:00:00Z').getTime() / 1000);
  
  // Find the signal day index
  let signalIdx = -1;
  for (let j = 0; j < timestamps.length; j++) {
    const d = new Date(timestamps[j] * 1000);
    const ds = d.toISOString().slice(0, 10);
    if (ds === signalDateStr) {
      signalIdx = j;
      break;
    }
    // Also match by closest
    if (Math.abs(timestamps[j] - signalTs) < 86400) {
      signalIdx = j;
    }
  }

  if (signalIdx === -1) {
    // Find closest
    let bestIdx = 0;
    let bestDiff = Math.abs(timestamps[0] - signalTs);
    for (let j = 1; j < timestamps.length; j++) {
      const diff = Math.abs(timestamps[j] - signalTs);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = j; }
    }
    signalIdx = bestIdx;
  }

  // Next trading day = next candle in the array
  const nextIdx = signalIdx + 1;
  if (nextIdx >= timestamps.length) {
    return { nextTradingDay: null, nextIdx: -1 };
  }

  const nextD = new Date(timestamps[nextIdx] * 1000);
  return { nextTradingDay: nextD.toISOString().slice(0, 10), nextIdx };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers, backtestDate, importDates } = await req.json();

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0 || !backtestDate) {
      return new Response(JSON.stringify({ error: 'tickers (array), backtestDate (YYYY-MM-DD), and importDates (Record<ticker, date>) required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    const nowWIB = getWIBNow();
    const todayStr = formatDateStr(nowWIB);
    const currentHour = nowWIB.getHours();

    const results: Record<string, {
      close_import: number | null;
      high: number | null;
      status: string;
      message: string;
      next_trading_day: string | null;
      error?: string;
    }> = {};

    const BATCH = 5;
    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH);
      const promises = batch.map(async (ticker: string) => {
        const symbol = ticker.toUpperCase().endsWith('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
        const importDate = importDates?.[ticker] || backtestDate;

        try {
          const importTs = Math.floor(new Date(importDate + 'T00:00:00Z').getTime() / 1000);
          const backtestTs = Math.floor(new Date(backtestDate + 'T00:00:00Z').getTime() / 1000);
          const period1 = Math.min(importTs, backtestTs) - 86400 * 3;
          const period2 = Math.max(importTs, backtestTs) + 86400 * 5;

          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`;
          const resp = await fetch(url, { headers });

          if (!resp.ok) {
            results[ticker] = { close_import: null, high: null, status: 'ERROR', message: `HTTP ${resp.status}`, next_trading_day: null, error: `HTTP ${resp.status}` };
            return;
          }

          const data = await resp.json();
          const result = data.chart?.result?.[0];

          if (!result || !result.timestamp || result.timestamp.length === 0) {
            results[ticker] = { close_import: null, high: null, status: 'ERROR', message: 'No data', next_trading_day: null, error: 'No data' };
            return;
          }

          const timestamps = result.timestamp;
          const closes = result.indicators?.quote?.[0]?.close || [];
          const highs = result.indicators?.quote?.[0]?.high || [];

          // Get close on import date (closest trading day)
          const findClosestIdx = (targetDateStr: string) => {
            const targetTs = Math.floor(new Date(targetDateStr + 'T00:00:00Z').getTime() / 1000);
            let bestIdx = 0;
            let bestDiff = Math.abs(timestamps[0] - targetTs);
            for (let j = 1; j < timestamps.length; j++) {
              const diff = Math.abs(timestamps[j] - targetTs);
              if (diff < bestDiff) { bestDiff = diff; bestIdx = j; }
            }
            return bestIdx;
          };

          const importIdx = findClosestIdx(importDate);
          const closeImport = closes[importIdx];

          // Find the NEXT trading day after the import date
          const { nextTradingDay, nextIdx } = findNextTradingDayFromTimestamps(importDate, timestamps);

          if (!nextTradingDay) {
            results[ticker] = {
              close_import: closeImport,
              high: null,
              status: 'PENDING',
              message: 'Menunggu hari bursa berikutnya',
              next_trading_day: null,
            };
            return;
          }

          // Check timing
          if (nextTradingDay > todayStr) {
            results[ticker] = {
              close_import: closeImport,
              high: null,
              status: 'PENDING',
              message: `Menunggu data ${nextTradingDay}`,
              next_trading_day: nextTradingDay,
            };
            return;
          }

          if (nextTradingDay === todayStr && currentHour < 16) {
            results[ticker] = {
              close_import: closeImport,
              high: null,
              status: 'MARKET_OPEN',
              message: 'Market sedang berjalan — update setelah jam 16:00 WIB',
              next_trading_day: nextTradingDay,
            };
            return;
          }

          // Data is available — use the high from next trading day
          const highNextDay = nextIdx >= 0 && nextIdx < highs.length ? highs[nextIdx] : null;

          if (closeImport != null && highNextDay != null) {
            const isWin = highNextDay >= closeImport * 1.02;
            results[ticker] = {
              close_import: closeImport,
              high: highNextDay,
              status: isWin ? 'WIN' : 'LOSE',
              message: isWin ? 'WIN' : 'LOSE',
              next_trading_day: nextTradingDay,
            };
          } else {
            results[ticker] = {
              close_import: closeImport,
              high: highNextDay,
              status: 'ERROR',
              message: 'Missing data',
              next_trading_day: nextTradingDay,
              error: 'Missing data',
            };
          }
        } catch (e) {
          results[ticker] = { close_import: null, high: null, status: 'ERROR', message: e.message, next_trading_day: null, error: e.message };
        }
      });

      await Promise.all(promises);

      if (i + BATCH < tickers.length) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Backtest error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
