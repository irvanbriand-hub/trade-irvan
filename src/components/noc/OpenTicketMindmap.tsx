import { useMemo } from 'react';
import { TicketMindmap, type MindNode } from './TicketMindmap';
import type { TTRecordDB } from '@/lib/noc/types';

interface OpenTicketMindmapProps {
  data: TTRecordDB[];
}

export function OpenTicketMindmap({ data }: OpenTicketMindmapProps) {
  const { root, total } = useMemo(() => {
    const open = data.filter((r) => r.status === 'OPEN');
    const safe = open.filter((r) => r.down_time <= 7);
    const overdue = open.filter((r) => r.down_time > 7);
    const warn = overdue.filter((r) => r.down_time <= 10);
    const crit = overdue.filter((r) => r.down_time >= 11);
    const node: MindNode = {
      id: 'root',
      label: 'Open TT',
      sub: 'total aktif',
      count: open.length,
      rows: open,
      tone: 'danger',
      children: [
        { id: 'safe', label: 'Tidak Overdue', sub: '≤ 7 hari', count: safe.length, rows: safe, tone: 'green' },
        {
          id: 'overdue',
          label: 'Overdue',
          sub: '> 7 hari',
          count: overdue.length,
          rows: overdue,
          tone: 'orange',
          children: [
            { id: 'warn', label: 'Perlu Atensi', sub: '8–10 hari', count: warn.length, rows: warn, tone: 'amber' },
            { id: 'crit', label: 'Kritis', sub: '> 10 hari', count: crit.length, rows: crit, tone: 'red' },
          ],
        },
      ],
    };
    return { root: node, total: open.length };
  }, [data]);

  return (
    <TicketMindmap
      title="Peta Tiket Open — Aging"
      subtitle="Overdue = umur > 7 hari · Kritis = umur > 10 hari"
      root={root}
      total={total}
    />
  );
}
