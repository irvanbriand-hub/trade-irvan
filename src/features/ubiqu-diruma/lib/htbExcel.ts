// Generate & baca-balik Excel HTB (output roundtrip offline).
//
// FLOW:
//   buildHtbWorkbookBlob → file .xlsx untuk di-download tim Performa.
//     • Progress Teknisi PRE-FILLED dari simpanan (edits, kunci ticket_id/TT).
//     • 5 kolom Aset (Progress Spare, No MRQ, RESI, MOD, MOS) selalu KOSONG.
//   readHtbProgressTeknisi → baca file yang sudah diisi OM/Aset, ambil HANYA
//     Progress Teknisi per tiket (kunci = TT yang diekstrak dari "No Tiket").

import type { DatasetRow, UbiquEdit } from './types';
import { HTB_EXCEL_HEADERS, htbExcelTitle } from './types';
import { findEdit, effProgressTeknisi } from './queries';
import { openWorkbook } from './xlsx';

/** Ekstrak token "TT 1038696" dari string No Tiket lengkap. '' kalau tak ada. */
export function extractTT(noTiket: string): string {
  const m = String(noTiket ?? '').match(/TT\s*\d+/i);
  return m ? m[0].replace(/\s+/, ' ').toUpperCase().trim() : '';
}

/**
 * Bangun workbook Excel HTB (sheet "HTB") → Blob untuk download.
 * Layout persis contoh referensi: row1=judul (merah), row3=12 header
 * (kuning + autofilter), row4+ data berborder. Pakai xlsx-js-style untuk styling.
 */
