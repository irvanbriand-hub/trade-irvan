import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function handler(req: any, res: any) {
  // Security: hanya allow dari Vercel Cron
  // Vercel Cron kirim header Authorization: Bearer [CRON_SECRET]
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Ambil semua TT records saat ini
    const { data: records, error: fetchError } = await supabaseAdmin
      .from('tt_records')
      .select('status, down_time, tiket_internal');

    if (fetchError) throw fetchError;
    if (!records) throw new Error('No records found');

    const open = records.filter((r) => r.status === 'OPEN');
    const closed = records.filter((r) => r.status === 'CLOSED');

    const snapshot = {
      snapshot_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD

      total_tt: records.length,
      total_open: open.length,
      total_closed: closed.length,

      // Open by aging bucket
      open_lt30: open.filter((r) => r.down_time < 30).length,
      open_gt30: open.filter((r) => r.down_time >= 30).length,
      open_gt60: open.filter((r) => r.down_time >= 60).length,

      // Closed breakdown
      close_noc: closed.filter((r) => r.down_time <= 2).length,
      close_om: closed.filter(
        (r) =>
          r.down_time >= 3 &&
          !r.tiket_internal?.toUpperCase().includes('KUNJUNGAN'),
      ).length,
      close_visit: closed.filter((r) =>
        r.tiket_internal?.toUpperCase().includes('KUNJUNGAN'),
      ).length,

      // New TT hari ini (aging = 1 hari)
      new_open_today: open.filter((r) => r.down_time === 1).length,

      // Overdue
      overdue_gte8: open.filter((r) => r.down_time >= 8).length,
      overdue_gte30: open.filter((r) => r.down_time >= 30).length,
    };

    // Upsert — jika sudah ada snapshot hari ini, update
    const { error } = await supabaseAdmin
      .from('daily_snapshots')
      .upsert(snapshot, { onConflict: 'snapshot_date' });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      date: snapshot.snapshot_date,
      total_tt: snapshot.total_tt,
      total_open: snapshot.total_open,
      total_closed: snapshot.total_closed,
    });
  } catch (err: any) {
    console.error('Snapshot error:', err);
    return res.status(500).json({ error: err.message });
  }
}
