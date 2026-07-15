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

  const areaColors: Record<number, { dot: string; text: string }> = {
    1: { dot: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' },
    2: { dot: 'bg-green-500', text: 'text-green-600 dark:text-green-400' },
    3: { dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {areas.map(({ area, total, open, closed, closeNoc, closeOm, resolvedPct }) => (
        <Card key={area} className="transition-shadow hover:shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${areaColors[area].dot}`} />
              Area {area}
              <span className="text-muted-foreground font-normal">· {AREA_NAMES[area]}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold tabular-nums">{total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Open</span>
              <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{open}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Resolved</span>
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                {closed} <span className="text-muted-foreground font-normal">({resolvedPct}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${resolvedPct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>Close NOC: <span className="font-semibold text-blue-600 dark:text-blue-400">{closeNoc}</span></span>
              <span>Close O&amp;M: <span className="font-semibold text-amber-600 dark:text-amber-400">{closeOm}</span></span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
