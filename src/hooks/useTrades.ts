import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { autoUpdateStampDuty } from "./useStampDuty";

export type Trade = Tables<"trades">;
export type TradeInsert = TablesInsert<"trades">;

export function useTrades() {
  return useQuery({
    queryKey: ["trades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trades")
        .select("*, trading_categories(name)")
        .order("trade_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAddTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trade: Omit<TradeInsert, "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase.from("trades").insert({ ...trade, user_id: user.id }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["stamp_duty"] });
      // Auto-generate materai setelah SELL tersimpan
      if (data?.trade_type === "SELL") {
        autoUpdateStampDuty(data.trade_date).catch(() => {});
      }
    },
  });
}

export function useUpdateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; trade_date?: string; price?: number; lots?: number; category_id?: string | null; notes?: string | null; fee?: number | null; total_value?: number | null; total_amount?: number | null }) => {
      const { error } = await supabase.from("trades").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { trade_date }) => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["yahoo-finance"] });
      qc.invalidateQueries({ queryKey: ["stamp_duty"] });
      if (trade_date) autoUpdateStampDuty(trade_date).catch(() => {});
    },
  });
}

export function useDeleteTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, trade_date }: { id: string; trade_date?: string }) => {
      const { error } = await supabase.from("trades").delete().eq("id", id);
      if (error) throw error;
      return { trade_date };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      qc.invalidateQueries({ queryKey: ["stamp_duty"] });
      if (result?.trade_date) autoUpdateStampDuty(result.trade_date).catch(() => {});
    },
  });
}
