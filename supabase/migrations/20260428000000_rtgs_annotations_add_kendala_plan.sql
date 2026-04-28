-- ============================================================
-- ALTER: rtgs_annotations
-- Tambah 2 kolom catatan manual baru:
--   - kendala (free text)
--   - plan_target_online (date / free text)
-- Keduanya persist saat sync TSV ulang, hanya bisa dihapus
-- via reset manual di UI (mirror behavior problem_analisa & action).
-- ============================================================
alter table public.rtgs_annotations
  add column if not exists kendala text,
  add column if not exists is_kendala_edited boolean not null default false,
  add column if not exists plan_target_online text,
  add column if not exists is_plan_target_online_edited boolean not null default false;
