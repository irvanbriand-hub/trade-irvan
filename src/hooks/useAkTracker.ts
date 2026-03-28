import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";

export interface AkBrokerRow {
  id: string;
  user_id: string;
  tanggal: string;
  ticker: string;
  broker_code: string;
  buy_value: number | null;
  buy_lot: number | null;
  buy_avg: number | null;
  sell_value: number | null;
  sell_lot: number | null;
  sell_avg: number | null;
  net_value: number;
  created_at: string;
}

export interface AkScoreRow {
  id: string;
  user_id: string;
  tanggal: string;
  ticker: string;
  broker_code: string;
  score_total: number;
  tag: string;
  tag_vs_saham: string;
  tag_vs_ak: string;
  streak_beli: number;
  streak_jual: number;
  is_reversal_buy: boolean;
  is_reversal_sell: boolean;
  cumulative_net_5d: number;
  cumulative_net_10d: number;
  cumulative_net_20d: number;
  avg_buy_rolling: number;
  buy_vs_avg_ratio: number;
  created_at: string;
}

export interface ParsedAkRow {
  ticker: string;
  buy_value: number | null;
  buy_lot: number | null;
  buy_avg: number | null;
  sell_value: number | null;
  sell_lot: number | null;
  sell_avg: number | null;
  net_value: number;
  side: "BUY" | "SELL" | "BOTH";
}

