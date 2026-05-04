import { supabase } from '@/integrations/supabase/client';
import { AREA_MAP } from './constants';
import { getPO } from './classifiers';
import type { PO, TTRecordDB } from './types';
import type { SCurveUploadRow } from './scurveUploadParser';

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
 * Buat baseline S-Curve dari hasil upload manual (Excel / CSV / paste TSV).
 * Source of truth: list site dari user, BUKAN snapshot tt_records.
 *
 * Alur:
 *  1. Validasi: minimal 1 row valid
 *  2. Ambil TT OPEN dari tt_records → map by site_id (uppercase) untuk resolve metadata
 *  3. Ambil PO list active untuk resolve PO/area
 *  4. Tanggal baseline = WIB today; kalau ada baseline di tanggal sama → delete (replaced=true)
 *  5. Tandai semua baseline 'active' lain → 'completed'
 *  6. Insert baseline baru
 *  7. Untuk tiap upload row:
 *     - Site ada di tt_records OPEN → masuk sebagai outstanding (is_online=false), metadata
 *       (site_name, provinsi, kabupaten, ticket_id) diisi dari tt_records
 *     - Site tidak ada → dianggap close on-time: is_online=true, actual_online=target_online,
 *       metadata kosong (site_name='Unknown', area=0), ticket_id pakai site_id sebagai placeholder
 *  8. Bulk insert ke s_curve_targets
 */
