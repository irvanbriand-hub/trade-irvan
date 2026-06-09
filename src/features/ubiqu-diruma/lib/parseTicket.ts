// Parser file Excel tiket (.xls/.xlsx — sebenarnya OOXML).
// Header file tiket punya DUPLIKAT ("TICKET DATE" muncul 3×, "LAST TICKET DETAIL
// DATE" 2×), jadi WAJIB baca mode array (header:1) + ambil kolom by index nama
// pertama yang cocok — bukan object-key (yang akan saling timpa).

import type { TicketRaw } from './types';
import { openWorkbook } from './xlsx';

/** Cari index kolom pertama yang cocok (trim + case-insensitive). -1 kalau tak ada. */
function findCol(headers: string[], name: string): number {
  const target = name.trim().toUpperCase();
  return headers.findIndex((h) => String(h).trim().toUpperCase() === target);
}

/** True kalau row ini baris header (memuat TICKET ID & PACKAGE NAME). */
function isHeaderRow(row: unknown[]): boolean {
  const up = row.map((c) => String(c ?? '').trim().toUpperCase());
  return up.includes('TICKET ID') && up.includes('PACKAGE NAME');
}

export async function parseTicketFile(file: File): Promise<TicketRaw[]> {
  const { XLSX, wb } = await openWorkbook(file);

  // Scan SEMUA sheet & ~80 baris pertama untuk menemukan baris header yang benar.
  // (Export modul bisa pakai sheet "Report" dgn banner/preamble sebelum header.)
  let matrix: unknown[][] = [];
  let headerIdx = -1;
  let sheetName = wb.SheetNames[0] ?? '';
  let firstNonEmptyPreview = '';

  for (const name of wb.SheetNames as string[]) {
    const ws = wb.Sheets[name];
    const m = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    const scan = Math.min(80, m.length);
    for (let h = 0; h < scan; h++) {
      const row = m[h] as unknown[];
      if (!firstNonEmptyPreview && row.some((c) => String(c ?? '').trim())) {
        firstNonEmptyPreview = JSON.stringify(
          row.slice(0, 12).map((c) => String(c ?? '').slice(0, 20)),
        );
      }
      if (isHeaderRow(row)) {
        matrix = m;
        headerIdx = h;
        sheetName = name;
        break;
      }
    }
    if (headerIdx >= 0) break;
  }

  if (headerIdx < 0) {
    throw new Error(
      `Struktur file tiket tidak dikenali — baris header dgn "TICKET ID" + "PACKAGE NAME" tidak ditemukan di sheet manapun (cek 80 baris teratas). Sheet pertama: "${sheetName}". Baris berisi pertama: ${firstNonEmptyPreview || '(semua kosong)'}.`,
    );
  }

  const headers = (matrix[headerIdx] as unknown[]).map((h) => String(h ?? ''));

  const col = {
    ticket_id: findCol(headers, 'TICKET ID'),
    ticket_number: findCol(headers, 'TICKET NUMBER'),
    site_id: findCol(headers, 'SUBSCRIBER NUMBER'),
    site_name: findCol(headers, 'SUBSCRIBER NAME'),
    province: findCol(headers, 'PROVINCE NAME'),
    city: findCol(headers, 'CITY NAME'),
    district: findCol(headers, 'DISTRICT NAME'),
    package_name: findCol(headers, 'PACKAGE NAME'),
    trouble_category: findCol(headers, 'TROUBLE CATEGORY'),
    dur_days: findCol(headers, 'DUR DAYS'),
    ticket_status: findCol(headers, 'TICKET STATUS'),
    ticket_date: findCol(headers, 'DATE CREATED'),
    address: findCol(headers, 'ADDR INSTALLATION'),
  };

  const get = (row: unknown[], idx: number): string =>
    idx >= 0 ? String(row[idx] ?? '').trim() : '';

  const out: TicketRaw[] = [];
  // Data mulai SETELAH baris header (header bisa bukan di baris 0).
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    const ticket_id = get(row, col.ticket_id);
    // Baris tanpa TICKET ID dianggap kosong/footer → skip.
    if (!ticket_id) continue;

    const durRaw = get(row, col.dur_days).replace(/[^\d.-]/g, '');
    out.push({
      ticket_id,
      ticket_number: get(row, col.ticket_number) || ticket_id,
      site_id: get(row, col.site_id),
      site_name: get(row, col.site_name),
      province: get(row, col.province),
      city: get(row, col.city),
      district: get(row, col.district),
      package_name: get(row, col.package_name),
      trouble_category: get(row, col.trouble_category),
      dur_days: Number(durRaw) || 0,
      ticket_status: get(row, col.ticket_status),
      ticket_date: get(row, col.ticket_date),
      address: get(row, col.address),
    });
  }
  return out;
}
