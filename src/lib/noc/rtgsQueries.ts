import { supabase } from '@/integrations/supabase/client';
import type { TTRecordDB } from './types';

// rtgs_annotations belum ada di generated Database types.
// Pakai cast ini sampai `supabase gen types` dijalankan ulang.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RTGSAnnotation {
  id: string;
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
const REPLACE_TARGET = 'BELUM ADA KONFIRMASI PIC';

/**
 * Pola detail_prob yang harus di-auto-replace jadi REPLACE_TARGET.
 * Toleran terhadap variasi spasi sekitar slash.
 */
const LINK_OFFLINE_PATTERNS = new Set([
  'LINK TIDAK TERDETEKSI / OFFLINE',
  'LINK TIDAK TERDETEKSI/OFFLINE',
  'LINK TIDAK TERDETEKSI',
]);

// ─── Queries ─────────────────────────────────────────────────────────────────

/** Ambil semua annotations. */
export async function getRTGSAnnotations(): Promise<RTGSAnnotation[]> {
  const { data, error } = await db
    .from('rtgs_annotations')
    .select('*');

  if (error) throw error;
  return (data ?? []) as RTGSAnnotation[];
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
 * Upsert satu field annotation untuk ticket tertentu.
 * - Set flag is_*_edited = true untuk field target.
 * - Semua field lain di-preserve dari row existing (kalau ada).
 */
export async function upsertAnnotation(
  ticketId: string,
  field: RTGSField,
  value: string,
): Promise<void> {
  const { data: existing, error: fetchErr } = await db
    .from('rtgs_annotations')
    .select('*')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
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

  const { error } = await db
    .from('rtgs_annotations')
    .upsert(updateData, { onConflict: 'ticket_id' });

  if (error) throw error;
}

/** Reset satu field ke default (NULL, flag false). */
export async function resetAnnotationField(
  ticketId: string,
  field: RTGSField,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {
    [field]: null,
    [FIELD_FLAG_MAP[field]]: false,
  };

  const { error } = await db
    .from('rtgs_annotations')
    .update(updateData)
    .eq('ticket_id', ticketId);

  if (error) throw error;
}

// ─── Helpers (compute effective values) ──────────────────────────────────────

/**
 * Compute effective Problem Analisa value.
 * Prioritas:
 *   1. Manual edit (kalau is_problem_edited & ada nilainya)
 *   2. Auto-replace untuk LINK TIDAK TERDETEKSI / OFFLINE
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
  if (LINK_OFFLINE_PATTERNS.has(detailProb)) {
    return REPLACE_TARGET;
  }

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
