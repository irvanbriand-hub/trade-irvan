// Akses Supabase untuk fitur UBIQU DIRUMA.
// Tabel ud_* belum ada di generated Database types → pakai cast `supabase as any`
// (pola sama seperti src/lib/noc/rtgsQueries.ts).

import { supabase } from '@/integrations/supabase/client';
import type { DatasetRow, ParsedDatasheet, UbiquEdit, UbiquField } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ─── Field → kolom DB ────────────────────────────────────────────────────────

const FIELD_COL: Record<UbiquField, { value: string; flag: string }> = {
  po: { value: 'po_name_edited', flag: 'is_po_edited' },
  kendala: { value: 'kendala_edited', flag: 'is_kendala_edited' },
  mrq_number: { value: 'mrq_number_edited', flag: 'is_mrq_number_edited' },
  resi: { value: 'resi_edited', flag: 'is_resi_edited' },
  eta: { value: 'eta_edited', flag: 'is_eta_edited' },
  status_pengiriman: {
    value: 'status_pengiriman_edited',
    flag: 'is_status_pengiriman_edited',
  },
  progress_teknisi: {
    value: 'progress_teknisi_edited',
    flag: 'is_progress_teknisi_edited',
  },
};

// ─── DATASET ─────────────────────────────────────────────────────────────────

export async function loadDataset(): Promise<DatasetRow[]> {
  const { data, error } = await db
    .from('ud_dataset')
    .select('*')
    .order('dur_days', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DatasetRow[];
}

export async function loadEdits(): Promise<UbiquEdit[]> {
  const { data, error } = await db.from('ud_edits').select('*');
  if (error) throw error;
  return (data ?? []) as UbiquEdit[];
}

/**
 * Timpa dataset dengan hasil upload terbaru + reconcile (GC) edits:
 * edit untuk ticket_id yang sudah tidak ada di upload baru (= tiket close) dihapus.
 */
export async function replaceDataset(rows: DatasetRow[]): Promise<void> {
  // 1. Hapus dataset lama (filter id>=0 → bukan bare DELETE, lolos guard Supabase).
  const del = await db.from('ud_dataset').delete().gte('id', 0);
  if (del.error) throw del.error;

  // 2. Insert baru (chunk 500 biar aman untuk payload besar).
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from('ud_dataset').insert(chunk);
    if (error) throw error;
  }

  // 3. Reconcile edits: hapus edit yang ticket_id-nya tak ada di upload baru.
  const newIds = new Set(rows.map((r) => r.ticket_id));
  const existing = await db.from('ud_edits').select('ticket_id');
  if (existing.error) throw existing.error;
  const stale = (existing.data ?? [])
    .map((e: { ticket_id: string }) => e.ticket_id)
    .filter((id: string) => !newIds.has(id));
  if (stale.length > 0) {
    const { error } = await db.from('ud_edits').delete().in('ticket_id', stale);
    if (error) throw error;
  }

  // 4. Reconcile HTB override: tiket yang tak ada di upload baru = close → hapus.
  const ovr = await db.from('ud_htb_override').select('ticket_id');
  if (ovr.error) throw ovr.error;
  const staleOvr = (ovr.data ?? [])
    .map((e: { ticket_id: string }) => e.ticket_id)
    .filter((id: string) => !newIds.has(id));
  if (staleOvr.length > 0) {
    const { error } = await db
      .from('ud_htb_override')
      .delete()
      .in('ticket_id', staleOvr);
    if (error) throw error;
  }
}

// ─── EDITS ───────────────────────────────────────────────────────────────────

export async function upsertEdit(
  ticketId: string,
  field: UbiquField,
  value: string,
): Promise<void> {
  const { value: valueCol, flag: flagCol } = FIELD_COL[field];
  const payload = {
    ticket_id: ticketId,
    [valueCol]: value,
    [flagCol]: true,
  };
  const { error } = await db
    .from('ud_edits')
    .upsert(payload, { onConflict: 'ticket_id' });
  if (error) throw error;
}

