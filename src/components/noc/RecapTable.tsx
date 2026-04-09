import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AREA_NAMES } from '@/lib/noc/constants';
import { getPO } from '@/lib/noc/classifiers';
import { useUpdateTTRecord } from '@/lib/noc/hooks/useTTRecords';
import type { TTRecordDB, PO } from '@/lib/noc/types';

interface RecapTableProps {
  records: TTRecordDB[];
  poList: PO[];
}

interface POColumn {
  poName: string;
  po: PO | null;
  provinsiMap: Map<string, TTRecordDB[]>;
  openCount: number;
}

const areaColors: Record<number, string> = {
  1: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  2: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  3: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

function groupByPO(records: TTRecordDB[], poList: PO[]): POColumn[] {
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

  // Sort rows within each provinsi by down_time DESC
  for (const { provinsiMap } of map.values()) {
    for (const [prov, rows] of provinsiMap) {
      provinsiMap.set(prov, [...rows].sort((a, b) => b.down_time - a.down_time));
    }
  }

  return Array.from(map.entries())
    .map(([poName, { po, provinsiMap }]) => {
      const openCount = Array.from(provinsiMap.values())
        .flat()
        .filter((r) => r.status === 'OPEN').length;
      return { poName, po, provinsiMap, openCount };
    })
    .sort((a, b) => b.openCount - a.openCount);
}

function agingColor(days: number): string {
  if (days >= 30) return 'text-red-400';
  if (days >= 14) return 'text-amber-400';
  return 'text-muted-foreground';
}

// ─── Site Table Row ──────────────────────────────────────────────────────────

interface EditState {
  targetOnline: string;
  rescheduleNote: string;
}

function SiteTableRow({ record }: { record: TTRecordDB }) {
  const { mutate: updateRecord, isPending } = useUpdateTTRecord();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditState>({ targetOnline: '', rescheduleNote: '' });

  const isClosed = record.status === 'CLOSED';
  const isReschedule = !!record.reschedule_note;
  const isVisit = (record.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN');
  const effectiveTarget = record.is_manually_edited
    ? record.target_online_edited ?? record.target_online_original ?? ''
    : record.target_online_original ?? '';

  function startEdit() {
    setForm({ targetOnline: effectiveTarget, rescheduleNote: record.reschedule_note ?? '' });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveEdit() {
    updateRecord(
      { id: record.id, target_online_edited: form.targetOnline, reschedule_note: form.rescheduleNote },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (editing) {
    return (
      <tr className="bg-muted/20">
        <td colSpan={4} className="px-2 py-1.5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-foreground">{record.site_name}</span>
            <div className="flex gap-1.5 flex-wrap">
              <Input
                value={form.targetOnline}
                onChange={(e) => setForm((f) => ({ ...f, targetOnline: e.target.value }))}
                placeholder="Target online (dd/mm/yy)"
                className="h-6 text-xs px-2 w-36"
              />
              <Input
                value={form.rescheduleNote}
                onChange={(e) => setForm((f) => ({ ...f, rescheduleNote: e.target.value }))}
                placeholder="Catatan reschedule (opsional)"
                className="h-6 text-xs px-2 flex-1 min-w-[140px]"
              />
              <Button size="sm" className="h-6 px-2 text-xs gap-0.5" onClick={saveEdit} disabled={isPending}>
                <Check className="h-3 w-3" /> Simpan
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={cancelEdit}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const targetColor = isClosed
    ? 'text-green-400/70'
    : isReschedule
    ? 'text-amber-400'
    : 'text-muted-foreground';

  return (
    <tr
      className={[
        'group border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors',
        isReschedule && !isClosed ? 'bg-amber-500/5' : '',
      ].join(' ')}
    >
      {/* Lokasi */}
      <td className="px-2 py-1 align-top">
        <div className="flex items-start gap-1 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              {isClosed && <span className="text-green-400 font-bold text-[10px] shrink-0">✓</span>}
              {isReschedule && !isClosed && <span className="text-amber-400 text-[10px] shrink-0">⚠</span>}
              <span
                className={[
                  'text-xs break-words',
                  isClosed ? 'text-green-400' : isReschedule ? 'text-amber-300' : 'text-foreground',
                ].join(' ')}
              >
                {record.site_name}
              </span>
              {isVisit && isClosed && (
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[9px] px-1 py-0 h-3.5 shrink-0">
                  VISIT
                </Badge>
              )}
              {record.is_manually_edited && (
                <span className="text-[9px] text-muted-foreground shrink-0" title="Diedit manual">✏</span>
              )}
            </div>
            {isReschedule && !isClosed && (
              <p className="text-amber-400/80 text-[10px] mt-0.5 break-words leading-tight">
                {record.reschedule_note}
              </p>
            )}
          </div>
          {/* Edit button — visible on hover */}
          <button
            onClick={startEdit}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground mt-0.5"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      </td>

      {/* Target Online */}
      <td className="px-2 py-1 text-xs whitespace-nowrap align-top">
        <span className={targetColor}>{effectiveTarget || '—'}</span>
      </td>

      {/* Status */}
      <td className="px-2 py-1 align-top">
        {isClosed ? (
          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 h-4 font-medium">
            CLOSED
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0 h-4 font-medium">
            OPEN
          </Badge>
        )}
      </td>

      {/* Downtime */}
      <td className="px-2 py-1 text-xs text-right whitespace-nowrap align-top">
        <span className={agingColor(record.down_time)}>
          {record.down_time}h
        </span>
      </td>
    </tr>
  );
}

// ─── PO Block ────────────────────────────────────────────────────────────────

function POBlock({ col }: { col: POColumn }) {
  const sortedProvinsi = Array.from(col.provinsiMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="flex flex-col min-w-[380px] max-w-[460px] rounded-lg border border-border bg-card overflow-hidden shrink-0">
      {/* PO Header */}
      <div className="bg-slate-700/80 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-white text-sm truncate">👤 {col.poName}</span>
          <span className="text-xs text-slate-300 shrink-0">{col.openCount} open</span>
        </div>
        {col.po && (
          <Badge
            variant="outline"
            className={`mt-1 text-[10px] px-1.5 py-0 h-4 ${areaColors[col.po.area] ?? ''}`}
          >
            Area {col.po.area} — {AREA_NAMES[col.po.area]}
          </Badge>
        )}
      </div>

      {/* Table */}
      <div className="overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Lokasi
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                Tgt Online
              </th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                DT
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedProvinsi.map(([prov, rows]) => (
              <>
                <tr key={`prov-${prov}`} className="border-b border-border/50">
                  <td
                    colSpan={4}
                    className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'hsl(185 80% 60%)', backgroundColor: 'hsl(var(--card) / 0.6)' }}
                  >
                    {prov}
                  </td>
                </tr>
                {rows.map((r) => (
                  <SiteTableRow key={r.id} record={r} />
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RecapTable({ records, poList }: RecapTableProps) {
  const columns = groupByPO(records, poList);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {columns.length} PO · {records.length} TT
      </p>

      {/* Horizontal scroll grid */}
      <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: '200px' }}>
        {columns.map((col) => (
          <POBlock key={col.poName} col={col} />
        ))}
      </div>
    </div>
  );
}
