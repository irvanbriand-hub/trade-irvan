import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchTTRecords, updateTTRecordEdit } from '../queries';
import type { TTRecordDB } from '../types';

const QK = ['noc', 'tt_records'] as const;

export function useTTRecords() {
  return useQuery<TTRecordDB[]>({
    queryKey: QK,
    queryFn: fetchTTRecords,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateTTRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateTTRecordEdit,
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: QK });
      const prev = qc.getQueryData<TTRecordDB[]>(QK);
      qc.setQueryData<TTRecordDB[]>(QK, (old) =>
        (old ?? []).map((r) =>
          r.id === payload.id
            ? { ...r, target_online_edited: payload.target_online_edited, reschedule_note: payload.reschedule_note, is_manually_edited: true }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK }),
  });
}
