// Parser workbook datasheet referensi (1 file, banyak sheet).
// Sheet yang dibaca:
//   - PRODUCT      : PAKET NAME -> PRODUCT
//   - PO           : PROVINS + KABUPATEN -> NAMA PO
//   - HTB (opsional): daftar lokasi HTB (sheet apapun yg namanya memuat "HTB"
//                     KECUALI "DEFINISI HTB" yg cuma berisi aturan, bukan data).
// Toleran terhadap urutan kolom & spasi/tab nyasar di nilai.

import type { ParsedDatasheet } from './types';
import { openWorkbook } from './xlsx';

/** Rapikan spasi ganda / tab / newline jadi 1 spasi + trim. */
function clean(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/** Baca sheet jadi { headers, rows } (array mode). */
function readSheet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XLSX: any,
  ws: unknown,
): { headers: string[]; rows: string[][] } {
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
  if (!matrix.length) return { headers: [], rows: [] };
  const headers = (matrix[0] as unknown[]).map((h) => clean(h).toUpperCase());
  const rows = matrix.slice(1) as string[][];
  return { headers, rows };
}

function colIdx(headers: string[], name: string): number {
  const t = name.toUpperCase();
  return headers.findIndex((h) => h === t);
}

export async function parseDatasheetFile(file: File): Promise<ParsedDatasheet> {
  const { XLSX, wb } = await openWorkbook(file);

  const result: ParsedDatasheet = { product: [], po: [], htbSites: [] };

  for (const name of wb.SheetNames) {
    const norm = name.trim().toUpperCase();
    const ws = wb.Sheets[name];
    const { headers, rows } = readSheet(XLSX, ws);

    if (norm === 'PRODUCT') {
      const ci = {
        paket: colIdx(headers, 'PAKET NAME'),
        product: colIdx(headers, 'PRODUCT'),
      };
      for (const r of rows) {
        const paket_name = clean(r[ci.paket]);
        const product = clean(r[ci.product]);
        if (paket_name && product) result.product.push({ paket_name, product });
      }
    } else if (norm === 'PO') {
      const ci = {
        prov: colIdx(headers, 'PROVINS'),
        po: colIdx(headers, 'NAMA PO'),
        kab: colIdx(headers, 'KABUPATEN'),
      };
      for (const r of rows) {
        const provins = clean(r[ci.prov]);
        const nama_po = clean(r[ci.po]);
        const kabupaten = clean(r[ci.kab]) || 'All';
        if (provins && nama_po) result.po.push({ provins, kabupaten, nama_po });
      }
    } else if (norm.includes('HTB') && norm !== 'DEFINISI HTB') {
      // Sheet daftar lokasi HTB. Coba kolom bernama SITE/LOKASI/SITE ID dulu,
      // fallback ke kolom pertama yang ada isinya.
      let keyCol = [
        'SITE KEY', 'SITE ID', 'SITEID', 'SITE', 'LOKASI', 'NAMA LOKASI',
        'SUBSCRIBER NAME',
      ]
        .map((n) => colIdx(headers, n))
        .find((idx) => idx >= 0);
      if (keyCol === undefined || keyCol < 0) keyCol = 0;
      for (const r of rows) {
        const site_key = clean(r[keyCol]);
        if (site_key) result.htbSites.push({ site_key });
      }
    }
  }

  return result;
}
