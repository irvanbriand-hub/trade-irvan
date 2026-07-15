-- Tambah kolom Gateway (di samping IP Address) ke master site. Additive & nullable.
alter table public.noc_site_master
  add column if not exists gateway text;
