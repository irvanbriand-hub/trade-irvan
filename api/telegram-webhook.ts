import { createClient } from '@supabase/supabase-js';
import { format, parseISO } from 'date-fns';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const APP_URL = process.env.VITE_APP_URL || 'https://tradeirvan.vercel.app';
const NOC_SHEETS_URL = process.env.VITE_NOC_SHEETS_URL || '';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Telegram helpers ─────────────────────────────────────────────────────────

async function sendTelegramMessage(chatId: string, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

async function sendTelegramPhoto(chatId: string, photo: Buffer) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('photo', new Blob([photo], { type: 'image/png' }), 'recap.png');
  await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData });
}

// ─── Screenshot helper ────────────────────────────────────────────────────────

async function sendCaptureToTelegram(chatId: string, url: string) {
  let browser = null;
  try {
    const chromium = (await import('@sparticuz/chromium')).default;
    const puppeteer = (await import('puppeteer-core')).default;

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1400, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless as boolean,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#capture-ready', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1000));

    const element = await page.$('#capture-ready');
    if (!element) throw new Error('#capture-ready element not found');

    const screenshot = await element.screenshot({ type: 'png' });
    await sendTelegramPhoto(chatId, Buffer.from(screenshot));
  } catch (err: any) {
    console.error('[sendCaptureToTelegram] error:', err);
    await sendTelegramMessage(chatId, `❌ Gagal generate capture: ${err.message}`);
  } finally {
    if (browser) await (browser as any).close();
  }
}

// ─── Sheet sync helpers ───────────────────────────────────────────────────────

