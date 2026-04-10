import { useRef, useState, useMemo } from 'react';
import { format, addDays, subDays } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Camera, LayoutGrid, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { normalizeDate } from '@/lib/noc/queries';
import { RecapTable } from '@/components/noc/RecapTable';
import { RecapCaptureMode } from '@/components/noc/RecapCaptureMode';
import type { TTRecordDB } from '@/lib/noc/types';

function formatDateLabel(date: Date): string {
  return format(date, 'EEEE, dd MMMM yyyy', { locale: id });
}

function toFilterKey(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

function getCloseType(r: TTRecordDB): 'noc' | 'om' | 'om-visit' | null {
  if (r.status !== 'CLOSED') return null;
  if (r.down_time <= 3) return 'noc';
  if ((r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN')) return 'om-visit';
  return 'om';
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

// ─── KPI Cards (light theme, untuk capture) ──────────────────────────────────

function KPICaptureCards({ kpi }: { kpi: KPIData }) {
  // Border top semua pakai slate — clean & profesional
  // Nilai pakai warna semantic muted hanya untuk angka yang perlu perhatian
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NocRecap() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [mode, setMode] = useState<'view' | 'capture'>('view');
  const combinedRef = useRef<HTMLDivElement>(null);

  const { data: allRecords = [], isLoading } = useTTRecords();
  const { data: poList = [] } = usePOList();
  const { lastUploadTime } = useNOC();

  const filterKey = toFilterKey(selectedDate);

  const filtered = allRecords.filter((r) => {
    const orig = normalizeDate(r.target_online_original ?? '');
    return orig === filterKey;
  });

  const openCount = filtered.filter((r) => r.status === 'OPEN').length;
  const closedCount = filtered.filter((r) => r.status === 'CLOSED').length;

  const kpi = useMemo(() => computeKPI(allRecords, filterKey), [allRecords, filterKey]);

  async function handleDownloadCombined() {
    const el = combinedRef.current;
    if (!el) return;

    // Temporarily bring on-screen so html2canvas can render it
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
      link.download = `noc-recap-${filterKey.replace(/\//g, '-')}.png`;
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
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-[220px] rounded-md border border-border bg-muted/40 px-3 py-1.5 text-center text-sm font-medium">
            {formatDateLabel(selectedDate)}
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="h-8"
          onClick={() => setSelectedDate(new Date())}
        >
          Hari Ini
        </Button>

        {/* Summary */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{filtered.length}</span> TT target{' '}
            {format(selectedDate, 'dd/MM/yyyy')} |{' '}
            <span className="text-yellow-400 font-medium">{openCount} open</span> |{' '}
            <span className="text-green-400 font-medium">{closedCount} closed</span>
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

          {/* Download combined — only in capture mode */}
          {mode === 'capture' && filtered.length > 0 && (
            <Button size="sm" className="h-8 gap-1.5" onClick={handleDownloadCombined}>
              <Download className="h-3.5 w-3.5" />
              Download PNG
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          Memuat data...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-base font-medium">Tidak ada TT</p>
          <p className="text-sm mt-1">
            Tidak ada TT dengan target online {format(selectedDate, 'dd/MM/yyyy')}
          </p>
        </div>
      ) : mode === 'view' ? (
        <RecapTable records={filtered} poList={poList} />
      ) : (
        /* Capture mode — show preview of the rekap table */
        <div className="overflow-x-auto pb-3">
          <RecapCaptureMode
            records={filtered}
            poList={poList}
            selectedDate={filterKey}
            lastUploadTime={lastUploadTime}
          />
        </div>
      )}

      {/* ── Hidden combined capture div (KPI + Rekap) ── */}
      {filtered.length > 0 && (
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
          {/* KPI Cards */}
          <KPICaptureCards kpi={kpi} />

          {/* Rekap Table */}
          <RecapCaptureMode
            records={filtered}
            poList={poList}
            selectedDate={filterKey}
            lastUploadTime={lastUploadTime}
          />
        </div>
      )}
    </div>
  );
}
