import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StampDuty {
  id: string;
  user_id: string;
  trade_date: string;
  amount: number;
  auto: boolean;
  notes: string | null;
  created_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Query: semua data materai user
// ────────────────────────────────────────────────────────────────────────────
export function useStampDuty() {
  return useQuery<StampDuty[]>({
    queryKey: ["stamp_duty"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stamp_duty")
        .select("*")
        .order("trade_date", { ascending: false });
      if (error) throw error;
      return data as StampDuty[];
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Upsert manual: untuk override dari UI
// ────────────────────────────────────────────────────────────────────────────
export function useUpsertStampDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      trade_date: string;
      amount: number;
      auto: boolean;
      notes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any)
        .from("stamp_duty")
        .upsert(
          { ...payload, user_id: user.id },
          { onConflict: "user_id,trade_date" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as StampDuty;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stamp_duty"] }),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Delete
// ────────────────────────────────────────────────────────────────────────────
export function useDeleteStampDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("stamp_duty")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stamp_duty"] }),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Auto-generate: dipanggil setelah trade SELL disimpan / dihapus / diedit
//
// Logika:
// 1. Ambil semua trade untuk trade_date dari Supabase
// 2. Hitung total gross = sum(price × lots × 100) semua trade hari itu
// 3. Jika total > 10.000.000:
//    - Cek apakah ada record manual (auto=false) → jangan overwrite
//    - Kalau tidak ada / sudah auto=true → upsert dengan amount=10000
// 4. Jika total ≤ 10.000.000:
//    - Hapus record auto=true untuk hari itu (jika ada)
// ────────────────────────────────────────────────────────────────────────────
export async function autoUpdateStampDuty(trade_date: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Ambil semua trade hari itu
  const { data: trades, error: tradesErr } = await supabase
    .from("trades")
    .select("price, lots")
    .eq("trade_date", trade_date)
    .eq("user_id", user.id);

  if (tradesErr || !trades) return;

  // Hitung total gross transaksi hari itu (BUY + SELL)
  const totalGross = trades.reduce(
    (sum, t) => sum + Number(t.price) * Number(t.lots) * 100,
    0
  );

  // Cek record existing
  const { data: existing } = await (supabase as any)
    .from("stamp_duty")
    .select("id, auto")
    .eq("user_id", user.id)
    .eq("trade_date", trade_date)
    .maybeSingle();

  if (totalGross > 10_000_000) {
    // Jika sudah ada record manual → jangan overwrite
    if (existing && existing.auto === false) return;

    // Upsert auto record
    await (supabase as any)
      .from("stamp_duty")
      .upsert(
        { user_id: user.id, trade_date, amount: 10000, auto: true },
        { onConflict: "user_id,trade_date" }
      );
  } else {
    // Hapus record auto saja (jangan hapus manual)
    if (existing && existing.auto === true) {
      await (supabase as any)
        .from("stamp_duty")
        .delete()
        .eq("id", existing.id);
    }
  }
}
