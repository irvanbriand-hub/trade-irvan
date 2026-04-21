import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import { AlertTriangle, Pin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  fixTargetBaseline,
  getActiveBaseline,
  getTargetsByBaseline,
  getOpenTTCount,
  resetActiveBaseline,
  type SCurveBaseline,
  type SCurveTarget,
} from '@/lib/noc/scurveQueries';

type AreaFilter = 'global' | '1' | '2' | '3';

// ─── Date helpers ────────────────────────────────────────────────────────────

/** Build array of Date objects dari ISO 'YYYY-MM-DD' start → end (inclusive). */
function getDatesBetweenISO(startIso: string, endIso: string): Date[] {
  const result: Date[] = [];
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const current = new Date(start);
  while (current <= end) {
    result.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

/** Format ISO date 'YYYY-MM-DD' → 'dd/MM' (untuk x-axis chart). */
function formatShort(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

/** Format ISO date 'YYYY-MM-DD' → 'dd/MM/yyyy'. */
function formatLong(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Parse ISO 'YYYY-MM-DD' ke epoch ms (UTC midnight). */
function parseIsoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

// ─── Chart ───────────────────────────────────────────────────────────────────

interface ChartProps {
  targets: SCurveTarget[];
  baseline: SCurveBaseline;
  area: AreaFilter;
}

function SCurveChart({ targets, baseline, area }: ChartProps) {
  const chartData = useMemo(() => {
    const filtered = area === 'global'
      ? targets
      : targets.filter((t) => t.area === Number(area));

    const dates = getDatesBetweenISO(baseline.baseline_date, baseline.end_date);

    return dates.map((date) => {
      const dateMs = date.getTime();

      const planned = filtered.filter((t) => {
        const ms = parseIsoToMs(t.target_online);
        return ms !== null && ms <= dateMs;
      }).length;

      const actual = filtered.filter((t) => {
        if (!t.is_online) return false;
        const ms = parseIsoToMs(t.actual_online);
        return ms !== null && ms <= dateMs;
      }).length;

      return { date: formatShort(date), Planned: planned, Actual: actual };
    });
  }, [targets, baseline, area]);

  const totalTarget = area === 'global'
    ? targets.length
    : targets.filter((t) => t.area === Number(area)).length;

  const areaLabel = area === 'global' ? 'Global' : `Area ${area}`;

  return (
    <div className="bg-card border border-border p-4 rounded-lg">
      <h3 className="text-sm font-semibold mb-4">
        S-Curve {areaLabel} — Total Target: {totalTarget} TT
      </h3>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" className="text-xs" />
          <YAxis className="text-xs" allowDecimals={false} />
          <RechartsTooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="Planned"
            stroke="#c0504d"
            strokeWidth={2}
            dot={{ r: 4 }}
          >
            <LabelList dataKey="Planned" position="top" fill="#c0504d" fontSize={11} />
          </Line>
          <Line
            type="monotone"
            dataKey="Actual"
            stroke="#9bbb59"
            strokeWidth={2}
            dot={{ r: 4 }}
          >
            <LabelList dataKey="Actual" position="top" fill="#9bbb59" fontSize={11} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
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

// ─── Fix Target Dialog ───────────────────────────────────────────────────────

interface FixTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBaseline: SCurveBaseline | null;
  onConfirm: () => void;
  isPending: boolean;
}

function FixTargetDialog({
  open, onOpenChange, currentBaseline, onConfirm, isPending,
}: FixTargetDialogProps) {
  const { data: openCount, isLoading } = useQuery({
    queryKey: ['noc', 'tt_open_count'],
    queryFn: getOpenTTCount,
    enabled: open,
    staleTime: 10_000,
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fix Target Baseline</AlertDialogTitle>
          <AlertDialogDescription>
            Akan snapshot{' '}
            <strong>{isLoading ? '...' : `${openCount ?? 0} TT OPEN`}</strong>{' '}
            saat ini sebagai baseline S-Curve periode 7 hari ke depan.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {currentBaseline && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Baseline hari ini akan diganti</AlertTitle>
            <AlertDescription>
              <div className="text-xs mt-2 space-y-0.5">
                <div>Label: {currentBaseline.label}</div>
                <div>
                  Dibuat:{' '}
                  {new Date(currentBaseline.created_at).toLocaleString('id-ID', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div>Total target: {currentBaseline.total_target} TT</div>
                <div className="mt-1 font-medium">
                  Progress yang sudah tercatat akan hilang.
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
            disabled={isPending || (openCount ?? 0) === 0}
          >
            {isPending
              ? 'Memproses...'
              : currentBaseline
                ? 'Ya, Ganti Baseline'
                : 'Ya, Fix Target'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  const [showFixDialog, setShowFixDialog] = useState(false);
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

  const fixTargetMut = useMutation({
    mutationFn: fixTargetBaseline,
    onSuccess: (result) => {
      toast({
        title: result.replaced ? 'Baseline diganti' : 'Baseline berhasil dibuat',
        description: `${result.label} — ${result.totalTarget} TT di-snapshot.`,
      });
      setShowFixDialog(false);
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_baseline'] });
      qc.invalidateQueries({ queryKey: ['noc', 's_curve_targets'] });
    },
    onError: (err: Error) => {
      toast({
        title: 'Gagal Fix Target',
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
            onClick={() => setShowFixDialog(true)}
            disabled={fixTargetMut.isPending}
          >
            <Pin className="h-3.5 w-3.5" />
            Fix Target
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
            Klik <span className="font-medium">Fix Target</span> untuk memulai tracking S-Curve
            minggu ini.
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
          ) : (
            <>
              <SCurveChart targets={targets} baseline={baseline} area={selectedArea} />
              <SCurveTable targets={targets} area={selectedArea} />
            </>
          )}
        </>
      )}

      {/* Dialogs */}
      <FixTargetDialog
        open={showFixDialog}
        onOpenChange={setShowFixDialog}
        currentBaseline={baseline}
        onConfirm={() => fixTargetMut.mutate()}
        isPending={fixTargetMut.isPending}
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