function normalizeDateFromSheet(str: string): string {
  if (!str) return '';
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function normalizeKabupaten(str: string): string {
  if (!str) return '';
  return str.replace(/^KAB\.\s*/i, '').replace(/^KOTA\s*/i, '').trim();
}

function toISODate(dateStr: string): string {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

type SheetRow = Record<string, string>;

function mapSheetRowToRecord(row: SheetRow) {
  return {
    tiket_internal: row['TIKET INTERNAL'] || null,
    ticket_id: row['TICKET ID'] || '',
    site_id: row['SITE ID'] || null,
    status: (row['STATUS'] || 'OPEN') as 'OPEN' | 'CLOSED',
    site_name: row['SITE NAME'] || '',
    provinsi: row['PROVINSI'] || null,
    kabupaten: normalizeKabupaten(row['KABUPATEN'] || '') || null,
    date_start: normalizeDateFromSheet(row['DATE START TT'] || '') || null,
    down_time: parseInt(row['DOWN TIME'] || '0', 10),
    target_online_original: normalizeDateFromSheet(row['TARGET ONLINE'] || '') || null,
    actual_online: normalizeDateFromSheet(row['ACTUAL ONLINE'] || '') || null,
    prob_class: row['PROBLEM CLASSIFICATION'] || null,
    detail_prob: row['DETAIL PROBLEM'] || null,
    teknis_nt: row['TEKNIS/NON TEKNIS'] || null,
  };
}

type ExistingEntry = {
  is_manually_edited: boolean;
  target_online_edited: string | null;
  reschedule_note: string | null;
};

async function syncFromGoogleSheet(): Promise<void> {
  if (!NOC_SHEETS_URL) throw new Error('VITE_NOC_SHEETS_URL tidak dikonfigurasi');

  const resp = await fetch(NOC_SHEETS_URL);
  if (!resp.ok) throw new Error(`Gagal fetch sheet: ${resp.status}`);

  const rows: SheetRow[] = await resp.json();
  if (!rows.length) return;

  const records = rows.map(mapSheetRowToRecord).filter((r) => r.ticket_id);
  if (!records.length) return;

  const ticketIds = records.map((r) => r.ticket_id);

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('tt_records')
    .select('ticket_id, is_manually_edited, target_online_edited, reschedule_note')
    .in('ticket_id', ticketIds);

  if (fetchError) throw fetchError;

  const existingMap = new Map<string, ExistingEntry>(
    (existing ?? []).map((e: any) => [
      e.ticket_id as string,
      {
        is_manually_edited: e.is_manually_edited as boolean,
        target_online_edited: e.target_online_edited as string | null,
        reschedule_note: e.reschedule_note as string | null,
      },
    ]),
  );

  const uploadDate = format(new Date(), 'dd/MM/yyyy');
  const toInsert: typeof records = [];
  const toUpdateFull: typeof records = [];
  const toUpdatePartial: Array<{ record: (typeof records)[0]; existing: ExistingEntry }> = [];

  for (const record of records) {
    const ex = existingMap.get(record.ticket_id);
    if (!ex) {
      toInsert.push(record);
    } else if (!ex.is_manually_edited) {
      toUpdateFull.push(record);
    } else {
      toUpdatePartial.push({ record, existing: ex });
    }
  }

  const writeOps: Promise<void>[] = [];

  if (toInsert.length > 0) {
    writeOps.push(
      supabaseAdmin.from('tt_records').insert(
        toInsert.map((r) => ({
          ...r,
          target_online_edited: r.target_online_original,
          upload_date: toISODate(uploadDate),
          is_manually_edited: false,
        })),
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  if (toUpdateFull.length > 0) {
    writeOps.push(
      supabaseAdmin.from('tt_records').upsert(
        toUpdateFull.map((r) => ({
          ...r,
          target_online_edited: r.target_online_original,
          upload_date: toISODate(uploadDate),
          is_manually_edited: false,
        })),
        { onConflict: 'ticket_id' },
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  if (toUpdatePartial.length > 0) {
    writeOps.push(
      supabaseAdmin.from('tt_records').upsert(
        toUpdatePartial.map(({ record: r, existing: ex }) => ({
          ...r,
          target_online_edited: ex.target_online_edited,  // PROTECTED
          upload_date: toISODate(uploadDate),
          is_manually_edited: true,                       // PROTECTED
          reschedule_note: ex.reschedule_note,            // PROTECTED
        })),
        { onConflict: 'ticket_id' },
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  await Promise.all(writeOps);
}

async function syncAndCapture(chatId: string, url: string): Promise<void> {
  await sendTelegramMessage(chatId, '⏳ Syncing data dari Google Sheet...');
  try {
    await syncFromGoogleSheet();
  } catch (err: any) {
    console.error('[syncAndCapture] sync error:', err);
    await sendTelegramMessage(chatId, `⚠️ Sync gagal: ${err.message}. Melanjutkan dengan data lama...`);
  }
  await sendTelegramMessage(chatId, '📡 Data diupdate. Generating capture...');
  await sendCaptureToTelegram(chatId, url);
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) return dateStr;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    try { return format(parseISO(dateStr), 'dd/MM/yyyy'); } catch { return ''; }
  }
  return dateStr;
}

// ─── Text generators ──────────────────────────────────────────────────────────

async function generateSummaryText(): Promise<string> {
  const { data: records, error } = await supabaseAdmin
    .from('tt_records')
    .select('status, down_time, target_online_original, tiket_internal');

  if (error || !records) return '❌ Gagal mengambil data summary.';

  const today = format(new Date(), 'dd/MM/yyyy');
  const todayKey = format(new Date(), 'dd/MM/yyyy');

  const total       = records.length;
  const open        = records.filter((r: any) => r.status === 'OPEN').length;
  const closed      = records.filter((r: any) => r.status === 'CLOSED').length;
  const closeNOC    = records.filter((r: any) => r.status === 'CLOSED' && r.down_time <= 2).length;
  const closeOM     = records.filter((r: any) => r.status === 'CLOSED' && r.down_time >= 3).length;
  const overdue8    = records.filter((r: any) => r.status === 'OPEN' && r.down_time >= 8).length;
  const overdue30   = records.filter((r: any) => r.status === 'OPEN' && r.down_time >= 30).length;
  const targetToday = records.filter(
    (r: any) => normalizeDate(r.target_online_original ?? '') === todayKey,
  ).length;

  return `📊 *NOC Summary — ${today}*

📌 *Total TT:* ${total}
🔴 *Open:* ${open}
🟢 *Closed:* ${closed}

✅ *Close NOC (≤2h):* ${closeNOC}
🔧 *Close O&M (≥3h):* ${closeOM}

⚠️ *Overdue ≥8h:* ${overdue8}
🚨 *Overdue ≥30h:* ${overdue30}

📅 *Target Hari Ini:* ${targetToday}`;
}

type POEntry = {
  name: string;
  kabupaten_coverage: string[];
  provinsi_coverage: string[];
  status: string;
};

function findPOName(provinsi: string, kabupaten: string, poList: POEntry[]): string {
  const provUpper = (provinsi || '').toUpperCase();
  const kabUpper = (kabupaten || '').toUpperCase();

  if (kabUpper) {
    const byKab = poList.find(
      (po) =>
        po.status === 'active' &&
        po.kabupaten_coverage.some((k) => k.toUpperCase() === kabUpper),
    );
    if (byKab) return byKab.name;
  }

  const byProv = poList.find(
    (po) =>
      po.status === 'active' &&
      po.provinsi_coverage.some((p) => p.toUpperCase() === provUpper),
  );
  return byProv?.name ?? '-';
}

async function generateOverdueText(): Promise<string> {
  const [recordsRes, poRes] = await Promise.all([
    supabaseAdmin
      .from('tt_records')
      .select('ticket_id, site_name, provinsi, kabupaten, down_time, status')
      .eq('status', 'OPEN')
      .order('down_time', { ascending: false }),
    supabaseAdmin
      .from('po_list')
      .select('name, kabupaten_coverage, provinsi_coverage, status'),
  ]);

  if (recordsRes.error || !recordsRes.data) return '❌ Gagal mengambil data overdue.';
  if (!recordsRes.data.length) return '✅ Tidak ada TT overdue saat ini.';

  const records = recordsRes.data;
  const poList: POEntry[] = (poRes.data ?? []) as POEntry[];
  const today = format(new Date(), 'dd/MM/yyyy');
  const SEP = '=========================';

  let text = `📋 *TT Overdue — ${today}*\n\n`;

  let currentAging = -1;
  let counter = 1;

  for (const record of records) {
    if (record.down_time !== currentAging) {
      currentAging = record.down_time;
      text += `Aging ${currentAging} Hari\n${SEP}\n`;
    }
    const emoji = record.status === 'CLOSED' ? '✅' : '❌';
    const poName = findPOName(record.provinsi ?? '', record.kabupaten ?? '', poList);
    text += `${counter}. ${record.ticket_id} - ${record.site_name} ${emoji}\n`;
    text += `> *PO*: ${poName} | ${record.provinsi ?? '-'}\n\n`;
    counter++;
  }

  text += `Total: ${records.length} TT open`;

  if (text.length > 4000) {
    text = text.substring(0, 4000) + '\n... terpotong';
  }
  return text;
}

// ─── Command router ───────────────────────────────────────────────────────────

async function processCommand(command: string, chatId: string) {
  switch (command) {
    case '/targettoday':
      await syncAndCapture(chatId, `${APP_URL}/noc/capture?type=daily&date=today`);
      break;
    case '/target-2':
      await syncAndCapture(chatId, `${APP_URL}/noc/capture?type=daily&date=tomorrow`);
      break;
    case '/target-3':
      await syncAndCapture(chatId, `${APP_URL}/noc/capture?type=daily&date=2days`);
      break;
    case '/closedtoday':
      await syncAndCapture(chatId, `${APP_URL}/noc/capture?type=closed`);
      break;
    case '/summary': {
      const summaryText = await generateSummaryText();
      await sendTelegramMessage(chatId, summaryText);
      break;
    }
    case '/overdue': {
      const overdueText = await generateOverdueText();
      await sendTelegramMessage(chatId, overdueText);
      break;
    }
    default:
      break;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body;
  const message = body?.message || body?.channel_post;
  if (!message) return res.status(200).end();

  const chatId = message.chat?.id?.toString();
  const allowedChatId = process.env.TELEGRAM_CHAT_ID?.trim();
  const text: string = message.text || '';

  if (chatId !== allowedChatId) return res.status(200).end();

  const command = text.split(' ')[0].toLowerCase();

  await processCommand(command, allowedChatId!);

  return res.status(200).json({ ok: true });
}
