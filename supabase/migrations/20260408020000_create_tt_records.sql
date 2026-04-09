create table tt_records (
  id uuid default gen_random_uuid() primary key,
  ticket_id text not null unique,
  site_id text,
  site_name text not null,
  provinsi text,
  kabupaten text,
  tiket_internal text,
  status text check (status in ('OPEN','CLOSED')),
  down_time integer default 0,
  date_start text,
  target_online_original text,
  target_online_edited text,
  reschedule_note text,
  actual_online text,
  prob_class text,
  detail_prob text,
  note_original text,
  teknis_nt text,
  upload_date date,
  is_manually_edited boolean default false,
  created_at timestamptz default now(),
  last_updated timestamptz default now()
);

-- RLS
alter table tt_records enable row level security;
create policy "Allow all" on tt_records for all using (true) with check (true);

-- Auto update last_updated
create trigger tt_records_updated_at
before update on tt_records
for each row execute function update_updated_at();

-- Index untuk performa
create index tt_records_ticket_id_idx on tt_records(ticket_id);
create index tt_records_target_online_idx on tt_records(target_online_original);
create index tt_records_status_idx on tt_records(status);
