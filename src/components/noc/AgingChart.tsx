import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TTRecordDB } from '@/lib/noc/types';

const AGING_BUCKETS = [
  { label: '1-7h', min: 1, max: 7 },
  { label: '8-14h', min: 8, max: 14 },
  { label: '15-21h', min: 15, max: 21 },
  { label: '22-30h', min: 22, max: 30 },
  { label: '30+h', min: 31, max: Infinity },
] as const;

interface AgingChartProps {
  data: TTRecordDB[];
}

export function AgingChart({ data }: AgingChartProps) {
  const chartData = useMemo(() => {
    return AGING_BUCKETS.map((bucket) => {
      const count = data.filter(
        (d) => d.down_time >= bucket.min && d.down_time <= bucket.max,
      ).length;
      return { label: bucket.label, count };
    });
  }, [data]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Distribusi Aging (hari)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" name="Jumlah TT" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
