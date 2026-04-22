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
  is_problem_edited: boolean;
  is_action_edited: boolean;
  created_at: string;
  updated_at: string;
}

export type RTGSField = 'problem_analisa' | 'action';

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

/** Ambil TT open dengan aging >= 7, sort by down_time DESC. */
export async function getRTGSTickets(): Promise<TTRecordDB[]> {
  const { data, error } = await db
    .from('tt_records')
    .select('*')
    .eq('status', 'OPEN')
    .gte('down_time', 7)
    .order('down_time', { ascending: false });

  if (error) throw error;
  return (data ?? []) as TTRecordDB[];
}

/**
 * Upsert satu field annotation untuk ticket tertentu.
 * - Set flag is_*_edited = true.
 * - Field yang lain dipertahankan dari row existing (kalau ada).
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
  };

  if (field === 'problem_analisa') {
    updateData.is_problem_edited = true;
    if (existing) {
      updateData.action = existing.action;
      updateData.is_action_edited = existing.is_action_edited;
    }
  } else {
    updateData.is_action_edited = true;
    if (existing) {
      updateData.problem_analisa = existing.problem_analisa;
      updateData.is_problem_edited = existing.is_problem_edited;
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
  };

  if (field === 'problem_analisa') {
    updateData.is_problem_edited = false;
  } else {
    updateData.is_action_edited = false;
  }

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
