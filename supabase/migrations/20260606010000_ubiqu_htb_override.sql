-- ============================================================
-- Migration: UBIQU DIRUMA — HTB Override by Ticket ID
-- Plan: iya-nomor-tiket-aku-partitioned-swing.md
-- Tujuan: daftar Ticket ID yang DIPAKSA jadi HTB (override klasifikasi).
--   • Dikunci by ticket_id (TT...) — BUKAN site_id: saat tiket close & muncul
--     problem baru di site yang sama, override lama tidak salah ikut.
--   • Di-paste manual di web, di-GC saat upload baru (ticket hilang = close).
-- Safety: idempotent, wrapped in transaction.
-- ============================================================

begin;

create table if not exists ud_htb_override (
  id          bigserial primary key,
  ticket_id   text not null unique,   -- "TT 1038696" (sama format ud_dataset.ticket_id)
  created_at  timestamptz default now()
);

create index if not exists idx_ud_htb_override_ticket on ud_htb_override(ticket_id);

-- RLS public read/write (pola ud_*, /noc publik)
alter table ud_htb_override enable row level security;
drop policy if exists ud_htb_override_public_rw on ud_htb_override;
create policy ud_htb_override_public_rw on ud_htb_override
  for all using (true) with check (true);

-- GRANT eksplisit (CLAUDE.md §8)
grant select, insert, update, delete on public.ud_htb_override to anon, authenticated, service_role;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;

commit;
