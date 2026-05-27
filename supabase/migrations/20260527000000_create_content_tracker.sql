-- Migration: Content Tracker
-- Sub-domain baru untuk tracking jadwal & posting konten di Facebook, Instagram, YouTube, TikTok.
-- Full manual (tanpa integrasi API platform). Per-user (RLS auth.uid() = user_id).

-- =====================================================================
-- Tabel: content_pages — daftar halaman/akun yang dilacak (multi-akun per platform)
-- =====================================================================
create table if not exists content_pages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('facebook','instagram','youtube','tiktok')),
  name        text not null,
  handle      text,
  color       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Hindari duplikat nama page dalam platform yang sama untuk 1 user
alter table content_pages
  add constraint content_pages_user_platform_name_unique unique (user_id, platform, name);

create index if not exists content_pages_user_idx on content_pages (user_id);

alter table content_pages enable row level security;

create policy "Users can view own content_pages"
  on content_pages for select
  using (auth.uid() = user_id);

create policy "Users can insert own content_pages"
  on content_pages for insert
  with check (auth.uid() = user_id);

create policy "Users can update own content_pages"
  on content_pages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own content_pages"
  on content_pages for delete
  using (auth.uid() = user_id);

-- =====================================================================
-- Tabel: content_schedules — slot jadwal individual per page
-- =====================================================================
create table if not exists content_schedules (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  page_id         uuid not null references content_pages(id) on delete cascade,
  scheduled_at    timestamptz not null,
  title           text not null,
  notes           text,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','posted','missed')),
  posted_at       timestamptz,
  bulk_batch_id   uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists content_schedules_user_date_idx on content_schedules (user_id, scheduled_at);
create index if not exists content_schedules_page_idx       on content_schedules (page_id);
create index if not exists content_schedules_batch_idx      on content_schedules (bulk_batch_id);
create index if not exists content_schedules_status_idx     on content_schedules (user_id, status);

alter table content_schedules enable row level security;

create policy "Users can view own content_schedules"
  on content_schedules for select
  using (auth.uid() = user_id);

create policy "Users can insert own content_schedules"
  on content_schedules for insert
  with check (auth.uid() = user_id);

create policy "Users can update own content_schedules"
  on content_schedules for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own content_schedules"
  on content_schedules for delete
  using (auth.uid() = user_id);

-- Auto-update kolom updated_at (function update_updated_at() sudah ada dari migration NOC)
create trigger content_schedules_updated_at
before update on content_schedules
for each row execute function update_updated_at();
