import { supabase } from '@/integrations/supabase/client';
import type { TTRecordDB } from './types';

// rtgs_annotations belum ada di generated Database types.
// Pakai cast ini sampai `supabase gen types` dijalankan ulang.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RTGSAnnotation {
  id: string;
  /** Kunci stabil per site fisik. Anotasi persist lintas reissue tiket. */
  site_id: string | null;
  /** Tiket terakhir yang menyentuh anotasi ini — referensi saja, bukan kunci. */
  ticket_id: string;
  problem_analisa: string | null;
  action: string | null;
  kendala: string | null;
  plan_target_online: string | null;
  is_problem_edited: boolean;
  is_action_edited: boolean;
  is_kendala_edited: boolean;
  is_plan_target_online_edited: boolean;
  created_at: string;
  updated_at: string;
}

export type RTGSField =
  | 'problem_analisa'
  | 'action'
  | 'kendala'
  | 'plan_target_online';

const FIELD_FLAG_MAP: Record<RTGSField, keyof RTGSAnnotation> = {
  problem_analisa: 'is_problem_edited',
  action: 'is_action_edited',
  kendala: 'is_kendala_edited',
  plan_target_online: 'is_plan_target_online_edited',
};

const ALL_FIELDS: RTGSField[] = [
  'problem_analisa',
  'action',
  'kendala',
  'plan_target_online',
];

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ACTION = 'Kunjungan Teknisi';

/**
 * Pola detail_prob yang otomatis di-replace di tampilan (display-only,
 * tidak mengubah data DB). Key: pattern uppercase + trimmed. Value:
 * teks yang ditampilkan sebagai pengganti.
 *
 * Toleran terhadap variasi spasi sekitar slash dan ejaan umum.
 */
const PROBLEM_AUTO_REPLACE: Record<string, string> = {
  'LINK TIDAK TERDETEKSI / OFFLINE': 'BELUM ADA KONFIRMASI PIC',
  'LINK TIDAK TERDETEKSI/OFFLINE': 'BELUM ADA KONFIRMASI PIC',
  'LINK TIDAK TERDETEKSI': 'BELUM ADA KONFIRMASI PIC',
  MISSPOINTING: 'BUC/LNB',
  'MISS POINTING': 'BUC/LNB',
  MISPOINTING: 'BUC/LNB',
  'MIS POINTING': 'BUC/LNB',
};

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Ambil semua annotations.
 * Wajib pagination: `.select()` PostgREST diam-diam cap 1000 baris, sedangkan
 * rtgs_annotations bisa >1000 (auto-snapshot Plan Target Online per sync TT).
 * Tanpa loop ini, anotasi yang terpotong tidak muncul di tampilan.
 */
