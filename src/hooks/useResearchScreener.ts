import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ========== CUSTOM FORMULAS ==========
export function useCustomFormulas() {
  return useQuery({
    queryKey: ["custom_formulas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custom_formulas")
        .select("*")
        .order("last_used", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nama: string; deskripsi?: string; formula: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("custom_formulas")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_formulas"] }),
  });
}

export function useUpdateFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; nama?: string; deskripsi?: string; formula?: string }) => {
      const { error } = await supabase
        .from("custom_formulas")
        .update({ ...updates, last_used: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_formulas"] }),
  });
}

export function useDeleteFormula() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("custom_formulas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom_formulas"] }),
  });
}

// ========== BACKTEST SESSIONS ==========
export function useBacktestSessions() {
  return useQuery({
    queryKey: ["backtest_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backtest_sessions")
        .select("*")
        .order("tanggal_run", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nama: string;
      formula: string;
      formula_id?: string;
      metode: string[];
      threshold_bsjp?: number;
      threshold_swing?: number;
      periode_historis?: string;
      parameter_dipilih?: any[];
      hasil_summary?: any;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("backtest_sessions")
        .insert({
          ...input,
          user_id: user.id,
          metode: input.metode as any,
          parameter_dipilih: input.parameter_dipilih as any,
          hasil_summary: input.hasil_summary as any,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backtest_sessions"] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("backtest_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["backtest_sessions"] }),
  });
}