export async function buildHtbWorkbookBlob(
  htbRows: DatasetRow[], // sudah filter HTB + sorted dur_days desc
  edits: UbiquEdit[],
  dateLabel: string, // 'DD/MM/YYYY'
  timeLabel: string, // 'HH:MM'
): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx-js-style');

  const aoa: (string | number)[][] = [];
  aoa.push([]); // row 0 — kosong
  aoa.push([htbExcelTitle(dateLabel, timeLabel)]); // row 1 — judul
  aoa.push([]); // row 2 — kosong
  aoa.push([...HTB_EXCEL_HEADERS]); // row 3 — header (12 kolom)

  htbRows.forEach((row, idx) => {
    const edit = findEdit(edits, row.ticket_id);
    aoa.push([
      idx + 1, // No
      row.ticket_number, // No Tiket (lengkap)
      row.site_id, // Site ID (string — hindari notasi ilmiah)
      row.site_name, // Nama Lokasi
      row.province, // Provinsi
      row.dur_days, // Umur Tiket (Hari)
      '', // Progress Spare      (Aset — kosong)
      effProgressTeknisi(edit), // Progress Teknisi   (pre-filled)
      '', // No MRQ             (Aset — kosong)
      '', // RESI               (Aset — kosong)
      '', // MOD                (Aset — kosong)
      '', // MOS                (Aset — kosong)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const NCOL = HTB_EXCEL_HEADERS.length; // 12
  const HEADER_R = 3; // 0-based baris header
  const lastDataR = HEADER_R + htbRows.length;

  ws['!cols'] = [
    { wch: 4 }, // No
    { wch: 38 }, // No Tiket
    { wch: 13 }, // Site ID
    { wch: 24 }, // Nama Lokasi
    { wch: 18 }, // Provinsi
    { wch: 9 }, // Umur
    { wch: 20 }, // Progress Spare
    { wch: 22 }, // Progress Teknisi
    { wch: 26 }, // No MRQ
    { wch: 18 }, // RESI
    { wch: 12 }, // MOD
    { wch: 12 }, // MOS
  ];
  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: NCOL - 1 } }];
  ws['!rows'] = [];
  ws['!rows'][1] = { hpt: 22 }; // judul
  ws['!rows'][HEADER_R] = { hpt: 30 }; // header
  // Autofilter dropdown di baris header.
  ws['!autofilter'] = {
    ref: `${XLSX.utils.encode_cell({ r: HEADER_R, c: 0 })}:${XLSX.utils.encode_cell(
      { r: HEADER_R, c: NCOL - 1 },
    )}`,
  };
  // Freeze: baris di bawah header tetap nampak saat scroll.
  ws['!freeze'] = {
    xSplit: 0,
    ySplit: HEADER_R + 1,
    topLeftCell: `A${HEADER_R + 2}`,
    activePane: 'bottomLeft',
    state: 'frozen',
  };

  // ── Styling ────────────────────────────────────────────────────────────────
  const thin = { style: 'thin', color: { rgb: 'BFBFBF' } };
  const allBorder = { top: thin, bottom: thin, left: thin, right: thin };

  function setStyle(r: number, c: number, s: Record<string, unknown>) {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = s;
  }

  // Judul (merah, bold).
  setStyle(1, 0, {
    font: { bold: true, sz: 12, color: { rgb: 'FF0000' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  });

  // Header (kuning, bold, center, border).
  for (let c = 0; c < NCOL; c++) {
    setStyle(HEADER_R, c, {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } },
      font: { bold: true, sz: 11, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allBorder,
    });
  }

  // Data (border + wrap; No & Umur center).
  for (let r = HEADER_R + 1; r <= lastDataR; r++) {
    for (let c = 0; c < NCOL; c++) {
      const center = c === 0 || c === 5; // No, Umur
      setStyle(r, c, {
        font: { sz: 10, color: { rgb: '000000' } },
        alignment: {
          horizontal: center ? 'center' : 'left',
          vertical: 'top',
          wrapText: true,
        },
        border: allBorder,
      });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HTB');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export interface HtbProgressEntry {
  ticketId: string; // TT... (kunci edit)
  noTiket: string; // string No Tiket asli (untuk debug/laporan)
  progressTeknisi: string;
}

export interface HtbReadResult {
  entries: HtbProgressEntry[]; // hanya yang punya TT + Progress Teknisi terisi
  skippedNoTT: number; // baris dengan Progress Teknisi terisi tapi No Tiket tanpa TT
}

/**
 * Baca file Excel HTB yang sudah diisi → ambil Progress Teknisi per tiket.
 * Toleran: cari baris header yang memuat "No Tiket" + "Progress Teknisi"
 * (case-insensitive, trim trailing space). Sel Progress Teknisi kosong dilewati.
 */
export async function readHtbProgressTeknisi(
  file: File,
): Promise<HtbReadResult> {
  const { XLSX, wb } = await openWorkbook(file);

  const norm = (v: unknown) => String(v ?? '').trim().toUpperCase();

  // Cari sheet + baris header. Default sheet "HTB" kalau ada, else scan semua.
  const sheetNames: string[] = wb.SheetNames ?? [];
  const ordered = sheetNames.includes('HTB')
    ? ['HTB', ...sheetNames.filter((n) => n !== 'HTB')]
    : sheetNames;

  for (const name of ordered) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const m = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    let headerIdx = -1;
    let colNoTiket = -1;
    let colProgress = -1;
    const scan = Math.min(40, m.length);
    for (let h = 0; h < scan; h++) {
      const cells = (m[h] ?? []).map(norm);
      const ti = cells.findIndex((c) => c === 'NO TIKET');
      const pi = cells.findIndex((c) => c === 'PROGRESS TEKNISI');
      if (ti >= 0 && pi >= 0) {
        headerIdx = h;
        colNoTiket = ti;
        colProgress = pi;
        break;
      }
    }
    if (headerIdx < 0) continue;

    const entries: HtbProgressEntry[] = [];
    let skippedNoTT = 0;
    for (let i = headerIdx + 1; i < m.length; i++) {
      const row = m[i] ?? [];
      const noTiket = String(row[colNoTiket] ?? '').trim();
      const progress = String(row[colProgress] ?? '').trim();
      if (!progress) continue; // kosong = tidak diubah
      const tt = extractTT(noTiket);
      if (!tt) {
        skippedNoTT++;
        continue;
      }
      entries.push({ ticketId: tt, noTiket, progressTeknisi: progress });
    }
    return { entries, skippedNoTT };
  }

  throw new Error(
    'Tidak menemukan baris header dengan kolom "No Tiket" + "Progress Teknisi". ' +
      'Pastikan ini file Excel HTB hasil download dari halaman ini.',
  );
}
