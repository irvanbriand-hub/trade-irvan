import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import {
  getActiveBaseline,
  getLastCompletedBaseline,
  getBaselineByDate,
  getTargetsByBaseline,
  type SCurveBaseline,
  type SCurveTarget,
} from '@/lib/noc/scurveQueries';
import {
  computeSCurveSeries,
  type SCurveAreaFilter,
  type SCurveSeries,
} from '@/lib/noc/scurveSeries';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTooltip,
  Filler,
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNowWIB(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const d = String(wib.getUTCDate()).padStart(2, '0');
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const y = wib.getUTCFullYear();
  const hh = String(wib.getUTCHours()).padStart(2, '0');
  const mm = String(wib.getUTCMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} ${hh}:${mm} WIB`;
}

const BULAN_ID_UPPER = [
  'JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER',
];

function formatBaselineDayMonth(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const day = parseInt(m[3], 10);
  const month = BULAN_ID_UPPER[parseInt(m[2], 10) - 1] ?? '';
  return `${day} ${month}`;
}

const AREAS: Array<{ filter: SCurveAreaFilter; label: string; highlight: boolean }> = [
  { filter: 'global', label: 'GLOBAL', highlight: true },
  { filter: '1', label: 'AREA 1', highlight: false },
  { filter: '2', label: 'AREA 2', highlight: false },
  { filter: '3', label: 'AREA 3', highlight: false },
];

// ─── Grid Cell ───────────────────────────────────────────────────────────────

interface CellProps {
  series: SCurveSeries;
  label: string;
  highlight: boolean;
}

function GridCell({ series, label, highlight }: CellProps) {
  const { labels, planned, actual, totalTarget } = series;

  const pillLabelsPlugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'pillLabelsGrid',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale) return;

        function drawPill(x: number, y: number, text: string, bg: string) {
          ctx.font = '500 11px Arial, sans-serif';
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
          if (pv == null && av == null) continue;

          const x = xScale.getPixelForValue(idx);
          const py = pv != null ? yScale.getPixelForValue(pv) : null;
          const ay = av != null ? yScale.getPixelForValue(av) : null;

          if (py != null && ay == null) {
            drawPill(x, py - 14, String(pv), '#e57373');
            continue;
          }
          if (py == null && ay != null) {
            drawPill(x, ay - 14, String(av), '#66bb6a');
            continue;
          }

          if (py != null && ay != null) {
            if (pv === av) {
              drawPill(x, py - 14, String(pv), '#e57373');
              drawPill(x, ay + 14, String(av), '#66bb6a');
            } else if ((av as number) > (pv as number)) {
              drawPill(x, ay - 14, String(av), '#66bb6a');
              drawPill(x, py + 14, String(pv), '#e57373');
            } else {
              drawPill(x, py - 14, String(pv), '#e57373');
              drawPill(x, ay + 14, String(av), '#66bb6a');
            }
          }
        }
      },
    }),
    [labels, planned, actual],
  );

  // Progress dari series (target online cumulative terakhir non-null)
  const onlineCount = useMemo(() => {
    for (let i = actual.length - 1; i >= 0; i--) {
      if (actual[i] != null) return actual[i] as number;
    }
    return 0;
  }, [actual]);
  const percent = totalTarget > 0 ? Math.round((onlineCount / totalTarget) * 100) : 0;

  return (
    <div
      style={{
        background: highlight ? '#eff6ff' : '#ffffff',
        border: highlight ? '2px solid #2563eb' : '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: highlight ? '0 2px 6px rgba(37, 99, 235, 0.15)' : 'none',
      }}
    >
      {/* Cell header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: highlight ? 800 : 700,
            color: highlight ? '#1e40af' : '#1e293b',
            letterSpacing: '0.02em',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 12, color: highlight ? '#1e40af' : '#475569', fontWeight: highlight ? 600 : 400 }}>
          Target {totalTarget} TT — {onlineCount}/{totalTarget} ({percent}%)
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 6,
          fontSize: 11,
          color: '#475569',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: '#e57373', borderRadius: 2 }} />
          Planned
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: '#66bb6a', borderRadius: 2 }} />
          Actual
        </span>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 280 }}>
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Planned',
                data: planned,
                borderColor: '#e57373',
                backgroundColor: '#e57373',
                borderWidth: 2.5,
                tension: 0.35,
                pointRadius: 4,
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
                pointRadius: 4,
                pointBackgroundColor: '#66bb6a',
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                spanGaps: false,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
            },
            layout: {
              padding: { top: 20, right: 16, left: 0, bottom: 16 },
            },
            scales: {
              y: {
                beginAtZero: true,
                max: Math.max(1, Math.ceil(totalTarget * 1.1)),
                grid: { color: 'rgba(128,128,128,0.12)' },
                ticks: { font: { size: 10 }, color: '#64748b' },
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 10 }, color: '#64748b' },
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any}
          plugins={[pillLabelsPlugin]}
        />
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NOCSCurveCaptureGrid() {
  const [searchParams] = useSearchParams();
  const baselineParam = searchParams.get('baseline') || 'active';

  const [ready, setReady] = useState(false);
  const [baseline, setBaseline] = useState<SCurveBaseline | null>(null);
  const [targets, setTargets] = useState<SCurveTarget[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let b: SCurveBaseline | null = null;

        if (baselineParam === 'active') {
          b = await getActiveBaseline();
        } else if (baselineParam === 'last') {
          b = await getLastCompletedBaseline();
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(baselineParam)) {
          b = await getBaselineByDate(baselineParam);
        }

        if (cancelled) return;

        if (!b) {
          const reason =
            baselineParam === 'active'
              ? 'Tidak ada baseline aktif'
              : baselineParam === 'last'
                ? 'Belum ada baseline completed'
                : `Tidak ada baseline untuk tanggal ${baselineParam}`;
          setError(reason);
          setReady(true);
          return;
        }

        const t = await getTargetsByBaseline(b.id);
        if (cancelled) return;

        setBaseline(b);
        setTargets(t);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setReady(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [baselineParam]);

  const seriesByArea = useMemo(() => {
    if (!baseline) return null;
    return AREAS.map((a) => ({
      area: a,
      series: computeSCurveSeries(targets, baseline, a.filter),
    }));
  }, [targets, baseline]);

  if (!ready) {
    return (
      <div
        id="scurve-capture-loading"
        style={{ padding: '20px', fontFamily: 'Arial, sans-serif', color: '#333' }}
      >
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div
        id="scurve-capture-ready"
        style={{
          width: '1400px',
          padding: '40px',
          backgroundColor: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          color: '#dc2626',
          fontSize: '18px',
        }}
      >
        ⚠️ {error}
      </div>
    );
  }

  const wmLabel = baseline ? formatBaselineDayMonth(baseline.baseline_date) : '';

  return (
    <div
      id="scurve-capture-ready"
      style={{
        width: '1400px',
        backgroundColor: '#ffffff',
        padding: '24px',
        fontFamily: 'Arial, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      {/* Title */}
      <h1
        style={{
          textAlign: 'center',
          fontSize: '20px',
          fontWeight: 700,
          color: '#1e293b',
          margin: '0 0 18px 0',
          letterSpacing: '0.02em',
        }}
      >
        S CURVE TARGET PENYELESAIAN TT WM {wmLabel}
      </h1>

      {/* 2x2 Grid */}
      {seriesByArea && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: 14,
          }}
        >
          {seriesByArea.map((entry) => (
            <GridCell
              key={entry.area.filter}
              series={entry.series}
              label={entry.area.label}
              highlight={entry.area.highlight}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 14,
          textAlign: 'center',
          fontSize: 11,
          color: '#64748b',
        }}
      >
        {baseline?.label} — Generated {formatNowWIB()}
      </div>
    </div>
  );
}