export async function resetEdit(
  ticketId: string,
  field: UbiquField,
): Promise<void> {
  const { value: valueCol, flag: flagCol } = FIELD_COL[field];
  const { error } = await db
    .from('ud_edits')
    .update({ [valueCol]: null, [flagCol]: false })
    .eq('ticket_id', ticketId);
  if (error) throw error;
}

/**
 * Simpan Progress Teknisi massal dari Excel HTB yang dibalikin OM/Aset.
 * Hanya entri non-kosong yang ditulis (sel kosong = "tidak diubah", BUKAN "hapus").
 * Kunci = ticket_id (TT...), di-upsert ke ud_edits. Mengembalikan jumlah tersimpan.
 */
export async function saveProgressTeknisiBulk(
  entries: { ticketId: string; progressTeknisi: string }[],
): Promise<number> {
  const rows = entries
    .filter((e) => e.ticketId && e.progressTeknisi.trim())
    .map((e) => ({
      ticket_id: e.ticketId,
      progress_teknisi_edited: e.progressTeknisi.trim(),
      is_progress_teknisi_edited: true,
    }));
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db
      .from('ud_edits')
      .upsert(chunk, { onConflict: 'ticket_id' });
    if (error) throw error;
  }
  return rows.length;
}

/**
 * Reset data operasional UBIQU: tiket (ud_dataset), edit manual (ud_edits),
 * & override HTB (ud_htb_override). Datasheet referensi (PRODUCT/PO/HTB) TIDAK
 * dihapus — tak perlu upload ulang. Pakai filter id (bukan bare DELETE) supaya
 * lolos guard Supabase (lihat reference_supabase_delete_guard).
 */
export async function resetUbiquData(): Promise<void> {
  // ud_dataset & ud_htb_override: id bigserial → gte(id, 0).
  const d1 = await db.from('ud_dataset').delete().gte('id', 0);
  if (d1.error) throw d1.error;
  const d2 = await db.from('ud_htb_override').delete().gte('id', 0);
  if (d2.error) throw d2.error;
  // ud_edits: id uuid → filter "id is not null" (match semua baris).
  const d3 = await db.from('ud_edits').delete().not('id', 'is', null);
  if (d3.error) throw d3.error;
}

// ─── HTB OVERRIDE (paksa tiket jadi HTB, by ticket_id) ───────────────────────

/**
 * Normalisasi teks paste → daftar ticket_id format "TT <digits>" (sama spt
 * ud_dataset.ticket_id). Terima: "TT 1038696", "1038696", atau No Tiket lengkap
 * "TIC-.../ TT 1038696". Pisah by newline/koma/titik-koma/spasi.
 */
export function parseTicketIdList(text: string): string[] {
  const out = new Set<string>();
  for (const tokRaw of String(text ?? '').split(/[\n,;]+/)) {
    const tok = tokRaw.trim();
    if (!tok) continue;
    const tt = tok.match(/TT\s*\d+/i);
    if (tt) {
      out.add(tt[0].replace(/\s+/, ' ').toUpperCase().trim());
      continue;
    }
    const digits = tok.replace(/\D/g, '');
    if (digits.length >= 4) out.add(`TT ${digits}`);
  }
  return [...out];
}

export async function loadHtbOverride(): Promise<string[]> {
  const { data, error } = await db
    .from('ud_htb_override')
    .select('ticket_id');
  if (error) throw error;
  return (data ?? []).map((r: { ticket_id: string }) => r.ticket_id);
}

