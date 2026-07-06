-- ============================================================
-- Migration: UBIQU DIRUMA — kolom Progress baru di tabel NON-HTB
-- Perubahan:
--   • ud_edits : tambah progress_edited + is_progress_edited
--     (kolom edit manual per ticket_id, tampil di kiri kolom Problem/Kendala).
--     BERBEDA dari progress_teknisi_edited (khusus HTB Excel roundtrip).
-- Catatan: rename header "Kendala" → "Problem" hanya di label UI,
--   kolom kendala_edited TIDAK diubah.
-- Safety: idempotent (IF NOT EXISTS), wrapped in transaction.
-- ============================================================

begin;

alter table ud_edits add column if not exists progress_edited    text;
alter table ud_edits add column if not exists is_progress_edited boolean default false;

-- GRANT defensif (CLAUDE.md §8) — idempotent, aman walau sudah ada.
grant select, insert, update, delete on public.ud_edits to anon, authenticated, service_role;

commit;
