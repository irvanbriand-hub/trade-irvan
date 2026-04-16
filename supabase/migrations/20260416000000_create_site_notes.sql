-- Tabel keterangan permanen per site (tidak ikut reset data harian)
create table site_notes (
  id uuid default gen_random_uuid() primary key,
  site_id text not null unique,
  site_name text,
  note text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table site_notes enable row level security;
create policy "Public read write" on site_notes
  for all using (true) with check (true);

create trigger site_notes_updated_at
before update on site_notes
for each row execute function update_updated_at();

create index site_notes_site_id_idx on site_notes(site_id);
