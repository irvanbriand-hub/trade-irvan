-- ============================================================
-- TABLE: rtgs_annotations
-- Annotasi manual untuk laporan RTGS Mahaga
-- (override Problem Analisa & Action per ticket_id)
-- ============================================================
create table rtgs_annotations (
  id uuid default gen_random_uuid() primary key,
  ticket_id text not null unique,
  problem_analisa text,
  action text,
  is_problem_edited boolean default false,
  is_action_edited boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table rtgs_annotations enable row level security;
create policy "Public read write" on rtgs_annotations
  for all using (true) with check (true);

-- Auto update updated_at (pakai function update_updated_at() yang sudah ada)
create trigger rtgs_annotations_updated_at
before update on rtgs_annotations
for each row execute function update_updated_at();

-- Index untuk performa lookup per ticket
create index rtgs_annotations_ticket_idx
  on rtgs_annotations(ticket_id);