export async function createBaselineFromUpload(
  uploadRows: SCurveUploadRow[],
  baselineDateISO: string,
): Promise<FixTargetResult> {
  if (uploadRows.length === 0) {
    throw new Error('Tidak ada baris valid di data upload');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baselineDateISO)) {
    throw new Error('Tanggal baseline tidak valid (harus YYYY-MM-DD)');
  }

  // 1. TT OPEN — buat lookup map by site_id (uppercase, sama seperti parser)
  const { data: openRecords, error: ttError } = await db
    .from('tt_records')
    .select('*')
    .eq('status', 'OPEN');

  if (ttError) throw ttError;

  const ttMap = new Map<string, TTRecordDB>();
  for (const r of (openRecords as TTRecordDB[]) ?? []) {
    const sid = (r.site_id ?? '').toUpperCase().trim();
    if (sid && !ttMap.has(sid)) ttMap.set(sid, r);
  }

  // 2. PO list
  const { data: poList, error: poError } = await supabase
    .from('po_list')
    .select('*')
    .eq('status', 'active');

  if (poError) throw poError;

  // 2b. Master noc_perf_sites — fallback source untuk area kalau site tidak ada
  // di tt_records OPEN (mis. site sudah online sebelum tracking) atau provinsi-nya
  // empty/typo. Filter by site_id IN (...) supaya gak kena 1000-row PostgREST limit.
  const uploadSiteIds = uploadRows.map((r) => r.site_id);
  const { data: masterSites, error: masterErr } = await db
    .from('noc_perf_sites')
    .select('site_id, province')
    .in('site_id', uploadSiteIds);
  if (masterErr) throw masterErr;

  const masterSiteMap = new Map<string, string>();
  for (const s of (masterSites as Array<{ site_id: string; province: string | null }>) ?? []) {
    const sid = (s.site_id ?? '').toUpperCase().trim();
    if (sid) masterSiteMap.set(sid, s.province ?? '');
  }

  // 3. Baseline date dari user, end_date = max target_online (atau baseline_date kalau lebih kecil)
  const baselineDate = baselineDateISO;
  const targetDates = uploadRows
    .map((r) => r.target_online)
    .filter((d): d is string => !!d);
  const maxTarget = targetDates.reduce(
    (acc, cur) => (cur > acc ? cur : acc),
    baselineDate,
  );
  const endDate = maxTarget > baselineDate ? maxTarget : baselineDate;
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
      total_target: uploadRows.length,
      status: 'active',
    })
    .select()
    .single();

  if (insertError) throw insertError;

  const baselineId = (newBaseline as SCurveBaseline).id;
  const nowIso = new Date().toISOString();
  const poListTyped = (poList as PO[]) ?? [];

  // 7. Build targets dari upload rows.
  //
  // Resolusi actual_online (priority):
  //  a) Kalau row.actual_online di-isi user di upload → SELALU pakai itu, mark online.
  //     (Override valid baik untuk site di tt_records maupun yang tidak.)
  //  b) Kalau kosong + site ada di tt_records OPEN → outstanding (is_online=false),
  //     auto-sync via updateBaselineActuals() saat sync TT.
  //  c) Kalau kosong + site tidak ada di tt_records → fallback close di baseline_date
  //     (asumsi sudah online sebelum tracking dimulai).
  const targets = uploadRows.map((row) => {
    const existingTT = ttMap.get(row.site_id);
    const userActual = row.actual_online; // null kalau tidak diisi

    if (existingTT) {
      const po = getPO(
        existingTT.provinsi ?? '',
        existingTT.kabupaten ?? '',
        poListTyped,
      );
      // Area dari tt_records.provinsi; fallback ke master kalau hasil 0 (provinsi
      // empty/typo) tapi master punya provinsi yang valid.
      const ttArea = getAreaFromProvinsi(existingTT.provinsi);
      const masterProv = masterSiteMap.get(row.site_id);
      const masterArea = getAreaFromProvinsi(masterProv);
      const useMaster = ttArea === 0 && masterArea !== 0;
      const finalProvinsi = useMaster ? (masterProv ?? null) : (existingTT.provinsi ?? null);
      const finalArea = useMaster ? masterArea : ttArea;
      const baseFields = {
        baseline_id: baselineId,
        site_id: row.site_id,
        ticket_id: existingTT.ticket_id,
        site_name: existingTT.site_name ?? null,
        target_online: row.target_online,
        po_name: po?.name ?? 'Unknown',
        provinsi: finalProvinsi,
        kabupaten: existingTT.kabupaten ?? null,
        area: finalArea,
      };
      if (userActual) {
        return {
          ...baseFields,
          actual_online: userActual,
          is_online: true,
          online_detected_at: nowIso,
        };
      }
      return {
        ...baseFields,
        actual_online: null,
        is_online: false,
        online_detected_at: null,
      };
    }

    // Site tidak ada di tt_records OPEN.
    // Fallback ke master noc_perf_sites untuk dapat provinsi → area.
    // site_name = null supaya UI fallback ke site_id, bukan menampilkan literal "Unknown".
    const masterProv = masterSiteMap.get(row.site_id) ?? null;
    return {
      baseline_id: baselineId,
      site_id: row.site_id,
      ticket_id: row.site_id, // placeholder unique per site, tidak akan dipakai matching
      site_name: null,
      target_online: row.target_online,
      actual_online: userActual ?? baselineDate,
      is_online: true,
      online_detected_at: nowIso,
      po_name: null,
      provinsi: masterProv,
      kabupaten: null,
      area: getAreaFromProvinsi(masterProv),
    };
  });

  const { error: targetsError } = await db
    .from('s_curve_targets')
    .insert(targets);

  if (targetsError) throw targetsError;

  return {
    baselineId,
    totalTarget: uploadRows.length,
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
 * Ambil semua site_id (uppercase) dari tt_records dengan status='OPEN'.
 * Dipakai di Upload Dialog untuk preview cross-check site upload vs daily tracker.
 */
export async function getOpenSiteIds(): Promise<string[]> {
  const { data, error } = await db
    .from('tt_records')
    .select('site_id')
    .eq('status', 'OPEN');
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data as Array<{ site_id: string | null }>) ?? []) {
    const sid = (r.site_id ?? '').toUpperCase().trim();
    if (sid) set.add(sid);
  }
  return Array.from(set);
}

