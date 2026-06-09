-- ============================================================
-- Migration: UBIQU DIRUMA Redesign — 2 output (Excel HTB + PNG NON-HTB)
-- Plan: iya-nomor-tiket-aku-partitioned-swing.md
-- Perubahan:
--   • ud_dataset  : tambah ticket_number (No Tiket lengkap "TIC.../ TT ...") + site_id (SUBSCRIBER NUMBER)
--   • ud_edits    : set field baru — NON-HTB (kendala, mrq_number, resi, eta, status_pengiriman, po)
--                   + HTB (progress_teknisi). Drop field usang (problem, action, plan_target).
--   • ticket_id (TT...) TETAP kunci edit & reconcile.
-- Safety: idempotent (IF NOT EXISTS / IF EXISTS), wrapped in transaction.
-- ============================================================

begin;

-- ─── ud_dataset: kolom baru ───────────────────────────────────────────────────
alter table ud_dataset add column if not exists ticket_number text;  -- "TIC-PSN/.../ TT 1038696"
alter table ud_dataset add column if not exists site_id       text;  -- SUBSCRIBER NUMBER (disimpan text)

-- ─── ud_edits: field NON-HTB baru (po_name_edited & kendala_edited sudah ada) ──
alter table ud_edits add column if not exists mrq_number_edited        text;
alter table ud_edits add column if not exists resi_edited              text;
alter table ud_edits add column if not exists eta_edited               text;
alter table ud_edits add column if not exists status_pengiriman_edited text;
-- field HTB (satu-satunya yang persist lintas hari untuk Excel roundtrip):
alter table ud_edits add column if not exists progress_teknisi_edited  text;

alter table ud_edits add column if not exists is_mrq_number_edited        boolean default false;
alter table ud_edits add column if not exists is_resi_edited              boolean default false;
alter table ud_edits add column if not exists is_eta_edited               boolean default false;
alter table ud_edits add column if not exists is_status_pengiriman_edited boolean default false;
alter table ud_edits add column if not exists is_progress_teknisi_edited  boolean default false;

-- ─── ud_edits: drop field usang (desain lama, data throwaway harian) ───────────
alter table ud_edits drop column if exists problem_edited;
alter table ud_edits drop column if exists action_edited;
alter table ud_edits drop column if exists plan_target_edited;
alter table ud_edits drop column if exists is_problem_edited;
alter table ud_edits drop column if exists is_action_edited;
alter table ud_edits drop column if exists is_plan_target_edited;

-- ─── GRANT defensif (CLAUDE.md §8) — idempotent, aman walau sudah ada ──────────
grant select, insert, update, delete on public.ud_dataset to anon, authenticated, service_role;
grant select, insert, update, delete on public.ud_edits   to anon, authenticated, service_role;

commit;
