-- Migration: create stamp_duty table
-- Tabel untuk tracking biaya materai (Rp 10.000 per hari jika total transaksi > Rp 10.000.000)

create table if not exists stamp_duty (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  trade_date  date not null,
  amount      integer not null default 10000,
  auto        boolean not null default true,
  notes       text,
  created_at  timestamptz not null default now()
);

-- Unique constraint: hanya 1 record materai per user per hari
alter table stamp_duty
  add constraint stamp_duty_user_date_unique unique (user_id, trade_date);

-- Index untuk lookup per user dan date
create index stamp_duty_user_id_idx on stamp_duty (user_id);
create index stamp_duty_trade_date_idx on stamp_duty (trade_date);

-- RLS: user hanya bisa akses data sendiri
alter table stamp_duty enable row level security;

create policy "Users can view own stamp_duty"
  on stamp_duty for select
  using (auth.uid() = user_id);

create policy "Users can insert own stamp_duty"
  on stamp_duty for insert
  with check (auth.uid() = user_id);

create policy "Users can update own stamp_duty"
  on stamp_duty for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own stamp_duty"
  on stamp_duty for delete
  using (auth.uid() = user_id);
