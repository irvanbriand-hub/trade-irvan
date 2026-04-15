const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/yahoo-finance-iep-backtest`;

// ========== INTERFACES ==========

export interface IepBucketStat {
  signal: number;
  buy: number;
  skip: number;
  tp: number;
  sl: number;
  hold: number;
  winRate: number | null;
  avgGap: number | null;
  avgMaxGain: number | null;
  avgReturn: number | null;
}

export interface IepSummary {
  all: IepBucketStat;
  v21: IepBucketStat;
  v22: IepBucketStat;
}

export interface IepBucket {
  bucket: number;
  label: string;
  firstDate: string | null;
  v21: IepBucketStat;
  v22: IepBucketStat;
  all: IepBucketStat;
}

export interface IepBestBucket {
  bucket: number;
  label: string;
  version: string;
  winRate: number;
  avgReturn: number;
}

export interface IepBacktestResult {
  ticker: string;
  totalBars: number;
  summary: IepSummary;
  buckets: IepBucket[];
  bestBucket: IepBestBucket | null;
  params: {
    minJumpPct: number;
    minValue: number;
    slPercent: number;
  };
}

export interface IepBacktestParams {
  minJumpPct?: number;
  minValue?: number;
  slPercent?: number;
}

// ========== DEFAULT PARAMS ==========

const DEFAULT_PARAMS: Required<IepBacktestParams> = {
  minJumpPct: 5,
  minValue: 5_000_000_000,
  slPercent: 5,
};

// ========== MODULE-LEVEL CACHE ==========

const iepCache = new Map<string, IepBacktestResult>();
const iepCacheDate = new Map<string, string>(); // key → "YYYY-MM-DD"

function cacheKey(ticker: string, params: Required<IepBacktestParams>): string {
  return `${ticker}|${params.minJumpPct}|${params.minValue}|${params.slPercent}`;
}

// ========== MAIN FUNCTION ==========

export async function runIepBacktest(
  ticker: string,
  params?: IepBacktestParams
): Promise<IepBacktestResult> {
  const resolvedParams: Required<IepBacktestParams> = {
    ...DEFAULT_PARAMS,
    ...params,
  };

  const key = cacheKey(ticker.toUpperCase(), resolvedParams);
  const today = new Date().toISOString().slice(0, 10);

  // Return from cache only if fetched today
  const cached = iepCache.get(key);
  const cachedDate = iepCacheDate.get(key);
  if (cached && cachedDate === today) return cached;

  const resp = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      ticker: ticker.toUpperCase(),
      params: resolvedParams,
    }),
  });

  if (!resp.ok) {
    let errMsg = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.error) errMsg = body.error;
    } catch { /* ignore */ }
    console.error(`[IEP hook] fetch error for ${ticker}: ${errMsg}`);
    throw new Error(errMsg);
  }

  const data = await resp.json();

  if (data?.error) {
    console.error(`[IEP hook] data error for ${ticker}:`, data.error);
    throw new Error(data.error);
  }

  console.log(`[IEP hook] ${ticker} → signals=${data?.summary?.all?.signal ?? "?"} bars=${data?.totalBars ?? "?"}`);
  const result = data as IepBacktestResult;
  iepCache.set(key, result);
  iepCacheDate.set(key, today);

  return result;
}

// Clear cache for a specific ticker (or all if no ticker given)
export function clearIepCache(ticker?: string) {
  if (!ticker) {
    iepCache.clear();
    iepCacheDate.clear();
    return;
  }
  const upper = ticker.toUpperCase();
  for (const key of iepCache.keys()) {
    if (key.startsWith(upper + "|")) {
      iepCache.delete(key);
      iepCacheDate.delete(key);
    }
  }
}
