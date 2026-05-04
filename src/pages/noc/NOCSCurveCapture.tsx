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
} from '@/lib/noc/scurveSeries';
import { SCurveBreakdownTable } from '@/components/noc/scurve/SCurveBreakdownTable';

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

/** ISO 'YYYY-MM-DD' → '28 APRIL' (untuk judul "WM 28 APRIL"). */
function formatBaselineDayMonth(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const day = parseInt(m[3], 10);
  const month = BULAN_ID_UPPER[parseInt(m[2], 10) - 1] ?? '';
  return `${day} ${month}`;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NOCSCurveCapture() {
  const [searchParams] = useSearchParams();
  const area = (searchParams.get('area') || 'global') as SCurveAreaFilter;
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

  const series = useMemo(() => {
    if (!baseline) return null;
    return computeSCurveSeries(targets, baseline, area);
  }, [targets, baseline, area]);

  const { labels, planned, actual, totalTarget } = series ?? {
    labels: [],
    planned: [],
    actual: [],
    totalTarget: 0,
  };

  const pillLabelsPlugin = useMemo<Plugin<'line'>>(
    () => ({
      id: 'pillLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const xScale = chart.scales.x;
        const yScale = chart.scales.y;
        if (!xScale || !yScale) return;

        function drawPill(x: number, y: number, text: string, bg: string) {
          ctx.font = '500 13px Arial, sans-serif';
          const w = ctx.measureText(text).width + 14;
          const h = 20;
          const r = 10;

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

        // Pakai scales.getPixelForValue langsung (bukan meta.data) supaya
        // posisi label tidak terpengaruh animation tweening / bezier interpolation.
        // Dengan cara ini, label SELALU di-render untuk tiap data point yang valid,
        // termasuk di tanggal plateau (mis. PLAN ALL = 121 untuk 03/05, 04/05, 05/05).
        for (let idx = 0; idx < labels.length; idx++) {
          const pv = planned[idx];
          const av = actual[idx];
          if (pv == null && av == null) continue;

          const x = xScale.getPixelForValue(idx);
          const py = pv != null ? yScale.getPixelForValue(pv) : null;
          const ay = av != null ? yScale.getPixelForValue(av) : null;

          if (py != null && ay == null) {
            drawPill(x, py - 20, String(pv), '#e57373');
            continue;
          }
          if (py == null && ay != null) {
            drawPill(x, ay - 20, String(av), '#66bb6a');
            continue;
          }

          if (py != null && ay != null) {
            if (pv === av) {
              drawPill(x, py - 20, String(pv), '#e57373');
              drawPill(x, ay + 20, String(av), '#66bb6a');
            } else if ((av as number) > (pv as number)) {
              drawPill(x, ay - 20, String(av), '#66bb6a');
              drawPill(x, py + 20, String(pv), '#e57373');
            } else {
              drawPill(x, py - 20, String(pv), '#e57373');
              drawPill(x, ay + 20, String(av), '#66bb6a');
            }
          }
        }
      },
    }),
    [labels, planned, actual],
  );

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
          width: '1200px',
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

  const areaSuffix = area === 'global' ? '' : ` AREA ${area}`;
  const wmLabel = baseline ? formatBaselineDayMonth(baseline.baseline_date) : '';

  return (
    <div
      id="scurve-capture-ready"
      style={{
        width: '1200px',
        backgroundColor: '#ffffff',
        padding: '30px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {/* Title */}
      <h1
        style={{
          textAlign: 'center',
          fontSize: '22px',
          fontWeight: '700',
          color: '#1e293b',
          marginBottom: '24px',
          marginTop: '0',
          letterSpacing: '0.02em',
        }}
      >
        S CURVE{areaSuffix} TARGET PENYELESAIAN TT WM {wmLabel}
      </h1>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '24px',
          marginBottom: '16px',
          fontSize: '13px',
          color: '#475569',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{ width: 12, height: 12, background: '#e57373', borderRadius: 2 }}
          />
          Planned
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{ width: 12, height: 12, background: '#66bb6a', borderRadius: 2 }}
          />
          Actual
        </span>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: '500px' }}>
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Planned',
                data: planned,
                borderColor: '#e57373',
                backgroundColor: '#e57373',
                borderWidth: 3,
                tension: 0.35,
                pointRadius: 6,
                pointBackgroundColor: '#e57373',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
              },
              {
                label: 'Actual',
                data: actual,
                borderColor: '#66bb6a',
                backgroundColor: '#66bb6a',
                borderWidth: 3,
                tension: 0.35,
                pointRadius: 6,
                pointBackgroundColor: '#66bb6a',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                spanGaps: false,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // penting untuk Puppeteer — render langsung
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
            },
            layout: {
              padding: { top: 28, right: 20, left: 0, bottom: 28 },
            },
            scales: {
              y: {
                beginAtZero: true,
                max: Math.max(1, Math.ceil(totalTarget * 1.1)),
                grid: { color: 'rgba(128,128,128,0.12)' },
                ticks: { font: { size: 13 }, color: '#64748b' },
              },
              x: {
                grid: { display: false },
                ticks: { font: { size: 13 }, color: '#64748b' },
              },
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any}
          plugins={[pillLabelsPlugin]}
        />
      </div>

      {/* Breakdown table */}
      {series && (
        <div style={{ marginTop: '24px' }}>
          <SCurveBreakdownTable series={series} />
        </div>
      )}

      {/* Footer info */}
      <div
        style={{
          marginTop: '20px',
          textAlign: 'center',
          fontSize: '12px',
          color: '#64748b',
        }}
      >
        {baseline?.label} — Generated {formatNowWIB()}
      </div>
    </div>
  );
}
