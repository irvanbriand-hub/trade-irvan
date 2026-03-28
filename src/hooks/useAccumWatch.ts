import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "./use-toast";

export interface AccumWatchRow {
  id: string;
  user_id: string;
  ticker: string;
  tanggal_pertama_accum: string;
  tier_saat_masuk: string;
  tanggal_masuk_superketat: string | null;
  hari_tunggu: number | null;
  composite_saat_confirm: number | null;
  streak_saat_confirm: number | null;
  status: string;
  created_at: string;
}

export function useAccumWatch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["accum-watch", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accum_watch_history")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AccumWatchRow[];
    },
    enabled: !!user,
  });

  const addToWatch = async (ticker: string, tier: string) => {
    if (!user) return;
    // Check if already watching
    const existing = items.find(i => i.ticker === ticker && i.status === "WATCHING");
    if (existing) return;

    const { error } = await supabase.from("accum_watch_history").insert({
      user_id: user.id,
      ticker,
      tanggal_pertama_accum: new Date().toISOString().split("T")[0],
      tier_saat_masuk: tier,
      status: "WATCHING",
    });
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["accum-watch"] });
  };

  const confirmSuperketat = async (ticker: string, composite?: number, streak?: number) => {
    if (!user) return;
    const watchItem = items.find(i => i.ticker === ticker && i.status === "WATCHING");
    if (!watchItem) return;

    const today = new Date().toISOString().split("T")[0];
    const firstDate = new Date(watchItem.tanggal_pertama_accum);
    const todayDate = new Date(today);
    const hariTunggu = Math.floor((todayDate.getTime() - firstDate.getTime()) / (86400000));

    const { error } = await supabase.from("accum_watch_history").update({
      status: "CONFIRMED",
      tanggal_masuk_superketat: today,
      hari_tunggu: hariTunggu,
      composite_saat_confirm: composite || null,
      streak_saat_confirm: streak || null,
    }).eq("id", watchItem.id);
    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ["accum-watch"] });
  };

  const expireOld = async (activeTickers: string[]) => {
    if (!user) return;
    const watching = items.filter(i => i.status === "WATCHING");
    for (const w of watching) {
      if (!activeTickers.includes(w.ticker)) {
        const firstDate = new Date(w.tanggal_pertama_accum);
        const daysSince = Math.floor((Date.now() - firstDate.getTime()) / 86400000);
        if (daysSince >= 3) {
          await supabase.from("accum_watch_history").update({ status: "EXPIRED" }).eq("id", w.id);
        }
      }
    }
    queryClient.invalidateQueries({ queryKey: ["accum-watch"] });
  };

  /**
   * Auto-populate accum_watch from bandarmology_data.
   * - Fetches today's bandar data with market_cap Big/Mid and tier S/A/B
   * - Finds earliest appearance date per ticker in bandarmology_data
   * - Inserts new WATCHING entries for tickers not already tracked
   * - Expires tickers missing from bandar data for 3+ days
   */
  const syncFromBandarmology = async () => {
    if (!user) return;

    // 1. Find the latest date in bandarmology_data for this user
    const { data: latestRow, error: latestErr } = await supabase
      .from("bandarmology_data")
      .select("tanggal_data")
      .eq("user_id", user.id)
      .order("tanggal_data", { ascending: false })
      .limit(1);

    if (latestErr || !latestRow || latestRow.length === 0) {
      console.error("syncFromBandarmology: no bandar data found");
      return;
    }

    const latestDate = latestRow[0].tanggal_data;

    // 2. Get bandar tickers for that date (Big/Mid cap, tier S/A/B)
    const { data: todayBandar, error: bandarErr } = await supabase
      .from("bandarmology_data")
      .select("ticker, tanggal_data, market_cap, tier")
      .eq("tanggal_data", latestDate)
      .eq("user_id", user.id)
      .in("tier", ["S", "A", "B"]);

    if (bandarErr) {
      console.error("syncFromBandarmology bandar error:", bandarErr);
      return;
    }

    // Filter Big/Mid cap only
    const qualifiedTickers = (todayBandar || [])
      .filter(b => b.market_cap === "Big" || b.market_cap === "Mid")
      .map(b => b.ticker);
    const uniqueTickers = [...new Set(qualifiedTickers)];

    if (uniqueTickers.length === 0) return;

    // 2. Get existing accum_watch entries for this user (all statuses)
    const { data: existingWatch, error: watchErr } = await supabase
      .from("accum_watch_history")
      .select("*")
      .eq("user_id", user.id);
    if (watchErr) {
      console.error("syncFromBandarmology watch error:", watchErr);
      return;
    }

    const watchByTicker = new Map<string, typeof existingWatch[0]>();
    for (const w of (existingWatch || [])) {
      // Keep the latest/active entry per ticker
      const existing = watchByTicker.get(w.ticker);
      if (!existing || w.status === "WATCHING" || w.created_at > existing.created_at) {
        watchByTicker.set(w.ticker, w);
      }
    }

    // 3. For each qualified ticker, find earliest date in bandarmology_data
    const { data: allBandarForTickers, error: histErr } = await supabase
      .from("bandarmology_data")
      .select("ticker, tanggal_data")
      .eq("user_id", user.id)
      .in("ticker", uniqueTickers)
      .order("tanggal_data", { ascending: true });

    const earliestDate = new Map<string, string>();
    for (const row of (allBandarForTickers || [])) {
      if (!earliestDate.has(row.ticker)) {
        earliestDate.set(row.ticker, row.tanggal_data);
      }
    }

    // 4. Insert new entries for tickers not yet in WATCHING
    const toInsert: Array<{
      user_id: string;
      ticker: string;
      tanggal_pertama_accum: string;
      tier_saat_masuk: string;
      status: string;
    }> = [];

    for (const ticker of uniqueTickers) {
      const existing = watchByTicker.get(ticker);
      // Skip if already WATCHING or CONFIRMED
      if (existing && (existing.status === "WATCHING" || existing.status === "CONFIRMED")) continue;

      const bandarRow = (todayBandar || []).find(b => b.ticker === ticker);
      toInsert.push({
        user_id: user.id,
        ticker,
        tanggal_pertama_accum: earliestDate.get(ticker) || latestDate,
        tier_saat_masuk: bandarRow?.tier || "B",
        status: "WATCHING",
      });
    }

    if (toInsert.length > 0) {
      const { error: insertErr } = await supabase.from("accum_watch_history").insert(toInsert);
      if (insertErr) console.error("syncFromBandarmology insert error:", insertErr);
    }

    // 5. Expire tickers that are WATCHING but NOT in today's qualified list
    const watchingItems = (existingWatch || []).filter(w => w.status === "WATCHING");
    for (const w of watchingItems) {
      if (!uniqueTickers.includes(w.ticker)) {
        // Check if absent for 3+ consecutive days
        const { data: recentAppearances } = await supabase
          .from("bandarmology_data")
          .select("tanggal_data")
          .eq("user_id", user.id)
          .eq("ticker", w.ticker)
          .order("tanggal_data", { ascending: false })
          .limit(1);

        if (recentAppearances && recentAppearances.length > 0) {
          const lastSeen = new Date(recentAppearances[0].tanggal_data);
          const daysSince = Math.floor((Date.now() - lastSeen.getTime()) / 86400000);
          if (daysSince >= 3) {
            await supabase.from("accum_watch_history").update({ status: "EXPIRED" }).eq("id", w.id);
          }
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ["accum-watch"] });
  };

  const getWatching = () => items.filter(i => i.status === "WATCHING");
  const getConfirmed = () => items.filter(i => i.status === "CONFIRMED");

  return {
    items,
    isLoading,
    addToWatch,
    confirmSuperketat,
    expireOld,
    syncFromBandarmology,
    getWatching,
    getConfirmed,
  };
}
