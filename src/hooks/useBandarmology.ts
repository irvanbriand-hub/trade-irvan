import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";
import type { ParsedBandarData } from "@/lib/bandarmologyParser";

export interface BandarmologyRow {
  id: string;
  user_id: string;
  tanggal_data: string;
  input_time: string;
  ticker: string;
  rank_score: number | null;
  composite_pct: number | null;
  streak: number | null;
  streak_direction: string | null;
  is_new_entry: boolean;
  kode_broker: string | null;
  pattern: string;
  market_cap: string;
  top1_pct: number | null;
  top1_broker: string | null;
  value: number | null;
  daily_pct: number | null;
  weekly_pct: number | null;
  liquidity: string | null;
  is_topl: boolean;
  is_top20: boolean;
  data_tier: string;
  tier: string;
  // legacy columns kept for compat
  muncul_di_topl: boolean;
  muncul_di_topv: boolean;
  muncul_di_top: boolean;
  source_count: number;
  is_topv: boolean;
  created_at: string;
}

export function useBandarmology() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["bandarmology", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bandarmology_data")
        .select("*")
        .order("tanggal_data", { ascending: false })
        .order("rank_score", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as BandarmologyRow[];
    },
    enabled: !!user,
  });

  const saveData = async (tanggal: string, parsed: ParsedBandarData[]) => {
    if (!user) return;
    const now = new Date().toISOString();
    const rows = parsed.map((p) => ({
      user_id: user.id,
      tanggal_data: tanggal,
      input_time: now,
      ticker: p.ticker,
      rank_score: p.rank_score,
      composite_pct: p.composite_pct,
      streak: p.streak,
      streak_direction: p.streak_direction,
      is_new_entry: p.is_new_entry,
      kode_broker: p.kode_broker,
      pattern: p.pattern,
      market_cap: p.market_cap,
      top1_pct: p.top1_pct,
      top1_broker: p.top1_broker,
      value: p.value,
      daily_pct: p.daily_pct,
      weekly_pct: p.weekly_pct,
      liquidity: p.liquidity,
      muncul_di_topl: p.is_topl,
      muncul_di_topv: false,
      muncul_di_top: p.is_top20,
      source_count: (p.is_topl ? 1 : 0) + (p.is_top20 ? 1 : 0),
      is_topv: p.is_top20,
      is_topl: p.is_topl,
      is_top20: p.is_top20,
      data_tier: p.data_tier,
      tier: p.tier,
    }));

    const { error } = await supabase.from("bandarmology_data").insert(rows as any);
    if (error) throw error;

    queryClient.invalidateQueries({ queryKey: ["bandarmology"] });
    toast({ title: "Data tersimpan", description: `${rows.length} saham disimpan untuk ${tanggal}` });
  };

  const deleteByDate = async (tanggal: string) => {
    if (!user) return;
    const { error } = await supabase.from("bandarmology_data").delete().eq("tanggal_data", tanggal).eq("user_id", user.id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["bandarmology"] });
  };

  const getExistingDates = () => new Set(items.map(i => i.tanggal_data));

  const getInputCountForDate = (tanggal: string) => {
    const inputTimes = new Set(items.filter(i => i.tanggal_data === tanggal).map(i => i.input_time));
    return inputTimes.size;
  };

  const getLatestForDate = (tanggal: string) => {
    const forDate = items.filter(i => i.tanggal_data === tanggal);
    if (forDate.length === 0) return [];
    const latestInput = forDate.reduce((max, i) => i.input_time > max ? i.input_time : max, forDate[0].input_time);
    return forDate.filter(i => i.input_time === latestInput);
  };

  const getRankDelta = (ticker: string, currentDate: string, currentRank: number | null): { delta: number | null; isNew: boolean } => {
    if (currentRank == null) return { delta: null, isNew: false };
    const sortedDates = [...new Set(items.map(i => i.tanggal_data))].sort();
    const dateIdx = sortedDates.indexOf(currentDate);
    if (dateIdx <= 0) {
      // First date or not found — check if ticker existed before
      const prevData = items.find(i => i.tanggal_data !== currentDate && i.ticker === ticker);
      return { delta: null, isNew: !prevData };
    }
    const prevDate = sortedDates[dateIdx - 1];
    const prevRow = getLatestForDate(prevDate).find(r => r.ticker === ticker);
    if (!prevRow || prevRow.rank_score == null) return { delta: null, isNew: true };
    return { delta: prevRow.rank_score - currentRank, isNew: false };
  };

  const getTickerHistory = (ticker: string) => {
    const tickerData = items.filter(i => i.ticker === ticker);
    // Group by date, take latest input per date
    const byDate = new Map<string, BandarmologyRow>();
    for (const d of tickerData) {
      const existing = byDate.get(d.tanggal_data);
      if (!existing || d.input_time > existing.input_time) {
        byDate.set(d.tanggal_data, d);
      }
    }
    return [...byDate.values()].sort((a, b) => a.tanggal_data.localeCompare(b.tanggal_data));
  };

  const getTodayData = () => {
    const today = new Date().toISOString().split("T")[0];
    return getLatestForDate(today);
  };

  return {
    items,
    isLoading,
    saveData,
    deleteByDate,
    getExistingDates,
    getInputCountForDate,
    getLatestForDate,
    getRankDelta,
    getTickerHistory,
    getTodayData,
  };
}
