import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AREA_MAP, AREA_NAMES } from '@/lib/noc/constants';
import type { TTRecordDB } from '@/lib/noc/types';

interface AreaCardsProps {
  data: TTRecordDB[];
}

function getArea(provinsi: string | null): 0 | 1 | 2 | 3 {
  const a = AREA_MAP[(provinsi ?? '').toUpperCase()];
  return (a === 1 || a === 2 || a === 3 ? a : 0) as 0 | 1 | 2 | 3;
}

export function AreaCards({ data }: AreaCardsProps) {
  const areas = useMemo(() => {
    return ([1, 2, 3] as const).map((area) => {
      const subset = data.filter((d) => getArea(d.provinsi) === area);
      const total = subset.length;
      const open = subset.filter((d) => d.status === 'OPEN').length;
      const closed = subset.filter((d) => d.status === 'CLOSED').length;
      const closeNoc = subset.filter(
        (d) => d.status === 'CLOSED' && d.down_time <= 3,
      ).length;
      const closeOm = subset.filter(
        (d) =>
          d.status === 'CLOSED' &&
          d.down_time > 3 &&
          !(d.tiket_internal ?? '').toUpperCase().includes('KUNJUNGAN'),
      ).length;
      const resolvedPct = total > 0 ? Math.round((closed / total) * 100) : 0;
      return { area, total, open, closed, closeNoc, closeOm, resolvedPct };
    });
  }, [data]);

  const areaColors: Record<number, string> = {
    1: 'text-blue-400',
    2: 'text-green-400',
    3: 'text-orange-400',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {areas.map(({ area, total, open, closed, closeNoc, closeOm, resolvedPct }) => (
        <Card key={area} className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className={`text-base font-semibold ${areaColors[area]}`}>
              Area {area} — {AREA_NAMES[area]}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Open</span>
              <span className="font-medium text-red-400">{open}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Resolved</span>
              <span className="font-medium text-green-400">{closed} ({resolvedPct}%)</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${resolvedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>Close NOC: <span className="text-blue-400 font-medium">{closeNoc}</span></span>
              <span>Close O&amp;M: <span className="text-yellow-400 font-medium">{closeOm}</span></span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
