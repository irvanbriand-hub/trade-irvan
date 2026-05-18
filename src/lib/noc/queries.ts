import { supabase } from '@/integrations/supabase/client';
import type { NOCSummary, TTRecord, MergeResult, TTRecordDB, SiteNote } from './types';

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
  if (records.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      updatedFull: 0,
      updatedProtected: 0,
      statusChanged: 0,
      unchanged: 0,
      deleted: 0,
      totalInDB: 0,
    };
  }

  const incomingTicketIds = new Set(records.map((r) => r.ticketId));

  // Fetch SEMUA ticket di DB — perlu untuk tahu mana yang harus di-delete
  const { data: existing, error: fetchError } = await supabase
    .from('tt_records')
    .select('ticket_id, is_manually_edited, target_online_edited, reschedule_note, status');

  if (fetchError) throw fetchError;

  const existingMap = new Map<string, ExistingEntry>();
  const ticketIdsToDelete: string[] = [];

  for (const e of existing ?? []) {
    const tid = e.ticket_id as string;
    if (incomingTicketIds.has(tid)) {
      existingMap.set(tid, {
        is_manually_edited: e.is_manually_edited as boolean,
        target_online_edited: e.target_online_edited as string | null,
        reschedule_note: e.reschedule_note as string | null,
        status: e.status as string,
      });
    } else {
      ticketIdsToDelete.push(tid);
    }
  }

  // DELETE ticket yang ada di DB tapi sudah tidak ada di Google Sheet
  let deleted = 0;
  if (ticketIdsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('tt_records')
      .delete()
      .in('ticket_id', ticketIdsToDelete);
    if (deleteError) {
      console.error('[mergeTSVToSupabase] Delete error:', deleteError);
    } else {
      deleted = ticketIdsToDelete.length;
    }
  }

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

  // Snapshot Plan Target Online (RTGS report) untuk site yang belum punya plan.
  // Dijalankan sekali per site: saat pertama kali muncul di TSV → snapshot
  // value target_online dari TSV → freeze di rtgs_annotations.plan_target_online.
  // Kunci = site_id (stabil lintas reissue tiket). Sync berikutnya tidak
  // overwrite. Reset manual di UI = clear → snapshot ulang di sync berikutnya.
  const incomingSiteIds = Array.from(
    new Set(records.map((r) => r.siteId).filter(Boolean)),
  ) as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annDb = supabase as any;
  // Chunk per 1000: PostgREST `.in()` pun cap 1000 baris. site_id unik di
  // rtgs_annotations, jadi chunk ≤1000 id → ≤1000 row (pas, aman). Tanpa ini
  // sebagian existing plan tak terbaca → ke-overwrite ulang dari TSV.
  let annFetchErr: { message: string } | null = null;
  const existingAnns: Array<{
    site_id: string;
    plan_target_online: string | null;
  }> = [];
  for (let i = 0; i < incomingSiteIds.length; i += 1000) {
    const chunk = incomingSiteIds.slice(i, i + 1000);
    const { data, error } = await annDb
      .from('rtgs_annotations')
      .select('site_id, plan_target_online')
      .in('site_id', chunk);
    if (error) {
      annFetchErr = error;
      break;
    }
    existingAnns.push(...((data ?? []) as typeof existingAnns));
  }

  if (annFetchErr) {
    console.error('[mergeTSVToSupabase] Plan TO fetch error:', annFetchErr);
  } else {
    const annPlanMap = new Map<string, string | null>(
      existingAnns.map((a) => [a.site_id, a.plan_target_online]),
    );

    const toSnapshot = records.filter((r) => {
      if (!r.siteId) return false; // tanpa site_id → tak bisa di-key, skip
      if (!r.targetOnline) return false; // TSV target kosong → skip
      const existingPlan = annPlanMap.get(r.siteId);
      return existingPlan == null || existingPlan === '';
    });

    if (toSnapshot.length > 0) {
      const snapshotData = toSnapshot.map((r) => ({
        site_id: r.siteId,
        ticket_id: r.ticketId,
        plan_target_online: r.targetOnline,
      }));
      const { error: snapshotErr } = await annDb
        .from('rtgs_annotations')
        .upsert(snapshotData, { onConflict: 'site_id' });
      if (snapshotErr) {
        // Non-fatal: sync TT records sudah sukses, snapshot bisa retry next sync.
        console.error('[mergeTSVToSupabase] Plan TO snapshot error:', snapshotErr);
      }
    }
  }

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
    deleted,
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

/**
 * Reset reschedule edit — hapus target_online_edited, reschedule_note, set is_manually_edited = false.
 */
export async function resetTTRecordEdit(ticketId: string): Promise<void> {
  // @ts-ignore
  const { error } = await supabase
    .from('tt_records')
    .update({
      target_online_edited: null,
      reschedule_note: null,
      is_manually_edited: false,
      last_updated: new Date().toISOString(),
    })
    .eq('ticket_id', ticketId);

  if (error) throw error;
}

// ─── Site Notes ──────────────────────────────────────────────────────────────

/**
 * Fetch semua site notes (load sekali, cache di context).
 */
export async function getSiteNotes(): Promise<SiteNote[]> {
  // @ts-ignore — site_notes belum ada di generated Database types
  const { data } = await supabase.from('site_notes').select('*');
  return (data as SiteNote[]) || [];
}

/**
 * Upsert note (insert atau update berdasarkan site_id).
 */
export async function upsertSiteNote(
  siteId: string,
  siteName: string,
  note: string,
): Promise<void> {
  // @ts-ignore
  const { error } = await supabase
    .from('site_notes')
    .upsert({ site_id: siteId, site_name: siteName, note }, { onConflict: 'site_id' });
  if (error) throw error;
}

/**
 * Delete note permanen berdasarkan site_id.
 */
export async function deleteSiteNote(siteId: string): Promise<void> {
  // @ts-ignore
  const { error } = await supabase.from('site_notes').delete().eq('site_id', siteId);
  if (error) throw error;
}
