import type React from 'react';
import { getPO } from '@/lib/noc/classifiers';
import { getEffectiveTargetOnlineDB } from '@/lib/noc/queries';
import type { TTRecordDB, PO } from '@/lib/noc/types';

export interface ClosedTodayKPI {
  // Section 1 — Keseluruhan DB
  totalClosed: number;
  closeNOC: number;
  closeVisit: number;
  overdueGte8: number;
  overdueGte30: number;
  // Section 2 — Hari Ini
  totalTargetHariIni: number;
  closedHariIni: number;
  resolutionRate: number;
}

interface ClosedTodayCaptureModeProps {
  /** Records: semua CLOSED + down_time >= 3 (tanpa filter tanggal) */
  records: TTRecordDB[];
  poList: PO[];
  selectedDate: string;
  lastUploadTime?: string;
  kpi: ClosedTodayKPI;
}

interface POGroup {
  poName: string;
  po: PO | null;
  provinsiMap: Map<string, TTRecordDB[]>;
  ttCount: number;
}

function groupByPO(records: TTRecordDB[], poList: PO[]): POGroup[] {
  const map = new Map<string, { po: PO | null; provinsiMap: Map<string, TTRecordDB[]> }>();

  for (const r of records) {
    const po = getPO(r.provinsi ?? '', r.kabupaten ?? '', poList);
    const poName = po?.name ?? '— Tidak Terpetakan';
    const prov = r.provinsi || '— Provinsi Tidak Dikenal';

    if (!map.has(poName)) map.set(poName, { po, provinsiMap: new Map() });
    const entry = map.get(poName)!;
    if (!entry.provinsiMap.has(prov)) entry.provinsiMap.set(prov, []);
    entry.provinsiMap.get(prov)!.push(r);
  }

  return Array.from(map.entries())
    .map(([poName, { po, provinsiMap }]) => ({
      poName,
      po,
      provinsiMap,
      ttCount: Array.from(provinsiMap.values()).flat().length,
    }))
    .sort((a, b) => b.ttCount - a.ttCount);
}

function normalizeKabupaten(kab: string): string {
  return kab.replace(/^KAB\.\s*/i, '').replace(/^KOTA\s*/i, '').trim().toUpperCase();
}

function getKabupatenLabel(provinsi: string, po: PO | null, rows: TTRecordDB[]): string {
  if (!po?.kabupaten_coverage?.length) return provinsi;
  const coverageSet = new Set(po.kabupaten_coverage.map((k) => k.toUpperCase()));
  const activeKabs = [
    ...new Set(
      rows
        .filter((tt) => coverageSet.has(normalizeKabupaten(tt.kabupaten ?? '')))
        .map((tt) => normalizeKabupaten(tt.kabupaten ?? '')),
    ),
  ];
  if (activeKabs.length === 0) return provinsi;
  return `${provinsi} — ${activeKabs.join(', ')}`;
}

function splitPOsToColumns(groups: POGroup[]): [POGroup[], POGroup[]] {
  const left: POGroup[] = [];
  const right: POGroup[] = [];
  let leftCount = 0;
  let rightCount = 0;

  for (const g of groups) {
    if (leftCount <= rightCount) {
      left.push(g);
      leftCount += g.ttCount;
    } else {
      right.push(g);
      rightCount += g.ttCount;
    }
  }

  return [left, right];
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  rowBase: {
    display: 'flex' as const,
    alignItems: 'stretch' as const,
    borderBottom: '1px solid #eee',
    fontSize: '11px',
    color: '#000',
  },
  cell: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    minHeight: '28px',
    padding: '0 8px',
  },
  cellNameFlex: {
    flex: 1,
    minWidth: 0,
  },
  cellDowntime: {
    width: '95px',
    flexShrink: 0,
    justifyContent: 'center' as const,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
  },
  cellTarget: {
    width: '110px',
    flexShrink: 0,
    justifyContent: 'center' as const,
    textAlign: 'center' as const,
  },
  headerRow: {
    display: 'flex' as const,
    backgroundColor: '#4CAF50',
    color: '#fff',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    borderBottom: '1px solid #388E3C',
  },
  poRow: {
    fontWeight: 'bold' as const,
    fontSize: '12px',
    backgroundColor: '#444',
    color: '#fff',
    padding: '4px 8px',
    minHeight: '28px',
    display: 'flex' as const,
    alignItems: 'center' as const,
  },
  provinsiRow: {
    fontWeight: 'bold' as const,
    fontSize: '10px',
    backgroundColor: '#C8E6C9',
    color: '#1B5E20',
    padding: '5px 8px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    display: 'flex' as const,
    alignItems: 'center' as const,
  },
};

