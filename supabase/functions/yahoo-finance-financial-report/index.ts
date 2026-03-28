import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  const initResp = await fetch('https://fc.yahoo.com/curltest', {
    headers: { 'User-Agent': userAgent },
    redirect: 'manual',
  });
  const setCookie = initResp.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0] || '';

  const crumbResp = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': userAgent, 'Cookie': cookie },
  });
  const crumb = await crumbResp.text();
  return { crumb, cookie };
}

const getRaw = (obj: any) => obj?.raw ?? null;

async function fetchQuoteSummary(symbol: string, crumb: string, cookie: string) {
  const modules = [
    'summaryProfile', 'price', 'defaultKeyStatistics', 'financialData',
    'summaryDetail', 'incomeStatementHistory', 'incomeStatementHistoryQuarterly',
    'balanceSheetHistory', 'balanceSheetHistoryQuarterly',
  ].join(',');

  // Try query2 first, then query1 as fallback
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(crumb)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': userAgent, 'Accept': 'application/json', 'Cookie': cookie },
    });
    if (resp.ok) {
      const data = await resp.json();
      const result = data.quoteSummary?.result?.[0];
      if (result) return result;
    }
  }

  // Fallback: try without crumb (some regions work)
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    const modules2 = ['price', 'summaryProfile', 'defaultKeyStatistics', 'financialData', 'summaryDetail'].join(',');
    const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules2}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
    });
    if (resp.ok) {
      const data = await resp.json();
      const result = data.quoteSummary?.result?.[0];
      if (result) return result;
    }
  }

  return null;
}

async function fetchChartFallback(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.chart?.result?.[0]?.meta || null;
}

const processStatement = (stmt: any, bs: any, sharesOutstanding: number | null) => {
  const totalRevenue = getRaw(stmt.totalRevenue);
  const grossProfit = getRaw(stmt.grossProfit);
  const operatingIncome = getRaw(stmt.operatingIncome);
  const netIncome = getRaw(stmt.netIncome);
  const ebitda = getRaw(stmt.ebitda);

  const eps = netIncome && sharesOutstanding ? netIncome / sharesOutstanding : null;

  const grossMargin = totalRevenue && grossProfit ? (grossProfit / totalRevenue) * 100 : null;
  const operatingMargin = totalRevenue && operatingIncome ? (operatingIncome / totalRevenue) * 100 : null;
  const netMargin = totalRevenue && netIncome ? (netIncome / totalRevenue) * 100 : null;

  const totalAssets = getRaw(bs?.totalAssets);
  const totalEquity = getRaw(bs?.totalStockholderEquity);
  const totalDebt = getRaw(bs?.longTermDebt) || getRaw(bs?.totalCurrentLiabilities);

  const roe = netIncome && totalEquity ? (netIncome / totalEquity) * 100 : null;
  const roa = netIncome && totalAssets ? (netIncome / totalAssets) * 100 : null;
  const dte = totalDebt && totalEquity ? totalDebt / totalEquity : null;

  return {
    endDate: stmt.endDate?.fmt || null,
    revenue: totalRevenue,
    ebitda,
    netProfit: netIncome,
    eps,
    grossMargin,
    operatingMargin,
    netMargin,
    roe,
    roa,
    debtToEquity: dte,
  };
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

    const { crumb, cookie } = await getCrumb();
    const result = await fetchQuoteSummary(symbol, crumb, cookie);

    if (!result) {
      // Last resort: chart fallback for basic price info
      const meta = await fetchChartFallback(symbol);
      if (meta) {
        return new Response(JSON.stringify({
          header: {
            name: meta.shortName || meta.longName || symbol.replace('.JK', ''),
            ticker: symbol,
            sector: null,
            industry: null,
            price: meta.regularMarketPrice || null,
            marketCap: null,
            currency: meta.currency || 'IDR',
          },
          quarterly: [],
          annual: [],
          lastReportDate: null,
          error: 'Data laporan keuangan tidak tersedia untuk emiten ini. Hanya data harga yang ditampilkan.',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Data tidak ditemukan untuk ${symbol}. Pastikan ticker valid.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profile = result.summaryProfile || {};
    const priceData = result.price || {};
    const keyStats = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    const summaryDetail = result.summaryDetail || {};

    const header = {
      name: priceData.longName || priceData.shortName || symbol.replace('.JK', ''),
      ticker: symbol,
      sector: profile.sector || null,
      industry: profile.industry || null,
      price: getRaw(priceData.regularMarketPrice) || getRaw(financial.currentPrice),
      marketCap: getRaw(priceData.marketCap) || getRaw(summaryDetail.marketCap),
      currency: priceData.currency || 'IDR',
    };

    const quarterlyStatements = result.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    const annualStatements = result.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterlyBS = result.balanceSheetHistoryQuarterly?.balanceSheetStatements || [];
    const annualBS = result.balanceSheetHistory?.balanceSheetStatements || [];

    const sharesOutstanding = getRaw(keyStats.sharesOutstanding);

    const quarterly = quarterlyStatements.map((stmt: any, i: number) =>
      processStatement(stmt, quarterlyBS[i], sharesOutstanding)
    );

    const annual = annualStatements.map((stmt: any, i: number) =>
      processStatement(stmt, annualBS[i], sharesOutstanding)
    );

    // Last report date = endDate of most recent quarterly statement
    const lastReportDate = quarterlyStatements[0]?.endDate?.fmt 
      || annualStatements[0]?.endDate?.fmt 
      || null;

    // Most recent filing date (when it was filed, if available)
    const mostRecentQuarter = keyStats.mostRecentQuarter?.fmt || null;
    const lastFiscalYearEnd = keyStats.lastFiscalYearEnd?.fmt || null;

    return new Response(JSON.stringify({ 
      header, 
      quarterly, 
      annual, 
      lastReportDate,
      mostRecentQuarter,
      lastFiscalYearEnd,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Yahoo Finance Financial Report error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
