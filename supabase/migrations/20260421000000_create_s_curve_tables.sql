-- S-Curve Dashboard untuk NOC
-- Tabel baseline mingguan (Selasa ke Selasa) + target per site per baseline

-- Baseline per WM
create table s_curve_baselines (
  id uuid default gen_random_uuid() primary key,
  baseline_date date not null,
  end_date date not null,
  label text not null,
  total_target integer default 0,
  status text default 'active'
    check (status in ('active','completed','archived')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

alter table s_curve_baselines enable row level security;
create policy "Public read write" on s_curve_baselines
  for all using (true) with check (true);

create index s_curve_baselines_date_idx
  on s_curve_baselines(baseline_date);
create index s_curve_baselines_status_idx
  on s_curve_baselines(status);

-- Target per site per baseline
create table s_curve_targets (
  id uuid default gen_random_uuid() primary key,
  baseline_id uuid not null
    references s_curve_baselines(id) on delete cascade,
  site_id text not null,
  ticket_id text not null,
  site_name text,
  target_online date,
  actual_online date,
  is_online boolean default false,
  online_detected_at timestamptz,
  po_name text,
  provinsi text,
  kabupaten text,
  area integer,
  created_at timestamptz default now()
);

alter table s_curve_targets enable row level security;
create policy "Public read write" on s_curve_targets
  for all using (true) with check (true);

create index s_curve_targets_baseline_idx
  on s_curve_targets(baseline_id);
create index s_curve_targets_online_idx
  on s_curve_targets(is_online);
create index s_curve_targets_area_idx
  on s_curve_targets(area);
