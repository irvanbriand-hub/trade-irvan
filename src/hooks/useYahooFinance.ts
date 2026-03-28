import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  marketCap: number;
}

export function useYahooFinance(tickers: string[], enabled = true) {
  return useQuery({
    queryKey: ["yahoo-finance", tickers.sort().join(",")],
    queryFn: async (): Promise<StockQuote[]> => {
      if (tickers.length === 0) return [];
      const { data, error } = await supabase.functions.invoke("yahoo-finance", {
        body: { tickers },
      });
      if (error) throw error;
      return data?.quotes || [];
    },
    enabled: enabled && tickers.length > 0,
    refetchInterval: 30000, // Refresh every 30s
    staleTime: 15000,
  });
}
