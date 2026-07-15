import { useMemo } from 'react';
import { TicketMindmap, type MindNode } from './TicketMindmap';
import type { TTRecordDB } from '@/lib/noc/types';

interface ClosedTicketMindmapProps {
  data: TTRecordDB[];
}

// Klasifikasi close mengikuti getCloseType di KpiCards:
//   NOC   = down_time <= 3 (close cepat)
//   O&M   = down_time > 3, dibagi Visit (tiket_internal mengandung "KUNJUNGAN") vs Non-Visit
export function ClosedTicketMindmap({ data }: ClosedTicketMindmapProps) {
  const { root, total } = useMemo(() => {
    const closed = data.filter((r) => r.status === 'CLOSED');
    const noc = closed.filter((r) => r.down_time <= 3);
    const om = closed.filter((r) => r.down_time > 3);
    const visit = om.filter((r) => (r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN'));
    const noVisit = om.filter((r) => !(r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN'));
    const node: MindNode = {
      id: 'root',
      label: 'Closed TT',
      sub: 'total closed',
      count: closed.length,
      rows: closed,
      tone: 'primary',
      children: [
        { id: 'noc', label: 'Close NOC', sub: '', count: noc.length, rows: noc, tone: 'blue' },
        {
          id: 'om',
          label: 'Close O&M',
          sub: '',
          count: om.length,
          rows: om,
          tone: 'violet',
          children: [
            { id: 'visit', label: 'Visit', sub: '', count: visit.length, rows: visit, tone: 'amber' },
            { id: 'novisit', label: 'Non-Visit', sub: '', count: noVisit.length, rows: noVisit, tone: 'green' },
          ],
        },
      ],
    };
    return { root: node, total: closed.length };
  }, [data]);

  return (
    <TicketMindmap
      title="Peta Tiket Closed — Jenis Penyelesaian"
      subtitle="NOC = close cepat (≤ 3 hari) · O&M = via teknisi lapangan"
      root={root}
      total={total}
    />
  );
}