// ─── ClosedColumn ─────────────────────────────────────────────────────────────
// Semua record di sini sudah CLOSED. Variasi hanya pada badge dan bold overdue.

// Grid columns: site name flex | aging 70px | target 120px
const ROW_GRID: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 70px 120px',
  padding: '3px 8px',
  borderBottom: '1px solid #eee',
  minHeight: '28px',
  alignItems: 'center',
};

const CELL_CENTER: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
};

function ClosedColumn({ groups }: { groups: POGroup[] }) {
  return (
    <div>
      {/* Column header — grid aligned */}
      <div style={{ ...ROW_GRID, padding: '0', backgroundColor: '#4CAF50', color: '#fff', fontWeight: 'bold', fontSize: '11px', borderBottom: '1px solid #388E3C' }}>
        <div style={{ padding: '5px 8px' }}>SITE NAME</div>
        <div style={{ ...CELL_CENTER, padding: '5px 8px' }}>TICKET AGING</div>
        <div style={{ ...CELL_CENTER, padding: '5px 8px' }}>TARGET ONLINE</div>
      </div>

      {groups.map((group) => {
        const sortedProvinsi = Array.from(group.provinsiMap.entries()).sort(([a], [b]) =>
          a.localeCompare(b),
        );

        return (
          <div key={group.poName}>
            {/* PO row */}
            <div style={S.poRow}>{group.poName}</div>

            {sortedProvinsi.map(([prov, rows]) => {
              const sortedRows = [...rows].sort((a, b) => b.down_time - a.down_time);
              return (
                <div key={prov}>
                  {/* Provinsi row */}
                  <div style={S.provinsiRow}>{getKabupatenLabel(prov, group.po, rows)}</div>

                  {/* Site rows — semua CLOSED, grid layout */}
                  {sortedRows.map((r) => {
                    const isVisit = (r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN');
                    const wasReschedule = r.is_manually_edited && !!r.reschedule_note;
                    const agingWeight = r.down_time >= 30 ? '700' : r.down_time >= 8 ? '600' : '400';

                    return (
                      <div key={r.id} style={ROW_GRID}>
                        {/* SITE NAME + badges */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          color: '#FF0000',
                          textDecoration: 'line-through',
                          flexWrap: 'wrap' as const,
                        }}>
                          <span>{r.site_name}</span>

                          {isVisit && (
                            <span style={{
                              fontSize: '8px', fontWeight: '700',
                              padding: '1px 5px', borderRadius: '3px',
                              backgroundColor: '#E9D5FF', color: '#6B21A8',
                              border: '1px solid #C084FC',
                              textDecoration: 'none', flexShrink: 0,
                            }}>
                              VISIT
                            </span>
                          )}

                          {wasReschedule && (
                            <span style={{
                              fontSize: '8px', fontWeight: '700',
                              padding: '1px 5px', borderRadius: '3px',
                              backgroundColor: '#FFF3CD', color: '#856404',
                              border: '1px solid #FFCA2C',
                              textDecoration: 'none', flexShrink: 0,
                            }}>
                              RESCHEDULE
                            </span>
                          )}
                        </div>

                        {/* TICKET AGING */}
                        <div style={{
                          ...CELL_CENTER,
                          color: '#FF0000',
                          textDecoration: 'line-through',
                          fontWeight: agingWeight,
                        }}>
                          {r.down_time}
                        </div>

                        {/* TARGET ONLINE */}
                        <div style={{
                          ...CELL_CENTER,
                          color: '#FF0000',
                          fontWeight: '700',
                          textDecoration: 'line-through',
                        }}>
                          CLOSED
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ClosedTodayCaptureMode({
  records,
  poList,
  selectedDate,
  lastUploadTime,
  kpi,
}: ClosedTodayCaptureModeProps) {
  const groups = groupByPO(records, poList);
  const [leftGroups, rightGroups] = splitPOsToColumns(groups);

  return (
    <div
      style={{
        width: '1400px',
        backgroundColor: '#fff',
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: '#000',
        border: '1px solid #ccc',
      }}
    >
      {/* Header — dark, berbeda dari Daily Recap */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '2px solid #0f172a',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#1e293b',
          color: '#ffffff',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '700' }}>
          NOC Closed Report{lastUploadTime ? ` | Update: ${lastUploadTime}` : ''}
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
          {kpi.totalClosed} Total Closed &nbsp;|&nbsp; Resolution Today: {kpi.resolutionRate}%
        </div>
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClosedColumn groups={leftGroups} />
        </div>

        {/* Red divider */}
        <div style={{ width: '4px', backgroundColor: '#FF0000', alignSelf: 'stretch', flexShrink: 0 }} />

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ClosedColumn groups={rightGroups} />
        </div>
      </div>
    </div>
  );
}