function parseAkValue(raw: string): number | null {
  if (!raw || raw.trim() === "-" || raw.trim() === "") return null;
  const s = raw.trim().replace(/,/g, "");
  const mLotMatch = s.match(/^([\d.]+)\s*M$/i);
  if (mLotMatch) return parseFloat(mLotMatch[1]) * 1_000_000;
  const suffixMatch = s.match(/^([\d.]+)\s*(B|M|K)$/i);
  if (suffixMatch) {
    const num = parseFloat(suffixMatch[1]);
    const suffix = suffixMatch[2].toUpperCase();
    if (suffix === "B") return num * 1_000_000_000;
    if (suffix === "M") return num * 1_000_000;
    if (suffix === "K") return num * 1_000;
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseAkBrokerInput(text: string): ParsedAkRow[] {
  const lines = text.trim().split("\n").filter(l => l.trim());
  const tickerMap = new Map<string, ParsedAkRow>();

  for (const line of lines) {
    if (/^(BUY|SELL|B\.VALUE|S\.VALUE|BROKER|NO\.|#)/i.test(line.trim())) continue;
    if (/^\s*$/.test(line)) continue;

    const parts = line.split("\t").map(p => p.trim());
    
    if (parts.length >= 8) {
      const buyTicker = parts[0].replace(/[^A-Z0-9\-]/g, "").toUpperCase();
      const sellTicker = parts[4].replace(/[^A-Z0-9\-]/g, "").toUpperCase();
      
      if (buyTicker && buyTicker.length >= 3) {
        const existing = tickerMap.get(buyTicker);
        const buyVal = parseAkValue(parts[1]);
        const buyLot = parseAkValue(parts[2]);
        const buyAvg = parseAkValue(parts[3]);
        if (existing) {
          existing.buy_value = buyVal;
          existing.buy_lot = buyLot;
          existing.buy_avg = buyAvg;
          existing.net_value = (existing.buy_value ?? 0) - (existing.sell_value ?? 0);
          existing.side = existing.sell_value ? "BOTH" : "BUY";
        } else {
          tickerMap.set(buyTicker, {
            ticker: buyTicker, buy_value: buyVal, buy_lot: buyLot, buy_avg: buyAvg,
            sell_value: null, sell_lot: null, sell_avg: null,
            net_value: buyVal ?? 0, side: "BUY"
          });
        }
      }
      
      if (sellTicker && sellTicker.length >= 3) {
        const existing = tickerMap.get(sellTicker);
        const sellVal = parseAkValue(parts[5]);
        const sellLot = parseAkValue(parts[6]);
        const sellAvg = parseAkValue(parts[7]);
        if (existing) {
          existing.sell_value = sellVal;
          existing.sell_lot = sellLot;
          existing.sell_avg = sellAvg;
          existing.net_value = (existing.buy_value ?? 0) - (existing.sell_value ?? 0);
          existing.side = existing.buy_value ? "BOTH" : "SELL";
        } else {
          tickerMap.set(sellTicker, {
            ticker: sellTicker, buy_value: null, buy_lot: null, buy_avg: null,
            sell_value: sellVal, sell_lot: sellLot, sell_avg: sellAvg,
            net_value: -(sellVal ?? 0), side: "SELL"
          });
        }
      }
    } else if (parts.length >= 4) {
      const ticker = parts[0].replace(/[^A-Z0-9\-]/g, "").toUpperCase();
      if (!ticker || ticker.length < 3) continue;
      const val = parseAkValue(parts[1]);
      const lot = parseAkValue(parts[2]);
      const avg = parseAkValue(parts[3]);
      
      const existing = tickerMap.get(ticker);
      if (existing) {
        if (existing.buy_value != null) {
          existing.sell_value = val;
          existing.sell_lot = lot;
          existing.sell_avg = avg;
          existing.side = "BOTH";
        } else {
          existing.buy_value = val;
          existing.buy_lot = lot;
          existing.buy_avg = avg;
          existing.side = existing.sell_value ? "BOTH" : "BUY";
        }
        existing.net_value = (existing.buy_value ?? 0) - (existing.sell_value ?? 0);
      } else {
        tickerMap.set(ticker, {
          ticker, buy_value: val, buy_lot: lot, buy_avg: avg,
          sell_value: null, sell_lot: null, sell_avg: null,
          net_value: val ?? 0, side: "BUY"
        });
      }
    }
  }

  return [...tickerMap.values()];
}

export function useAkTracker(brokerCode?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: brokerData = [], isLoading: loadingData } = useQuery({
    queryKey: ["ak_broker_data", user?.id],
    queryFn: async () => {
      const allRows: AkBrokerRow[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("ak_broker_data")
          .select("*")
          .order("tanggal", { ascending: false })
          .order("net_value", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...(data as unknown as AkBrokerRow[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allRows;
    },
    enabled: !!user,
  });

  const { data: scores = [], isLoading: loadingScores } = useQuery({
    queryKey: ["ak_broker_scores", user?.id],
    queryFn: async () => {
      const allRows: AkScoreRow[] = [];
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("ak_broker_scores")
          .select("*")
          .order("tanggal", { ascending: false })
          .order("score_total", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...(data as unknown as AkScoreRow[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allRows;
    },
    enabled: !!user,
  });

  // Filter by broker_code if specified
  const filteredBrokerData = brokerCode
    ? brokerData.filter(d => d.broker_code === brokerCode)
    : brokerData;

  const filteredScores = brokerCode
    ? scores.filter(s => s.broker_code === brokerCode)
    : scores;

  const saveData = async (tanggal: string, parsed: ParsedAkRow[], broker_code: string = "AK") => {
    if (!user) return;
    const rows = parsed.map(p => ({
      user_id: user.id,
      tanggal,
      ticker: p.ticker,
      broker_code,
      buy_value: p.buy_value,
      buy_lot: p.buy_lot,
      buy_avg: p.buy_avg,
      sell_value: p.sell_value,
      sell_lot: p.sell_lot,
      sell_avg: p.sell_avg,
      net_value: p.net_value,
    }));

    const { error } = await supabase.from("ak_broker_data").upsert(rows as any, {
      onConflict: "user_id,broker_code,tanggal,ticker",
    });
    if (error) throw error;

    queryClient.invalidateQueries({ queryKey: ["ak_broker_data"] });
    toast({ title: "Data tersimpan", description: `${rows.length} saham [${broker_code}] disimpan untuk ${tanggal}` });
  };

  const deleteByDate = async (tanggal: string, broker_code?: string) => {
    if (!user) return;
    let q = supabase.from("ak_broker_data").delete().eq("tanggal", tanggal).eq("user_id", user.id);
    if (broker_code) q = q.eq("broker_code", broker_code);
    const { error } = await q;
    if (error) throw error;
    let sq = supabase.from("ak_broker_scores").delete().eq("tanggal", tanggal).eq("user_id", user.id);
    if (broker_code) sq = sq.eq("broker_code", broker_code);
    await sq;
    queryClient.invalidateQueries({ queryKey: ["ak_broker_data"] });
    queryClient.invalidateQueries({ queryKey: ["ak_broker_scores"] });
  };

  const calculateScores = async (tanggal: string, rollingWindow: number = 10, broker_code?: string) => {
    if (!user) return;
    
    const relevantData = broker_code
      ? brokerData.filter(d => d.broker_code === broker_code)
      : brokerData;
    
    const dataForDate = relevantData.filter(d => d.tanggal === tanggal);
    if (dataForDate.length === 0) return;

    // Delete existing scores for date + broker
    let delQ = supabase.from("ak_broker_scores").delete().eq("tanggal", tanggal).eq("user_id", user.id);
    if (broker_code) delQ = delQ.eq("broker_code", broker_code);
    await delQ;

    // Fetch market value for all tickers via Yahoo Finance OHLCV
    const tickerMarketValues = new Map<string, { totalValue: number; source: string }>();
    const uniqueTickers = [...new Set(dataForDate.map(d => d.ticker))];
    
    for (const ticker of uniqueTickers) {
      try {
        const { data: ohlcvData } = await supabase.functions.invoke("yahoo-finance-ohlcv", {
          body: { ticker, count: 30 },
        });
        if (ohlcvData?.candles && ohlcvData.candles.length > 0) {
          const matchCandle = ohlcvData.candles.find((c: any) => {
            const cDate = new Date(c.time * 1000).toISOString().split("T")[0];
            return cDate === tanggal;
          });
          if (matchCandle) {
            tickerMarketValues.set(ticker, {
              totalValue: matchCandle.close * matchCandle.volume,
              source: "SAME_DAY",
            });
          } else {
            const recent = ohlcvData.candles.slice(-20);
            const avgVal = recent.reduce((s: number, c: any) => s + c.close * c.volume, 0) / recent.length;
            tickerMarketValues.set(ticker, { totalValue: avgVal, source: "AVG_20D" });
          }
        }
      } catch {}
    }

    const scoreRows: any[] = [];
    
    for (const row of dataForDate) {
      const tickerHistory = relevantData
        .filter(d => d.ticker === row.ticker && d.tanggal < tanggal)
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

      const recentBuys = tickerHistory
        .filter(h => (h.buy_value ?? 0) > 0)
        .slice(0, rollingWindow);
      
      const avgBuyRolling = recentBuys.length > 0
        ? recentBuys.reduce((s, h) => s + (h.buy_value ?? 0), 0) / recentBuys.length
        : 0;
      
      const buyVsAvgRatio = avgBuyRolling > 0 ? (row.buy_value ?? 0) / avgBuyRolling : 0;

      let tagVsAk = "NORMAL";
      if (buyVsAvgRatio > 3) tagVsAk = "HYPERACCUM";
      else if (buyVsAvgRatio >= 1.5) tagVsAk = "ACCELERATION";

      let tagVsSaham = "NORMAL";
      let totalValueSaham = 0;
      let pctOfMarket = 0;
      let valueSource = "FALLBACK_HARDCODED";

      const marketData = tickerMarketValues.get(row.ticker);
      if (marketData && marketData.totalValue > 0) {
        totalValueSaham = marketData.totalValue;
        valueSource = marketData.source;
        pctOfMarket = ((row.buy_value ?? 0) / totalValueSaham) * 100;
        if (pctOfMarket >= 5) tagVsSaham = "WHALE";
        else if (pctOfMarket >= 1) tagVsSaham = "BIG_ACCUM";
      } else {
        if ((row.buy_value ?? 0) > 100_000_000_000) tagVsSaham = "WHALE";
        else if ((row.buy_value ?? 0) > 20_000_000_000) tagVsSaham = "BIG_ACCUM";
      }

      let streakBeli = 0;
      let streakJual = 0;
      if (row.net_value > 0) {
        streakBeli = 1;
        for (const h of tickerHistory) {
          if (h.net_value > 0) streakBeli++;
          else break;
        }
      } else if (row.net_value < 0) {
        streakJual = 1;
        for (const h of tickerHistory) {
          if (h.net_value < 0) streakJual++;
          else break;
        }
      }

      const prevNet = tickerHistory.length > 0 ? tickerHistory[0].net_value : 0;
      const isReversalBuy = prevNet < 0 && row.net_value > 0;
      const isReversalSell = prevNet > 0 && row.net_value < 0;

      const cum5 = tickerHistory.slice(0, 4).reduce((s, h) => s + h.net_value, 0) + row.net_value;
      const cum10 = tickerHistory.slice(0, 9).reduce((s, h) => s + h.net_value, 0) + row.net_value;
      const cum20 = tickerHistory.slice(0, 19).reduce((s, h) => s + h.net_value, 0) + row.net_value;

      let score = 0;
      if (row.net_value > 0) score += 20;
      if (tagVsAk === "ACCELERATION") score += 15;
      if (tagVsAk === "HYPERACCUM") score += 25;
      if (tagVsSaham === "BIG_ACCUM") score += 10;
      if (tagVsSaham === "WHALE") score += 20;
      if (streakBeli >= 5) score += 20;
      else if (streakBeli >= 3) score += 15;
      else if (streakBeli >= 2) score += 10;
      if (isReversalBuy) score += 15;
      if (row.net_value < 0) score -= 20;
      if (row.net_value < 0 && buyVsAvgRatio >= 1.5) score -= 15;
      if (streakJual >= 2) score -= 10;
      score = Math.max(0, Math.min(100, score));

      let tag = "NORMAL";
      if (tagVsSaham === "WHALE" || score >= 80) tag = "WHALE";
      else if (tagVsSaham === "BIG_ACCUM" || score >= 50) tag = "BIG_ACCUM";

      scoreRows.push({
        user_id: user.id,
        tanggal,
        ticker: row.ticker,
        broker_code: row.broker_code || "AK",
        score_total: score,
        tag,
        tag_vs_saham: tagVsSaham,
        tag_vs_ak: tagVsAk,
        streak_beli: streakBeli,
        streak_jual: streakJual,
        is_reversal_buy: isReversalBuy,
        is_reversal_sell: isReversalSell,
        cumulative_net_5d: cum5,
        cumulative_net_10d: cum10,
        cumulative_net_20d: cum20,
        avg_buy_rolling: avgBuyRolling,
        buy_vs_avg_ratio: buyVsAvgRatio,
        total_value_saham: totalValueSaham,
        pct_of_market: pctOfMarket,
        value_source: valueSource,
      });
    }

    if (scoreRows.length > 0) {
      const { error } = await supabase.from("ak_broker_scores").upsert(scoreRows as any, {
        onConflict: "user_id,broker_code,tanggal,ticker",
      });
      if (error) throw error;
    }

    queryClient.invalidateQueries({ queryKey: ["ak_broker_scores"] });
    toast({ title: "Score dihitung", description: `${scoreRows.length} skor untuk ${tanggal}` });
  };

  const getExistingDates = (bc?: string) => {
    const data = bc ? brokerData.filter(d => d.broker_code === bc) : brokerData;
    return new Set(data.map(d => d.tanggal));
  };
  
  const getDataForDate = (tanggal: string, bc?: string) => {
    let data = brokerData.filter(d => d.tanggal === tanggal);
    if (bc) data = data.filter(d => d.broker_code === bc);
    return data;
  };
  
  const getScoresForDate = (tanggal: string, bc?: string) => {
    let data = scores.filter(s => s.tanggal === tanggal);
    if (bc) data = data.filter(s => s.broker_code === bc);
    return data;
  };

  const getTickerHistory = (ticker: string, bc?: string) => {
    let data = brokerData.filter(d => d.ticker === ticker);
    if (bc) data = data.filter(d => d.broker_code === bc);
    return data.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  };

  const getTickerScoreHistory = (ticker: string, bc?: string) => {
    let data = scores.filter(s => s.ticker === ticker);
    if (bc) data = data.filter(s => s.broker_code === bc);
    return data.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  };

  return {
    brokerData: filteredBrokerData,
    allBrokerData: brokerData,
    scores: filteredScores,
    allScores: scores,
    isLoading: loadingData || loadingScores,
    saveData,
    deleteByDate,
    calculateScores,
    getExistingDates,
    getDataForDate,
    getScoresForDate,
    getTickerHistory,
    getTickerScoreHistory,
  };
}