export async function getRTGSAnnotations(): Promise<RTGSAnnotation[]> {
  const pageSize = 1000;
  let all: RTGSAnnotation[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('rtgs_annotations')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as RTGSAnnotation[];
    all = all.concat(batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

/**
 * Ambil TT open dengan aging >= minAging, sort by down_time DESC.
 * Default minAging = 7 (untuk capture PNG). Halaman view bisa pass 5
 * untuk preview row aging 5-6.
 */
export async function getRTGSTickets(minAging = 7): Promise<TTRecordDB[]> {
  const { data, error } = await db
    .from('tt_records')
    .select('*')
    .eq('status', 'OPEN')
    .gte('down_time', minAging)
    .order('down_time', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TTRecordDB[];
}

/**
 * Upsert satu field annotation untuk satu site.
 * - Kunci = site_id (stabil). `ticketId` dipakai utk snapshot target online
 *   & disimpan sebagai referensi tiket terakhir.
 * - Set flag is_*_edited = true untuk field target.
 * - Semua field lain di-preserve dari row existing (kalau ada).
 * - Bonus: kalau annotation belum punya plan_target_online, snapshot dari
 *   tt_records.target_online_original. Ini mirror behavior snapshot di
 *   mergeTSVToSupabase, biar Plan Target Online tetap terisi walaupun user
 *   edit field lain duluan sebelum sync TSV berikutnya.
 */
export async function upsertAnnotation(
  siteId: string,
  ticketId: string,
  field: RTGSField,
  value: string,
): Promise<void> {
  if (!siteId) {
    throw new Error(
      `Tidak bisa simpan anotasi: site_id kosong untuk tiket ${ticketId}.`,
    );
  }

  const [annResult, ttResult] = await Promise.all([
    db
      .from('rtgs_annotations')
      .select('*')
      .eq('site_id', siteId)
      .maybeSingle(),
    db
      .from('tt_records')
      .select('target_online_original')
      .eq('ticket_id', ticketId)
      .maybeSingle(),
  ]);

  const { data: existing, error: fetchErr } = annResult;
  if (fetchErr) throw fetchErr;

  const ttRecord = ttResult.data as
    | { target_online_original: string | null }
    | null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    site_id: siteId,
    ticket_id: ticketId,
    [field]: value,
    [FIELD_FLAG_MAP[field]]: true,
  };

  if (existing) {
    for (const otherField of ALL_FIELDS) {
      if (otherField === field) continue;
      updateData[otherField] = existing[otherField];
      const flagCol = FIELD_FLAG_MAP[otherField];
      updateData[flagCol] = existing[flagCol];
    }
  }

  // Auto-snapshot plan_target_online dari TT record kalau annotation belum
  // punya. Tidak overwrite manual edit (cek is_plan_target_online_edited dulu).
  if (field !== 'plan_target_online' && ttRecord?.target_online_original) {
    const existingPlan = existing?.plan_target_online;
    const existingPlanFlag = existing?.is_plan_target_online_edited;
    if (!existingPlanFlag && (existingPlan == null || existingPlan === '')) {
      updateData.plan_target_online = ttRecord.target_online_original;
    }
  }

  const { error } = await db
    .from('rtgs_annotations')
    .upsert(updateData, { onConflict: 'site_id' });

  if (error) throw error;
}

/** Reset satu field ke default (NULL, flag false). Kunci = site_id. */
export async function resetAnnotationField(
  siteId: string,
  field: RTGSField,
): Promise<void> {
  if (!siteId) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    [field]: null,
    [FIELD_FLAG_MAP[field]]: false,
  };

  const { error } = await db
    .from('rtgs_annotations')
    .update(updateData)
    .eq('site_id', siteId);

  if (error) throw error;
}

// ─── Helpers (compute effective values) ──────────────────────────────────────

/**
 * Compute effective Problem Analisa value.
 * Prioritas:
 *   1. Manual edit (kalau is_problem_edited & ada nilainya)
 *   2. Auto-replace dari PROBLEM_AUTO_REPLACE (LINK OFFLINE → BELUM ADA
 *      KONFIRMASI PIC, MISSPOINTING → BUC/LNB)
 *   3. Default dari detail_prob
 */
export function getEffectiveProblem(
  record: Pick<TTRecordDB, 'detail_prob'>,
  annotation: RTGSAnnotation | null,
): string {
  if (annotation?.is_problem_edited && annotation.problem_analisa) {
    return annotation.problem_analisa;
  }

  const detailProb = (record.detail_prob ?? '').toUpperCase().trim();
  const replaced = PROBLEM_AUTO_REPLACE[detailProb];
  if (replaced) return replaced;

  return record.detail_prob ?? '-';
}

/**
 * Compute effective Action value.
 * Default = "Kunjungan Teknisi" kalau belum diedit.
 */
export function getEffectiveAction(annotation: RTGSAnnotation | null): string {
  if (annotation?.is_action_edited && annotation.action) {
    return annotation.action;
  }
  return DEFAULT_ACTION;
}

/** Compute effective Kendala. Default '-' kalau belum diedit. */
export function getEffectiveKendala(annotation: RTGSAnnotation | null): string {
  if (annotation?.is_kendala_edited && annotation.kendala) {
    return annotation.kendala;
  }
  return '-';
}

/**
 * Compute effective Plan Target Online.
 * Sumber bisa snapshot otomatis (saat sync TSV pertama) atau manual edit.
 * Helper ini tidak peduli sumbernya — cukup return apapun yang ada di kolom.
 * Flag `is_plan_target_online_edited` hanya untuk visual indicator manual edit.
 */
export function getEffectivePlanTargetOnline(
  annotation: RTGSAnnotation | null,
): string {
  if (annotation?.plan_target_online) {
    return annotation.plan_target_online;
  }
  return '-';
}