/** Tambah ticket_id ke override (dedup via upsert onConflict). Return jumlah unik. */
export async function addHtbOverride(ticketIds: string[]): Promise<number> {
  const ids = [...new Set(ticketIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  const rows = ids.map((ticket_id) => ({ ticket_id }));
  const { error } = await db
    .from('ud_htb_override')
    .upsert(rows, { onConflict: 'ticket_id', ignoreDuplicates: true });
  if (error) throw error;
  return ids.length;
}

export async function removeHtbOverride(ticketId: string): Promise<void> {
  const { error } = await db
    .from('ud_htb_override')
    .delete()
    .eq('ticket_id', ticketId);
  if (error) throw error;
}

// ─── REFERENCE (datasheet) ───────────────────────────────────────────────────

export async function loadReference(): Promise<ParsedDatasheet> {
  const [prod, po, htb] = await Promise.all([
    db.from('ud_ref_product').select('paket_name, product'),
    db.from('ud_ref_po').select('provins, kabupaten, nama_po'),
    db.from('ud_ref_htb_site').select('site_key'),
  ]);
  if (prod.error) throw prod.error;
  if (po.error) throw po.error;
  if (htb.error) throw htb.error;
  return {
    product: (prod.data ?? []) as ParsedDatasheet['product'],
    po: (po.data ?? []) as ParsedDatasheet['po'],
    htbSites: (htb.data ?? []) as ParsedDatasheet['htbSites'],
  };
}

export interface ReferenceCounts {
  product: number;
  po: number;
  htbSites: number;
}

export async function loadReferenceCounts(): Promise<ReferenceCounts> {
  const [prod, po, htb] = await Promise.all([
    db.from('ud_ref_product').select('*', { count: 'exact', head: true }),
    db.from('ud_ref_po').select('*', { count: 'exact', head: true }),
    db.from('ud_ref_htb_site').select('*', { count: 'exact', head: true }),
  ]);
  return {
    product: prod.count ?? 0,
    po: po.count ?? 0,
    htbSites: htb.count ?? 0,
  };
}

/** Timpa semua tabel referensi dengan hasil parse datasheet. */
export async function replaceReference(ref: ParsedDatasheet): Promise<void> {
  async function wipeInsert(table: string, rows: object[]) {
    const del = await db.from(table).delete().gte('id', 0);
    if (del.error) throw del.error;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      if (chunk.length === 0) continue;
      const { error } = await db.from(table).insert(chunk);
      if (error) throw error;
    }
  }
  await wipeInsert('ud_ref_product', ref.product);
  await wipeInsert('ud_ref_po', ref.po);
  await wipeInsert('ud_ref_htb_site', ref.htbSites);
}

// ─── Effective value helpers (default vs override manual) ─────────────────────

export function findEdit(
  edits: UbiquEdit[],
  ticketId: string,
): UbiquEdit | null {
  return edits.find((e) => e.ticket_id === ticketId) ?? null;
}

export function effPO(row: DatasetRow, edit: UbiquEdit | null): string {
  if (edit?.is_po_edited && edit.po_name_edited) return edit.po_name_edited;
  return row.po_name;
}

export function effKendala(edit: UbiquEdit | null): string {
  if (edit?.is_kendala_edited && edit.kendala_edited) return edit.kendala_edited;
  return '';
}

export function effMrqNumber(edit: UbiquEdit | null): string {
  if (edit?.is_mrq_number_edited && edit.mrq_number_edited) {
    return edit.mrq_number_edited;
  }
  return '';
}

export function effResi(edit: UbiquEdit | null): string {
  if (edit?.is_resi_edited && edit.resi_edited) return edit.resi_edited;
  return '';
}

export function effEta(edit: UbiquEdit | null): string {
  if (edit?.is_eta_edited && edit.eta_edited) return edit.eta_edited;
  return '';
}

export function effStatusPengiriman(edit: UbiquEdit | null): string {
  if (edit?.is_status_pengiriman_edited && edit.status_pengiriman_edited) {
    return edit.status_pengiriman_edited;
  }
  return '';
}

export function effProgressTeknisi(edit: UbiquEdit | null): string {
  if (edit?.is_progress_teknisi_edited && edit.progress_teknisi_edited) {
    return edit.progress_teknisi_edited;
  }
  return '';
}
