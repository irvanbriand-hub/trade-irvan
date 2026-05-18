-- ============================================================
-- ALTER: rtgs_annotations — re-key dari ticket_id → site_id
--
-- Masalah: anotasi disimpan dengan kunci unik `ticket_id`
-- (format `{site_id}-{tahun}-{seq}`). Saat Google Sheet menaikkan
-- nomor urut tiket untuk site yang MASIH down (mis. -007 → -009),
-- anotasi lama jadi yatim & baris baru tampil default.
--
-- Solusi: pakai `site_id` sebagai kunci stabil (terbukti tidak
-- pernah ada >1 tiket OPEN per site). Recovery orphan-tapi-live
-- terjadi otomatis begitu join pakai site_id. `ticket_id` tetap
-- disimpan sebagai referensi (last-seen), bukan lagi conflict key.
-- ============================================================

-- 1. Tambah kolom site_id
alter table public.rtgs_annotations
  add column if not exists site_id text;

-- 2. Backfill: utamakan site_id dari tt_records (paling andal utk
--    tiket yang masih ada), fallback strip suffix `-YYYY-NNN` dari
--    ticket_id (utk anotasi yatim yang tt_records-nya sudah dihapus).
update public.rtgs_annotations a
set site_id = coalesce(
  (select t.site_id from public.tt_records t
     where t.ticket_id = a.ticket_id and t.site_id is not null
     limit 1),
  regexp_replace(a.ticket_id, '-[0-9]{4}-[0-9]+$', '')
)
where a.site_id is null;

-- Empty string → NULL (jangan dianggap kunci valid)
update public.rtgs_annotations
set site_id = null
where site_id = '';

-- 3. Dedup/merge: beberapa anotasi bisa berbagi site_id (mis. edit
--    di -010 lalu -011). Survivor = row updated_at terbaru per site.
--    Untuk tiap field, kalau survivor belum edited tapi ada anggota
--    grup yang edited → salin value+flag dari row edited ter-update.
--    plan_target_online: pertahankan value non-null (snapshot auto
--    pun berharga), prioritas yang edited.

with survivors as (
  select id, site_id
  from (
    select id, site_id,
           row_number() over (
             partition by site_id
             order by updated_at desc, id desc
           ) as rn
    from public.rtgs_annotations
    where site_id is not null
  ) q
  where rn = 1
)
update public.rtgs_annotations s
set problem_analisa = b.problem_analisa,
    is_problem_edited = true
from survivors sv
join lateral (
  select r.problem_analisa
  from public.rtgs_annotations r
  where r.site_id = sv.site_id and r.is_problem_edited = true
  order by r.updated_at desc, r.id desc
  limit 1
) b on true
where s.id = sv.id and s.is_problem_edited = false;

with survivors as (
  select id, site_id from (
    select id, site_id,
           row_number() over (partition by site_id order by updated_at desc, id desc) rn
    from public.rtgs_annotations where site_id is not null
  ) q where rn = 1
)
update public.rtgs_annotations s
set action = b.action,
    is_action_edited = true
from survivors sv
join lateral (
  select r.action
  from public.rtgs_annotations r
  where r.site_id = sv.site_id and r.is_action_edited = true
  order by r.updated_at desc, r.id desc
  limit 1
) b on true
where s.id = sv.id and s.is_action_edited = false;

with survivors as (
  select id, site_id from (
    select id, site_id,
           row_number() over (partition by site_id order by updated_at desc, id desc) rn
    from public.rtgs_annotations where site_id is not null
  ) q where rn = 1
)
update public.rtgs_annotations s
set kendala = b.kendala,
    is_kendala_edited = true
from survivors sv
join lateral (
  select r.kendala
  from public.rtgs_annotations r
  where r.site_id = sv.site_id and r.is_kendala_edited = true
  order by r.updated_at desc, r.id desc
  limit 1
) b on true
where s.id = sv.id and s.is_kendala_edited = false;

with survivors as (
  select id, site_id from (
    select id, site_id,
           row_number() over (partition by site_id order by updated_at desc, id desc) rn
    from public.rtgs_annotations where site_id is not null
  ) q where rn = 1
)
update public.rtgs_annotations s
set plan_target_online = b.plan_target_online,
    is_plan_target_online_edited = b.is_plan_target_online_edited
from survivors sv
join lateral (
  select r.plan_target_online, r.is_plan_target_online_edited
  from public.rtgs_annotations r
  where r.site_id = sv.site_id and r.plan_target_online is not null
  order by r.is_plan_target_online_edited desc, r.updated_at desc, r.id desc
  limit 1
) b on true
where s.id = sv.id
  and (s.plan_target_online is null or s.plan_target_online = '');

-- Hapus non-survivor (recompute ranking; survivor sudah ter-merge
-- & updated_at-nya paling baru, tetap rn=1).
delete from public.rtgs_annotations
where site_id is not null
  and id not in (
    select id from (
      select id,
             row_number() over (
               partition by site_id order by updated_at desc, id desc
             ) rn
      from public.rtgs_annotations
      where site_id is not null
    ) q where rn = 1
  );

-- 4. Tukar kunci unik: ticket_id → site_id
alter table public.rtgs_annotations
  drop constraint if exists rtgs_annotations_ticket_id_key;

create unique index if not exists rtgs_annotations_site_id_uniq
  on public.rtgs_annotations(site_id)
  where site_id is not null;

create index if not exists rtgs_annotations_site_id_idx
  on public.rtgs_annotations(site_id);
