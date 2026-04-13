import { createClient } from '@supabase/supabase-js';
import { format, parseISO } from 'date-fns';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const APP_URL = process.env.VITE_APP_URL || 'https://tradeirvan.vercel.app';

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
🔧 *Close O\\&M (≥3h):* ${closeOM}

⚠️ *Overdue ≥8h:* ${overdue8}
🚨 *Overdue ≥30h:* ${overdue30}

📅 *Target Hari Ini:* ${targetToday}`;
}

async function generateOverdueText(): Promise<string> {
  const { data: records, error } = await supabaseAdmin
    .from('tt_records')
    .select('ticket_id, site_name, provinsi, down_time, status')
    .eq('status', 'OPEN')
    .order('down_time', { ascending: false });

  if (error || !records) return '❌ Gagal mengambil data overdue.';
  if (!records.length) return '✅ Tidak ada TT overdue saat ini.';

  const today = format(new Date(), 'dd/MM/yyyy');
  let text = `📋 *TT Overdue — ${today}*\n\n`;

  let currentAging = -1;
  let counter = 1;

  for (const record of records) {
    if (record.down_time !== currentAging) {
      currentAging = record.down_time;
      text += `\n*Aging ${currentAging} Hari*\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    text += `${counter}\\. ${record.ticket_id} \\- ${record.site_name} ❌\n`;
    text += `  📍 ${record.provinsi ?? '\\-'}\n`;
    counter++;
  }

  if (text.length > 4000) {
    text = text.substring(0, 4000) + '\n_\\.\\.\\. terpotong_';
  }
  return text;
}

// ─── Command router ───────────────────────────────────────────────────────────

async function processCommand(command: string, chatId: string) {
  switch (command) {
    case '/targettoday':
      await sendCaptureToTelegram(chatId, `${APP_URL}/noc/capture?type=daily&date=today`);
      break;
    case '/target-2':
      await sendCaptureToTelegram(chatId, `${APP_URL}/noc/capture?type=daily&date=tomorrow`);
      break;
    case '/target-3':
      await sendCaptureToTelegram(chatId, `${APP_URL}/noc/capture?type=daily&date=2days`);
      break;
    case '/closedtoday':
      await sendCaptureToTelegram(chatId, `${APP_URL}/noc/capture?type=closed`);
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
  const photoCommands = ['/targettoday', '/target-2', '/target-3', '/closedtoday'];

  if (photoCommands.includes(command)) {
    await sendTelegramMessage(allowedChatId!, `⏳ Generating ${command}\\.\\.\\. mohon tunggu \\~15 detik`);
  }

  await processCommand(command, allowedChatId!);

  return res.status(200).json({ ok: true });
}
