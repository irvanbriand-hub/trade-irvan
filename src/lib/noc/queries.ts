import { supabase } from '@/integrations/supabase/client';
import type { NOCSummary, TTRecord, MergeResult, TTRecordDB } from './types';

/** Konvert DD/M/YYYY atau DD/MM/YYYY ke YYYY-MM-DD untuk PostgreSQL. */
function toISODate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Insert ringkasan upload harian ke tabel tt_uploads.
 * Dipanggil setelah TSV berhasil di-parse dan diproses.
 */
export async function saveUploadHistory(
  uploadDate: string,
  summary: NOCSummary,
): Promise<void> {
  const { error } = await supabase.from('tt_uploads').insert({
    upload_date: toISODate(uploadDate),
    total_tt: summary.totalTT,
    total_open: summary.totalOpen,
    total_closed: summary.totalClosed,
    close_noc: summary.closeNOC,
    close_om: summary.closeOM,
    close_visit: summary.closeVisit,
    summary: summary as unknown as Record<string, unknown>,
  });

  if (error) throw error;
}

/**
 * Helper: ambil target online yang efektif untuk display.
 * Jika record sudah diedit manual, pakai target_online_edited.
 */
export function getEffectiveTargetOnline(record: {
  is_manually_edited: boolean;
  target_online_edited: string | null;
  target_online_original: string | null;
}): string {
  if (record.is_manually_edited && record.target_online_edited) {
    return record.target_online_edited;
  }
  return record.target_online_original ?? '';
}

/**
 * Merge parsed TTRecord[] dari TSV ke tabel tt_records di Supabase.
 * - Record baru: INSERT, target_online_edited = target_online_original
 * - Record lama (is_manually_edited=false): UPDATE semua field TSV + target_online_edited
 * - Record lama (is_manually_edited=true): UPDATE field TSV saja, JANGAN ubah target_online_edited & reschedule_note
 */
type ExistingEntry = {
  is_manually_edited: boolean;
  target_online_edited: string | null;
  reschedule_note: string | null;
  status: string;
};

