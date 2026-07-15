import { useMemo } from 'react';
import { TicketMindmap, type MindNode, type MindTone } from './TicketMindmap';
import { AREA_MAP, AREA_NAMES } from '@/lib/noc/constants';
import type { TTRecordDB } from '@/lib/noc/types';

interface AreaTicketMindmapProps {
  data: TTRecordDB[];
}

function getArea(provinsi: string | null): 0 | 1 | 2 | 3 {
  const a = AREA_MAP[(provinsi ?? '').toUpperCase()];
  return (a === 1 || a === 2 || a === 3 ? a : 0) as 0 | 1 | 2 | 3;
}

const AREA_TONE: Record<number, MindTone> = { 1: 'blue', 2: 'violet', 3: 'orange', 0: 'slate' };

// Total Tiket → Area → Open & Closed.
export function AreaTicketMindmap({ data }: AreaTicketMindmapProps) {
  const root = useMemo<MindNode>(() => {
    const build = (area: 0 | 1 | 2 | 3): MindNode => {
      const subset = data.filter((r) => getArea(r.provinsi) === area);
      const openRows = subset.filter((r) => r.status === 'OPEN');
      const openLt3 = openRows.filter((r) => r.down_time < 3);
      const openGte3 = openRows.filter((r) => r.down_time >= 3);
      const closed = subset.filter((r) => r.status === 'CLOSED');
      return {
        id: `area${area}`,
        label: area === 0 ? 'Tak Terpetakan' : `Area ${area}`,
        sub: area === 0 ? '' : AREA_NAMES[area],
        count: subset.length,
        rows: subset,
        tone: AREA_TONE[area],
        children: [
          {
            id: `area${area}-open`,
            label: 'Open',
            sub: '',
            count: openRows.length,
            rows: openRows,
            tone: 'red',
            children: [
              { id: `area${area}-open-lt3`, label: '< 3 hari', sub: '', count: openLt3.length, rows: openLt3, tone: 'amber' },
              { id: `area${area}-open-gte3`, label: '≥ 3 hari', sub: '', count: openGte3.length, rows: openGte3, tone: 'red' },
            ],
          },
          { id: `area${area}-closed`, label: 'Closed', sub: '', count: closed.length, rows: closed, tone: 'green' },
        ],
      };
    };

    const areas: MindNode[] = [build(1), build(2), build(3)];
    const unmapped = build(0);
    if (unmapped.count > 0) areas.push(unmapped);

    return {
      id: 'root',
      label: 'Total Tiket',
      sub: 'semua status',
      count: data.length,
      rows: data,
      tone: 'primary',
      children: areas,
    };
  }, [data]);

  return (
    <TicketMindmap
      title="Peta Tiket per Area"
      subtitle="Sebaran Open vs Closed di tiap area"
      root={root}
      total={data.length}
    />
  );
}
