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
import { MapPin, Pencil, Trash2, Upload } from 'lucide-react';

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
  reclassifyBaselineAreas,
  resetActiveBaseline,
  updateBaselineEndDate,
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

// Plugin static — baca data langsung dari chart.data.datasets, tidak dari React
// closure. Ini menghindari race condition saat React re-render vs Chart.js update,
// dan menjamin label pill SELALU cocok dengan data yang sedang di-render.
const pillLabelsPlugin: Plugin<'line'> = {
  id: 'pillLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if (!xScale || !yScale) return;

    const plannedData = (chart.data.datasets[0]?.data ?? []) as Array<number | null>;
    const actualData = (chart.data.datasets[1]?.data ?? []) as Array<number | null>;
    const len = Math.max(plannedData.length, actualData.length);
    if (len === 0) return;

    function drawPill(x: number, y: number, text: string, bg: string) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
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

    for (let idx = 0; idx < len; idx++) {
      const pv = plannedData[idx];
      const av = actualData[idx];
      if (pv == null && av == null) continue;

      const x = xScale.getPixelForValue(idx);
      const py = pv != null ? yScale.getPixelForValue(pv) : null;
      const ay = av != null ? yScale.getPixelForValue(av) : null;

      if (py != null && ay == null) {
        drawPill(x, py - 16, String(pv), '#e57373');
        continue;
      }
      if (py == null && ay != null) {
        drawPill(x, ay - 16, String(av), '#66bb6a');
        continue;
      }

      if (py != null && ay != null && pv != null && av != null) {
        if (pv === av) {
          drawPill(x, py - 16, String(pv), '#e57373');
          drawPill(x, ay + 16, String(av), '#66bb6a');
        } else if (av > pv) {
          drawPill(x, ay - 16, String(av), '#66bb6a');
          drawPill(x, py + 16, String(pv), '#e57373');
        } else {
          drawPill(x, py - 16, String(pv), '#e57373');
          drawPill(x, ay + 16, String(av), '#66bb6a');
        }
      }
    }
  },
};

function SCurveChart({ series, area }: ChartProps) {
  const { labels, planned, actual, totalTarget } = series;
  const areaLabel = area === 'global' ? 'Global' : `Area ${area}`;

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
  const [showEditEndDialog, setShowEditEndDialog] = useState(false);
  const [editEndDateValue, setEditEndDateValue] = useState('');

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

  const endDateMut = useMutation({
    mutationFn: ({ id, endDate }: { id: string; endDate: string }) =>
      updateBaselineEndDate(id, endDate),
    onSuccess: () => {
      toast({ title: 'End date diupdate' });
      setShowEditEndDialog(false);
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_baseline'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Gagal update end date',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const reclassifyMut = useMutation({
    mutationFn: (id: string) => reclassifyBaselineAreas(id),
    onSuccess: ({ updated, stillUnknown }) => {
      toast({
        title: 'Reclassify area selesai',
        description:
          updated === 0 && stillUnknown === 0
            ? 'Tidak ada site dengan area=0 — semua sudah ter-klasifikasi.'
            : `${updated} site dapat area baru. ${stillUnknown} site masih unknown (tidak ada di master).`,
      });
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_targets'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Gagal reclassify area',
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
            onClick={() => baseline && reclassifyMut.mutate(baseline.id)}
            disabled={!baseline || reclassifyMut.isPending}
            title="Lookup master noc_perf_sites untuk site dengan area=0"
          >
            <MapPin className="h-3.5 w-3.5" />
            {reclassifyMut.isPending ? 'Reclassifying...' : 'Reclassify Area'}
          </Button>
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
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <span>Periode: {formatLong(baseline.baseline_date)} → {formatLong(baseline.end_date)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditEndDateValue(baseline.end_date);
                    setShowEditEndDialog(true);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Edit end date"
                  title="Edit end date"
                >
                  <Pencil className="h-3 w-3" />
                </button>
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
      <AlertDialog open={showEditEndDialog} onOpenChange={setShowEditEndDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit End Date</AlertDialogTitle>
            <AlertDialogDescription>
              Extend atau shrink range chart S-Curve. Plan curve akan flat di
              total untuk tanggal setelah max(target_online).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-xs text-muted-foreground" htmlFor="edit-end-date">
              Tanggal end
            </label>
            <input
              id="edit-end-date"
              type="date"
              value={editEndDateValue}
              min={baseline?.baseline_date}
              onChange={(e) => setEditEndDateValue(e.target.value)}
              className="w-full px-3 py-1.5 border border-input rounded-md text-sm bg-background"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endDateMut.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!baseline) return;
                endDateMut.mutate({ id: baseline.id, endDate: editEndDateValue });
              }}
              disabled={endDateMut.isPending || !editEndDateValue}
            >
              {endDateMut.isPending ? 'Saving...' : 'Save'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
