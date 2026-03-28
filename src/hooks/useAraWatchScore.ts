import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AraWatchScore {
  ticker: string;
  score_total: number;
  total_ara_count: number;
  tanggal_ara_terakhir: string | null;
  pct_ara_terakhir: number | null;
  score_d1: number;
  score_d2: number;
  score_d3: number;
}

export function useAraWatchScores() {
  return useQuery({
    queryKey: ["ara-watch-scores"],
    queryFn: async (): Promise<Map<string, AraWatchScore>> => {
      const today = new Date().toISOString().slice(0, 10);

      // Get scores
      const { data: scores } = await supabase
        .from("ara_watchlist_scores")
        .select("ticker, score_total, score_d1, score_d2, score_d3")
        .eq("tanggal_score", today);

      // Get ARA event counts
      const { data: events } = await supabase
        .from("ara_events")
        .select("ticker, tanggal_ara, pct_change")
        .order("tanggal_ara", { ascending: false });

      const araMap = new Map<string, { count: number; lastDate: string; lastPct: number }>();
      if (events) {
        for (const e of events) {
          if (!araMap.has(e.ticker)) {
            araMap.set(e.ticker, { count: 0, lastDate: e.tanggal_ara, lastPct: Number(e.pct_change) });
          }
          araMap.get(e.ticker)!.count++;
        }
      }

      const result = new Map<string, AraWatchScore>();
      if (scores) {
        for (const s of scores) {
          const ara = araMap.get(s.ticker);
          result.set(s.ticker, {
            ticker: s.ticker,
            score_total: Number(s.score_total),
            total_ara_count: ara?.count || 0,
            tanggal_ara_terakhir: ara?.lastDate || null,
            pct_ara_terakhir: ara?.lastPct || null,
            score_d1: Number(s.score_d1),
            score_d2: Number(s.score_d2),
            score_d3: Number(s.score_d3),
          });
        }
      }

      return result;
    },
    staleTime: 5 * 60 * 1000,
  });
}
