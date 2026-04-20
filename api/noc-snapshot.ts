import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function getWIBDate(offsetDays = 0): string {
  const now = new Date();
  const wibTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  wibTime.setUTCDate(wibTime.getUTCDate() + offsetDays);
  return wibTime.toISOString().split('T')[0];
}

function getWIBParts(offsetDays = 0): { day: number; date: number; month: number; year: number } {
  const now = new Date();
  const wibTime = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  wibTime.setUTCDate(wibTime.getUTCDate() + offsetDays);
  return {
    day: wibTime.getUTCDay(),
    date: wibTime.getUTCDate(),
    month: wibTime.getUTCMonth(),
    year: wibTime.getUTCFullYear(),
  };
}

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
      snapshot_date: getWIBDate(0), // YYYY-MM-DD di zona WIB (UTC+7)

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

    // Format tanggal Indonesia
    const bulanNames = [
      'Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'
    ];
    const wib = getWIBParts(0);
    const tanggalFormatted = `${wib.date} ${bulanNames[wib.month]} ${wib.year}`;

    const message = `🔄 *Snapshot Harian — ${tanggalFormatted}*

Data berhasil direkam pukul 23.00 WIB:

🔢 Total TT Aktif: ${snapshot.total_tt} TT
❌ Total Open: ${snapshot.total_open} TT
✅ Total Closed: ${snapshot.total_closed} TT

📊 Breakdown Open:
⏳ Open < 30 Hari: ${snapshot.open_lt30} TT
⛔ Open ≥ 30 Hari: ${snapshot.open_gt30} TT
❌ Open ≥ 60 Hari: ${snapshot.open_gt60} TT

📍 TT Baru Hari Ini: ${snapshot.new_open_today} TT
⚠️ Overdue ≥ 8 Hari: ${snapshot.overdue_gte8} TT
🚨 Overdue ≥ 30 Hari: ${snapshot.overdue_gte30} TT`;

    // Kirim ke Telegram
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown',
        }),
      }
    );

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
