// Parser & validator untuk upload baseline S-Curve.
// Menerima 2 input: File (CSV/XLSX) atau text (paste TSV/CSV) yang minimal
// punya kolom site_id + target_online (+ optional actual_online).

export interface SCurveUploadRow {
  site_id: string;
  target_online: string;          // ISO 'YYYY-MM-DD'
  actual_online: string | null;   // ISO 'YYYY-MM-DD', null = belum diisi user
  raw_target: string;             // tampilan raw kalau parsing gagal
  rowIndex: number;               // 1-based, baris di file (excluding header)
}

export interface SCurveUploadError {
  rowIndex: number;
  raw: Record<string, string>;
  reason: string;
}

export interface ParsedSCurveUpload {
  headers: string[];
  validRows: SCurveUploadRow[];
  errorRows: SCurveUploadError[];
  duplicates: number; // jumlah row yang di-dedup (site_id sama, ambil first)
}

interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

const SITE_ID_KEYS = ['site_id', 'siteid', 'site id', 'site'];
const TARGET_KEYS = [
  'target_online',
  'target online',
  'target',
  'target_date',
  'target date',
];
const ACTUAL_KEYS = [
  'actual_online',
  'actual online',
  'actual',
  'actual_date',
  'actual date',
];

const SUPPORTED_DELIMITERS = [',', ';', '\t'] as const;
type Delimiter = typeof SUPPORTED_DELIMITERS[number];

// ─── CSV / TSV parsing (minimal) ─────────────────────────────────────────────

function detectDelimiter(headerLine: string): Delimiter {
  let best: Delimiter = ',';
  let bestCount = 0;
  for (const d of SUPPORTED_DELIMITERS) {
    const count = headerLine.split(d).length - 1;
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === delimiter) {
        out.push(cur);
        cur = '';
      } else if (ch === '"' && cur.length === 0) {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text: string): ParseResult {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip UTF-8 BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows };
}

// ─── Date parsing (DD/MM/YYYY atau YYYY-MM-DD) ───────────────────────────────

function isValidCalendarDate(
  yyyy: string | number,
  mm: string | number,
  dd: string | number,
): boolean {
  const y = typeof yyyy === 'number' ? yyyy : parseInt(yyyy, 10);
  const m = typeof mm === 'number' ? mm : parseInt(mm, 10);
  const d = typeof dd === 'number' ? dd : parseInt(dd, 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Parse "DD/MM/YYYY" atau "YYYY-MM-DD" (dengan optional time) → ISO 'YYYY-MM-DD'. */
function parseIndonesianDate(s: string): string | null {
  if (!s) return null;
  const trimmed = s.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    if (!isValidCalendarDate(iso[1], iso[2], iso[3])) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const match = trimmed.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/,
  );
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  if (!isValidCalendarDate(yyyy, mm, dd)) return null;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

// ─── Excel (.xlsx/.xls) parsing via lazy SheetJS import ──────────────────────

const DATE_FORMAT_RX = /[ymdhs]/i;

interface XLSXCell {
  t?: string;
  v?: unknown;
  w?: string;
  z?: string;
}

interface XLSXModule {
  SSF: { format: (fmt: string, val: number | Date) => string };
}

function cellToString(XLSX: XLSXModule, cell: XLSXCell | undefined): string {
  if (!cell) return '';
  if (
    cell.t === 'n' &&
    typeof cell.v === 'number' &&
    cell.z &&
    DATE_FORMAT_RX.test(String(cell.z))
  ) {
    try {
      const withTime = XLSX.SSF.format('dd/mm/yyyy hh:mm', cell.v);
      return withTime.replace(/ 00:00$/, '').trim();
    } catch {
      // fall through
    }
  }
  if (cell.w != null) return String(cell.w).trim();
  if (cell.v != null) return String(cell.v).trim();
  return '';
}

async function parseExcel(file: File): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellNF: true });

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[firstSheetName];
  const ref = sheet['!ref'];
  if (!ref) return { headers: [], rows: [] };

  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    headers.push(cellToString(XLSX as unknown as XLSXModule, sheet[addr]).trim());
  }

  const rows: Record<string, string>[] = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row: Record<string, string> = {};
    let allEmpty = true;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const v = cellToString(XLSX as unknown as XLSXModule, sheet[addr]);
      if (v !== '') allEmpty = false;
      row[headers[c - range.s.c]] = v;
    }
    if (!allEmpty) rows.push(row);
  }

  return { headers, rows };
}

