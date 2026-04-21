import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { parseTSV } from '../tsvParser';
import { computeSummary } from '../classifiers';
import { saveUploadHistory, mergeTSVToSupabase, resetTTRecords, getSiteNotes } from '../queries';
import { updateBaselineActuals } from '../scurveQueries';
import type { TTRecord, PO, NOCSummary, MergeResult, SiteNote } from '../types';

interface NOCContextValue {
  rawData: TTRecord[];
  uploadDate: string;
  lastUploadTime: string;
  summary: NOCSummary | null;
  isLoading: boolean;
  mergeResult: MergeResult | null;
  siteNotes: SiteNote[];
  refreshSiteNotes: () => Promise<void>;
  getSiteNote: (siteId: string) => SiteNote | null;
  loadFromRecords: (records: TTRecord[], date: string) => Promise<void>;
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
  const [siteNotes, setSiteNotes] = useState<SiteNote[]>([]);
  const qc = useQueryClient();

  const refreshSiteNotes = useCallback(async () => {
    const notes = await getSiteNotes();
    setSiteNotes(notes);
  }, []);

  const getSiteNote = useCallback(
    (siteId: string): SiteNote | null =>
      siteNotes.find((n) => n.site_id === siteId) ?? null,
    [siteNotes],
  );

  // Load site notes on mount
  useEffect(() => {
    refreshSiteNotes().catch(() => {});
  }, [refreshSiteNotes]);

  const loadFromRecords = useCallback(async (records: TTRecord[], date: string) => {
    setIsLoading(true);
    setMergeResult(null);
    try {
      const computed = computeSummary(records);
      setRawData(records);
      setUploadDate(date);
      setSummary(computed);

      const result = await mergeTSVToSupabase(records, date);
      setMergeResult(result);
      setLastUploadTime(format(new Date(), 'HH:mm'));

      // Invalidate tt_records cache agar Recap page langsung reflect data baru
      qc.invalidateQueries({ queryKey: ['noc', 'tt_records'] });

      saveUploadHistory(date, computed).catch(() => {});

      // Update S-Curve baseline actuals (best-effort — skip kalau belum ada baseline aktif)
      updateBaselineActuals()
        .then((n) => {
          if (n > 0) qc.invalidateQueries({ queryKey: ['noc', 's_curve_targets'] });
        })
        .catch((err) => console.error('[updateBaselineActuals]', err));
    } finally {
      setIsLoading(false);
    }
  }, [qc]);

  const loadTSV = useCallback(async (raw: string, poList: PO[], date: string) => {
    const parsed = parseTSV(raw, poList);
    await loadFromRecords(parsed, date);
  }, [loadFromRecords]);

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
    <NOCContext.Provider value={{ rawData, uploadDate, lastUploadTime, summary, isLoading, mergeResult, siteNotes, refreshSiteNotes, getSiteNote, loadFromRecords, loadTSV, clearData, resetData }}>
      {children}
    </NOCContext.Provider>
  );
}

export function useNOC(): NOCContextValue {
  const ctx = useContext(NOCContext);
  if (!ctx) throw new Error('useNOC must be used inside NOCProvider');
  return ctx;
}
