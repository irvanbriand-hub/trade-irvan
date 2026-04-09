import type { PO, TTRecord, NOCSummary } from './types';

/**
 * Classify how a TT was closed based on tiket internal + down time + status.
 * Returns null if TT is not CLOSED.
 *
 * Rules:
 * - CLOSED + downTime <= 3  → 'noc'
 * - CLOSED + tiketInternal contains 'KUNJUNGAN' → 'om-visit'
 * - CLOSED + lainnya → 'om'
 */
export function getCloseType(
  tiketInternal: string,
  downTime: number,
  status: string,
): 'noc' | 'om' | 'om-visit' | null {
  if (status.toUpperCase() !== 'CLOSED') return null;
  if (downTime <= 3) return 'noc';
  if (tiketInternal.toUpperCase().includes('KUNJUNGAN')) return 'om-visit';
  return 'om';
}

/**
 * Find the active PO responsible for a given site.
 * Priority: kabupaten_coverage dulu, fallback ke provinsi_coverage.
 * Khusus kasus NTT: FIRMAN dan NOVAN berbagi provinsi, bedanya di kabupaten.
 */
export function getPO(
  provinsi: string,
  kabupaten: string,
  poList: PO[],
): PO | null {
  const provUpper = provinsi.toUpperCase();
  const kabUpper = kabupaten.toUpperCase();

  // 1. Cek kabupaten_coverage dulu
  if (kabUpper) {
    const byKab = poList.find(
      (po) =>
        po.status === 'active' &&
        po.kabupaten_coverage.some((k) => k.toUpperCase() === kabUpper),
    );
    if (byKab) return byKab;
  }

  // 2. Fallback ke provinsi_coverage
  return (
    poList.find(
      (po) =>
        po.status === 'active' &&
        po.provinsi_coverage.some((p) => p.toUpperCase() === provUpper),
    ) ?? null
  );
}

/**
 * Convert hours to days (floor).
 */
export function hoursToDays(hours: number): number {
  return Math.floor(hours / 24);
}

/**
 * Hitung NOCSummary dari array TTRecord.
 */
export function computeSummary(records: TTRecord[]): NOCSummary {
  const byArea: NOCSummary['byArea'] = { 1: empty(), 2: empty(), 3: empty() };

  for (const r of records) {
    const isClosed = r.status === 'CLOSED';
    const isOpen = r.status === 'OPEN';
    const area = r.area;
    if (area === 1 || area === 2 || area === 3) {
      byArea[area].total++;
      if (isOpen) byArea[area].open++;
      if (isClosed) byArea[area].closed++;
      if (r.closeType === 'noc') byArea[area].closeNOC++;
      if (r.closeType === 'om') byArea[area].closeOM++;
      if (r.closeType === 'om-visit') byArea[area].closeVisit++;
    }
  }

  return {
    totalTT: records.length,
    totalOpen: records.filter((r) => r.status === 'OPEN').length,
    totalClosed: records.filter((r) => r.status === 'CLOSED').length,
    closeNOC: records.filter((r) => r.closeType === 'noc').length,
    closeOM: records.filter((r) => r.closeType === 'om').length,
    closeVisit: records.filter((r) => r.closeType === 'om-visit').length,
    teknis: records.filter((r) => r.teknisNT === 'TEKNIS').length,
    nonTeknis: records.filter((r) => r.teknisNT === 'NON TEKNIS').length,
    byArea,
  };
}

function empty() {
  return { total: 0, open: 0, closed: 0, closeNOC: 0, closeOM: 0, closeVisit: 0 };
}
