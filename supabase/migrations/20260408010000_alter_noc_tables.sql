-- Migration: alter NOC tables to match spec
-- Tambah kabupaten_coverage, hapus shift, tambah RLS, trigger, seed data

-- 1. Tambah kolom kabupaten_coverage jika belum ada
alter table po_list add column if not exists kabupaten_coverage text[] default '{}';

-- 2. Hapus kolom shift jika masih ada
alter table po_list drop column if exists shift;

-- 3. RLS (idempotent)
alter table po_list enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'po_list' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on po_list for all using (true) with check (true)';
  end if;
end$$;

alter table tt_uploads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tt_uploads' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on tt_uploads for all using (true) with check (true)';
  end if;
end$$;

-- 4. updated_at trigger (idempotent)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists po_list_updated_at on po_list;
create trigger po_list_updated_at
before update on po_list
for each row execute function update_updated_at();

-- 5. Seed data — hanya insert jika tabel kosong
insert into po_list (name, area, provinsi_coverage, kabupaten_coverage, status)
select * from (values
  ('AGUS',      3, ARRAY['PAPUA','PAPUA BARAT','PAPUA BARAT DAYA','PAPUA PEGUNUNGAN','PAPUA SELATAN','PAPUA TENGAH'], ARRAY[]::text[], 'active'),
  ('ALEX',      2, ARRAY['KALIMANTAN TENGAH','KALIMANTAN TIMUR','KALIMANTAN UTARA'], ARRAY[]::text[], 'active'),
  ('DIRGA',     1, ARRAY['JAMBI','RIAU','SUMATERA SELATAN'], ARRAY[]::text[], 'active'),
  ('FAISAL',    2, ARRAY['GORONTALO','SULAWESI TENGGARA','SULAWESI UTARA'], ARRAY[]::text[], 'active'),
  ('FARHAN',    2, ARRAY['SULAWESI TENGAH'], ARRAY[]::text[], 'active'),
  ('GARIN',     1, ARRAY['ACEH'], ARRAY[]::text[], 'active'),
  ('HERMAN',    3, ARRAY['MALUKU UTARA'], ARRAY[]::text[], 'active'),
  ('IWAN',      2, ARRAY['KALIMANTAN BARAT','KALIMANTAN SELATAN'], ARRAY[]::text[], 'active'),
  ('JONO',      1, ARRAY['SUMATERA BARAT','SUMATERA UTARA'], ARRAY[]::text[], 'active'),
  ('KRIS',      1, ARRAY['BENGKULU','KEPULAUAN BANGKA BELITUNG','KEPULAUAN RIAU','LAMPUNG'], ARRAY[]::text[], 'active'),
  ('NOVAN',     3, ARRAY['NUSA TENGGARA BARAT'], ARRAY['ENDE','FLORES TIMUR','LEMBATA','MANGGARAI','MANGGARAI BARAT','MANGGARAI TIMUR','NAGEKEO','NGADA','SIKKA'], 'active'),
  ('SUPRIYADI', 3, ARRAY['MALUKU'], ARRAY[]::text[], 'active'),
  ('YADIN',     2, ARRAY['SULAWESI BARAT','SULAWESI SELATAN'], ARRAY[]::text[], 'active'),
  ('YUDHI',     1, ARRAY['BANTEN','DKI JAKARTA','JAWA BARAT','JAWA TENGAH','JAWA TIMUR'], ARRAY[]::text[], 'active'),
  ('FIRMAN',    3, ARRAY[]::text[], ARRAY['ALOR','BELU','KUPANG','MALAKA','ROTE NDAO','SABU RAIJUA','SUMBA BARAT','SUMBA BARAT DAYA','SUMBA TENGAH','SUMBA TIMUR','TIMOR TENGAH SELATAN','TIMOR TENGAH UTARA'], 'active')
) as v(name, area, provinsi_coverage, kabupaten_coverage, status)
where not exists (select 1 from po_list limit 1);
