import { supabase } from '@/integrations/supabase/client';
import { AREA_MAP } from './constants';
import { getPO } from './classifiers';
import type { PO, TTRecordDB } from './types';

// s_curve_baselines & s_curve_targets belum ada di generated Database types.
// Pakai cast ini untuk semua query ke tabel S-Curve sampai `supabase gen types` dijalankan ulang.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SCurveBaseline {
  id: string;
  baseline_date: string;  // 'YYYY-MM-DD'
  end_date: string;       // 'YYYY-MM-DD'
  label: string;
  total_target: number;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
  completed_at: string | null;
}

export interface SCurveTarget {
  id: string;
  baseline_id: string;
  site_id: string;
  ticket_id: string;
  site_name: string | null;
  target_online: string | null;    // 'YYYY-MM-DD'
  actual_online: string | null;    // 'YYYY-MM-DD'
  is_online: boolean;
  online_detected_at: string | null;
  po_name: string | null;
  provinsi: string | null;
  kabupaten: string | null;
  area: number | null;
  created_at: string;
}

export interface FixTargetResult {
  baselineId: string;
  totalTarget: number;
  label: string;
  replaced: boolean;  // true kalau override baseline yang sudah ada di tanggal sama
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getWIBDate(offsetDays = 0): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  wib.setUTCDate(wib.getUTCDate() + offsetDays);
  return wib.toISOString().split('T')[0];
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Parse tanggal fleksibel ke ISO 'YYYY-MM-DD'.
 * Terima: "DD/M/YY", "DD/MM/YYYY", "YYYY-MM-DD".
 * Return null kalau kosong, '-', atau format tidak dikenal.
 */
function parseTargetToISODate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === '-') return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

function getAreaFromProvinsi(provinsi: string | null | undefined): number {
  if (!provinsi) return 0;
  return AREA_MAP[provinsi.toUpperCase()] ?? 0;
}

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatBaselineLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `WM ${d} ${BULAN_ID[m - 1]} ${y}`;
}

// ─── Main functions ──────────────────────────────────────────────────────────

/**
 * Snapshot semua TT OPEN saat ini jadi baseline S-Curve baru.
 * Alur:
 *  1. Ambil TT OPEN + PO list
 *  2. Kalau ada baseline di tanggal WIB hari ini → delete (cascade ke targets)
 *  3. Tandai semua baseline 'active' lain → 'completed'
 *  4. Insert baseline baru (status='active')
 *  5. Snapshot semua TT OPEN ke s_curve_targets
 */
export async function fixTargetBaseline(): Promise<FixTargetResult> {
  // 1. TT OPEN
  const { data: openRecords, error: ttError } = await db
    .from('tt_records')
    .select('*')
    .eq('status', 'OPEN');

  if (ttError) throw ttError;
  if (!openRecords || openRecords.length === 0) {
    throw new Error('Tidak ada TT OPEN untuk dijadikan baseline');
  }

  // 2. PO list
  const { data: poList, error: poError } = await supabase
    .from('po_list')
    .select('*')
    .eq('status', 'active');

  if (poError) throw poError;

  // 3. Tanggal baseline (WIB)
  const baselineDate = getWIBDate();
  const endDate = addDays(baselineDate, 7);
  const label = formatBaselineLabel(baselineDate);

  // 4. Cek baseline di tanggal yang sama → override
  const { data: existing, error: existingError } = await db
    .from('s_curve_baselines')
    .select('id')
    .eq('baseline_date', baselineDate)
    .maybeSingle();

  if (existingError) throw existingError;

  let replaced = false;
  if (existing) {
    const { error: delError } = await db
      .from('s_curve_baselines')
      .delete()
      .eq('id', (existing as { id: string }).id);
    if (delError) throw delError;
    replaced = true;
  }

  // 5. Tandai semua baseline 'active' lain → 'completed'
  const { error: completeError } = await db
    .from('s_curve_baselines')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'active');
  if (completeError) throw completeError;

  // 6. Insert baseline baru
  const { data: newBaseline, error: insertError } = await db
    .from('s_curve_baselines')
    .insert({
      baseline_date: baselineDate,
      end_date: endDate,
      label,
      total_target: openRecords.length,
      status: 'active',
    })
    .select()
    .single();

  if (insertError) throw insertError;

  // 7. Snapshot TT OPEN ke s_curve_targets
  const records = openRecords as unknown as TTRecordDB[];
  const targets = records.map((r) => {
    const po = getPO(r.provinsi ?? '', r.kabupaten ?? '', (poList as PO[]) ?? []);
    return {
      baseline_id: (newBaseline as SCurveBaseline).id,
      site_id: r.site_id ?? '',
      ticket_id: r.ticket_id,
      site_name: r.site_name ?? null,
      target_online: parseTargetToISODate(r.target_online_original),
      po_name: po?.name ?? 'Unknown',
      provinsi: r.provinsi ?? null,
      kabupaten: r.kabupaten ?? null,
      area: getAreaFromProvinsi(r.provinsi),
    };
  });

  const { error: targetsError } = await db
    .from('s_curve_targets')
    .insert(targets);

  if (targetsError) throw targetsError;

  return {
    baselineId: (newBaseline as SCurveBaseline).id,
    totalTarget: openRecords.length,
    label,
    replaced,
  };
}

