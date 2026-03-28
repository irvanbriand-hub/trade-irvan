import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WrScannerItem {
  id: string;
  user_id: string;
  ticker: string;
  screener_names: string[];
  tanggal_import: string;
  tanggal_backtest: string | null;
  status: string;
  close_import: number | null;
  high_price: number | null;
  pct_open_to_high: number | null;
  result: string | null;
  wl_kategori: string | null;
  notes: string | null;
  created_at: string;
  param_pr: boolean | null;
  param_v_ma20: boolean | null;
  param_ma_plus: boolean | null;
  param_l_pl: boolean | null;
  param_h_ph: boolean | null;
  param_ol_hc: boolean | null;
  param_c_vwap: boolean | null;
  param_v_ma5: boolean | null;
  param_count: number | null;
}

export function useWrScanner() {
  return useQuery({
    queryKey: ["wr_scanner"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wr_scanner")
        .select("*")
        .order("tanggal_import", { ascending: false });
      if (error) throw error;
      return (data as unknown as WrScannerItem[]).map(item => ({
        ...item,
        screener_names: Array.isArray(item.screener_names) ? item.screener_names : [],
      }));
    },
  });
}

export function useImportToWrScanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: {
      ticker: string;
      screener_names: string[];
      wl_kategori: string | null;
      param_pr?: boolean;
      param_v_ma20?: boolean;
      param_ma_plus?: boolean;
      param_l_pl?: boolean;
      param_h_ph?: boolean;
      param_ol_hc?: boolean;
      param_c_vwap?: boolean;
      param_v_ma5?: boolean;
      param_count?: number;
    }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const today = new Date().toISOString().split("T")[0];

      const rows = items.map(item => ({
        user_id: user.id,
        ticker: item.ticker,
        screener_names: item.screener_names,
        tanggal_import: today,
        wl_kategori: item.wl_kategori,
        status: "OPEN",
        param_pr: item.param_pr ?? null,
        param_v_ma20: item.param_v_ma20 ?? null,
        param_ma_plus: item.param_ma_plus ?? null,
        param_l_pl: item.param_l_pl ?? null,
        param_h_ph: item.param_h_ph ?? null,
        param_ol_hc: item.param_ol_hc ?? null,
        param_c_vwap: item.param_c_vwap ?? null,
        param_v_ma5: item.param_v_ma5 ?? null,
        param_count: item.param_count ?? null,
      }));

      const { data, error } = await supabase
        .from("wr_scanner" as any)
        .insert(rows as any)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wr_scanner"] }),
  });
}

export function useDeleteWrScannerByDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase
        .from("wr_scanner" as any)
        .delete()
        .eq("tanggal_import", date);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wr_scanner"] }),
  });
}

export function useUpdateWrScannerBacktest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: {
      id: string;
      close_import: number | null;
      high_price: number | null;
      pct_open_to_high: number | null;
      result: string | null;
      status: string;
      tanggal_backtest: string;
      notes?: string | null;
    }[]) => {
      for (const item of updates) {
        const { id, ...rest } = item;
        const { error } = await supabase
          .from("wr_scanner" as any)
          .update(rest as any)
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wr_scanner"] }),
  });
}

export function useDeleteWrScanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("wr_scanner" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wr_scanner"] }),
  });
}
