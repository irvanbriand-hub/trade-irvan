import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PO, POInsert } from '../types';

const QK = ['noc', 'po_list'] as const;

export function usePOList() {
  return useQuery<PO[]>({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('po_list')
        .select('*')
        .order('area', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PO[];
    },
  });
}

export function useAddPO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: POInsert) => {
      const { data, error } = await supabase
        .from('po_list')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PO;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdatePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<POInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from('po_list')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PO;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useDeletePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('po_list').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useTogglePOStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'active' | 'inactive' }) => {
      const { data, error } = await supabase
        .from('po_list')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as PO;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
