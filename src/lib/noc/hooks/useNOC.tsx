import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { parseTSV } from '../tsvParser';
import { computeSummary } from '../classifiers';
import { saveUploadHistory, mergeTSVToSupabase, resetTTRecords } from '../queries';
import type { TTRecord, PO, NOCSummary, MergeResult } from '../types';

interface NOCContextValue {
  rawData: TTRecord[];
  uploadDate: string;
  lastUploadTime: string;
  summary: NOCSummary | null;
  isLoading: boolean;
  mergeResult: MergeResult | null;
  loadTSV: (raw: string, poList: PO[], date: string) => Promise<void>;
  clearData: () => void;
  resetData: () => Promise<void>;
}

const NOCContext = createContext<NOCContextValue | null>(null);

export function NOCProvider({ children }: { children: ReactNode }) {
  const [rawData, setRawData] = useState<TTRecord[]>([]);
  const [uploadDate, setUploadDate] = useState<string>('');
  const [lastUploadTime, setLastUploadTime] = useState<string>('');
  const [summary, setSummary] = useState<NOCSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
  const qc = useQueryClient();

  const loadTSV = useCallback(async (raw: string, poList: PO[], date: string) => {
    setIsLoading(true);
    setMergeResult(null);
    try {
      const parsed = parseTSV(raw, poList);
      const computed = computeSummary(parsed);
      setRawData(parsed);
      setUploadDate(date);
      setSummary(computed);

      const result = await mergeTSVToSupabase(parsed, date);
      setMergeResult(result);
      setLastUploadTime(format(new Date(), 'HH:mm'));

      // Invalidate tt_records cache agar Recap page langsung reflect data baru
      qc.invalidateQueries({ queryKey: ['noc', 'tt_records'] });

      saveUploadHistory(date, computed).catch(() => {});
    } finally {
      setIsLoading(false);
    }
  }, [qc]);

  const clearData = useCallback(() => {
    setRawData([]);
    setUploadDate('');
    setSummary(null);
    setMergeResult(null);
  }, []);

  const resetData = useCallback(async () => {
    await resetTTRecords();
    clearData();
  }, [clearData]);

  return (
    <NOCContext.Provider value={{ rawData, uploadDate, lastUploadTime, summary, isLoading, mergeResult, loadTSV, clearData, resetData }}>
      {children}
    </NOCContext.Provider>
  );
}

export function useNOC(): NOCContextValue {
  const ctx = useContext(NOCContext);
  if (!ctx) throw new Error('useNOC must be used inside NOCProvider');
  return ctx;
}
