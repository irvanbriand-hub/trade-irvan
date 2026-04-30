import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip as ChartTooltip,
  Filler,
  type Plugin,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Trash2, Upload } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTooltip,
  Filler,
);
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  createBaselineFromUpload,
  getActiveBaseline,
  getTargetsByBaseline,
  resetActiveBaseline,
  type SCurveBaseline,
  type SCurveTarget,
} from '@/lib/noc/scurveQueries';
import {
  computeSCurveSeries,
  type SCurveSeries,
} from '@/lib/noc/scurveSeries';
import { SCurveUploadDialog } from '@/components/noc/scurve/SCurveUploadDialog';
import { SCurveBreakdownTable } from '@/components/noc/scurve/SCurveBreakdownTable';
import type { SCurveUploadRow } from '@/lib/noc/scurveUploadParser';

type AreaFilter = 'global' | '1' | '2' | '3';

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Format ISO date 'YYYY-MM-DD' → 'dd/MM/yyyy'. */
function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ─── Chart ───────────────────────────────────────────────────────────────────

interface ChartProps {
  series: SCurveSeries;
  area: AreaFilter;
}

function SCurveChart({ series, area }: ChartProps) {
  const { labels, planned, actual, totalTarget } = series;
  const areaLabel = area === 'global' ? 'Global' : `Area ${area}`;

  const pillLabelsPlugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'pillLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const plannedMeta = chart.getDatasetMeta(0);
        const actualMeta = chart.getDatasetMeta(1);

        function drawPill(x: number, y: number, text: string, bg: string) {
          ctx.font = '500 11px -apple-system, system-ui, sans-serif';
          const w = ctx.measureText(text).width + 10;
          const h = 16;
          const r = 8;

          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.moveTo(x - w / 2 + r, y - h / 2);
          ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
          ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
          ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
          ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, x, y);
        }

        for (let idx = 0; idx < labels.length; idx++) {
          const pv = planned[idx];
          const av = actual[idx];
          const pp = plannedMeta.data[idx] as { x: number; y: number } | undefined;
          const ap = actualMeta.data[idx] as { x: number; y: number } | undefined;

          if (pv == null && av == null) continue;

          if (pv != null && av == null && pp) {
            drawPill(pp.x, pp.y - 16, String(pv), '#e57373');
            continue;
          }
          if (pv == null && av != null && ap) {
            drawPill(ap.x, ap.y - 16, String(av), '#66bb6a');
            continue;
          }

          if (pv != null && av != null && pp && ap) {
            if (pv === av) {
              drawPill(pp.x, pp.y - 16, String(pv), '#e57373');
              drawPill(ap.x, ap.y + 16, String(av), '#66bb6a');
            } else if (av > pv) {
              drawPill(ap.x, ap.y - 16, String(av), '#66bb6a');
              drawPill(pp.x, pp.y + 16, String(pv), '#e57373');
            } else {
              drawPill(pp.x, pp.y - 16, String(pv), '#e57373');
              drawPill(ap.x, ap.y + 16, String(av), '#66bb6a');
            }
          }
        }
      },
    }),
    [labels, planned, actual],
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Planned',
        data: planned,
        borderColor: '#e57373',
        backgroundColor: '#e57373',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 5,
        pointBackgroundColor: '#e57373',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
      },
      {
        label: 'Actual',
        data: actual,
        borderColor: '#66bb6a',
        backgroundColor: '#66bb6a',
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 5,
        pointBackgroundColor: '#66bb6a',
        pointBorderColor: '#fff',
        pointBorderWidth: 1.5,
        spanGaps: false,
      },
    ],
  };

  // Cast options to any agar tidak tabrak dengan typing ketat dari Chart.js;
  // struktur di bawah ini sudah match ChartOptions<'line'> secara runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#fff',
        bodyColor: '#fff',
        padding: 10,
        cornerRadius: 6,
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ${ctx.parsed.y ?? '-'} TT`,
        },
      },
    },
    layout: {
      padding: { top: 24, right: 10, left: 0, bottom: 24 },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: Math.max(1, Math.ceil(totalTarget * 1.1)),
        grid: { color: 'rgba(128,128,128,0.1)' },
        ticks: { font: { size: 11 }, color: '#888' },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: '#888' },
      },
    },
  };

  return (
    <div className="bg-card rounded-lg p-5 border">
      <div className="flex justify-between items-baseline mb-3">
        <div className="text-sm font-medium">
          S-Curve {areaLabel} — Target {totalTarget} TT
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-sm"
              style={{ width: 10, height: 10, background: '#e57373' }}
            />
            Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block rounded-sm"
              style={{ width: 10, height: 10, background: '#66bb6a' }}
            />
            Actual
          </span>
        </div>
      </div>

      <div className="relative w-full" style={{ height: 320 }}>
        <Line data={chartData} options={chartOptions} plugins={[pillLabelsPlugin]} />
      </div>
    </div>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

interface TableProps {
  targets: SCurveTarget[];
  area: AreaFilter;
}

function SCurveTable({ targets, area }: TableProps) {
  const filtered = useMemo(() => {
    const list = area === 'global'
      ? targets
      : targets.filter((t) => t.area === Number(area));
    // Sort: belum online dulu (is_online=false), lalu by site_name
    return [...list].sort((a, b) => {
      if (a.is_online !== b.is_online) return a.is_online ? 1 : -1;
      return (a.site_name ?? '').localeCompare(b.site_name ?? '');
    });
  }, [targets, area]);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Detail Sites</h3>
        <div className="text-xs text-muted-foreground">
          {filtered.length} TT
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site</TableHead>
              <TableHead>PO</TableHead>
              <TableHead>Provinsi</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Actual</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Tidak ada data untuk filter ini.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.site_name ?? t.site_id ?? t.ticket_id}
                  </TableCell>
                  <TableCell>{t.po_name ?? '-'}</TableCell>
                  <TableCell className="text-xs">{t.provinsi ?? '-'}</TableCell>
                  <TableCell className="text-xs">
                    {t.target_online ? formatLong(t.target_online) : '-'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.actual_online ? formatLong(t.actual_online) : '-'}
                  </TableCell>
                  <TableCell>
                    {t.is_online ? (
                      <Badge className="bg-green-500/10 text-green-500 border-green-500/30 hover:bg-green-500/20">
                        ✓ Online
                      </Badge>
                    ) : (
                      <Badge variant="secondary">⏳ Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Reset Baseline Dialog ───────────────────────────────────────────────────

interface ResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBaseline: SCurveBaseline | null;
  onConfirm: () => void;
  isPending: boolean;
}

function ResetBaselineDialog({
  open, onOpenChange, currentBaseline, onConfirm, isPending,
}: ResetDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Baseline Aktif?</AlertDialogTitle>
          <AlertDialogDescription>
            Baseline aktif dan semua target progress-nya akan dihapus permanen.
            Aksi ini tidak bisa dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {currentBaseline && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-0.5">
            <div>Label: <span className="font-medium">{currentBaseline.label}</span></div>
            <div>Total target: {currentBaseline.total_target} TT</div>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? 'Menghapus...' : 'Hapus Baseline'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function NOCSCurve() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedArea, setSelectedArea] = useState<AreaFilter>('global');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const baselineQuery = useQuery({
    queryKey: ['noc', 's_curve_baseline'],
    queryFn: getActiveBaseline,
  });

  const baseline = baselineQuery.data ?? null;

  const targetsQuery = useQuery({
    queryKey: ['noc', 's_curve_targets', baseline?.id],
    queryFn: () => getTargetsByBaseline(baseline!.id),
    enabled: !!baseline?.id,
  });

  const targets = targetsQuery.data ?? [];

  const uploadMut = useMutation({
    mutationFn: ({
      rows,
      baselineDate,
    }: {
      rows: SCurveUploadRow[];
      baselineDate: string;
    }) => createBaselineFromUpload(rows, baselineDate),
    onSuccess: (result) => {
      toast({
        title: result.replaced ? 'Baseline diganti' : 'Baseline berhasil dibuat',
        description: `${result.label} — ${result.totalTarget} site di-snapshot.`,
      });
      setShowUploadDialog(false);
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_baseline'] });
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_targets'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Gagal upload baseline',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const resetMut = useMutation({
    mutationFn: resetActiveBaseline,
    onSuccess: () => {
      toast({
        title: 'Baseline dihapus',
        description: 'Baseline aktif beserta semua targetnya sudah di-reset.',
      });
      setShowResetDialog(false);
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_baseline'] });
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_targets'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Gagal reset',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Progress calc untuk header info
  const { onlineCount, totalTarget, percent } = useMemo(() => {
    const total = targets.length;
    const online = targets.filter((t) => t.is_online).length;
    return {
      onlineCount: online,
      totalTarget: total,
      percent: total > 0 ? Math.round((online / total) * 100) : 0,
    };
  }, [targets]);

  // Series cumulative/daily untuk chart + breakdown table.
  // Hitung sekali di parent, share ke kedua komponen supaya tidak double-compute.
  const series = useMemo(() => {
    if (!baseline) return null;
    return computeSCurveSeries(targets, baseline, selectedArea);
  }, [targets, baseline, selectedArea]);

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">S-Curve Dashboard</h2>
          <p className="text-xs text-muted-foreground">
            Tracking progress penyelesaian TT per baseline mingguan
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowResetDialog(true)}
            disabled={!baseline || resetMut.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Reset Baseline
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setShowUploadDialog(true)}
            disabled={uploadMut.isPending}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Baseline
          </Button>
        </div>
      </div>

      {/* Baseline info card */}
      {baselineQuery.isLoading ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Memuat baseline...
        </div>
      ) : baseline ? (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Baseline Aktif</div>
              <div className="text-lg font-bold mt-0.5">{baseline.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Periode: {formatLong(baseline.baseline_date)} → {formatLong(baseline.end_date)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Progress</div>
              <div className="text-2xl font-bold mt-0.5">
                {onlineCount} / {totalTarget}
              </div>
              <div className="text-xs">({percent}%)</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-muted/30 border border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-sm font-medium">Belum ada baseline aktif</p>
          <p className="text-xs text-muted-foreground mt-1">
            Klik <span className="font-medium">Upload Baseline</span> untuk
            mulai tracking S-Curve minggu ini dengan list site dari file Excel
            atau paste TSV.
          </p>
        </div>
      )}

      {/* Area selector + content */}
      {baseline && (
        <>
          <Tabs value={selectedArea} onValueChange={(v) => setSelectedArea(v as AreaFilter)}>
            <TabsList>
              <TabsTrigger value="global">Global</TabsTrigger>
              <TabsTrigger value="1">Area 1</TabsTrigger>
              <TabsTrigger value="2">Area 2</TabsTrigger>
              <TabsTrigger value="3">Area 3</TabsTrigger>
            </TabsList>
          </Tabs>

          {targetsQuery.isLoading ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
              Memuat targets...
            </div>
          ) : series ? (
            <>
              <SCurveChart series={series} area={selectedArea} />
              <div className="bg-card border border-border rounded-lg p-3 overflow-x-auto">
                <SCurveBreakdownTable series={series} />
              </div>
              <SCurveTable targets={targets} area={selectedArea} />
            </>
          ) : null}
        </>
      )}

      {/* Dialogs */}
      <SCurveUploadDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        currentBaseline={baseline}
        onConfirm={(rows, baselineDate) =>
          uploadMut.mutate({ rows, baselineDate })
        }
        isPending={uploadMut.isPending}
      />
      <ResetBaselineDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        currentBaseline={baseline}
        onConfirm={() => resetMut.mutate()}
        isPending={resetMut.isPending}
      />
    </div>
  );
}
