import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface WatchlistRekomendasi {
  id: string;
  user_id: string;
  ticker: string;
  category_id: string | null;
  entry_date: string;
  notes: string | null;
  created_at: string;
}

export function useWatchlistRekomendasi() {
  return useQuery({
    queryKey: ["watchlist_rekomendasi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlist_rekomendasi" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as WatchlistRekomendasi[];
    },
  });
}

export function useAddWatchlistRekomendasi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { ticker: string; category_id: string | null; entry_date: string; notes: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("watchlist_rekomendasi" as any)
        .insert({ ...item, user_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist_rekomendasi"] }),
  });
}

export function useUpdateWatchlistRekomendasi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; ticker?: string; category_id?: string | null; entry_date?: string; notes?: string | null }) => {
      const { error } = await supabase
        .from("watchlist_rekomendasi" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist_rekomendasi"] }),
  });
}

export function useDeleteWatchlistRekomendasi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("watchlist_rekomendasi" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist_rekomendasi"] }),
  });
}
