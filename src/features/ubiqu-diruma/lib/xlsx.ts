// Pembuka workbook yang robust lintas-environment.
//
// SheetJS `type:'array'` secara teknis menerima Uint8Array, TAPI perilaku
// berbeda antara build node (butuh Uint8Array; ArrayBuffer → 0 baris) dan build
// browser (ArrayBuffer mentah jalan). Untuk aman di keduanya, kita coba beberapa
// bentuk input dan ambil yang menghasilkan sheet ber-isi.

export interface OpenedWorkbook {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  XLSX: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wb: any;
}

/** Jumlah baris (termasuk header) pada sheet pertama — buat validasi cepat. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstSheetRowCount(XLSX: any, wb: any): number {
  const name = wb?.SheetNames?.[0];
  if (!name) return 0;
  const ws = wb.Sheets[name];
  if (!ws || !ws['!ref']) return 0;
  const m = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return Array.isArray(m) ? m.length : 0;
}

export async function openWorkbook(file: File): Promise<OpenedWorkbook> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx');
  const ab = await file.arrayBuffer();

  const attempts: Array<() => unknown> = [
    () => XLSX.read(new Uint8Array(ab), { type: 'array', cellDates: false }),
    () => XLSX.read(ab, { type: 'array', cellDates: false }),
    () =>
      XLSX.read(new Uint8Array(ab), {
        type: 'array',
        cellDates: false,
        cellNF: true,
      }),
  ];

  let lastErr: unknown = null;
  // Pakai attempt PERTAMA yang valid (>= 2 baris = header + min 1 data).
  // Uint8Array (kanonik) menang duluan; ArrayBuffer hanya fallback.
  for (const attempt of attempts) {
    try {
      const wb = attempt();
      if (wb && firstSheetRowCount(XLSX, wb) >= 2) {
        return { XLSX, wb };
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    `File Excel tidak terbaca (0 baris data). Pastikan file .xls/.xlsx valid hasil export modul. ${
      lastErr instanceof Error ? `(${lastErr.message})` : ''
    }`,
  );
}
