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
    const { ticker } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: 'ticker required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const symbol = ticker.toUpperCase().endsWith('.JK') ? ticker.toUpperCase() : `${ticker.toUpperCase()}.JK`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    // Use quoteSummary for fundamental data
    const modules = 'summaryProfile,defaultKeyStatistics,financialData,price,summaryDetail,earningsQuoteSummary';
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
    const resp = await fetch(url, { headers });

    if (!resp.ok) {
      // Fallback: try v8 chart for basic info
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
      const chartResp = await fetch(chartUrl, { headers });
      if (chartResp.ok) {
        const chartData = await chartResp.json();
        const meta = chartData.chart?.result?.[0]?.meta;
        return new Response(JSON.stringify({
          name: meta?.shortName || meta?.longName || symbol.replace('.JK', ''),
          sector: null,
          industry: null,
          marketCap: null,
          per: null,
          pbv: null,
          eps: null,
          roe: null,
          revenue: null,
          netProfit: null,
          dividendYield: null,
          fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh || null,
          fiftyTwoWeekLow: meta?.fiftyTwoWeekLow || null,
          price: meta?.regularMarketPrice || null,
          error: 'Limited data available (fundamental modules unavailable)',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: `Yahoo API error: ${resp.status}` }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resp.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) {
      return new Response(JSON.stringify({ error: 'No data found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profile = result.summaryProfile || {};
    const keyStats = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    const priceData = result.price || {};
    const summaryDetail = result.summaryDetail || {};

    const getRaw = (obj: any) => obj?.raw ?? obj?.fmt ?? null;

    const fundamental = {
      name: priceData.longName || priceData.shortName || symbol.replace('.JK', ''),
      sector: profile.sector || null,
      industry: profile.industry || null,
      marketCap: getRaw(priceData.marketCap) || getRaw(summaryDetail.marketCap),
      per: getRaw(summaryDetail.trailingPE) || getRaw(keyStats.trailingPE),
      pbv: getRaw(keyStats.priceToBook),
      eps: getRaw(keyStats.trailingEps) || getRaw(financial.earningsPerShare),
      roe: getRaw(financial.returnOnEquity),
      revenue: getRaw(financial.totalRevenue),
      netProfit: getRaw(financial.netIncomeToCommon) || getRaw(keyStats.netIncomeToCommon),
      dividendYield: getRaw(summaryDetail.dividendYield) || getRaw(summaryDetail.trailingAnnualDividendYield),
      fiftyTwoWeekHigh: getRaw(summaryDetail.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: getRaw(summaryDetail.fiftyTwoWeekLow),
      price: getRaw(priceData.regularMarketPrice) || getRaw(financial.currentPrice),
    };

    return new Response(JSON.stringify(fundamental), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Yahoo Finance Fundamental error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
