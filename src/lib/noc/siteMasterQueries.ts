import { supabase } from '@/integrations/supabase/client';

// Tabel noc_site_master belum ada di generated Database types → pakai cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Query key React Query bersama (halaman Master Site, Monitoring, mindmap).
export const SITE_MASTER_LIST_QK = ['noc', 'site_master', 'list'] as const;

export interface SiteMaster {
  id: string;
  site_id: string;
  name: string | null;
  kategori_lokasi: string | null;
  ip_address: string | null;
  gateway: string | null;
  provinsi: string | null;
  kabupaten: string | null;
  kecamatan: string | null;
  cluster: string | null;
  desa: string | null;
  hub: string | null;
  beam: string | null;
  longitude: number | null;
  latitude: number | null;
  created_at: string;
  updated_at: string;
}

export type SiteMasterInsert = Omit<SiteMaster, 'id' | 'created_at' | 'updated_at'>;

// Hanya site_id yang wajib; kolom lain opsional supaya bisa PARTIAL update
// (hanya kolom yang ada di file yang di-upsert; kolom lain di DB tetap utuh).
export type SiteMasterUpsert = { site_id: string } & Partial<Omit<SiteMasterInsert, 'site_id'>>;

export interface ParseResult {
  rows: SiteMasterUpsert[];
  skipped: number; // baris tanpa SITE ID
  duplicates: number; // site_id kembar dalam file (di-merge, last-wins)
  total: number; // total baris data (tanpa header)
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Locale ID/EU: koma = desimal. Buang spasi (termasuk nbsp) lalu koma → titik.
  const s = String(v).trim().replace(/\s| /g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Parse file Excel master site → SiteMasterInsert[].
 * Header dicocokkan case-insensitive. Baris tanpa SITE ID dilewati.
 * Duplikat site_id dalam satu file di-merge (baris terakhir menang) supaya
 * upsert onConflict tidak error "affect row a second time".
 */
export async function parseSiteMasterExcel(file: File): Promise<ParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: any = await import('xlsx');
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(ab), { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('File Excel kosong / sheet pertama tidak ditemukan.');

  const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (matrix.length < 2) throw new Error('File tidak punya baris data (hanya header?).');

  const header = (matrix[0] as unknown[]).map((h) => String(h).trim().toUpperCase());
  const idx = (name: string) => header.indexOf(name);

  const c = {
    site_id: idx('SITE ID'),
    name: idx('NAME'),
    kategori_lokasi: idx('KATEGORI LOKASI'),
    ip_address: idx('IP ADDRESS'),
    gateway: idx('GATEWAY'),
    provinsi: idx('PROVINSI'),
    kabupaten: idx('KABUPATEN'),
    kecamatan: idx('KECAMATAN'),
    cluster: idx('CLUSTER'),
    desa: idx('DESA'),
    hub: idx('HUB'),
    beam: idx('BEAM'),
    longitude: idx('LONGITUDE'),
    latitude: idx('LATITUDE'),
  };

  if (c.site_id < 0) {
    throw new Error(
      'Kolom "SITE ID" tidak ditemukan di header. Pastikan baris pertama berisi nama kolom.',
    );
  }

  const byId = new Map<string, SiteMasterUpsert>();
  let skipped = 0;
  let duplicates = 0;

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] as unknown[];
    const siteId = String(row[c.site_id] ?? '').trim();
    if (!siteId) {
      skipped++;
      continue;
    }
    if (byId.has(siteId)) duplicates++;

    // Hanya sertakan kolom yang benar-benar ADA di file (index >= 0).
    // Kolom yang tak ada TIDAK dimasukkan → saat upsert, nilai lama di DB tetap utuh.
    const rec: SiteMasterUpsert = { site_id: siteId };
    if (c.name >= 0) rec.name = str(row[c.name]);
    if (c.kategori_lokasi >= 0) rec.kategori_lokasi = str(row[c.kategori_lokasi]);
    if (c.ip_address >= 0) rec.ip_address = str(row[c.ip_address]);
    if (c.gateway >= 0) rec.gateway = str(row[c.gateway]);
    if (c.provinsi >= 0) rec.provinsi = str(row[c.provinsi])?.toUpperCase() ?? null;
    if (c.kabupaten >= 0) rec.kabupaten = str(row[c.kabupaten]);
    if (c.kecamatan >= 0) rec.kecamatan = str(row[c.kecamatan]);
    if (c.cluster >= 0) rec.cluster = str(row[c.cluster]);
    if (c.desa >= 0) rec.desa = str(row[c.desa]);
    if (c.hub >= 0) rec.hub = str(row[c.hub]);
    if (c.beam >= 0) rec.beam = str(row[c.beam]);
    if (c.longitude >= 0) rec.longitude = toNum(row[c.longitude]);
    if (c.latitude >= 0) rec.latitude = toNum(row[c.latitude]);
    byId.set(siteId, rec);
  }

  return {
    rows: Array.from(byId.values()),
    skipped,
    duplicates,
    total: matrix.length - 1,
  };
}

/**
 * Upsert master site by site_id, dipecah per chunk. Partial: hanya kolom yang
 * ada di tiap objek yang ditulis; kolom lain di DB tidak tersentuh. Jadi upload
 * file berisi cuma (SITE ID + kolom tertentu) aman — tidak menimpa kolom lain.
 */
export async function upsertSiteMaster(rows: SiteMasterUpsert[]): Promise<number> {
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db
      .from('noc_site_master')
      .upsert(chunk, { onConflict: 'site_id' });
    if (error) throw error;
    saved += chunk.length;
  }
  return saved;
}

/** Ambil semua master site (pagination — tabel bisa ribuan baris, >1000). */
export async function fetchSiteMaster(): Promise<SiteMaster[]> {
  const all: SiteMaster[] = [];
  const SIZE = 1000;
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await db
      .from('noc_site_master')
      .select('*')
      .order('site_id', { ascending: true })
      .range(from, from + SIZE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as SiteMaster[]));
    if (!data || data.length < SIZE) break;
  }
  return all;
}

/** Jumlah baris master site (head count, tanpa transfer data). */
export async function countSiteMaster(): Promise<number> {
  const { count, error } = await db
    .from('noc_site_master')
    .select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Hapus semua master site. Pakai filter (WHERE) supaya lolos guard Supabase. */
export async function resetSiteMaster(): Promise<void> {
  const { error } = await db.from('noc_site_master').delete().not('id', 'is', null);
  if (error) throw error;
}
