-- Content Tracker iterasi 2: tipe konten per channel (Reels / Post / Story / dst)
-- Channel dengan nama sama boleh punya tipe berbeda sebagai baris terpisah di grid.

alter table content_pages add column if not exists content_type text not null default 'Post';

-- Relax unique constraint lama (user_id, platform, name) → sertakan content_type
alter table content_pages drop constraint if exists content_pages_user_platform_name_unique;
alter table content_pages add constraint content_pages_user_platform_name_type_unique
  unique (user_id, platform, name, content_type);
