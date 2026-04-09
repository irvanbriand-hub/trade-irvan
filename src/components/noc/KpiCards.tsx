import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { normalizeDate, getEffectiveTargetOnlineDB } from '@/lib/noc/queries';
import type { TTRecordDB } from '@/lib/noc/types';

interface KpiCardsProps {
  data: TTRecordDB[];
}

function getCloseType(r: TTRecordDB): 'noc' | 'om' | 'om-visit' | null {
  if (r.status !== 'CLOSED') return null;
  if (r.down_time <= 3) return 'noc';
  if ((r.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN')) return 'om-visit';
  return 'om';
}

interface KpiCard {
  label: string;
  value: number;
  color: string;
}

export function KpiCards({ data }: KpiCardsProps) {
  const today = format(new Date(), 'dd/MM/yyyy');

  const { row1, row2 } = useMemo((): { row1: KpiCard[]; row2: KpiCard[] } => {
    const totalTT     = data.length;
    const open        = data.filter((r) => r.status === 'OPEN').length;
    const closed      = data.filter((r) => r.status === 'CLOSED').length;
    const overdueGt8  = data.filter((r) => r.status === 'OPEN' && r.down_time > 8).length;
    const overdueGt30 = data.filter((r) => r.status === 'OPEN' && r.down_time > 30).length;
    const closeNOC    = data.filter((r) => getCloseType(r) === 'noc').length;
    const closeOM     = data.filter((r) => getCloseType(r) === 'om').length;
    const closeVisit  = data.filter((r) => getCloseType(r) === 'om-visit').length;
    const targetToday = data.filter((r) => normalizeDate(getEffectiveTargetOnlineDB(r)) === today).length;
    const closeTarget = data.filter(
      (r) => normalizeDate(getEffectiveTargetOnlineDB(r)) === today && r.status === 'CLOSED',
    ).length;

    return {
      row1: [
        { label: 'Total TT',     value: totalTT,     color: 'text-foreground' },
        { label: 'Open',         value: open,         color: 'text-red-400' },
        { label: 'Closed',       value: closed,       color: 'text-green-400' },
        { label: 'Overdue >8h',  value: overdueGt8,   color: 'text-orange-400' },
        { label: 'Overdue >30h', value: overdueGt30,  color: 'text-red-600' },
      ],
      row2: [
        { label: 'Close NOC',            value: closeNOC,    color: 'text-blue-400' },
        { label: 'Close O&M',            value: closeOM,     color: 'text-yellow-400' },
        { label: 'O&M Visit',            value: closeVisit,  color: 'text-purple-400' },
        { label: 'Target Hari Ini',      value: targetToday, color: 'text-cyan-400' },
        { label: 'Close Target Hari Ini',value: closeTarget, color: 'text-emerald-400' },
      ],
    };
  }, [data, today]);

  const renderRow = (cards: KpiCard[]) => (
    <div className="grid grid-cols-5 gap-3">
      {cards.map((card) => (
        <Card key={card.label} className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1 leading-tight">
              {card.label}
            </p>
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {renderRow(row1)}
      {renderRow(row2)}
    </div>
  );
}
