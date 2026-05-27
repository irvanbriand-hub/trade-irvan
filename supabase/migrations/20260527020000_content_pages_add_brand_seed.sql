-- Content Tracker iterasi 3: lapisan Brand/Project untuk mengelompokkan channel.
-- 1 channel per (brand, platform). Grid & Halaman dikelompokkan per brand.

alter table content_pages add column if not exists brand text;

create index if not exists content_pages_brand_idx on content_pages (user_id, brand);

-- Seed channel awal untuk pemilik (idempotent, guard by email + not-exists).
-- name = brand (label baris di grid pakai platform; brand jadi header grup).
insert into content_pages (user_id, brand, platform, name, content_type, color, is_active)
select u.id, v.brand, v.platform, v.brand, 'Post', v.color, true
from auth.users u
cross join (values
  ('IB Clip',          'facebook',  '#1877F2'),
  ('IB Clip',          'youtube',   '#FF0000'),
  ('Amaze_Transform',  'instagram', '#E4405F'),
  ('Amaze_Transform',  'facebook',  '#1877F2'),
  ('Amaze_Transform',  'youtube',   '#FF0000'),
  ('Amaze_Transform',  'tiktok',    '#000000'),
  ('WarmClay Studio',  'facebook',  '#1877F2'),
  ('WarmClay Studio',  'instagram', '#E4405F'),
  ('WarmClay Studio',  'youtube',   '#FF0000'),
  ('WarmClay Studio',  'tiktok',    '#000000'),
  ('HomeWood',         'facebook',  '#1877F2')
) as v(brand, platform, color)
where u.email = 'irvanbriand@gmail.com'
  and not exists (
    select 1 from content_pages cp
    where cp.user_id = u.id and cp.brand = v.brand and cp.platform = v.platform
  );
