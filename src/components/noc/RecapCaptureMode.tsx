import { forwardRef } from 'react';
import { getPO } from '@/lib/noc/classifiers';
import { getEffectiveTargetOnlineDB } from '@/lib/noc/queries';
import type { TTRecordDB, PO, SiteNote } from '@/lib/noc/types';

interface RecapCaptureModeProps {
  records: TTRecordDB[];
  poList: PO[];
  selectedDate: string;
  lastUploadTime?: string;
  siteNotes?: SiteNote[];
  /** 'standalone' (default): render outer wrapper + header. 'section': hanya 2-kolom layout tanpa wrapper/header. */
  renderMode?: 'standalone' | 'section';
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

/**
 * Greedy split: balance 2 kolom berdasarkan total TT count
 */
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
  // Row wrapper: flexbox so cells are vertically centered
  rowBase: {
    display: 'flex' as const,
    alignItems: 'stretch' as const,
    borderBottom: '1px solid #eee',
    fontSize: '11px',
    color: '#000',
  },
  // Shared cell base
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
  // Header row
  headerRow: {
    display: 'flex' as const,
    backgroundColor: '#4CAF50',
    color: '#fff',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    borderBottom: '1px solid #388E3C',
  },
  // PO / provinsi rows (full-width)
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
  rescheduleCell: {
    backgroundColor: '#FFF176',
    fontSize: '9px',
    lineHeight: '1.4',
    flexDirection: 'column' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    textAlign: 'center' as const,
    padding: '3px 6px',
    gap: '1px',
  },
};

// ─── RecapColumn ─────────────────────────────────────────────────────────────

