import { useMutation } from '@tanstack/react-query';
import { saveUploadHistory } from '../queries';
import type { NOCSummary } from '../types';

export function useSaveUploadHistory() {
  return useMutation({
    mutationFn: ({
      uploadDate,
      summary,
    }: {
      uploadDate: string;
      summary: NOCSummary;
    }) => saveUploadHistory(uploadDate, summary),
  });
}
