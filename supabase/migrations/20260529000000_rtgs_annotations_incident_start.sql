-- ============================================================
-- ALTER: rtgs_annotations — tag anotasi ke INSIDEN via incident_start
--
-- Masalah: anotasi dikunci site_id & persist lintas insiden. Saat site
-- pulih lalu down lagi (insiden baru), anotasi insiden lama (kendala,
-- plan_target_online, dst) tetap nempel & muncul di tiket baru.
--
-- Solusi: simpan `date_start` (tanggal mulai down) insiden saat anotasi
-- dibuat. Tampilan & sync membandingkan incident_start vs date_start tiket
-- OPEN sekarang. date_start tetap sama selama reissue (masih down), berubah
-- saat insiden baru → jadi kunci insiden yang andal.
-- ============================================================

alter table public.rtgs_annotations add column if not exists incident_start text;

-- Backfill: hanya anotasi milik insiden tiket OPEN sekarang yang di-tag.
-- Kriteria "milik insiden sekarang":
--   (a) ticket_id == tiket OPEN saat ini, ATAU
--   (b) updated_at >= tanggal mulai down (catatan ditulis selama insiden ini
--       berjalan — mencakup kasus reissue saat masih down).
-- Sisanya (stale dari insiden lama) dibiarkan NULL → ter-gate di tampilan.
update public.rtgs_annotations a
set incident_start = t.date_start
from public.tt_records t
where t.site_id = a.site_id
  and t.status = 'OPEN'
  and (
    t.ticket_id = a.ticket_id
    or (
      t.date_start ~ '^[0-9]{2}/[0-9]{2}/[0-9]{2}$'
      and a.updated_at::date >= to_date(t.date_start, 'DD/MM/YY')
    )
  );
