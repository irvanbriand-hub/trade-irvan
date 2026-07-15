-- Tambah kolom HUB & Beam ke master site (datek). Additive & nullable — aman.
alter table public.noc_site_master
  add column if not exists hub text,
  add column if not exists beam text;
