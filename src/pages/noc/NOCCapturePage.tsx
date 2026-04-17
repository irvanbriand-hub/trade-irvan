import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, addDays, parseISO, startOfDay, isAfter } from 'date-fns';
import { id } from 'date-fns/locale';
import { useTTRecords } from '@/lib/noc/hooks/useTTRecords';
import { usePOList } from '@/lib/noc/hooks/usePOList';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { normalizeDate } from '@/lib/noc/queries';
import { RecapCaptureMode } from '@/components/noc/RecapCaptureMode';
import { ClosedTodayCaptureMode } from '@/components/noc/ClosedTodayCaptureMode';
import type { ClosedTodayKPI } from '@/components/noc/ClosedTodayCaptureMode';
import type { TTRecordDB, SiteNote } from '@/lib/noc/types';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toFilterKey(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

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

function MultidaySection({
  date,
  records,
  poList,
  siteNotes,
  isFirst,
}: {
  date: Date;
  records: TTRecordDB[];
  poList: ReturnType<typeof Array.from>;
  siteNotes: SiteNote[];
  isFirst: boolean;
}) {
  const key = toFilterKey(date);
  const dateRecords = records.filter(
    (r) => normalizeDate(r.target_online_original ?? '') === key,
  );
  if (dateRecords.length === 0) return null;

  const openCount = dateRecords.filter((r) => r.status === 'OPEN').length;
  const closedCount = dateRecords.filter((r) => r.status === 'CLOSED').length;
  const dayName = format(date, 'EEEE', { locale: id });
  const dateFormatted = format(date, 'dd MMMM yyyy', { locale: id });

  return (
    <div>
      {!isFirst && <div style={{ height: '2px', backgroundColor: '#e2e8f0' }} />}
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
          <span style={{ backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
            🔴 {openCount} Open
          </span>
          <span style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
            ✅ {closedCount} Closed
          </span>
          <span style={{ backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', fontWeight: '700' }}>
            📋 {dateRecords.length} Total
          </span>
        </div>
      </div>
      <RecapCaptureMode
        records={dateRecords}
        poList={poList as any}
        selectedDate={key}
        renderMode="section"
        siteNotes={siteNotes}
      />
    </div>
  );
}

function getCloseType(r: TTRecordDB): 'noc' | 'om' | 'om-visit' | null {
  if (r.status !== 'CLOSED') return null;
  if (r.down_time <= 3) return 'noc';
  if ((r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN')) return 'om-visit';
  return 'om';
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

// ─── KPI Cards — Daily Recap (light theme, untuk capture) ────────────────────

function KPICaptureCards({ kpi }: { kpi: KPIData }) {
  const row1 = [
    { label: 'Total TT',    value: kpi.totalTT,    valueColor: '#1e293b' },
    { label: 'Open',        value: kpi.open,        valueColor: '#b91c1c' },
    { label: 'Closed',      value: kpi.closed,      valueColor: '#15803d' },
    { label: 'Overdue 8h',  value: kpi.overdueGt8,  valueColor: '#c2410c' },
    { label: 'Overdue 30h', value: kpi.overdueGt30, valueColor: '#991b1b' },
  ];
  const row2 = [
    { label: 'Close NOC',             value: kpi.closeNOC,          valueColor: '#1d4ed8' },
    { label: 'Close O&M',             value: kpi.closeOM,            valueColor: '#b45309' },
    { label: 'O&M Visit',             value: kpi.closeOMVisit,       valueColor: '#6d28d9' },
    { label: 'Target Hari Ini',       value: kpi.targetOnlineToday,  valueColor: '#0369a1' },
    { label: 'Close Target Hari Ini', value: kpi.closeTargetToday,   valueColor: '#047857' },
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

// ─── KPI Cards — Closed Today (2 section, light theme, untuk capture) ────────

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
    { label: 'Target Hari Ini',       value: String(kpi.totalTargetHariIni), valueColor: '#1e293b', subtitle: 'Semua status' },
    { label: 'Closed Hari Ini',       value: String(kpi.closedHariIni),      valueColor: '#15803d', subtitle: 'Target hari ini' },
    { label: 'Resolution Rate Today', value: `${kpi.resolutionRate}%`,        valueColor: resColor,  subtitle: `${kpi.closedHariIni} / ${kpi.totalTargetHariIni}` },
  ];

  const sectionLabel = (text: string) => (
    <div style={{ fontSize: '9px', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#6c757d', marginBottom: '6px' }}>
      {text}
    </div>
  );

  return (
    <div style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #cbd5e1' }}>
      <div style={{ padding: '10px 12px 6px' }}>
        {sectionLabel('Keseluruhan Closed')}
        {renderCards(section1, 5)}
      </div>
      <div style={{ height: '1px', backgroundColor: '#dee2e6', margin: '0 12px' }} />
      <div style={{ padding: '6px 12px 10px' }}>
        {sectionLabel(`Hari Ini — ${todayLabel}`)}
        {renderCards(section2, 3)}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NOCCapturePage() {
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'daily';
  const dateParam = searchParams.get('date') || 'today';
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const { data: allRecords = [], isLoading: loadingRecords } = useTTRecords();
  const { data: poList = [], isLoading: loadingPO } = usePOList();
  const { siteNotes } = useNOC();

  const isLoading = loadingRecords || loadingPO;

  const targetDate = useMemo(() => {
    if (dateParam === 'tomorrow') return addDays(new Date(), 1);
    if (dateParam === '2days') return addDays(new Date(), 2);
    if (dateParam === 'today') return new Date();
    try {
      return parseISO(dateParam);
    } catch {
      return new Date();
    }
  }, [dateParam]);

  const multidayRange = useMemo(() => {
    if (type !== 'multiday' || !fromParam || !toParam) return null;
    try {
      return { from: parseISO(fromParam), to: parseISO(toParam) };
    } catch {
      return null;
    }
  }, [type, fromParam, toParam]);

  const filterKey = toFilterKey(targetDate);

  const dailyRecords = useMemo(
    () => allRecords.filter((r) => normalizeDate(r.target_online_original ?? '') === filterKey),
    [allRecords, filterKey],
  );

  const closedRecords = useMemo(
    () => allRecords.filter((r) => r.status === 'CLOSED' && r.down_time >= 3),
    [allRecords],
  );

  const kpi = useMemo(() => computeKPI(allRecords, filterKey), [allRecords, filterKey]);

  const closedKPI: ClosedTodayKPI = useMemo(() => {
    const todayKey = toFilterKey(new Date());
    const todayRecords = allRecords.filter(
      (r) => normalizeDate(r.target_online_original ?? '') === todayKey,
    );
    const closedHariIni = todayRecords.filter(
      (r) => r.status === 'CLOSED' && r.down_time >= 3,
    ).length;
    return {
      totalClosed: closedRecords.length,
      closeNOC: allRecords.filter((r) => r.status === 'CLOSED' && r.down_time <= 2).length,
      closeVisit: closedRecords.filter((r) =>
        (r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN'),
      ).length,
      overdueGte8: closedRecords.filter((r) => r.down_time >= 8).length,
      overdueGte30: closedRecords.filter((r) => r.down_time >= 30).length,
      totalTargetHariIni: todayRecords.length,
      closedHariIni,
      resolutionRate:
        todayRecords.length > 0 ? Math.round((closedHariIni / todayRecords.length) * 100) : 0,
    };
  }, [allRecords, closedRecords]);

  if (isLoading) {
    return (
      <div
        id="capture-loading"
        style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#333' }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      id="capture-ready"
      style={{
        width: '1400px',
        backgroundColor: '#ffffff',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {type === 'daily' && (
        <>
          <KPICaptureCards kpi={kpi} />
          <RecapCaptureMode
            records={dailyRecords}
            poList={poList}
            selectedDate={filterKey}
            siteNotes={siteNotes}
          />
        </>
      )}
      {type === 'closed' && (
        <>
          <ClosedTodayKPICards kpi={closedKPI} />
          <ClosedTodayCaptureMode
            records={closedRecords}
            poList={poList}
            selectedDate={filterKey}
            kpi={closedKPI}
          />
        </>
      )}
      {type === 'multiday' && multidayRange && (
        <>
          <KPICaptureCards kpi={kpi} />
          {getDatesBetween(multidayRange.from, multidayRange.to).map((date, idx) => (
            <MultidaySection
              key={date.toISOString()}
              date={date}
              records={allRecords}
              poList={poList}
              siteNotes={siteNotes}
              isFirst={idx === 0}
            />
          ))}
        </>
      )}
    </div>
  );
}