export async function mergeTSVToSupabase(
  records: TTRecord[],
  uploadDate: string,
): Promise<MergeResult> {
  if (records.length === 0) return { inserted: 0, updated: 0, unchanged: 0, totalInDB: 0 };

  const ticketIds = records.map((r) => r.ticketId);

  // 1 query: fetch semua yang sudah ada — ambil protected fields + status sekalian
  const { data: existing, error: fetchError } = await supabase
    .from('tt_records')
    .select('ticket_id, is_manually_edited, target_online_edited, reschedule_note, status')
    .in('ticket_id', ticketIds);

  if (fetchError) throw fetchError;

  const existingMap = new Map<string, ExistingEntry>(
    (existing ?? []).map((e) => [
      e.ticket_id as string,
      {
        is_manually_edited: e.is_manually_edited as boolean,
        target_online_edited: e.target_online_edited as string | null,
        reschedule_note: e.reschedule_note as string | null,
        status: e.status as string,
      },
    ]),
  );

  const toInsert: TTRecord[] = [];
  const toUpdateFull: TTRecord[] = [];
  const toUpdatePartial: Array<{ record: TTRecord; existing: ExistingEntry }> = [];
  let statusChanged = 0;

  for (const record of records) {
    const ex = existingMap.get(record.ticketId);
    if (!ex) {
      toInsert.push(record);
    } else {
      if (ex.status !== record.status) statusChanged++;
      if (!ex.is_manually_edited) {
        toUpdateFull.push(record);
      } else {
        toUpdatePartial.push({ record, existing: ex });
      }
    }
  }

  // 3 write operations jalan parallel — aman karena ticket_ids mutually exclusive
  const writeOps: Promise<void>[] = [];

  if (toInsert.length > 0) {
    writeOps.push(
      supabase.from('tt_records').insert(
        toInsert.map((r) => ({
          ticket_id: r.ticketId,
          site_id: r.siteId || null,
          site_name: r.siteName,
          provinsi: r.provinsi || null,
          kabupaten: r.kabupaten || null,
          tiket_internal: r.tiketInternal || null,
          status: r.status as 'OPEN' | 'CLOSED',
          down_time: r.downTime,
          date_start: r.dateStart || null,
          target_online_original: r.targetOnline || null,
          target_online_edited: r.targetOnline || null,
          actual_online: r.actualOnline || null,
          prob_class: r.probClass || null,
          detail_prob: r.detailProb || null,
          note_original: r.note || null,
          teknis_nt: r.teknisNT || null,
          upload_date: toISODate(uploadDate),
          is_manually_edited: false,
        })),
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  if (toUpdateFull.length > 0) {
    writeOps.push(
      supabase.from('tt_records').upsert(
        toUpdateFull.map((r) => ({
          ticket_id: r.ticketId,
          site_id: r.siteId || null,
          site_name: r.siteName,
          provinsi: r.provinsi || null,
          kabupaten: r.kabupaten || null,
          tiket_internal: r.tiketInternal || null,
          status: r.status as 'OPEN' | 'CLOSED',
          down_time: r.downTime,
          date_start: r.dateStart || null,
          target_online_original: r.targetOnline || null,
          target_online_edited: r.targetOnline || null,
          actual_online: r.actualOnline || null,
          prob_class: r.probClass || null,
          detail_prob: r.detailProb || null,
          note_original: r.note || null,
          teknis_nt: r.teknisNT || null,
          upload_date: toISODate(uploadDate),
          is_manually_edited: false,
        })),
        { onConflict: 'ticket_id' },
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  if (toUpdatePartial.length > 0) {
    writeOps.push(
      supabase.from('tt_records').upsert(
        toUpdatePartial.map(({ record: r, existing: ex }) => ({
          ticket_id: r.ticketId,
          site_id: r.siteId || null,
          site_name: r.siteName,
          provinsi: r.provinsi || null,
          kabupaten: r.kabupaten || null,
          tiket_internal: r.tiketInternal || null,
          status: r.status as 'OPEN' | 'CLOSED',
          down_time: r.downTime,
          date_start: r.dateStart || null,
          target_online_original: r.targetOnline || null,
          target_online_edited: ex.target_online_edited,   // PROTECTED
          actual_online: r.actualOnline || null,
          prob_class: r.probClass || null,
          detail_prob: r.detailProb || null,
          note_original: r.note || null,
          teknis_nt: r.teknisNT || null,
          upload_date: toISODate(uploadDate),
          is_manually_edited: true,                        // PROTECTED
          reschedule_note: ex.reschedule_note,             // PROTECTED
        })),
        { onConflict: 'ticket_id' },
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  await Promise.all(writeOps);

  // 1 query: hitung total record di DB setelah merge
  const { count } = await supabase
    .from('tt_records')
    .select('*', { count: 'exact', head: true });

  return {
    inserted: toInsert.length,
    updated: toUpdateFull.length + toUpdatePartial.length,
    updatedFull: toUpdateFull.length,
    updatedProtected: toUpdatePartial.length,
    statusChanged,
    unchanged: 0,
    totalInDB: count ?? 0,
  };
}

/**
 * Hapus semua data TT dari tt_records (reset, bukan drop tabel).
 */
export async function resetTTRecords(): Promise<void> {
  const { error } = await supabase
    .from('tt_records')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows
  if (error) throw error;
}

/**
 * Fetch semua TT records dari Supabase.
 */
export async function fetchTTRecords(): Promise<TTRecordDB[]> {
  const { data, error } = await supabase
    .from('tt_records')
    .select('*')
    .order('down_time', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TTRecordDB[];
}

/**
 * Update target online + reschedule note (edit manual).
 * Pakai (supabase as any) karena tt_records belum ada di generated Database types.
 * Filter by ticket_id (text) — lebih reliable dari id (UUID).
 */
export async function updateTTRecordEdit(payload: {
  id: string;         // untuk cache update (optimistic)
  ticket_id: string;  // untuk DB filter
  target_online_edited: string;
  reschedule_note: string;
}): Promise<void> {
  // tt_records belum ada di generated types, suppress TS error di .from() saja
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const { error } = await supabase
    .from('tt_records')
    .update({
      target_online_edited: payload.target_online_edited || null,
      reschedule_note: payload.reschedule_note || null,
      is_manually_edited: true,
    })
    .eq('ticket_id', payload.ticket_id);

  if (error) {
    console.error('[updateTTRecordEdit] code:', error.code);
    console.error('[updateTTRecordEdit] message:', error.message);
    console.error('[updateTTRecordEdit] details:', error.details);
    console.error('[updateTTRecordEdit] hint:', error.hint);
    throw error;
  }
}

/**
 * Normalisasi format tanggal ke DD/MM/YYYY.
 * Handle: "8/4/26", "08/04/26", "08/04/2026", "2026-04-08"
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const s = dateStr.trim();

  // Format ISO: YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // Format DD/MM/YY atau D/M/YY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${d}/${m}/${y}`;
  }

  return s;
}

/**
 * Ambil effective target online dari record DB.
 * Kalau is_manually_edited = true, pakai target_online_edited.
 */
export function getEffectiveTargetOnlineDB(record: TTRecordDB): string {
  if (record.is_manually_edited && record.target_online_edited) {
    return record.target_online_edited;
  }
  return record.target_online_original ?? '';
}
