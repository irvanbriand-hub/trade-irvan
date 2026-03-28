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
    const { ticker, range = "1y", interval = "1d" } = await req.json();

    if (!ticker) {
      return new Response(JSON.stringify({ error: 'ticker required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const upperTicker = ticker.toUpperCase();
    // Don't append .JK for index tickers (e.g. ^JKSE)
    const symbol = upperTicker.startsWith('^') || upperTicker.endsWith('.JK') ? upperTicker : `${upperTicker}.JK`;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `Yahoo API error: ${resp.status}`, closes: [], volumes: [], timestamps: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chartData = await resp.json();
    const result = chartData.chart?.result?.[0];

    if (!result) {
      return new Response(JSON.stringify({ closes: [], volumes: [], timestamps: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawCloses = result.indicators?.quote?.[0]?.close || [];
    const rawVolumes = result.indicators?.quote?.[0]?.volume || [];
    const rawTimestamps = result.timestamp || [];

    // Filter out null entries, keeping aligned indices
    const closes: number[] = [];
    const volumes: number[] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < rawCloses.length; i++) {
      if (rawCloses[i] != null) {
        closes.push(rawCloses[i]);
        volumes.push(rawVolumes[i] ?? 0);
        if (rawTimestamps[i] != null) {
          timestamps.push(rawTimestamps[i]);
        }
      }
    }

    // Calculate MA50 and MA200
    const ma50 = closes.length >= 50
      ? closes.slice(-50).reduce((s: number, v: number) => s + v, 0) / 50
      : null;
    const ma200 = closes.length >= 200
      ? closes.slice(-200).reduce((s: number, v: number) => s + v, 0) / 200
      : null;

    return new Response(JSON.stringify({ closes, volumes, timestamps, ma50, ma200 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Yahoo Finance History error:', error);
    return new Response(JSON.stringify({ error: error.message, closes: [], volumes: [], timestamps: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
