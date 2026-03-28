import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, count = 200 } = await req.json();

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'ticker required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const upperTicker = ticker.toUpperCase();
    const symbol = upperTicker.startsWith('^') || upperTicker.endsWith('.JK') ? upperTicker : `${upperTicker}.JK`;

    const range = "2y";
    const interval = "1d";

    // Fetch OHLCV and sector info in parallel
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const quoteUrl = `https://query1.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbol)}`;

    const [chartResp, quoteResp] = await Promise.all([
      fetch(chartUrl, { headers }),
      fetch(quoteUrl, { headers }).catch(() => null),
    ]);

    // Process chart data
    let allCandles: any[] = [];
    let companyName = symbol;
    let currency = "IDR";
    let metaSymbol = symbol;

    if (chartResp.ok) {
      const chartData = await chartResp.json();
      const result = chartData.chart?.result?.[0];
      if (result) {
        const quote = result.indicators?.quote?.[0];
        const timestamps = result.timestamp || [];
        const opens = quote?.open || [];
        const highs = quote?.high || [];
        const lows = quote?.low || [];
        const closes = quote?.close || [];
        const volumes = quote?.volume || [];

        for (let i = 0; i < timestamps.length; i++) {
          if (opens[i] != null && highs[i] != null && lows[i] != null && closes[i] != null) {
            allCandles.push({
              time: timestamps[i],
              open: Math.round(opens[i]),
              high: Math.round(highs[i]),
              low: Math.round(lows[i]),
              close: Math.round(closes[i]),
              volume: volumes[i] ?? 0,
            });
          }
        }

        const meta = result.meta || {};
        companyName = meta.longName || meta.shortName || symbol;
        currency = meta.currency || "IDR";
        metaSymbol = meta.symbol || symbol;
      }
    }

    // Process sector info from quote endpoint
    let sector = null;
    let sectorChangePct = null;

    if (quoteResp && quoteResp.ok) {
      try {
        const quoteData = await quoteResp.json();
        const q = quoteData.quoteResponse?.result?.[0];
        if (q) {
          sector = q.sector || null;
          if (!companyName || companyName === symbol) {
            companyName = q.longName || q.shortName || companyName;
          }
        }
      } catch {}
    }

    // If we got a sector, try to fetch sector performance via a known IDX sector index
    if (sector) {
      const sectorIndexMap: Record<string, string> = {
        'Financial Services': '^JKFINA',
        'Financials': '^JKFINA',
        'Finance': '^JKFINA',
        'Basic Materials': '^JKBIND',
        'Industrials': '^JKMISC',
        'Consumer Cyclical': '^JKTRAD',
        'Consumer Defensive': '^JKTRAD',
        'Technology': '^JKINFR',
        'Communication Services': '^JKINFR',
        'Energy': '^JKMING',
        'Healthcare': '^JKTRAD',
        'Real Estate': '^JKPROP',
        'Utilities': '^JKINFR',
      };

      const sectorIndex = sectorIndexMap[sector];
      if (sectorIndex) {
        try {
          const sectorUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sectorIndex)}?range=2d&interval=1d`;
          const sectorResp = await fetch(sectorUrl, { headers });
          if (sectorResp.ok) {
            const sectorData = await sectorResp.json();
            const sr = sectorData.chart?.result?.[0];
            if (sr) {
              const prevClose = sr.meta?.chartPreviousClose || sr.meta?.previousClose;
              const curPrice = sr.meta?.regularMarketPrice;
              if (prevClose && curPrice) {
                sectorChangePct = ((curPrice - prevClose) / prevClose) * 100;
              }
            }
          }
        } catch {}
      }
    }

    return new Response(JSON.stringify({ 
      candles: allCandles, 
      symbol: metaSymbol,
      companyName,
      currency,
      sector,
      sectorChangePct,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Yahoo Finance OHLCV error:', error);
    return new Response(JSON.stringify({ error: error.message, candles: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