async function parseFile(file: File): Promise<ParseResult> {
  const ext = (file.name.toLowerCase().split('.').pop() ?? '').trim();
  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(file);
  }
  const text = await file.text();
  return parseCSV(text);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase().trim();
}

function findKey(headers: string[], candidates: string[]): string | null {
  const norm = headers.map(normalizeKey);
  for (const cand of candidates) {
    const idx = norm.indexOf(cand);
    if (idx >= 0) return headers[idx];
  }
  return null;
}

// ─── Validate & normalize ────────────────────────────────────────────────────

/**
 * Validasi & normalisasi dari ParseResult ke SCurveUploadRow[].
 * - Map header dengan tolerant matching.
 * - Parse target_online ke ISO via parseIndonesianDate.
 * - Dedup by site_id (first wins).
 * - Kumpulkan error per row, jangan hard-throw.
 */
export function validateAndNormalize(parsed: ParseResult): ParsedSCurveUpload {
  const { headers, rows } = parsed;

  const siteKey = findKey(headers, SITE_ID_KEYS);
  const targetKey = findKey(headers, TARGET_KEYS);
  const actualKey = findKey(headers, ACTUAL_KEYS); // optional

  if (!siteKey || !targetKey) {
    return {
      headers,
      validRows: [],
      errorRows: rows.map((row, idx) => ({
        rowIndex: idx + 1,
        raw: row,
        reason: !siteKey
          ? 'Kolom site_id tidak ditemukan di header'
          : 'Kolom target_online tidak ditemukan di header',
      })),
      duplicates: 0,
    };
  }

  const validRows: SCurveUploadRow[] = [];
  const errorRows: SCurveUploadError[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  rows.forEach((row, idx) => {
    const siteRaw = (row[siteKey] ?? '').trim();
    const targetRaw = (row[targetKey] ?? '').trim();
    const rowIndex = idx + 1;

    if (!siteRaw) {
      errorRows.push({ rowIndex, raw: row, reason: 'site_id kosong' });
      return;
    }

    const siteId = siteRaw.toUpperCase();
    if (seen.has(siteId)) {
      duplicates++;
      return;
    }

    if (!targetRaw) {
      errorRows.push({
        rowIndex,
        raw: row,
        reason: 'target_online kosong',
      });
      return;
    }

    const iso = parseIndonesianDate(targetRaw);
    if (!iso) {
      errorRows.push({
        rowIndex,
        raw: row,
        reason: `target_online tidak valid: "${targetRaw}" (gunakan format DD/MM/YYYY atau YYYY-MM-DD)`,
      });
      return;
    }

    // actual_online optional: kalau header tidak ada → null. Kalau header ada
    // tapi cell kosong / "-" → null. Kalau ada nilai tapi format invalid → error.
    let actualISO: string | null = null;
    if (actualKey) {
      const actualRaw = (row[actualKey] ?? '').trim();
      if (actualRaw && actualRaw !== '-') {
        const parsedActual = parseIndonesianDate(actualRaw);
        if (!parsedActual) {
          errorRows.push({
            rowIndex,
            raw: row,
            reason: `actual_online tidak valid: "${actualRaw}" (gunakan format DD/MM/YYYY atau YYYY-MM-DD)`,
          });
          return;
        }
        actualISO = parsedActual;
      }
    }

    seen.add(siteId);
    validRows.push({
      site_id: siteId,
      target_online: iso,
      actual_online: actualISO,
      raw_target: targetRaw,
      rowIndex,
    });
  });

  return { headers, validRows, errorRows, duplicates };
}

/** Parse file (.csv/.xlsx/.xls) ke SCurveUploadRow. */
export async function parseSCurveUploadFile(
  file: File,
): Promise<ParsedSCurveUpload> {
  const parsed = await parseFile(file);
  return validateAndNormalize(parsed);
}

/** Parse text (paste TSV/CSV) ke SCurveUploadRow. Auto-detect delimiter. */
export function parseSCurveUploadText(text: string): ParsedSCurveUpload {
  const parsed = parseCSV(text);
  return validateAndNormalize(parsed);
}