/**
 * Re-classify area dari semua target dengan area=0 di baseline tertentu.
 * Lookup ke master `noc_perf_sites` untuk dapat province → derive area.
 *
 * Dipakai user untuk fix chart Area 1+2+3 yang totalnya gak match Global
 * — biasanya karena ada site yang sudah online sebelum tracking
 * (tidak ada di tt_records OPEN saat upload, jadi area=0 hardcoded).
 *
 * Return:
 *   - updated: jumlah site yang dapat area baru (1/2/3)
 *   - stillUnknown: jumlah site yang masih area=0 (tidak ditemukan di master atau province masih unknown)
 */
export async function reclassifyBaselineAreas(
  baselineId: string,
): Promise<{ updated: number; stillUnknown: number }> {
  // 1. Fetch targets dengan area=0
  const { data: zeros, error: zerosErr } = await db
    .from('s_curve_targets')
    .select('id, site_id')
    .eq('baseline_id', baselineId)
    .eq('area', 0);
  if (zerosErr) throw zerosErr;

  const zeroTargets = (zeros as Array<{ id: string; site_id: string }>) ?? [];
  if (zeroTargets.length === 0) return { updated: 0, stillUnknown: 0 };

  // 2. Lookup master_sites — filter by site_id IN supaya gak kena 1000-row limit
  const ids = zeroTargets.map((t) => t.site_id);
  const { data: masters, error: mastersErr } = await db
    .from('noc_perf_sites')
    .select('site_id, province')
    .in('site_id', ids);
  if (mastersErr) throw mastersErr;

  const provMap = new Map<string, string>();
  for (const m of (masters as Array<{ site_id: string; province: string | null }>) ?? []) {
    const sid = (m.site_id ?? '').toUpperCase().trim();
    if (sid) provMap.set(sid, m.province ?? '');
  }

  // 3. Build updates (cuma yang dapat area baru ≠ 0)
  const updates = zeroTargets
    .map((t) => {
      const prov = provMap.get(t.site_id) ?? null;
      return {
        id: t.id,
        provinsi: prov,
        area: getAreaFromProvinsi(prov),
      };
    })
    .filter((u) => u.area !== 0);

  if (updates.length === 0) {
    return { updated: 0, stillUnknown: zeroTargets.length };
  }

  // 4. Batch update parallel (pola sama dengan updateBaselineActuals)
  await Promise.all(
    updates.map((u) =>
      db
        .from('s_curve_targets')
        .update({ area: u.area, provinsi: u.provinsi })
        .eq('id', u.id)
        .then(({ error }: { error: unknown }) => {
          if (error) throw error;
        }),
    ),
  );

  return {
    updated: updates.length,
    stillUnknown: zeroTargets.length - updates.length,
  };
}

/**
 * Update end_date baseline. Dipakai user untuk extend chart range tanpa
 * harus re-upload data (mis. data sampai 3 Mei tapi mau chart sampai 5 Mei
 * → kurva PLAN flat di total, ACTUAL tetap stop di hari ini).
 *
 * Validasi: newEndDate harus >= baseline_date.
 */
export async function updateBaselineEndDate(
  baselineId: string,
  newEndDate: string,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndDate)) {
    throw new Error('Format tanggal harus YYYY-MM-DD');
  }

  const { data: baseline, error: fetchErr } = await db
    .from('s_curve_baselines')
    .select('baseline_date')
    .eq('id', baselineId)
    .single();
  if (fetchErr) throw fetchErr;

  const baselineDate = (baseline as { baseline_date: string }).baseline_date;
  if (newEndDate < baselineDate) {
    throw new Error(
      `End date (${newEndDate}) tidak boleh sebelum baseline date (${baselineDate})`,
    );
  }

  const { error: updErr } = await db
    .from('s_curve_baselines')
    .update({ end_date: newEndDate })
    .eq('id', baselineId);
  if (updErr) throw updErr;
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
