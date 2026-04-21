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

// ─── S-Curve actual-online detection (duplikasi dari scurveQueries.ts) ────────

function parseTargetToISODate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s === '-') return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

async function updateBaselineActualsServer(): Promise<number> {
  const { data: baseline } = await supabaseAdmin
    .from('s_curve_baselines')
    .select('id')
    .eq('status', 'active')
    .maybeSingle();

  if (!baseline) return 0;

  const { data: targets } = await supabaseAdmin
    .from('s_curve_targets')
    .select('id, ticket_id')
    .eq('baseline_id', (baseline as { id: string }).id)
    .eq('is_online', false);

  if (!targets || targets.length === 0) return 0;

  const { data: currentRecords } = await supabaseAdmin
    .from('tt_records')
    .select('ticket_id, status, actual_online');

  const recordMap = new Map<string, { status: string; actual_online: string | null }>();
  for (const r of (currentRecords as Array<{ ticket_id: string; status: string; actual_online: string | null }>) ?? []) {
    recordMap.set(r.ticket_id, { status: r.status, actual_online: r.actual_online });
  }

  const now = new Date().toISOString();
  const todayWIB = getWIBDate();
  const updates: Array<{ id: string; actual_online: string }> = [];

  for (const target of targets as Array<{ id: string; ticket_id: string }>) {
    const record = recordMap.get(target.ticket_id);
    let actualOnline: string | null = null;

    if (!record) {
      actualOnline = todayWIB;
    } else if (
      record.status === 'CLOSED' &&
      record.actual_online &&
      record.actual_online.trim() !== '' &&
      record.actual_online.trim() !== '-'
    ) {
      actualOnline = parseTargetToISODate(record.actual_online) ?? todayWIB;
    }

    if (actualOnline) {
      updates.push({ id: target.id, actual_online: actualOnline });
    }
  }

  if (updates.length === 0) return 0;

  await Promise.all(
    updates.map((u) =>
      supabaseAdmin
        .from('s_curve_targets')
        .update({
          is_online: true,
          actual_online: u.actual_online,
          online_detected_at: now,
        })
        .eq('id', u.id)
        .then(({ error }) => {
          if (error) throw error;
        }),
    ),
  );

  return updates.length;
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

    // Update S-Curve baseline actuals (best-effort)
    try {
      const n = await updateBaselineActualsServer();
      if (n > 0) console.log(`[noc-snapshot] S-Curve: ${n} target mark online`);
    } catch (err) {
      console.error('[noc-snapshot] updateBaselineActualsServer error:', err);
    }

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
