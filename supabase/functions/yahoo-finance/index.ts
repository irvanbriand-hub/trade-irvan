import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers } = await req.json();
    
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(JSON.stringify({ error: 'tickers array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const symbols = tickers.map((t: string) => {
      const upper = t.toUpperCase().trim();
      return upper.endsWith('.JK') ? upper : `${upper}.JK`;
    });

    const symbolsParam = symbols.join(',');
    
    // Use Yahoo Finance v8 API
    const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbolsParam)}&range=1d&interval=1d`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    // Try spark API first for basic quote data
    const sparkResponse = await fetch(url, { headers });
    
    if (sparkResponse.ok) {
      const sparkData = await sparkResponse.json();
      const quotes = [];
      
      for (const symbol of symbols) {
        const sparkResult = sparkData.spark?.result?.find((r: any) => r.symbol === symbol);
        if (sparkResult) {
          const meta = sparkResult.response?.[0]?.meta;
          if (meta) {
            quotes.push({
              symbol: symbol.replace('.JK', ''),
              name: meta.shortName || meta.symbol || symbol.replace('.JK', ''),
              price: meta.regularMarketPrice || 0,
              change: (meta.regularMarketPrice || 0) - (meta.previousClose || 0),
              changePercent: meta.previousClose ? (((meta.regularMarketPrice || 0) - meta.previousClose) / meta.previousClose) * 100 : 0,
              previousClose: meta.previousClose || 0,
              open: meta.regularMarketPrice || 0,
              high: meta.regularMarketPrice || 0,
              low: meta.regularMarketPrice || 0,
              volume: meta.regularMarketVolume || 0,
              marketCap: 0,
            });
          }
        }
      }
      
      if (quotes.length > 0) {
        return new Response(JSON.stringify({ quotes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Fallback: try individual chart API for each ticker
    const quotes = [];
    for (const symbol of symbols) {
      try {
        const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
        const chartResp = await fetch(chartUrl, { headers });
        
        if (chartResp.ok) {
          const chartData = await chartResp.json();
          const meta = chartData.chart?.result?.[0]?.meta;
          if (meta) {
            const price = meta.regularMarketPrice || 0;
            const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
            quotes.push({
              symbol: symbol.replace('.JK', ''),
              name: meta.shortName || meta.longName || symbol.replace('.JK', ''),
              price,
              change: price - prevClose,
              changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
              previousClose: prevClose,
              open: meta.regularMarketOpen || price,
              high: meta.regularMarketDayHigh || price,
              low: meta.regularMarketDayLow || price,
              volume: meta.regularMarketVolume || 0,
              marketCap: meta.marketCap || 0,
            });
          }
        }
      } catch (e) {
        console.error(`Error fetching ${symbol}:`, e);
      }
    }

    return new Response(JSON.stringify({ quotes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Yahoo Finance error:', error);
    return new Response(JSON.stringify({ error: error.message, quotes: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
