import { AREA_MAP } from './constants';
import { getCloseType, getPO } from './classifiers';
import type { TTRecord, PO } from './types';

/** Strip prefix administratif (KAB., KAB , KOTA ) sebelum matching. */
function normalizeKabupaten(raw: string): string {
  return raw.trim().toUpperCase().replace(/^(KAB\.|KAB\s+|KOTA\s+)/, '').trim();
}

/**
 * Parse raw TSV string (copied from Google Sheet) into TTRecord[].
 *
 * Expected column order (16 cols, tab-separated):
 * 0  TIKET INTERNAL
 * 1  TICKET ID
 * 2  SITE ID
 * 3  STATUS
 * 4  SITE NAME
 * 5  PROVINSI
 * 6  KABUPATEN
 * 7  LAYANAN
 * 8  DATE START TT
 * 9  DOWN TIME
 * 10 TARGET ONLINE
 * 11 ACTUAL ONLINE
 * 12 PROBLEM CLASSIFICATION
 * 13 DETAIL PROBLEM
 * 14 NOTE
 * 15 TEKNIS/NON TEKNIS
 */
export function parseTSV(raw: string, poList: PO[]): TTRecord[] {
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return [];

  // Skip header row (deteksi dari kolom STATUS di index 3)
  const dataLines = lines.slice(1);

  return dataLines
    .filter((line) => line.trim())
    .map((line): TTRecord | null => {
      const cols = line.replace(/\r$/, '').split('\t');

      const tiketInternal = cols[0]?.trim() ?? '';
      const ticketId = cols[1]?.trim() ?? '';
      const siteId = cols[2]?.trim() ?? '';
      const status = (cols[3]?.trim() ?? '').toUpperCase();
      const siteName = cols[4]?.trim() ?? '';
      const provinsi = (cols[5]?.trim() ?? '').toUpperCase();
      const kabupaten = normalizeKabupaten(cols[6] ?? '');
      const layanan = cols[7]?.trim() ?? '';
      const dateStart = cols[8]?.trim() ?? '';
      const downTime = parseInt((cols[9]?.trim() ?? '').replace(/[^0-9]/g, '')) || 0;
      const targetOnline = cols[10]?.trim() ?? '';
      const actualOnline = cols[11]?.trim() ?? '';
      const probClass = cols[12]?.trim() ?? '';
      const detailProb = cols[13]?.trim() ?? '';
      const note = cols[14]?.trim() ?? '';
      const teknisNT = (cols[15]?.trim() ?? '').toUpperCase();

      // Skip baris yang status-nya bukan OPEN/CLOSED
      if (status !== 'OPEN' && status !== 'CLOSED') return null;

      const areaRaw = AREA_MAP[provinsi];
      const area = (areaRaw === 1 || areaRaw === 2 || areaRaw === 3 ? areaRaw : 0) as
        | 0 | 1 | 2 | 3;

      const closeType = getCloseType(tiketInternal, downTime, status);
      const po = getPO(provinsi, kabupaten, poList);
      const isVisit = tiketInternal.toUpperCase().includes('KUNJUNGAN');

      return {
        tiketInternal,
        ticketId,
        siteId,
        status,
        siteName,
        provinsi,
        kabupaten,
        layanan,
        dateStart,
        downTime,
        targetOnline,
        actualOnline,
        probClass,
        detailProb,
        note,
        teknisNT,
        area,
        po,
        closeType,
        isReschedule: note !== '' && note !== '-',
        isVisit,
      };
    })
    .filter((r): r is TTRecord => r !== null);
}
