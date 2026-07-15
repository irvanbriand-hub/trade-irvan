import { useRef, useState, useMemo, useEffect } from 'react';
import { format, addDays, isSameDay, isAfter, startOfDay, differenceInDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { Camera, LayoutGrid, Download, Search, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { normalizeDate } from '@/lib/noc/queries';
import { getPO } from '@/lib/noc/classifiers';
import { RecapTable } from '@/components/noc/RecapTable';
import { RecapCaptureMode } from '@/components/noc/RecapCaptureMode';
import { ClosedTodayCaptureMode } from '@/components/noc/ClosedTodayCaptureMode';
import type { ClosedTodayKPI } from '@/components/noc/ClosedTodayCaptureMode';
import type { TTRecordDB, PO, SiteNote } from '@/lib/noc/types';


function toFilterKey(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

/** Parse DD/MM/YYYY → Date */
function parseDMY(key: string): Date {
  const [dd, mm, yyyy] = key.split('/').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

/** Kembalikan semua tanggal (inclusive) antara from sampai to */
function getDatesBetween(from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  let current = startOfDay(from);
  const end = startOfDay(to);
  while (!isAfter(current, end)) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

/** Format Date ke "YYYY-MM-DD" untuk <input type="date"> */
function toInputValue(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Parse "YYYY-MM-DD" → Date */
function fromInputValue(val: string): Date {
  const [yyyy, mm, dd] = val.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function getCloseType(r: TTRecordDB): 'noc' | 'om' | 'om-visit' | null {
  if (r.status !== 'CLOSED') return null;
  if (r.down_time <= 3) return 'noc';
  if ((r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN')) return 'om-visit';
  return 'om';
}

function agingColor(days: number): string {
  if (days >= 30) return 'text-red-600 dark:text-red-400';
  if (days >= 14) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
}

interface KPIData {
  totalTT: number;
  open: number;
  closed: number;
  closeNOC: number;
  closeOM: number;
  closeOMVisit: number;
  overdueGt8: number;
  overdueGt30: number;
  targetOnlineToday: number;
  closeTargetToday: number;
}

function computeKPI(allRecords: TTRecordDB[], filterKey: string): KPIData {
  return {
    totalTT: allRecords.length,
    open: allRecords.filter((r) => r.status === 'OPEN').length,
    closed: allRecords.filter((r) => r.status === 'CLOSED').length,
    closeNOC: allRecords.filter((r) => getCloseType(r) === 'noc').length,
    closeOM: allRecords.filter((r) => getCloseType(r) === 'om').length,
    closeOMVisit: allRecords.filter((r) => getCloseType(r) === 'om-visit').length,
    overdueGt8: allRecords.filter((r) => r.status === 'OPEN' && r.down_time >= 8).length,
    overdueGt30: allRecords.filter((r) => r.status === 'OPEN' && r.down_time >= 30).length,
    targetOnlineToday: allRecords.filter(
      (r) => normalizeDate(r.target_online_original ?? '') === filterKey,
    ).length,
    closeTargetToday: allRecords.filter(
      (r) =>
        normalizeDate(r.target_online_original ?? '') === filterKey && r.status === 'CLOSED',
    ).length,
  };
}

// ─── Capture Range Header ─────────────────────────────────────────────────────

interface CaptureRangeHeaderProps {
  dateRange: { from: Date; to: Date };
  lastUploadTime?: string;
  totalTT: number;
}

function CaptureRangeHeader({ dateRange, lastUploadTime, totalTT }: CaptureRangeHeaderProps) {
  const isSingle = isSameDay(dateRange.from, dateRange.to);
  const dateLabel = isSingle
    ? format(dateRange.from, 'dd/MM/yyyy')
    : `${format(dateRange.from, 'dd/MM')} → ${format(dateRange.to, 'dd/MM/yyyy')}`;

  return (
    <div style={{
      padding: '10px 16px',
      backgroundColor: '#1e293b',
      color: '#ffffff',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div style={{ fontSize: '14px', fontWeight: '700' }}>
        NOC Daily Recap — {dateLabel}{lastUploadTime ? ` | Update: ${lastUploadTime}` : ''}
      </div>
      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
        {totalTT} TT dalam range
      </div>
    </div>
  );
}

// ─── DateSectionCapture — 1 section per tanggal dalam capture ─────────────────

interface DateSectionProps {
  date: Date;
  records: TTRecordDB[];
  poList: PO[];
  isFirst: boolean;
  siteNotes?: SiteNote[];
}

function DateSectionCapture({ date, records, poList, isFirst, siteNotes }: DateSectionProps) {
  const dateRecords = records.filter((r) => {
    const key = normalizeDate(r.target_online_original ?? '');
    return key === toFilterKey(date);
  });

  if (dateRecords.length === 0) return null;

  const openCount = dateRecords.filter((r) => r.status === 'OPEN').length;
  const closedCount = dateRecords.filter((r) => r.status === 'CLOSED').length;

  const dayName = format(date, 'EEEE', { locale: id });
  const dateFormatted = format(date, 'dd MMMM yyyy', { locale: id });

  return (
    <div>
      {!isFirst && <div style={{ height: '2px', backgroundColor: '#e2e8f0' }} />}

      {/* Section header */}
      <div style={{
        padding: '8px 16px',
        backgroundColor: '#334155',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '4px', height: '20px', backgroundColor: '#06b6d4', borderRadius: '2px' }} />
          <span style={{ fontSize: '13px', fontWeight: '700' }}>{dayName}, {dateFormatted}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: '700',
          }}>🔴 {openCount} Open</span>
          <span style={{
            backgroundColor: '#f0fdf4',
            color: '#15803d',
            border: '1px solid #bbf7d0',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: '700',
          }}>✅ {closedCount} Closed</span>
          <span style={{
            backgroundColor: '#f8fafc',
            color: '#334155',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: '700',
          }}>📋 {dateRecords.length} Total</span>
        </div>
      </div>

      {/* 2-kolom data (reuse RecapCaptureMode dalam mode section) */}
      <RecapCaptureMode
        records={dateRecords}
        poList={poList}
        selectedDate={toFilterKey(date)}
        renderMode="section"
        siteNotes={siteNotes}
      />
    </div>
  );
}

// ─── KPI Cards — Daily Recap (light theme, untuk capture) ────────────────────

function KPICaptureCards({ kpi }: { kpi: KPIData }) {
  const row1 = [
    { label: 'Total TT',     value: kpi.totalTT,     valueColor: '#1e293b' },
    { label: 'Open',         value: kpi.open,         valueColor: '#b91c1c' },
    { label: 'Closed',       value: kpi.closed,       valueColor: '#15803d' },
    { label: 'Overdue 8h',  value: kpi.overdueGt8,   valueColor: '#c2410c' },
    { label: 'Overdue 30h', value: kpi.overdueGt30,  valueColor: '#991b1b' },
  ];
  const row2 = [
    { label: 'Close NOC',            value: kpi.closeNOC,          valueColor: '#1d4ed8' },
    { label: 'Close O&M',            value: kpi.closeOM,           valueColor: '#b45309' },
    { label: 'O&M Visit',            value: kpi.closeOMVisit,      valueColor: '#6d28d9' },
    { label: 'Target Hari Ini',      value: kpi.targetOnlineToday, valueColor: '#0369a1' },
    { label: 'Close Target Hari Ini',value: kpi.closeTargetToday,  valueColor: '#047857' },
  ];

  const renderRow = (items: typeof row1, borderColor: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', alignItems: 'start' }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderTop: `3px solid ${borderColor}`,
            borderRadius: '6px',
            padding: '10px 8px',
            textAlign: 'center' as const,
          }}
        >
          <div style={{ fontSize: '11px', color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: '700', marginBottom: '4px', lineHeight: '1.3' }}>
            {item.label}
          </div>
          <div style={{ fontSize: '30px', fontWeight: '700', color: item.valueColor, lineHeight: '1' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
      {renderRow(row1, '#334155')}
      {renderRow(row2, '#334155')}
    </div>
  );
}

// ─── KPI Cards — Closed Today (2 section, light theme, untuk capture) ───────

function ClosedTodayKPICards({ kpi }: { kpi: ClosedTodayKPI }) {
  const resColor =
    kpi.resolutionRate >= 80 ? '#15803d' : kpi.resolutionRate >= 50 ? '#d97706' : '#dc2626';
  const todayLabel = format(new Date(), 'dd/MM/yyyy');

  type CardItem = { label: string; value: string; valueColor: string; subtitle?: string };

  const renderCards = (items: CardItem[], cols: number) => (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: '6px',
      alignItems: 'start',
    }}>
      {items.map((item) => (
        <div
          key={item.label + (item.subtitle ?? '')}
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderTop: '3px solid #334155',
            borderRadius: '6px',
            padding: '10px 8px',
            textAlign: 'center' as const,
          }}
        >
          <div style={{ fontSize: '11px', color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: '700', marginBottom: '4px', lineHeight: '1.3' }}>
            {item.label}
          </div>
          <div style={{ fontSize: '30px', fontWeight: '700', color: item.valueColor, lineHeight: '1' }}>
            {item.value}
          </div>
          {item.subtitle && (
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
              {item.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const section1: CardItem[] = [
    { label: 'Total Closed',   value: String(kpi.totalClosed),  valueColor: '#15803d', subtitle: 'Aging ≥ 3 hari' },
    { label: 'Close NOC',      value: String(kpi.closeNOC),     valueColor: '#0891b2', subtitle: '≤ 2 hari' },
    { label: 'Close Visit',    value: String(kpi.closeVisit),   valueColor: '#7c3aed', subtitle: 'Kunjungan fisik' },
    { label: 'Overdue Closed', value: String(kpi.overdueGte8),  valueColor: '#ea580c', subtitle: '≥ 8 hari' },
    { label: 'Overdue Closed', value: String(kpi.overdueGte30), valueColor: '#dc2626', subtitle: '≥ 30 hari' },
  ];

  const section2: CardItem[] = [
    { label: 'Target Hari Ini',      value: String(kpi.totalTargetHariIni), valueColor: '#1e293b',  subtitle: 'Semua status' },
    { label: 'Closed Hari Ini',      value: String(kpi.closedHariIni),      valueColor: '#15803d',  subtitle: 'Target hari ini' },
    { label: 'Resolution Rate Today',value: `${kpi.resolutionRate}%`,        valueColor: resColor,   subtitle: `${kpi.closedHariIni} / ${kpi.totalTargetHariIni}` },
  ];

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#6c757d', marginBottom: '6px' }}>
      {text}
    </div>
  );

  return (
    <div style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #cbd5e1' }}>
      {/* Section 1 — Keseluruhan Closed */}
      <div style={{ padding: '10px 12px 6px' }}>
        {sectionLabel('Keseluruhan Closed')}
        {renderCards(section1, 5)}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: '#dee2e6', margin: '0 12px' }} />

      {/* Section 2 — Hari Ini */}
      <div style={{ padding: '6px 12px 10px' }}>
        {sectionLabel(`Hari Ini — ${todayLabel}`)}
        {renderCards(section2, 3)}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NocRecap() {
  const today = new Date();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: today,
    to: addDays(today, 2),
  });
  const [selectedTabDate, setSelectedTabDate] = useState<Date>(today);
  const [mode, setMode] = useState<'view' | 'capture'>('view');
  const [captureTab, setCaptureTab] = useState<'daily' | 'closed-today'>('daily');
  const combinedRef = useRef<HTMLDivElement>(null);
  const closedTodayRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  const { data: allRecords = [], isLoading } = useTTRecords();
  const { data: poList = [] } = usePOList();
  const { lastUploadTime, siteNotes } = useNOC();

  // Pastikan selectedTabDate selalu dalam range saat range berubah
  useEffect(() => {
    const dates = getDatesBetween(dateRange.from, dateRange.to);
    const inRange = dates.some((d) => isSameDay(d, selectedTabDate));
    if (!inRange) setSelectedTabDate(dateRange.from);
  }, [dateRange]);

  // filterKey = tanggal tab aktif (untuk view) atau from (untuk KPI)
  const filterKey = toFilterKey(selectedTabDate);

  // filtered = records untuk tab aktif saat ini
  const filtered = allRecords.filter((r) => {
    const orig = normalizeDate(r.target_online_original ?? '');
    return orig === filterKey;
  });

  // Total TT di seluruh range (untuk capture header)
  const totalInRange = useMemo(() => {
    const keys = getDatesBetween(dateRange.from, dateRange.to).map(toFilterKey);
    return allRecords.filter((r) => {
      const key = normalizeDate(r.target_online_original ?? '');
      return keys.includes(key);
    }).length;
  }, [allRecords, dateRange]);

  const openCount = filtered.filter((r) => r.status === 'OPEN').length;
  const closedCount = filtered.filter((r) => r.status === 'CLOSED').length;

  // Closed Today data
  // Base filter: SEMUA CLOSED + down_time >= 3 (tanpa filter tanggal)
  const closedTodayRecords = useMemo(
    () => allRecords.filter((r) => r.status === 'CLOSED' && r.down_time >= 3),
    [allRecords],
  );
  const closedTodayKPI: ClosedTodayKPI = useMemo(() => {
    // Section 2 pakai actual today (bukan selectedDate)
    const todayKey = toFilterKey(new Date());
    const todayRecords = allRecords.filter(
      (r) => normalizeDate(r.target_online_original ?? '') === todayKey,
    );
    const closedHariIni = todayRecords.filter(
      (r) => r.status === 'CLOSED' && r.down_time >= 3,
    ).length;
    return {
      // Section 1 — Keseluruhan DB
      totalClosed:        closedTodayRecords.length,
      closeNOC:           allRecords.filter((r) => r.status === 'CLOSED' && r.down_time <= 2).length,
      closeVisit:         closedTodayRecords.filter((r) =>
                            (r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN')).length,
      overdueGte8:        closedTodayRecords.filter((r) => r.down_time >= 8).length,
      overdueGte30:       closedTodayRecords.filter((r) => r.down_time >= 30).length,
      // Section 2 — Hari Ini
      totalTargetHariIni: todayRecords.length,
      closedHariIni,
      resolutionRate:     todayRecords.length > 0
                            ? Math.round((closedHariIni / todayRecords.length) * 100)
                            : 0,
    };
  }, [allRecords, closedTodayRecords]);

  const kpi = useMemo(() => computeKPI(allRecords, filterKey), [allRecords, filterKey]);

  // Reset captureTab ke 'daily' saat mode berubah ke view
  useEffect(() => {
    if (mode === 'view') setCaptureTab('daily');
  }, [mode]);

  // Search across ALL records (all dates)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return allRecords
      .filter((r) => r.site_name.toLowerCase().includes(q))
      .slice(0, 15)
      .map((r) => {
        const po = getPO(r.provinsi ?? '', r.kabupaten ?? '', poList);
        const recordDate = normalizeDate(r.target_online_original ?? '');
        const effectiveTarget = r.is_manually_edited
          ? r.target_online_edited ?? r.target_online_original ?? ''
          : r.target_online_original ?? '';
        return { record: r, poName: po?.name ?? '— Tidak Terpetakan', recordDate, effectiveTarget };
      });
  }, [searchQuery, allRecords, poList]);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchResultClick(recordId: string, recordDate: string) {
    setSearchQuery('');
    setSearchOpen(false);
    setPendingHighlight(recordId);

    if (recordDate) {
      const targetDate = parseDMY(recordDate);
      // Kalau tanggal di luar range, set range ke 1 hari itu
      const inRange = getDatesBetween(dateRange.from, dateRange.to).some((d) =>
        isSameDay(d, targetDate),
      );
      if (!inRange) {
        setDateRange({ from: targetDate, to: targetDate });
      }
      setSelectedTabDate(targetDate);
    }

    setTimeout(() => setPendingHighlight(null), 4500);
  }

  async function handleDownloadCombined() {
    const el = combinedRef.current;
    if (!el) return;

    const dayCount = differenceInDays(dateRange.to, dateRange.from) + 1;
    if (dayCount > 14) {
      toast({ title: 'Terlalu banyak hari', description: 'Maksimal 14 hari dalam 1 capture.', variant: 'destructive' });
      return;
    }

    el.style.left = '0';
    el.style.position = 'fixed';
    el.style.zIndex = '-1';

    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: 1400,
        logging: false,
        imageTimeout: 0,
      });
      const isSingle = isSameDay(dateRange.from, dateRange.to);
      const filename = isSingle
        ? `noc-recap-${format(dateRange.from, 'yyyy-MM-dd')}.png`
        : `noc-recap-${format(dateRange.from, 'yyyy-MM-dd')}-to-${format(dateRange.to, 'yyyy-MM-dd')}.png`;
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } finally {
      el.style.left = '-9999px';
      el.style.position = 'absolute';
      el.style.zIndex = 'auto';
    }
  }

  async function handleDownloadClosedToday() {
    const el = closedTodayRef.current;
    if (!el) return;

    el.style.left = '0';
    el.style.position = 'fixed';
    el.style.zIndex = '-1';

    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: true,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: 1400,
        logging: false,
        imageTimeout: 0,
      });
      const link = document.createElement('a');
      link.download = `noc-closed-today-${format(new Date(), 'yyyy-MM-dd')}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
    } finally {
      el.style.left = '-9999px';
      el.style.position = 'absolute';
      el.style.zIndex = 'auto';
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range picker */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Dari</span>
            <input
              type="date"
              value={toInputValue(dateRange.from)}
              onChange={(e) => {
                if (!e.target.value) return;
                const newFrom = fromInputValue(e.target.value);
                setDateRange((prev) => ({
                  from: newFrom,
                  to: isAfter(newFrom, prev.to) ? newFrom : prev.to,
                }));
                setSelectedTabDate(newFrom);
              }}
              className="h-8 rounded-md border border-border bg-muted/40 px-2 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
          <span className="text-muted-foreground text-sm">→</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Sampai</span>
            <input
              type="date"
              value={toInputValue(dateRange.to)}
              min={toInputValue(dateRange.from)}
              onChange={(e) => {
                if (!e.target.value) return;
                setDateRange((prev) => ({ ...prev, to: fromInputValue(e.target.value) }));
              }}
              className="h-8 rounded-md border border-border bg-muted/40 px-2 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]"
            />
          </div>
        </div>

        {/* Preset buttons */}
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="sm" className="h-7 text-xs px-2"
            onClick={() => { const t = new Date(); setDateRange({ from: t, to: t }); setSelectedTabDate(t); }}>
            Hari Ini
          </Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs px-2"
            onClick={() => { const t = new Date(); setDateRange({ from: t, to: addDays(t, 1) }); setSelectedTabDate(t); }}>
            +2 Hari
          </Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs px-2"
            onClick={() => { const t = new Date(); setDateRange({ from: t, to: addDays(t, 2) }); setSelectedTabDate(t); }}>
            +3 Hari
          </Button>
          <Button variant="secondary" size="sm" className="h-7 text-xs px-2"
            onClick={() => { const t = new Date(); setDateRange({ from: t, to: addDays(t, 6) }); setSelectedTabDate(t); }}>
            +7 Hari
          </Button>
        </div>

        {/* Summary range */}
        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            {isSameDay(dateRange.from, dateRange.to)
              ? format(dateRange.from, 'dd/MM/yyyy')
              : `${format(dateRange.from, 'dd/MM')} → ${format(dateRange.to, 'dd/MM')}`
            }
            {' | '}
            <span className="font-medium text-foreground">
              {getDatesBetween(dateRange.from, dateRange.to).length} hari
            </span>
            {totalInRange > 0 && (
              <> | <span className="font-medium text-foreground">{totalInRange} TT</span></>
            )}
          </p>
        )}

        {/* Mode toggle — push to right */}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button
              variant={mode === 'view' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 rounded-none gap-1.5 border-0"
              onClick={() => setMode('view')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              View
            </Button>
            <Button
              variant={mode === 'capture' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 rounded-none gap-1.5 border-0 border-l border-border"
              onClick={() => setMode('capture')}
            >
              <Camera className="h-3.5 w-3.5" />
              Capture
            </Button>
          </div>

          {/* Download PNG — muncul saat capture, sesuai tab aktif */}
          {mode === 'capture' && (
            <>
              {captureTab === 'daily' && totalInRange > 0 && (
                <Button size="sm" className="h-8 gap-1.5" onClick={handleDownloadCombined}>
                  <Download className="h-3.5 w-3.5" />
                  Download PNG
                </Button>
              )}
              {captureTab === 'closed-today' && closedTodayRecords.length > 0 && (
                <Button size="sm" className="h-8 gap-1.5" onClick={handleDownloadClosedToday}>
                  <Download className="h-3.5 w-3.5" />
                  Download PNG
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Capture tab switcher — hanya saat mode capture ── */}
      {mode === 'capture' && totalInRange > 0 && (
        <div className="flex rounded-md border border-border overflow-hidden w-fit">
          <Button
            variant={captureTab === 'daily' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 rounded-none gap-1.5 border-0 text-xs"
            onClick={() => setCaptureTab('daily')}
          >
            📋 Daily Recap
          </Button>
          <Button
            variant={captureTab === 'closed-today' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 rounded-none gap-1.5 border-0 border-l border-border text-xs"
            onClick={() => setCaptureTab('closed-today')}
          >
            ✅ Closed Today
          </Button>
        </div>
      )}

      {/* ── Search Lokasi (global, semua tanggal) — view mode only ── */}
      {mode === 'view' && !isLoading && allRecords.length > 0 && (
        <div ref={searchWrapperRef} className="relative w-80">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(e.target.value.trim().length > 0);
              }}
              onFocus={() => {
                if (searchQuery.trim()) setSearchOpen(true);
              }}
              placeholder="Cari lokasi di semua tanggal..."
              className="h-8 pl-8 pr-8 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSearchOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown results */}
          {searchOpen && searchQuery.trim() && (
            <div className="absolute top-full mt-1 left-0 w-[520px] rounded-md border border-border bg-popover shadow-lg z-50 overflow-hidden">
              {searchResults.length > 0 ? (
                <>
                  <div className="max-h-80 overflow-y-auto">
                    {searchResults.map(({ record, poName, recordDate, effectiveTarget }) => {
                      const isOtherDate = recordDate !== filterKey;
                      return (
                        <button
                          key={record.id}
                          className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted/60 text-left border-b border-border/30 last:border-0 transition-colors"
                          onClick={() => handleSearchResultClick(record.id, recordDate)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">
                              {record.site_name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              👤 {poName}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={['text-[10px] font-medium', isOtherDate ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'].join(' ')}>
                              {recordDate || '—'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {effectiveTarget !== recordDate ? effectiveTarget || '' : ''}
                            </span>
                            {record.status === 'CLOSED' ? (
                              <Badge variant="outline" className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 text-[9px] px-1 py-0 h-4">
                                CLOSED
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 text-[9px] px-1 py-0 h-4">
                                OPEN
                              </Badge>
                            )}
                            <span className={`text-[10px] ${agingColor(record.down_time)}`}>
                              {record.down_time}h
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {searchResults.length === 15 && (
                    <p className="px-3 py-1.5 text-[10px] text-muted-foreground bg-muted/20 border-t border-border/30">
                      Menampilkan 15 hasil teratas
                    </p>
                  )}
                </>
              ) : (
                <p className="px-3 py-3 text-xs text-muted-foreground text-center">
                  Tidak ada lokasi ditemukan
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Memuat data...
        </div>
      ) : mode === 'view' ? (
        <>
          {/* Tabs per tanggal dalam range */}
          {getDatesBetween(dateRange.from, dateRange.to).length > 1 && (
            <div className="flex flex-wrap gap-1 border-b border-border pb-2">
              {getDatesBetween(dateRange.from, dateRange.to).map((date) => {
                const key = toFilterKey(date);
                const count = allRecords.filter(
                  (r) => normalizeDate(r.target_online_original ?? '') === key,
                ).length;
                const isActive = isSameDay(date, selectedTabDate);
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedTabDate(date)}
                    className={[
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                  >
                    {format(date, 'EEE dd/MM', { locale: id })}
                    {count > 0 && (
                      <span className={[
                        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                        isActive ? 'bg-primary-foreground/20' : 'bg-muted',
                      ].join(' ')}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-base font-medium">Tidak ada TT</p>
              <p className="text-sm mt-1">
                Tidak ada TT dengan target online {toFilterKey(selectedTabDate)}
              </p>
            </div>
          ) : (
            <RecapTable
              key={filterKey}
              records={filtered}
              poList={poList}
              initialHighlightId={pendingHighlight}
            />
          )}
        </>
      ) : captureTab === 'daily' ? (
        <div className="overflow-x-auto pb-3">
          {totalInRange === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-base font-medium">Tidak ada TT dalam range ini</p>
            </div>
          ) : (
            /* Preview capture — tampilkan semua section */
            <div style={{ width: '1400px', backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', fontSize: '11px' }}>
              <CaptureRangeHeader dateRange={dateRange} lastUploadTime={lastUploadTime} totalTT={totalInRange} />
              <KPICaptureCards kpi={kpi} />
              {getDatesBetween(dateRange.from, dateRange.to).map((date, idx) => (
                <DateSectionCapture
                  key={date.toISOString()}
                  date={date}
                  records={allRecords}
                  poList={poList}
                  isFirst={idx === 0}
                  siteNotes={siteNotes}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Closed Today preview */
        <div className="overflow-x-auto pb-3">
          {closedTodayRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm font-medium">Belum ada TT yang closed</p>
            </div>
          ) : (
            <ClosedTodayCaptureMode
              records={closedTodayRecords}
              poList={poList}
              selectedDate={toFilterKey(new Date())}
              lastUploadTime={lastUploadTime}
              kpi={closedTodayKPI}
            />
          )}
        </div>
      )}

      {/* ── Hidden div — Daily Recap multi-section (KPI + sections per tanggal) ── */}
      {totalInRange > 0 && (
        <div
          ref={combinedRef}
          style={{
            width: '1400px',
            backgroundColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '11px',
            color: '#000',
            position: 'absolute',
            left: '-9999px',
            top: 0,
          }}
        >
          <CaptureRangeHeader dateRange={dateRange} lastUploadTime={lastUploadTime} totalTT={totalInRange} />
          <KPICaptureCards kpi={kpi} />
          {getDatesBetween(dateRange.from, dateRange.to).map((date, idx) => (
            <DateSectionCapture
              key={date.toISOString()}
              date={date}
              records={allRecords}
              poList={poList}
              isFirst={idx === 0}
              siteNotes={siteNotes}
            />
          ))}
        </div>
      )}

      {/* ── Hidden div — Closed Today (KPI + Table) ── */}
      {closedTodayRecords.length > 0 && (
        <div
          ref={closedTodayRef}
          style={{
            width: '1400px',
            backgroundColor: '#ffffff',
            fontFamily: 'Arial, sans-serif',
            fontSize: '11px',
            color: '#000',
            position: 'absolute',
            left: '-9999px',
            top: 0,
          }}
        >
          <ClosedTodayKPICards kpi={closedTodayKPI} />
          <ClosedTodayCaptureMode
            records={closedTodayRecords}
            poList={poList}
            selectedDate={filterKey}
            lastUploadTime={lastUploadTime}
            kpi={closedTodayKPI}
          />
        </div>
      )}
    </div>
  );
}
