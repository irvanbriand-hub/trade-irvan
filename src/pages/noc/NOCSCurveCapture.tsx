import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts';
import {
  getActiveBaseline,
  getLastCompletedBaseline,
  getBaselineByDate,
  getTargetsByBaseline,
  type SCurveBaseline,
  type SCurveTarget,
} from '@/lib/noc/scurveQueries';

type AreaFilter = 'global' | '1' | '2' | '3';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatShort(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

function parseIsoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NOCSCurveCapture() {
  const [searchParams] = useSearchParams();
  const area = (searchParams.get('area') || 'global') as AreaFilter;
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

  const chartData = useMemo(() => {
    if (!baseline) return [];
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

  const totalTarget = useMemo(() => {
    if (area === 'global') return targets.length;
    return targets.filter((t) => t.area === Number(area)).length;
  }, [targets, area]);

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

  const areaTitle = area === 'global' ? 'GLOBAL' : `AREA ${area}`;

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
        S CURVE {areaTitle} — TARGET PENYELESAIAN {totalTarget} TT
      </h1>

      {/* Chart */}
      <div style={{ width: '100%', height: '500px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 30, right: 40, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" stroke="#475569" style={{ fontSize: '13px' }} />
            <YAxis stroke="#475569" style={{ fontSize: '13px' }} allowDecimals={false} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '14px' }} />
            <Line
              type="monotone"
              dataKey="Planned"
              stroke="#c0504d"
              strokeWidth={3}
              dot={{ r: 5, fill: '#c0504d' }}
              isAnimationActive={false}
            >
              <LabelList dataKey="Planned" position="top" fill="#c0504d" fontSize={12} fontWeight={600} />
            </Line>
            <Line
              type="monotone"
              dataKey="Actual"
              stroke="#9bbb59"
              strokeWidth={3}
              dot={{ r: 5, fill: '#9bbb59' }}
              isAnimationActive={false}
            >
              <LabelList dataKey="Actual" position="top" fill="#6b8e23" fontSize={12} fontWeight={600} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

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