function RecapColumn({ groups, siteNotesMap }: { groups: POGroup[]; siteNotesMap: Map<string, string> }) {
  return (
    <div>
      {/* Column header */}
      <div style={S.headerRow}>
        <div style={{ ...S.cell, ...S.cellNameFlex }}>SITE NAME</div>
        <div style={{ ...S.cell, ...S.cellDowntime }}>TICKET AGING</div>
        <div style={{ ...S.cell, ...S.cellTarget }}>TARGET ONLINE</div>
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

                  {/* Site rows */}
                  {sortedRows.map((r) => {
                    const isClosed = r.status === 'CLOSED';
                    const effectiveTarget = getEffectiveTargetOnlineDB(r);
                    const isReschedule = !isClosed && !!r.reschedule_note;
                    const isVisit = isClosed && (r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN');
                    const siteNote = r.site_id ? siteNotesMap.get(r.site_id) : undefined;

                    if (isClosed) {
                      return (
                        <div key={r.id}>
                          <div style={{ ...S.rowBase, textDecoration: 'line-through', color: '#FF0000', borderBottom: siteNote ? 'none' : S.rowBase.borderBottom }}>
                            <div style={{ ...S.cell, ...S.cellNameFlex }}>
                              <span>{r.site_name}</span>
                              {isVisit && (
                                <span style={{
                                  marginLeft: '6px',
                                  fontSize: '10px',
                                  fontWeight: 'bold',
                                  color: '#7B1FA2',
                                  textDecoration: 'none',
                                }}>[VISIT]</span>
                              )}
                            </div>
                            <div style={{ ...S.cell, ...S.cellDowntime }}>{r.down_time}</div>
                            <div style={{ ...S.cell, ...S.cellTarget }}>CLOSED</div>
                          </div>
                          {siteNote && (
                            <div style={{ backgroundColor: '#EFF6FF', borderLeft: '3px solid #3B82F6', padding: '4px 8px 4px 12px', fontSize: '10px', color: '#1e3a5f', fontStyle: 'italic', lineHeight: '1.4', borderBottom: '1px solid #eee' }}>
                              » {siteNote}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (isReschedule) {
                      return (
                        <div key={r.id}>
                          <div style={{
                            display: 'table',
                            width: '100%',
                            borderBottom: siteNote ? 'none' : '1px solid #eee',
                            fontSize: '11px',
                            color: '#000',
                          }}>
                            <div style={{
                              display: 'table-cell',
                              verticalAlign: 'middle',
                              padding: '4px 8px',
                            }}>
                              <span>{r.site_name}</span>
                              <span style={{
                                marginLeft: '6px',
                                fontSize: '10px',
                                fontWeight: 'bold',
                                color: '#D97706',
                              }}>[RESCHEDULE]</span>
                            </div>
                            <div style={{
                              display: 'table-cell',
                              verticalAlign: 'middle',
                              width: '95px',
                              textAlign: 'center',
                              padding: '4px 8px',
                              whiteSpace: 'nowrap',
                            }}>
                              {r.down_time}
                            </div>
                            <div style={{
                              display: 'table-cell',
                              verticalAlign: 'middle',
                              width: '110px',
                              textAlign: 'center',
                              backgroundColor: '#FFF176',
                              fontSize: '9px',
                              lineHeight: '1.4',
                              padding: '3px 6px',
                            }}>
                              <div>{r.reschedule_note}</div>
                              {effectiveTarget && (
                                <div style={{ color: '#5D4037', fontWeight: 'bold' }}>({effectiveTarget})</div>
                              )}
                            </div>
                          </div>
                          {siteNote && (
                            <div style={{ backgroundColor: '#EFF6FF', borderLeft: '3px solid #3B82F6', padding: '4px 8px 4px 12px', fontSize: '10px', color: '#1e3a5f', fontStyle: 'italic', lineHeight: '1.4', borderBottom: '1px solid #eee' }}>
                              » {siteNote}
                            </div>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div key={r.id}>
                        <div style={{ ...S.rowBase, borderBottom: siteNote ? 'none' : S.rowBase.borderBottom }}>
                          <div style={{ ...S.cell, ...S.cellNameFlex }}>{r.site_name}</div>
                          <div style={{ ...S.cell, ...S.cellDowntime }}>{r.down_time}</div>
                          <div style={{ ...S.cell, ...S.cellTarget }}>{effectiveTarget || '—'}</div>
                        </div>
                        {siteNote && (
                          <div style={{ backgroundColor: '#EFF6FF', borderLeft: '3px solid #3B82F6', padding: '4px 8px 4px 12px', fontSize: '10px', color: '#1e3a5f', fontStyle: 'italic', lineHeight: '1.4', borderBottom: '1px solid #eee' }}>
                            » {siteNote}
                          </div>
                        )}
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

export const RecapCaptureMode = forwardRef<HTMLDivElement, RecapCaptureModeProps>(
  ({ records, poList, selectedDate, lastUploadTime, siteNotes = [], renderMode = 'standalone' }, ref) => {
    const groups = groupByPO(records, poList);
    const [leftGroups, rightGroups] = splitPOsToColumns(groups);
    const siteNotesMap = new Map(siteNotes.map((n) => [n.site_id, n.note]));

    const openCount = records.filter((r) => r.status === 'OPEN').length;
    const closedCount = records.filter((r) => r.status === 'CLOSED').length;

    const twoColumns = (
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <RecapColumn groups={leftGroups} siteNotesMap={siteNotesMap} />
        </div>

        {/* Red divider */}
        <div style={{ width: '4px', backgroundColor: '#FF0000', alignSelf: 'stretch', flexShrink: 0 }} />

        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <RecapColumn groups={rightGroups} siteNotesMap={siteNotesMap} />
        </div>
      </div>
    );

    if (renderMode === 'section') {
      return <div ref={ref}>{twoColumns}</div>;
    }

    return (
      <div
        ref={ref}
        style={{
          width: '1400px',
          backgroundColor: '#fff',
          fontFamily: 'Arial, sans-serif',
          fontSize: '11px',
          color: '#000',
          border: '1px solid #ccc',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '8px 12px',
            borderBottom: '2px solid #333',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f5f5f5',
          }}
        >
          <strong style={{ fontSize: '13px' }}>
            NOC Daily Recap — Target Online: {selectedDate}{lastUploadTime ? ` | Update: ${lastUploadTime}` : ''}
          </strong>
          <span style={{ fontSize: '11px', color: '#555' }}>
            {openCount} Open &nbsp;|&nbsp; {closedCount} Closed &nbsp;|&nbsp; {records.length} Total TT
          </span>
        </div>

        {twoColumns}
      </div>
    );
  },
);

RecapCaptureMode.displayName = 'RecapCaptureMode';
