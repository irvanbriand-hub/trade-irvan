import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches IHSG trading dates and provides a function to calculate
 * the number of trading days between two dates.
 * Skips weekends and IDX holidays automatically.
 */
export function useTradingDays() {
  const { data: tradingDates = new Set<string>(), isLoading } = useQuery({
    queryKey: ["ihsg-trading-dates"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.functions.invoke("yahoo-finance-history", {
        body: { ticker: "^JKSE", range: "2y", interval: "1d" },
      });
      if (error) throw error;

      const timestamps: number[] = data?.timestamps || [];
      const dates = new Set<string>();

      for (const ts of timestamps) {
        // UTC+7 for WIB
        const d = new Date(ts * 1000 + 7 * 3600 * 1000);
        dates.add(d.toISOString().slice(0, 10));
      }

      return dates;
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
  });

  /**
   * Count trading days elapsed since entryDate until today (or endDate).
   * Entry date itself = Day 0, next trading day = Day 1, etc.
   */
  const getTradingDaysSince = (entryDateStr: string, endDateStr?: string): number => {
    if (tradingDates.size === 0) {
      // Fallback: simple weekday count if IHSG data not loaded
      return getWeekdayCount(entryDateStr, endDateStr);
    }

    const entryDate = new Date(entryDateStr + "T00:00:00+07:00");
    const endDate = endDateStr
      ? new Date(endDateStr + "T00:00:00+07:00")
      : new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }).replace(",", ""));

    let count = 0;
    const current = new Date(entryDate);
    current.setDate(current.getDate() + 1); // Start counting from day after entry

    while (current <= endDate) {
      const dateStr = current.toISOString().slice(0, 10);
      if (tradingDates.has(dateStr)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  };

  return { tradingDates, isLoading, getTradingDaysSince };
}

/** Fallback: count weekdays only (no holiday detection) */
function getWeekdayCount(entryDateStr: string, endDateStr?: string): number {
  const entry = new Date(entryDateStr);
  const end = endDateStr ? new Date(endDateStr) : new Date();
  let count = 0;
  const current = new Date(entry);
  current.setDate(current.getDate() + 1);

  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
    current.setDate(current.getDate() + 1);
  }

  return count;
}
