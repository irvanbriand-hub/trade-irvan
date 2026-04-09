-- Migration: create NOC Dashboard tables
-- po_list: daftar PO (Field Operation Officer) dengan provinsi & kabupaten coverage
-- tt_uploads: history upload TSV harian (opsional)

-- ============================================================
-- TABLE: po_list
-- ============================================================
create table if not exists po_list (
  id                   uuid default gen_random_uuid() primary key,
  name                 text not null,
  area                 integer not null check (area in (1, 2, 3)),
  provinsi_coverage    text[] default '{}',
  kabupaten_coverage   text[] default '{}',
  status               text default 'active' check (status in ('active', 'inactive')),
  notes                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create index if not exists po_list_area_idx   on po_list (area);
create index if not exists po_list_status_idx on po_list (status);

-- RLS
alter table po_list enable row level security;
create policy "Allow all" on po_list for all using (true) with check (true);

-- Auto update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger po_list_updated_at
before update on po_list
for each row execute function update_updated_at();

-- ============================================================
-- TABLE: tt_uploads
-- ============================================================
create table if not exists tt_uploads (
  id              uuid default gen_random_uuid() primary key,
  upload_date     date not null,
  total_tt        integer default 0,
  total_open      integer default 0,
  total_closed    integer default 0,
  close_noc       integer default 0,
  close_om        integer default 0,
  close_visit     integer default 0,
  summary         jsonb,
  created_at      timestamptz default now()
);

create index if not exists tt_uploads_upload_date_idx on tt_uploads (upload_date);

-- RLS
alter table tt_uploads enable row level security;
create policy "Allow all" on tt_uploads for all using (true) with check (true);

-- ============================================================
-- SEED DATA: po_list (15 PO)
-- ============================================================
insert into po_list (name, area, provinsi_coverage, kabupaten_coverage, status) values
(
  'AGUS', 3,
  ARRAY['PAPUA','PAPUA BARAT','PAPUA BARAT DAYA','PAPUA PEGUNUNGAN','PAPUA SELATAN','PAPUA TENGAH'],
  ARRAY[]::text[], 'active'
),
(
  'ALEX', 2,
  ARRAY['KALIMANTAN TENGAH','KALIMANTAN TIMUR','KALIMANTAN UTARA'],
  ARRAY[]::text[], 'active'
),
(
  'DIRGA', 1,
  ARRAY['JAMBI','RIAU','SUMATERA SELATAN'],
  ARRAY[]::text[], 'active'
),
(
  'FAISAL', 2,
  ARRAY['GORONTALO','SULAWESI TENGGARA','SULAWESI UTARA'],
  ARRAY[]::text[], 'active'
),
(
  'FARHAN', 2,
  ARRAY['SULAWESI TENGAH'],
  ARRAY[]::text[], 'active'
),
(
  'GARIN', 1,
  ARRAY['ACEH'],
  ARRAY[]::text[], 'active'
),
(
  'HERMAN', 3,
  ARRAY['MALUKU UTARA'],
  ARRAY[]::text[], 'active'
),
(
  'IWAN', 2,
  ARRAY['KALIMANTAN BARAT','KALIMANTAN SELATAN'],
  ARRAY[]::text[], 'active'
),
(
  'JONO', 1,
  ARRAY['SUMATERA BARAT','SUMATERA UTARA'],
  ARRAY[]::text[], 'active'
),
(
  'KRIS', 1,
  ARRAY['BENGKULU','KEPULAUAN BANGKA BELITUNG','KEPULAUAN RIAU','LAMPUNG'],
  ARRAY[]::text[], 'active'
),
(
  'NOVAN', 3,
  ARRAY['NUSA TENGGARA BARAT'],
  ARRAY['ENDE','FLORES TIMUR','LEMBATA','MANGGARAI','MANGGARAI BARAT','MANGGARAI TIMUR','NAGEKEO','NGADA','SIKKA'],
  'active'
),
(
  'SUPRIYADI', 3,
  ARRAY['MALUKU'],
  ARRAY[]::text[], 'active'
),
(
  'YADIN', 2,
  ARRAY['SULAWESI BARAT','SULAWESI SELATAN'],
  ARRAY[]::text[], 'active'
),
(
  'YUDHI', 1,
  ARRAY['BANTEN','DKI JAKARTA','JAWA BARAT','JAWA TENGAH','JAWA TIMUR'],
  ARRAY[]::text[], 'active'
),
(
  'FIRMAN', 3,
  ARRAY[]::text[],
  ARRAY['ALOR','BELU','KUPANG','MALAKA','ROTE NDAO','SABU RAIJUA','SUMBA BARAT','SUMBA BARAT DAYA','SUMBA TENGAH','SUMBA TIMUR','TIMOR TENGAH SELATAN','TIMOR TENGAH UTARA'],
  'active'
);