/**
 * Ambil baseline aktif saat ini. Return null kalau tidak ada.
 */
export async function getActiveBaseline(): Promise<SCurveBaseline | null> {
  const { data, error } = await db
    .from('s_curve_baselines')
    .select('*')
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return (data as SCurveBaseline) ?? null;
}

/**
 * Ambil baseline terakhir yang completed (untuk final report Selasa malam).
 * Return null kalau belum ada yang completed.
 */
export async function getLastCompletedBaseline(): Promise<SCurveBaseline | null> {
  const { data, error } = await db
    .from('s_curve_baselines')
    .select('*')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SCurveBaseline) ?? null;
}

/**
 * Ambil baseline berdasarkan baseline_date ISO (untuk lookup historis).
 * Return null kalau tidak ada.
 */
export async function getBaselineByDate(isoDate: string): Promise<SCurveBaseline | null> {
  const { data, error } = await db
    .from('s_curve_baselines')
    .select('*')
    .eq('baseline_date', isoDate)
    .maybeSingle();

  if (error) throw error;
  return (data as SCurveBaseline) ?? null;
}

/**
 * Ambil semua targets untuk baseline tertentu.
 */
export async function getTargetsByBaseline(baselineId: string): Promise<SCurveTarget[]> {
  const { data, error } = await db
    .from('s_curve_targets')
    .select('*')
    .eq('baseline_id', baselineId)
    .order('area', { ascending: true });

  if (error) throw error;
  return (data as SCurveTarget[]) ?? [];
}

/**
 * Scan tt_records terkini, update target di baseline aktif yang sudah online.
 * Kriteria online:
 *  A) Ticket masih ada di tt_records, status='CLOSED', actual_online terisi (bukan '-'/empty)
 *     → actual_online = parse dari tt_records.actual_online
 *  B) Ticket hilang dari tt_records (sudah dihapus di Sheet)
 *     → actual_online = tanggal deteksi (hari ini, WIB)
 *
 * Return: jumlah target yang baru di-mark online.
 */
export async function updateBaselineActuals(): Promise<number> {
  // 1. Baseline aktif
  const baseline = await getActiveBaseline();
  if (!baseline) return 0;

  // 2. Target yang belum online
  const { data: targets, error: targetsError } = await db
    .from('s_curve_targets')
    .select('id, ticket_id')
    .eq('baseline_id', baseline.id)
    .eq('is_online', false);

  if (targetsError) throw targetsError;
  if (!targets || targets.length === 0) return 0;

  // 3. tt_records terkini untuk matching (minimal field)
  const { data: currentRecords, error: ttError } = await db
    .from('tt_records')
    .select('ticket_id, status, actual_online');

  if (ttError) throw ttError;

  const recordMap = new Map<string, { status: string; actual_online: string | null }>();
  for (const r of (currentRecords as Array<{ ticket_id: string; status: string; actual_online: string | null }>) ?? []) {
    recordMap.set(r.ticket_id, { status: r.status, actual_online: r.actual_online });
  }

  // 4. Tentukan target yang baru online
  const now = new Date().toISOString();
  const todayWIB = getWIBDate();
  const updates: Array<{ id: string; actual_online: string }> = [];

  for (const target of targets as Array<{ id: string; ticket_id: string }>) {
    const record = recordMap.get(target.ticket_id);
    let actualOnline: string | null = null;

    if (!record) {
      // Opsi B: ticket hilang dari sheet
      actualOnline = todayWIB;
    } else if (
      record.status === 'CLOSED' &&
      record.actual_online &&
      record.actual_online.trim() !== '' &&
      record.actual_online.trim() !== '-'
    ) {
      // Opsi A: actual_online terisi di sheet
      actualOnline = parseTargetToISODate(record.actual_online) ?? todayWIB;
    }

    if (actualOnline) {
      updates.push({ id: target.id, actual_online: actualOnline });
    }
  }

  if (updates.length === 0) return 0;

  // 5. Batch update paralel (200 rows ~ < 2s)
  await Promise.all(
    updates.map((u) =>
      db
        .from('s_curve_targets')
        .update({
          is_online: true,
          actual_online: u.actual_online,
          online_detected_at: now,
        })
        .eq('id', u.id)
        .then(({ error }: { error: unknown }) => {
          if (error) throw error;
        }),
    ),
  );

  return updates.length;
}

/**
 * Hitung jumlah TT dengan status OPEN saat ini. Dipakai di Fix Target dialog
 * untuk preview berapa site yang akan di-snapshot.
 */
export async function getOpenTTCount(): Promise<number> {
  const { count, error } = await db
    .from('tt_records')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'OPEN');
  if (error) throw error;
  return count ?? 0;
}

/**
 * Hapus baseline aktif + semua targets-nya (cascade).
 * Return true kalau ada yang dihapus, false kalau tidak ada baseline aktif.
 */
export async function resetActiveBaseline(): Promise<boolean> {
  const baseline = await getActiveBaseline();
  if (!baseline) return false;

  const { error } = await db
    .from('s_curve_baselines')
    .delete()
    .eq('id', baseline.id);

  if (error) throw error;
  return true;
}
