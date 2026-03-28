import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export interface IHSGDayData {
  close: number;
  changePct: number;
}

export function useIHSG(currentMonth: Date) {
  const monthKey = format(currentMonth, "yyyy-MM");

  return useQuery({
    queryKey: ["ihsg", monthKey],
    queryFn: async (): Promise<Map<string, IHSGDayData>> => {
      // Fetch ~6 months of data to ensure we have previous day close for % change
      const { data, error } = await supabase.functions.invoke("yahoo-finance-history", {
        body: { ticker: "^JKSE", range: "6mo", interval: "1d" },
      });

      if (error) throw error;

      const closes: number[] = data?.closes || [];
      const timestamps: number[] = data?.timestamps || [];

      const map = new Map<string, IHSGDayData>();

      for (let i = 0; i < closes.length; i++) {
        const ts = timestamps[i];
        if (!ts) continue;
        // Yahoo timestamps are in seconds (UTC)
        // Use UTC+7 (WIB) to match Indonesian trading dates
        const d = new Date(ts * 1000 + 7 * 3600 * 1000);
        const dateStr = d.toISOString().slice(0, 10);
        const prevClose = i > 0 ? closes[i - 1] : closes[i];
        const changePct = prevClose > 0 ? ((closes[i] - prevClose) / prevClose) * 100 : 0;

        map.set(dateStr, {
          close: Math.round(closes[i] * 100) / 100,
          changePct: Math.round(changePct * 100) / 100,
        });
      }

      return map;
    },
    staleTime: 1000 * 60 * 30, // 30 min cache
  });
}
