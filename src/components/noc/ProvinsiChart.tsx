import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TTRecordDB } from '@/lib/noc/types';

interface ProvinsiChartProps {
  data: TTRecordDB[];
}

export function ProvinsiChart({ data }: ProvinsiChartProps) {
  const chartData = useMemo(() => {
    const counts: Record<string, { open: number; closed: number }> = {};
    for (const d of data) {
      const prov = d.provinsi || 'Unknown';
      if (!counts[prov]) counts[prov] = { open: 0, closed: 0 };
      if (d.status === 'OPEN') counts[prov].open++;
      else if (d.status === 'CLOSED') counts[prov].closed++;
    }
    return Object.entries(counts)
      .map(([provinsi, v]) => ({ provinsi, ...v, total: v.open + v.closed }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 10);
  }, [data]);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Open TT per Provinsi (Top 10)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis
              type="category"
              dataKey="provinsi"
              width={130}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="open" name="Open" fill="hsl(var(--loss))" radius={[0, 4, 4, 0]} />
            <Bar dataKey="closed" name="Closed" fill="hsl(var(--gain))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
