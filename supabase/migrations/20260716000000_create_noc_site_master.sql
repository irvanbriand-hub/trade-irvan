-- Master data site (datek) — referensi global untuk pengelolaan lokasi.
-- Sumber: upload Excel dengan kolom
--   SITE ID, NAME, KATEGORI LOKASI, IP ADDRESS, PROVINSI, KABUPATEN,
--   KECAMATAN, CLUSTER, DESA, LONGITUDE, LATITUDE
-- Longitude/latitude disimpan numeric untuk kebutuhan geospasial (peta) nantinya.

create table if not exists public.noc_site_master (
  id uuid default gen_random_uuid() primary key,
  site_id text not null unique,
  name text,
  kategori_lokasi text,
  ip_address text,
  provinsi text,
  kabupaten text,
  kecamatan text,
  cluster text,
  desa text,
  longitude double precision,
  latitude double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: NOC wajib login → akses penuh untuk authenticated (pola sama tt_records).
alter table public.noc_site_master enable row level security;
create policy "Allow all" on public.noc_site_master for all using (true) with check (true);

-- Auto update updated_at.
create trigger noc_site_master_updated_at
before update on public.noc_site_master
for each row execute function update_updated_at();

-- Index untuk pencarian umum.
create index if not exists noc_site_master_provinsi_idx on public.noc_site_master(provinsi);
create index if not exists noc_site_master_kabupaten_idx on public.noc_site_master(kabupaten);

-- GRANT eksplisit (wajib untuk tabel baru sejak 30 Okt 2026 — auto-grant dihentikan).
grant select, insert, update, delete on public.noc_site_master to authenticated;
grant select, insert, update, delete on public.noc_site_master to service_role;
