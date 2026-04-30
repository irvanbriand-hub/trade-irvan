// Util murni untuk hitung deret data S-Curve dari baseline + targets.
// Dipakai oleh SCurveChart (dashboard), NOCSCurveCapture (Puppeteer page), dan
// SCurveBreakdownTable (ringkasan harian per kolom).
// Logic perhitungan planned/actual identik dengan implementasi awal di
// SCurveChart — di-extract supaya tidak ada duplikasi 3 tempat.

import type { SCurveBaseline, SCurveTarget } from './scurveQueries';

export type SCurveAreaFilter = 'global' | '1' | '2' | '3';

export interface SCurveSeries {
  /** 'dd/MM' untuk x-axis chart. */
  labels: string[];
  /** 'dd/MM/yyyy' untuk header tabel breakdown. */
  fullDates: string[];
  /** ISO 'YYYY-MM-DD' raw, satu per kolom — referensi untuk debugging/test. */
  isoDates: string[];
  /** PLAN ALL: cumulative target_online ≤ tanggal[i]. */
  planned: number[];
  /** PLAN DAILY: planned[i] - planned[i-1]. */
  planDaily: number[];
  /** ACTUAL ALL: cumulative is_online & actual_online ≤ tanggal[i]. null untuk masa depan. */
  actual: (number | null)[];
  /** Total target setelah filter area. */
  totalTarget: number;
}

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

function formatFull(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function formatISO(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${y}-${m}-${d}`;
}

function parseIsoToMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

export function computeSCurveSeries(
  targets: SCurveTarget[],
  baseline: SCurveBaseline,
  area: SCurveAreaFilter,
): SCurveSeries {
  const filtered =
    area === 'global'
      ? targets
      : targets.filter((t) => t.area === Number(area));

  const dates = getDatesBetweenISO(baseline.baseline_date, baseline.end_date);
  const labels = dates.map(formatShort);
  const fullDates = dates.map(formatFull);
  const isoDates = dates.map(formatISO);

  // "Hari ini" WIB → UTC midnight, agar sebanding dengan dateMs
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayMs = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate(),
  );

  const planned = dates.map((date) => {
    const dateMs = date.getTime();
    return filtered.filter((t) => {
      const ms = parseIsoToMs(t.target_online);
      return ms !== null && ms <= dateMs;
    }).length;
  });

  const planDaily = planned.map((v, i) =>
    i === 0 ? v : v - planned[i - 1],
  );

  const actual: (number | null)[] = dates.map((date) => {
    const dateMs = date.getTime();
    if (dateMs > todayMs) return null;
    return filtered.filter((t) => {
      if (!t.is_online) return false;
      const ms = parseIsoToMs(t.actual_online);
      return ms !== null && ms <= dateMs;
    }).length;
  });

  return {
    labels,
    fullDates,
    isoDates,
    planned,
    planDaily,
    actual,
    totalTarget: filtered.length,
  };
}
