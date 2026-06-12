-- NOC kini WAJIB login. Cabut akses role `anon` dari semua tabel/view NOC,
-- pastikan `authenticated` (owner + akun NOC team) punya akses penuh.
--
-- Catatan: Telegram webhook & cron snapshot (api/*.ts) memakai SERVICE_ROLE_KEY
-- yang BYPASS RLS & grant — jadi pengetatan ini tidak memengaruhi bot/cron.
--
-- Pendekatan: gate di level privilege (revoke dari anon). Tanpa privilege tabel,
-- PostgREST menolak anon sebelum RLS dievaluasi — lebih kokoh & tak perlu tahu
-- nama tiap policy. RLS policy "allow all" yang ada tetap berlaku untuk
-- authenticated (yang memang kita izinkan).

begin;

do $$
declare
  rel text;
  -- Tabel NOC (read+write untuk authenticated)
  noc_tables text[] := array[
    'po_list', 'tt_uploads', 'tt_records', 'site_notes', 'bot_templates',
    'daily_snapshots', 'rtgs_annotations', 'telegram_rtgs_list_snapshot',
    's_curve_baselines', 's_curve_targets',
    'noc_perf_sites', 'noc_perf_nmt', 'noc_perf_cboss', 'noc_perf_tmo',
    'noc_perf_sla_monthly', 'noc_perf_csr_log', 'noc_perf_daily_ping',
    'noc_perf_uploads', 'noc_perf_classifications',
    'ud_dataset', 'ud_edits', 'ud_ref_product', 'ud_ref_po', 'ud_ref_htb_site',
    'ud_htb_override'
  ];
  -- Materialized view NOC (read-only untuk authenticated)
  noc_views text[] := array[
    'noc_perf_mv_site_metrics', 'noc_perf_mv_regency_summary',
    'noc_perf_mv_regency_sla_monthly', 'noc_perf_mv_regency_categories'
  ];
begin
  foreach rel in array noc_tables loop
    if to_regclass('public.' || rel) is not null then
      execute format('revoke all on public.%I from anon', rel);
      execute format('grant select, insert, update, delete on public.%I to authenticated', rel);
      execute format('grant select, insert, update, delete on public.%I to service_role', rel);
    end if;
  end loop;

  foreach rel in array noc_views loop
    if to_regclass('public.' || rel) is not null then
      execute format('revoke all on public.%I from anon', rel);
      execute format('grant select on public.%I to authenticated', rel);
      execute format('grant select on public.%I to service_role', rel);
    end if;
  end loop;
end $$;

-- Sebagian tabel memakai sequence (serial). Pastikan authenticated bisa insert.
-- Idempotent & aman (usage sequence tidak memberi akses tabel apa pun).
grant usage, select on all sequences in schema public to authenticated;

commit;
