import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  Ticket,
  CircleDot,
  CheckCircle2,
  Clock,
  AlarmClock,
  ShieldCheck,
  Wrench,
  Navigation,
  Target,
  CheckCheck,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { normalizeDate } from '@/lib/noc/queries';
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

// Tone → kelas yang adaptif light/dark. Chip untuk ikon, value untuk angka.
type Tone = 'neutral' | 'red' | 'green' | 'orange' | 'rose' | 'blue' | 'amber' | 'violet' | 'cyan' | 'emerald';

const TONES: Record<Tone, { chip: string; value: string }> = {
  neutral: { chip: 'bg-muted text-foreground', value: 'text-foreground' },
  red: { chip: 'bg-red-500/10 text-red-600 dark:text-red-400', value: 'text-red-600 dark:text-red-400' },
  green: { chip: 'bg-green-500/10 text-green-600 dark:text-green-400', value: 'text-green-600 dark:text-green-400' },
  orange: { chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', value: 'text-orange-600 dark:text-orange-400' },
  rose: { chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', value: 'text-rose-600 dark:text-rose-400' },
  blue: { chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', value: 'text-blue-600 dark:text-blue-400' },
  amber: { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', value: 'text-amber-600 dark:text-amber-400' },
  violet: { chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', value: 'text-violet-600 dark:text-violet-400' },
  cyan: { chip: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400', value: 'text-cyan-600 dark:text-cyan-400' },
  emerald: { chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', value: 'text-emerald-600 dark:text-emerald-400' },
};

interface KpiCard {
  label: string;
  value: number;
  tone: Tone;
  Icon: LucideIcon;
}

export function KpiCards({ data }: KpiCardsProps) {
  const today = format(new Date(), 'dd/MM/yyyy');

  const cards = useMemo((): KpiCard[] => {
    const totalTT = data.length;
    const open = data.filter((r) => r.status === 'OPEN').length;
    const closed = data.filter((r) => r.status === 'CLOSED').length;
    const overdueGt8 = data.filter((r) => r.status === 'OPEN' && r.down_time >= 8).length;
    const overdueGt30 = data.filter((r) => r.status === 'OPEN' && r.down_time >= 30).length;
    const closeNOC = data.filter((r) => getCloseType(r) === 'noc').length;
    const closeOM = data.filter((r) => getCloseType(r) === 'om').length;
    const closeVisit = data.filter((r) => getCloseType(r) === 'om-visit').length;
    const targetToday = data.filter((r) => normalizeDate(r.target_online_original ?? '') === today).length;
    const closeTarget = data.filter(
      (r) => normalizeDate(r.target_online_original ?? '') === today && r.status === 'CLOSED',
    ).length;

    return [
      { label: 'Total TT', value: totalTT, tone: 'neutral', Icon: Ticket },
      { label: 'Open', value: open, tone: 'red', Icon: CircleDot },
      { label: 'Closed', value: closed, tone: 'green', Icon: CheckCircle2 },
      { label: 'Overdue 8h', value: overdueGt8, tone: 'orange', Icon: Clock },
      { label: 'Overdue 30h', value: overdueGt30, tone: 'rose', Icon: AlarmClock },
      { label: 'Close NOC', value: closeNOC, tone: 'blue', Icon: ShieldCheck },
      { label: 'Close O&M', value: closeOM, tone: 'amber', Icon: Wrench },
      { label: 'O&M Visit', value: closeVisit, tone: 'violet', Icon: Navigation },
      { label: 'Target Hari Ini', value: targetToday, tone: 'cyan', Icon: Target },
      { label: 'Close Target Hari Ini', value: closeTarget, tone: 'emerald', Icon: CheckCheck },
    ];
  }, [data, today]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(({ label, value, tone, Icon }) => {
        const t = TONES[tone];
        return (
          <Card
            key={label}
            className="group relative overflow-hidden p-4 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-tight">
                {label}
              </p>
              <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${t.chip}`}>
                <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
            <p className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${t.value}`}>
              {value}
            </p>
          </Card>
        );
      })}
    </div>
  );
}
