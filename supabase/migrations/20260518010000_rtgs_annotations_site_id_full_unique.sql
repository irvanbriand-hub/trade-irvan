-- ============================================================
-- FIX: rtgs_annotations — unique site_id harus NON-partial
--
-- Migration 20260518000000 membuat partial unique index
-- (`where site_id is not null`). PostgREST `upsert(onConflict:'site_id')`
-- menghasilkan `ON CONFLICT (site_id)` TANPA predikat WHERE, sehingga
-- Postgres menolak: "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- Solusi: ganti dengan UNIQUE CONSTRAINT biasa (non-partial).
-- NULL tetap diizinkan & dianggap distinct (write path sudah guard
-- agar site_id tidak pernah null saat upsert).
-- ============================================================

drop index if exists public.rtgs_annotations_site_id_uniq;

alter table public.rtgs_annotations
  drop constraint if exists rtgs_annotations_site_id_key;

alter table public.rtgs_annotations
  add constraint rtgs_annotations_site_id_key unique (site_id);
