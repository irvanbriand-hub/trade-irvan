import { useQuery, useMutation, useQueryClient, } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ModalTransaction {
  id: string;
  user_id: string;
  tanggal: string;
  tipe: "TOP_UP" | "WITHDRAW";
  jumlah: number;
  notes: string | null;
  created_at: string;
}

export function useModalTransactions() {
  return useQuery({
    queryKey: ["modal_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modal_transactions" as any)
        .select("*")
        .order("tanggal", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ModalTransaction[];
    },
  });
}

export function useAddModalTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tx: { tanggal: string; tipe: string; jumlah: number; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("modal_transactions" as any)
        .insert({ ...tx, user_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modal_transactions"] }),
  });
}

export function useDeleteModalTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("modal_transactions" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["modal_transactions"] }),
  });
}

export function useModalSummary() {
  const { data: transactions, isLoading } = useModalTransactions();

  const summary = useMemo(() => {
    if (!transactions) return { totalTopUp: 0, totalWithdraw: 0, modalBersih: 0, lastTransaction: null as ModalTransaction | null, transactions: [] as ModalTransaction[] };

    let totalTopUp = 0;
    let totalWithdraw = 0;

    for (const tx of transactions) {
      if (tx.tipe === "TOP_UP") totalTopUp += Number(tx.jumlah);
      else totalWithdraw += Number(tx.jumlah);
    }

    const sorted = [...transactions].sort((a, b) => b.tanggal.localeCompare(a.tanggal));

    return {
      totalTopUp,
      totalWithdraw,
      modalBersih: totalTopUp - totalWithdraw,
      lastTransaction: sorted[0] || null,
      transactions,
    };
  }, [transactions]);

  // Helper: modal bersih up to a given date
  const getModalBersihUntil = (date: string) => {
    if (!transactions) return 0;
    let net = 0;
    for (const tx of transactions) {
      if (tx.tanggal <= date) {
        net += tx.tipe === "TOP_UP" ? Number(tx.jumlah) : -Number(tx.jumlah);
      }
    }
    return net;
  };

  return { ...summary, isLoading, getModalBersihUntil };
}
