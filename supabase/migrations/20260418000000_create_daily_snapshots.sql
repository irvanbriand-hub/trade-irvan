create table daily_snapshots (
  id uuid default gen_random_uuid() primary key,
  snapshot_date date not null unique,

  -- TT counts saat snapshot diambil
  total_tt integer default 0,
  total_open integer default 0,
  total_closed integer default 0,

  -- Breakdown open by aging
  open_lt30 integer default 0,
  open_gt30 integer default 0,
  open_gt60 integer default 0,

  -- Breakdown closed
  close_noc integer default 0,
  close_om integer default 0,
  close_visit integer default 0,

  -- New TT hari ini
  new_open_today integer default 0,

  -- Overdue
  overdue_gte8 integer default 0,
  overdue_gte30 integer default 0,

  created_at timestamptz default now()
);

alter table daily_snapshots enable row level security;
create policy "Public read write" on daily_snapshots
  for all using (true) with check (true);

create index daily_snapshots_date_idx on daily_snapshots(snapshot_date);
