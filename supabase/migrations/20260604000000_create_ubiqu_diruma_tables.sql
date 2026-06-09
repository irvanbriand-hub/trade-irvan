-- ============================================================
-- Migration: UBIQU DIRUMA Ticket Capture — Foundation Tables
-- Plan: noc-ubiqu-diruma-plan.md
-- Convention: ALL objects prefixed `ud_*`
-- Model: data NOC bersama (global, tanpa user_id) — sama seperti rtgs_annotations.
--        /noc/* publik (anon), jadi GRANT wajib ke anon + authenticated + service_role.
-- Safety: idempotent (IF NOT EXISTS), wrapped in transaction
-- ============================================================

begin;

-- ============================================================
-- DATA TABLES (langsing — ditimpa tiap upload tiket via TRUNCATE)
-- ============================================================

-- ud_dataset — hasil upload tiket terkini (HANYA baris lolos filter UBIQU DIRUMA).
create table if not exists ud_dataset (
  id               bigserial primary key,
  ticket_id        text not null unique,   -- "TT 1038696" (KEY editan)
  site_name        text,                   -- SUBSCRIBER NAME
  province         text,                   -- PROVINCE NAME
  city             text,                   -- CITY NAME
  district         text,                   -- DISTRICT NAME
  package_name     text,                   -- PACKAGE NAME
  trouble_category text,
  dur_days         integer not null default 0,  -- DUR DAYS (sort key)
  ticket_status    text,
  ticket_date      text,
  address          text,                   -- ADDR INSTALLATION
  -- derived (dihitung saat upload dari tabel referensi):
  product          text,                   -- hasil lookup PRODUCT
  po_name          text,                   -- hasil lookup PO ('' = editable manual)
  htb_label        text,                   -- 'HTB' | 'NON HTB'
  uploaded_at      timestamptz default now(),
  created_at       timestamptz default now()
);

create index if not exists idx_ud_dataset_dur on ud_dataset(dur_days desc);

-- ud_edits — override sel manual, dikunci by ticket_id. Persist selama tiket masih ada;
-- di-GC saat upload baru (reconcile di app: DELETE WHERE ticket_id NOT IN <upload baru>).
create table if not exists ud_edits (
  id                    uuid default gen_random_uuid() primary key,
  ticket_id             text not null unique,
  po_name_edited        text,
  problem_edited        text,
  action_edited         text,
  kendala_edited        text,
  plan_target_edited    text,
  is_po_edited          boolean default false,
  is_problem_edited     boolean default false,
  is_action_edited      boolean default false,
  is_kendala_edited     boolean default false,
  is_plan_target_edited boolean default false,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create index if not exists idx_ud_edits_ticket on ud_edits(ticket_id);

drop trigger if exists ud_edits_updated_at on ud_edits;
create trigger ud_edits_updated_at
  before update on ud_edits
  for each row execute function update_updated_at();

-- ============================================================
-- REFERENCE TABLES (upload sekali, ditimpa saat user update datasheet)
-- ============================================================

-- ud_ref_product — PAKET NAME -> PRODUCT
create table if not exists ud_ref_product (
  id          bigserial primary key,
  paket_name  text not null,
  product     text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_ud_ref_product_paket on ud_ref_product(paket_name);

-- ud_ref_po — PROVINS + KABUPATEN -> NAMA PO
create table if not exists ud_ref_po (
  id          bigserial primary key,
  provins     text not null,
  kabupaten   text not null default 'All',
  nama_po     text not null,
  created_at  timestamptz default now()
);

-- ud_ref_htb_site — daftar lokasi HTB (datasheet menyusul; aturan "Converter" jalan tanpa ini)
create table if not exists ud_ref_htb_site (
  id          bigserial primary key,
  site_key    text not null,
  created_at  timestamptz default now()
);

create index if not exists idx_ud_ref_htb_site_key on ud_ref_htb_site(site_key);

-- ============================================================
-- ROW LEVEL SECURITY — public read/write (pola rtgs_annotations, /noc publik)
-- ============================================================
do $$
declare
  t text;
  tables text[] := array[
    'ud_dataset', 'ud_edits',
    'ud_ref_product', 'ud_ref_po', 'ud_ref_htb_site'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_public_rw', t);
    execute format(
      'create policy %I on %I for all using (true) with check (true)',
      t || '_public_rw', t
    );
  end loop;
end$$;

-- ============================================================
-- GRANTS (wajib eksplisit untuk tabel baru — CLAUDE.md §8)
-- /noc publik → anon perlu akses. service_role utk import script.
-- ============================================================
do $$
declare
  t text;
  tables text[] := array[
    'ud_dataset', 'ud_edits',
    'ud_ref_product', 'ud_ref_po', 'ud_ref_htb_site'
  ];
begin
  foreach t in array tables loop
    execute format('grant select, insert, update, delete on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end$$;

-- Sequences (bigserial) — grant usage supaya insert dari anon/authenticated tidak "permission denied"
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

commit;
