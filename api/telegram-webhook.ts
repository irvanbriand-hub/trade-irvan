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

async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts: { parseMode?: 'Markdown' | 'HTML' | null } = {},
) {
  // parseMode === null => plain text, tanpa parse_mode (aman untuk teks
  // dari user yang mungkin punya '*' / '_' / '`').
  const body: Record<string, any> = { chat_id: chatId, text };
  if (opts.parseMode !== null) {
    body.parse_mode = opts.parseMode ?? 'Markdown';
  }
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function sendTelegramPhoto(
  chatId: string,
  photo: Buffer,
  filename: string = 'recap.png',
  caption?: string,
) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append('photo', new Blob([photo], { type: 'image/png' }), filename);
  if (caption) formData.append('caption', caption);
  await fetch(`${TELEGRAM_API}/sendPhoto`, { method: 'POST', body: formData });
}

async function sendTelegramDocument(
  chatId: string,
  file: Buffer,
  filename: string,
  caption?: string,
) {
  const formData = new FormData();
  formData.append('chat_id', chatId);
  formData.append(
    'document',
    new Blob([file], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  );
  if (caption) formData.append('caption', caption);
  await fetch(`${TELEGRAM_API}/sendDocument`, { method: 'POST', body: formData });
}

const TELEGRAM_MAX_LENGTH = 3800;

function splitIntoChunks(
  text: string,
  sectionPattern?: RegExp,
  opts: { plainPrefix?: boolean } = {},
): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let currentChunk = '';
  const sections = sectionPattern ? text.split(sectionPattern) : [text];

  for (const section of sections) {
    if (section.length > TELEGRAM_MAX_LENGTH) {
      const lines = section.split('\n');
      for (const line of lines) {
        if ((currentChunk + '\n' + line).length > TELEGRAM_MAX_LENGTH) {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk += (currentChunk ? '\n' : '') + line;
        }
      }
    } else if ((currentChunk + '\n\n' + section).length > TELEGRAM_MAX_LENGTH) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = section;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + section;
    }
  }

  if (currentChunk) chunks.push(currentChunk);

  if (chunks.length > 1) {
    return chunks.map((chunk, i) =>
      opts.plainPrefix
        ? `📋 Part ${i + 1}/${chunks.length}\n\n${chunk}`
        : `📋 *Part ${i + 1}/${chunks.length}*\n\n${chunk}`,
    );
  }
  return chunks;
}

async function sendTelegramChunks(
  chatId: string,
  chunks: string[],
  opts: { parseMode?: 'Markdown' | 'HTML' | null } = {},
): Promise<void> {
  for (const chunk of chunks) {
    await sendTelegramMessage(chatId, chunk, opts);
    await new Promise((r) => setTimeout(r, 300));
  }
}

// ─── Capture auth (headless) ─────────────────────────────────────────────────
// /noc/* wajib login. Puppeteer tak punya sesi interaktif, jadi kita mint
// magiclink token (single-use, short-lived) untuk akun "capture bot" dan
// menempelkannya ke URL sebagai #cap_otp=. Halaman capture mengonsumsinya.

const CAPTURE_BOT_EMAIL = 'capturebot@noc.tradeirvan.local';

async function ensureCaptureUser() {
  try {
    await supabaseAdmin.auth.admin.createUser({
      email: CAPTURE_BOT_EMAIL,
      password: `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}A!`,
      email_confirm: true,
      app_metadata: { role: 'noc', capture_bot: true },
    });
  } catch {
    /* sudah ada → abaikan */
  }
}

// Mengembalikan fragment hash "cap_otp=<token>" untuk ditempel ke URL capture.
async function captureAuthHash(): Promise<string> {
  let res = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: CAPTURE_BOT_EMAIL,
  });
  if (res.error || !res.data?.properties?.hashed_token) {
    // user mungkin belum ada (fresh env) → buat lalu ulang sekali
    await ensureCaptureUser();
    res = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: CAPTURE_BOT_EMAIL,
    });
  }
  const token = res.data?.properties?.hashed_token;
  if (!token) throw new Error('gagal mint capture session');
  return `cap_otp=${encodeURIComponent(token)}`;
}

// ─── Screenshot helper ────────────────────────────────────────────────────────

async function sendCaptureToTelegram(
  chatId: string,
  url: string,
  opts: { filename?: string; waitSelector?: string; caption?: string } = {},
) {
  const filename = opts.filename ?? 'recap.png';
  const waitSelector = opts.waitSelector ?? '#capture-ready';
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

    // Tempel magiclink token untuk auth headless (sebelum navigasi).
    const authHash = await captureAuthHash();
    const navUrl = `${url}${url.includes('#') ? '&' : '#'}${authHash}`;
    await page.goto(navUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector(waitSelector, { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1000));

    const element = await page.$(waitSelector);
    if (!element) throw new Error(`${waitSelector} element not found`);

    const screenshot = await element.screenshot({ type: 'png' });
    await sendTelegramPhoto(
      chatId,
      Buffer.from(screenshot),
      filename,
      opts.caption,
    );
  } catch (err: any) {
    console.error('[sendCaptureToTelegram] error:', err);
    await sendTelegramMessage(chatId, `❌ Gagal generate capture: ${err.message}`);
  } finally {
    if (browser) await (browser as any).close();
  }
}

// ─── UBIQU DIRUMA: build styled HTB Excel server-side (for /diruma) ──────────

const HTB_HEADERS = [
  'No',
  'No Tiket',
  'Site ID',
  'Nama Lokasi',
  'Provinsi',
  'Umur Tiket (Hari)',
  'Progress Spare',
  'Progress Teknisi',
  'No MRQ',
  'RESI',
  'MOD',
  'MOS',
];

async function buildDirumaHtbExcel(
  dateLabel: string,
  timeLabel: string,
): Promise<{ buffer: Buffer; htbCount: number }> {
  // xlsx-js-style = CommonJS → di Node/Vercel export-nya ada di .default
  // (XLSX.utils undefined kalau pakai namespace langsung).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import('xlsx-js-style');
  const XLSX: any = mod.default ?? mod;

  const [ds, ed, ov] = await Promise.all([
    supabaseAdmin
      .from('ud_dataset')
      .select('*')
      .order('dur_days', { ascending: false }),
    supabaseAdmin.from('ud_edits').select('*'),
    supabaseAdmin.from('ud_htb_override').select('ticket_id'),
  ]);
  if (ds.error) throw new Error(ds.error.message);

  const rows: any[] = ds.data ?? [];
  const edits: any[] = ed.data ?? [];
  const overrideSet = new Set(
    (ov.data ?? []).map((r: any) => r.ticket_id as string),
  );
  const editById = new Map<string, any>();
  for (const e of edits) editById.set(e.ticket_id, e);

  // Efektif HTB = htb_label HTB ATAU di-override.
  const htbRows = rows.filter(
    (r) => r.htb_label === 'HTB' || overrideSet.has(r.ticket_id),
  );

  const aoa: (string | number)[][] = [];
  aoa.push([]);
  aoa.push([
    `Tiket Ubiqu Diruma yang membutuhkan spare HTB-A dan HTB-B, Update : ${dateLabel}, Jam ${timeLabel} WIB`,
  ]);
  aoa.push([]);
  aoa.push([...HTB_HEADERS]);
  htbRows.forEach((row, idx) => {
    const e = editById.get(row.ticket_id);
    const progressTeknisi =
      e?.is_progress_teknisi_edited && e.progress_teknisi_edited
        ? e.progress_teknisi_edited
        : '';
    aoa.push([
      idx + 1,
      row.ticket_number ?? '',
      row.site_id ?? '',
      row.site_name ?? '',
      row.province ?? '',
      row.dur_days ?? 0,
      '',
      progressTeknisi,
      '',
      '',
      '',
      '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const NCOL = HTB_HEADERS.length;
  const HEADER_R = 3;
  const lastDataR = HEADER_R + htbRows.length;

  ws['!cols'] = [
    { wch: 4 },
    { wch: 38 },
    { wch: 13 },
    { wch: 24 },
    { wch: 18 },
    { wch: 9 },
    { wch: 20 },
    { wch: 22 },
    { wch: 26 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
  ];
  ws['!merges'] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: NCOL - 1 } }];
  ws['!rows'] = [];
  ws['!rows'][1] = { hpt: 22 };
  ws['!rows'][HEADER_R] = { hpt: 30 };
  ws['!autofilter'] = {
    ref: `${XLSX.utils.encode_cell({ r: HEADER_R, c: 0 })}:${XLSX.utils.encode_cell(
      { r: HEADER_R, c: NCOL - 1 },
    )}`,
  };
  ws['!freeze'] = {
    xSplit: 0,
    ySplit: HEADER_R + 1,
    topLeftCell: `A${HEADER_R + 2}`,
    activePane: 'bottomLeft',
    state: 'frozen',
  };

  const thin = { style: 'thin', color: { rgb: 'BFBFBF' } };
  const allBorder = { top: thin, bottom: thin, left: thin, right: thin };
  const setStyle = (r: number, c: number, s: Record<string, unknown>) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = s;
  };

  setStyle(1, 0, {
    font: { bold: true, sz: 12, color: { rgb: 'FF0000' } },
    alignment: { horizontal: 'left', vertical: 'center' },
  });
  for (let c = 0; c < NCOL; c++) {
    setStyle(HEADER_R, c, {
      fill: { patternType: 'solid', fgColor: { rgb: 'FFFF00' } },
      font: { bold: true, sz: 11, color: { rgb: '000000' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allBorder,
    });
  }
  for (let r = HEADER_R + 1; r <= lastDataR; r++) {
    for (let c = 0; c < NCOL; c++) {
      const center = c === 0 || c === 5;
      setStyle(r, c, {
        font: { sz: 10, color: { rgb: '000000' } },
        alignment: {
          horizontal: center ? 'center' : 'left',
          vertical: 'top',
          wrapText: true,
        },
        border: allBorder,
      });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HTB');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  return { buffer: Buffer.from(out), htbCount: htbRows.length };
}

// ─── RTGS Annotation helpers (for /rtgs-list & /rtgs-edit-* commands) ─────────

const RTGS_DEFAULT_ACTION = 'Kunjungan Teknisi';

// Pola detail_prob yang otomatis di-replace di tampilan (display-only).
// Key: pattern uppercase + trimmed. Value: teks pengganti.
// Harus sinkron dengan PROBLEM_AUTO_REPLACE di src/lib/noc/rtgsQueries.ts.
const RTGS_PROBLEM_AUTO_REPLACE: Record<string, string> = {
  'LINK TIDAK TERDETEKSI / OFFLINE': 'BELUM ADA KONFIRMASI PIC',
  'LINK TIDAK TERDETEKSI/OFFLINE': 'BELUM ADA KONFIRMASI PIC',
  'LINK TIDAK TERDETEKSI': 'BELUM ADA KONFIRMASI PIC',
  MISSPOINTING: 'BUC/LNB',
  'MISS POINTING': 'BUC/LNB',
  MISPOINTING: 'BUC/LNB',
  'MIS POINTING': 'BUC/LNB',
};

type RtgsFieldAlias = 'problem' | 'action' | 'kendala' | 'target';
const RTGS_FIELD_MAP: Record<
  RtgsFieldAlias,
  { col: string; flag: string; label: string }
> = {
  problem: {
    col: 'problem_analisa',
    flag: 'is_problem_edited',
    label: 'Problem Hasil Analisa',
  },
  action: {
    col: 'action',
    flag: 'is_action_edited',
    label: 'Action',
  },
  kendala: {
    col: 'kendala',
    flag: 'is_kendala_edited',
    label: 'Kendala',
  },
  target: {
    col: 'plan_target_online',
    flag: 'is_plan_target_online_edited',
    label: 'Plan Target Online',
  },
};

interface RtgsTtRow {
  ticket_id: string;
  site_id: string | null;
  site_name: string;
  provinsi: string | null;
  kabupaten: string | null;
  down_time: number;
  detail_prob: string | null;
  date_start: string | null;
  target_online_original: string | null;
  target_online_edited: string | null;
  is_manually_edited: boolean | null;
}

interface RtgsAnnRow {
  site_id: string | null;
  ticket_id: string;
  problem_analisa: string | null;
  action: string | null;
  kendala: string | null;
  plan_target_online: string | null;
  incident_start: string | null;
  is_problem_edited: boolean | null;
  is_action_edited: boolean | null;
  is_kendala_edited: boolean | null;
  is_plan_target_online_edited: boolean | null;
}

function rtgsEffectiveProblem(rec: RtgsTtRow, ann: RtgsAnnRow | null): string {
  if (ann?.is_problem_edited && ann.problem_analisa) return ann.problem_analisa;
  const dp = (rec.detail_prob ?? '').trim().toUpperCase();
  const replaced = RTGS_PROBLEM_AUTO_REPLACE[dp];
  if (replaced) return replaced;
  return rec.detail_prob || '-';
}
function rtgsEffectiveAction(ann: RtgsAnnRow | null): string {
  if (ann?.is_action_edited && ann.action) return ann.action;
  return RTGS_DEFAULT_ACTION;
}
function rtgsEffectiveKendala(ann: RtgsAnnRow | null): string {
  if (ann?.is_kendala_edited && ann.kendala) return ann.kendala;
  return '-';
}
function rtgsEffectivePlanTarget(ann: RtgsAnnRow | null): string {
  if (ann?.is_plan_target_online_edited && ann.plan_target_online)
    return ann.plan_target_online;
  return '-';
}
function rtgsPickTargetOnline(rec: RtgsTtRow): string {
  if (rec.is_manually_edited && rec.target_online_edited)
    return rec.target_online_edited;
  return rec.target_online_original || '';
}

interface RtgsPoRow {
  name: string;
  provinsi_coverage: string[] | null;
  kabupaten_coverage: string[] | null;
  status: string | null;
}

/**
 * Resolve nama PO penanggung jawab lokasi. Mirror getPO() di
 * src/lib/noc/classifiers.ts: cek kabupaten_coverage dulu, fallback provinsi.
 * Khusus NTT (FIRMAN vs NOVAN) bedanya di kabupaten.
 */
function rtgsResolvePO(rec: RtgsTtRow, poList: RtgsPoRow[]): string {
  const prov = (rec.provinsi ?? '').toUpperCase();
  const kab = (rec.kabupaten ?? '').toUpperCase();

  if (kab) {
    const byKab = poList.find(
      (p) =>
        p.status === 'active' &&
        (p.kabupaten_coverage ?? []).some((k) => k.toUpperCase() === kab),
    );
    if (byKab) return byKab.name;
  }

  const byProv = poList.find(
    (p) =>
      p.status === 'active' &&
      (p.provinsi_coverage ?? []).some((pr) => pr.toUpperCase() === prov),
  );
  return byProv?.name ?? '-';
}

function rtgsFormatDate(raw: string | null | undefined): string {
  if (!raw) return '-';
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${d}/${m}/${y}`;
  }
  return trimmed;
}

function getRtgsWIBLabel(): { date: string; time: string } {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return { date: `${dd}/${mm}/${yyyy}`, time: `${hh}:${mi}` };
}

async function handleRtgsList(chatId: string, minAging: number = 7) {
  await sendTelegramMessage(chatId, '⏳ Syncing data dari Google Sheet...');
  try {
    await syncFromGoogleSheet();
  } catch (err: any) {
    await sendTelegramMessage(
      chatId,
      `⚠️ Sync gagal: ${err.message}. Melanjutkan dengan data lama...`,
    );
  }

  const { data: ttsRaw, error: ttsErr } = await supabaseAdmin
    .from('tt_records')
    .select(
      'ticket_id, site_id, site_name, provinsi, kabupaten, down_time, detail_prob, date_start, target_online_original, target_online_edited, is_manually_edited',
    )
    .eq('status', 'OPEN')
    .gte('down_time', minAging)
    .order('down_time', { ascending: false });

  if (ttsErr) {
    await sendTelegramMessage(chatId, `❌ Gagal load TT: ${ttsErr.message}`, {
      parseMode: null,
    });
    return;
  }

  const tickets = (ttsRaw ?? []) as RtgsTtRow[];

  if (tickets.length === 0) {
    await sendTelegramMessage(
      chatId,
      `Tidak ada TT dengan aging ≥ ${minAging} hari.`,
      { parseMode: null },
    );
    await supabaseAdmin
      .from('telegram_rtgs_list_snapshot')
      .delete()
      .eq('chat_id', chatId);
    return;
  }

  // Pagination wajib: PostgREST cap 1000 baris/`select`, rtgs_annotations
  // bisa >1000 (auto-snapshot Plan TO per sync). Tanpa loop ini sebagian
  // anotasi terpotong → tidak muncul di /rtgs-list.
  const annsRaw: RtgsAnnRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error: annErr } = await supabaseAdmin
      .from('rtgs_annotations')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (annErr) {
      await sendTelegramMessage(
        chatId,
        `❌ Gagal load annotations: ${annErr.message}`,
        { parseMode: null },
      );
      return;
    }
    const batch = (data ?? []) as RtgsAnnRow[];
    annsRaw.push(...batch);
    if (batch.length < 1000) break;
  }
  const annMap = new Map<string, RtgsAnnRow>();
  for (const a of annsRaw) {
    if (a.site_id) annMap.set(a.site_id, a);
  }

  // Load PO list untuk derive nama PO per lokasi (by kabupaten→provinsi).
  // Kalau gagal, list tetap jalan dengan PO '-'.
  const { data: poRaw } = await supabaseAdmin
    .from('po_list')
    .select('name, provinsi_coverage, kabupaten_coverage, status');
  const poList = (poRaw ?? []) as RtgsPoRow[];

  const { date: dateLabel, time: timeLabel } = getRtgsWIBLabel();

  const items = tickets.map((t, i) => {
    const annRaw = (t.site_id ? annMap.get(t.site_id) : null) ?? null;
    // Gate per insiden: anotasi insiden lama (incident_start ≠ date_start tiket
    // sekarang) diabaikan → tidak ikut tampil di list Telegram.
    const ann = annRaw && annRaw.incident_start === t.date_start ? annRaw : null;
    return [
      `${i + 1}. ${t.site_name} — ${t.down_time} hari`,
      `   Site   : ${t.site_id ?? '-'}`,
      `   Prov   : ${t.provinsi ?? '-'}`,
      `   PO     : ${rtgsResolvePO(t, poList)}`,
      `   Problem: ${rtgsEffectiveProblem(t, ann)}`,
      `   Action : ${rtgsEffectiveAction(ann)}`,
      `   Kendala: ${rtgsEffectiveKendala(ann)}`,
      `   PlanTO : ${rtgsFormatDate(rtgsEffectivePlanTarget(ann))}`,
      `   UpdTO  : ${rtgsFormatDate(rtgsPickTargetOnline(t))}`,
    ].join('\n');
  });

  const header =
    `📋 RTGS List — ${tickets.length} TT (umur ≥ ${minAging} hari)\n` +
    `update: ${dateLabel}, ${timeLabel}\n\n` +
    `Edit: /rtgs-edit-<field>-<N> <text>\n` +
    `Field: problem | action | kendala | target\n` +
    `Contoh: /rtgs-edit-kendala-2 Sudah dikunjungi tapi tidak ada PIC`;

  const fullText = header + '\n\n' + items.join('\n\n');
  const chunks = splitIntoChunks(fullText, /\n\n(?=\d+\.\s)/, {
    plainPrefix: true,
  });
  await sendTelegramChunks(chatId, chunks, { parseMode: null });

  // Persist snapshot — overwrite latest list per chat_id
  const snapshot = tickets.map((t, i) => ({
    idx: i + 1,
    ticket_id: t.ticket_id,
    site_id: t.site_id,
    site_name: t.site_name,
    down_time: t.down_time,
    date_start: t.date_start,
  }));
  const { error: snapUpErr } = await supabaseAdmin
    .from('telegram_rtgs_list_snapshot')
    .upsert(
      {
        chat_id: chatId,
        tickets: snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id' },
    );
  if (snapUpErr) {
    console.error('[rtgs-list] snapshot upsert error:', snapUpErr);
  }
}

async function handleRtgsEdit(
  chatId: string,
  fieldAlias: RtgsFieldAlias,
  idx: number,
  value: string,
) {
  const fieldInfo = RTGS_FIELD_MAP[fieldAlias];
  if (!value) {
    await sendTelegramMessage(
      chatId,
      `❌ Value kosong. Format: /rtgs-edit-${fieldAlias}-${idx} <text>`,
      { parseMode: null },
    );
    return;
  }

  const { data: snap, error: snapErr } = await supabaseAdmin
    .from('telegram_rtgs_list_snapshot')
    .select('tickets')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (snapErr) {
    await sendTelegramMessage(
      chatId,
      `❌ Gagal load snapshot: ${snapErr.message}`,
      { parseMode: null },
    );
    return;
  }
  if (!snap) {
    await sendTelegramMessage(
      chatId,
      '❌ Belum ada list di chat ini. Jalankan /rtgs-list dulu.',
      { parseMode: null },
    );
    return;
  }

  const tickets = ((snap.tickets ?? []) as Array<{
    idx: number;
    ticket_id: string;
    site_id: string | null;
    site_name: string;
    down_time: number;
    date_start?: string | null;
  }>);
  const item = tickets.find((t) => t.idx === idx);
  if (!item) {
    await sendTelegramMessage(
      chatId,
      `❌ Nomor #${idx} tidak ada di list. Range: 1..${tickets.length}.`,
      { parseMode: null },
    );
    return;
  }

  if (!item.site_id) {
    await sendTelegramMessage(
      chatId,
      `❌ #${idx} ${item.site_name} tidak punya site_id — anotasi tidak bisa disimpan.`,
      { parseMode: null },
    );
    return;
  }

  // Fetch existing annotation + date_start tiket OPEN sekarang (kunci insiden).
  // Kunci anotasi = site_id (stabil lintas reissue tiket).
  const [{ data: existing, error: fetchErr }, { data: ttRow }] = await Promise.all([
    supabaseAdmin
      .from('rtgs_annotations')
      .select('*')
      .eq('site_id', item.site_id)
      .maybeSingle(),
    supabaseAdmin
      .from('tt_records')
      .select('date_start')
      .eq('site_id', item.site_id)
      .eq('status', 'OPEN')
      .maybeSingle(),
  ]);
  if (fetchErr) {
    await sendTelegramMessage(
      chatId,
      `❌ Gagal load annotation: ${fetchErr.message}`,
      { parseMode: null },
    );
    return;
  }

  // date_start dari snapshot (kalau ada) atau dari tt_records OPEN terkini.
  const incidentStart =
    (item.date_start ?? null) || ((ttRow as any)?.date_start ?? null);
  const isNewIncident =
    !!existing && (existing as any).incident_start !== incidentStart;

  const updateData: Record<string, any> = {
    site_id: item.site_id,
    ticket_id: item.ticket_id,
    incident_start: incidentStart,
    [fieldInfo.col]: value,
    [fieldInfo.flag]: true,
  };
  if (existing && !isNewIncident) {
    // Insiden sama → preserve field lain.
    for (const otherKey of Object.keys(RTGS_FIELD_MAP) as RtgsFieldAlias[]) {
      if (otherKey === fieldAlias) continue;
      const oi = RTGS_FIELD_MAP[otherKey];
      updateData[oi.col] = (existing as any)[oi.col];
      updateData[oi.flag] = (existing as any)[oi.flag];
    }
  } else if (isNewIncident) {
    // Insiden baru → reset field lain ke default.
    for (const otherKey of Object.keys(RTGS_FIELD_MAP) as RtgsFieldAlias[]) {
      if (otherKey === fieldAlias) continue;
      const oi = RTGS_FIELD_MAP[otherKey];
      updateData[oi.col] = null;
      updateData[oi.flag] = false;
    }
  }

  const { error: upErr } = await supabaseAdmin
    .from('rtgs_annotations')
    .upsert(updateData, { onConflict: 'site_id' });
  if (upErr) {
    await sendTelegramMessage(chatId, `❌ Gagal simpan: ${upErr.message}`, {
      parseMode: null,
    });
    return;
  }

  await sendTelegramMessage(
    chatId,
    `✅ #${idx} ${item.site_name} (${item.site_id ?? '-'})\n` +
      `${fieldInfo.label} diupdate:\n${value}`,
    { parseMode: null },
  );
}

// ─── WIB timezone helpers ─────────────────────────────────────────────────────

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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function wibDMY(): string {
  const { date, month, year } = getWIBParts(0);
  return `${pad2(date)}/${pad2(month + 1)}/${year}`;
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

// ─── S-Curve actual-online detection ─────────────────────────────────────────

/** Parse "DD/M/YY", "DD/MM/YYYY", atau "YYYY-MM-DD" ke ISO "YYYY-MM-DD". */
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

/**
 * Scan tt_records terkini, update target di baseline S-Curve aktif yang sudah online.
 * Dipanggil setelah sync dari Google Sheet / snapshot harian.
 *
 * Duplikasi logic dari src/lib/noc/scurveQueries.ts (tidak bisa di-share karena
 * frontend pakai supabase client browser, server-side pakai supabaseAdmin).
 */
async function updateBaselineActualsServer(): Promise<number> {
  // 1. Baseline aktif
  const { data: baseline } = await supabaseAdmin
    .from('s_curve_baselines')
    .select('id')
    .eq('status', 'active')
    .maybeSingle();

  if (!baseline) return 0;

  // 2. Target yang belum online
  const { data: targets } = await supabaseAdmin
    .from('s_curve_targets')
    .select('id, ticket_id')
    .eq('baseline_id', (baseline as { id: string }).id)
    .eq('is_online', false);

  if (!targets || targets.length === 0) return 0;

  // 3. tt_records terkini (minimal field)
  const { data: currentRecords } = await supabaseAdmin
    .from('tt_records')
    .select('ticket_id, status, actual_online');

  const recordMap = new Map<string, { status: string; actual_online: string | null }>();
  for (const r of (currentRecords as Array<{ ticket_id: string; status: string; actual_online: string | null }>) ?? []) {
    recordMap.set(r.ticket_id, { status: r.status, actual_online: r.actual_online });
  }

  // 4. Tentukan target yang baru online
  const now = new Date().toISOString();
  const todayWIB = getWIBDate();
  const updates: Array<{ id: string; actual_online: string }> = [];

  for (const target of targets as Array<{ id: string; ticket_id: string }>) {
    const record = recordMap.get(target.ticket_id);
    let actualOnline: string | null = null;

    if (!record) {
      // Opsi B: ticket hilang dari sheet
      actualOnline = todayWIB;
    } else if (
      record.status === 'CLOSED' &&
      record.actual_online &&
      record.actual_online.trim() !== '' &&
      record.actual_online.trim() !== '-'
    ) {
      // Opsi A: actual_online terisi di sheet
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

async function syncFromGoogleSheet(): Promise<{ inserted: number; updated: number; deleted: number }> {
  if (!NOC_SHEETS_URL) throw new Error('VITE_NOC_SHEETS_URL tidak dikonfigurasi');

  const resp = await fetch(NOC_SHEETS_URL);
  if (!resp.ok) throw new Error(`Gagal fetch sheet: ${resp.status}`);

  const rows: SheetRow[] = await resp.json();
  if (!rows.length) return { inserted: 0, updated: 0, deleted: 0 };

  const records = rows.map(mapSheetRowToRecord).filter((r) => r.ticket_id);
  if (!records.length) return { inserted: 0, updated: 0, deleted: 0 };

  const incomingTicketIds = new Set(records.map((r) => r.ticket_id));

  // Fetch SEMUA ticket di DB — perlu untuk tahu mana yang harus di-delete
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('tt_records')
    .select('ticket_id, is_manually_edited, target_online_edited, reschedule_note');

  if (fetchError) throw fetchError;

  const existingMap = new Map<string, ExistingEntry>();
  const ticketIdsToDelete: string[] = [];

  for (const e of (existing ?? []) as any[]) {
    const tid = e.ticket_id as string;
    if (incomingTicketIds.has(tid)) {
      existingMap.set(tid, {
        is_manually_edited: e.is_manually_edited as boolean,
        target_online_edited: e.target_online_edited as string | null,
        reschedule_note: e.reschedule_note as string | null,
      });
    } else {
      ticketIdsToDelete.push(tid);
    }
  }

  // DELETE ticket yang ada di DB tapi sudah tidak ada di Google Sheet
  let deleted = 0;
  if (ticketIdsToDelete.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from('tt_records')
      .delete()
      .in('ticket_id', ticketIdsToDelete);
    if (deleteError) {
      console.error('[syncFromGoogleSheet] Delete error:', deleteError);
    } else {
      deleted = ticketIdsToDelete.length;
    }
  }

  const uploadDate = wibDMY();
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
          ticket_id: r.ticket_id,
          site_id: r.site_id,
          site_name: r.site_name,
          provinsi: r.provinsi,
          kabupaten: r.kabupaten,
          date_start: r.date_start,
          upload_date: toISODate(uploadDate),

          status: r.status,
          down_time: r.down_time,
          target_online_original: r.target_online_original,
          actual_online: r.actual_online,
          prob_class: r.prob_class,
          detail_prob: r.detail_prob,
          teknis_nt: r.teknis_nt,
          tiket_internal: r.tiket_internal,

          target_online_edited: r.target_online_original,
          is_manually_edited: false,
        })),
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  if (toUpdateFull.length > 0) {
    writeOps.push(
      supabaseAdmin.from('tt_records').upsert(
        toUpdateFull.map((r) => ({
          ticket_id: r.ticket_id,
          site_id: r.site_id,
          site_name: r.site_name,
          provinsi: r.provinsi,
          kabupaten: r.kabupaten,
          date_start: r.date_start,
          upload_date: toISODate(uploadDate),

          status: r.status,
          down_time: r.down_time,
          target_online_original: r.target_online_original,
          actual_online: r.actual_online,
          prob_class: r.prob_class,
          detail_prob: r.detail_prob,
          teknis_nt: r.teknis_nt,
          tiket_internal: r.tiket_internal,

          target_online_edited: r.target_online_original,
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
          ticket_id: r.ticket_id,
          site_id: r.site_id,
          site_name: r.site_name,
          provinsi: r.provinsi,
          kabupaten: r.kabupaten,
          date_start: r.date_start,
          upload_date: toISODate(uploadDate),

          // 8 field NON-PROTECTED — selalu update dari Google Sheet
          status: r.status,
          down_time: r.down_time,
          target_online_original: r.target_online_original,
          actual_online: r.actual_online,
          prob_class: r.prob_class,
          detail_prob: r.detail_prob,
          teknis_nt: r.teknis_nt,
          tiket_internal: r.tiket_internal,

          // 3 field PROTECTED — preserve dari existing
          target_online_edited: ex.target_online_edited,
          is_manually_edited: true,
          reschedule_note: ex.reschedule_note,
        })),
        { onConflict: 'ticket_id' },
      ).then(({ error }) => { if (error) throw error; }),
    );
  }

  await Promise.all(writeOps);

  // Update S-Curve baseline actuals (best-effort — tidak blokir sync kalau error)
  try {
    const n = await updateBaselineActualsServer();
    if (n > 0) console.log(`[syncFromGoogleSheet] S-Curve: ${n} target mark online`);
  } catch (err) {
    console.error('[syncFromGoogleSheet] updateBaselineActualsServer error:', err);
  }

  return {
    inserted: toInsert.length,
    updated: toUpdateFull.length + toUpdatePartial.length,
    deleted,
  };
}

async function syncAndCapture(chatId: string, url: string): Promise<void> {
  await sendTelegramMessage(chatId, '⏳ Syncing data dari Google Sheet...');
  let counts: { inserted: number; updated: number; deleted: number } | null = null;
  try {
    counts = await syncFromGoogleSheet();
  } catch (err: any) {
    console.error('[syncAndCapture] sync error:', err);
    await sendTelegramMessage(chatId, `⚠️ Sync gagal: ${err.message}. Melanjutkan dengan data lama...`);
  }
  const statusLine = counts
    ? `📡 Data diupdate:\n+${counts.inserted} insert, ${counts.updated} update, -${counts.deleted} delete\n\nGenerating capture...`
    : '📡 Data diupdate. Generating capture...';
  await sendTelegramMessage(chatId, statusLine);
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

  const today = wibDMY();
  const todayKey = today;

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

async function generateOverdueText({
  minAging = 0,
  showClosed = false,
}: {
  minAging?: number;
  showClosed?: boolean;
} = {}): Promise<string[]> {
  let query = supabaseAdmin
    .from('tt_records')
    .select('ticket_id, site_id, site_name, provinsi, kabupaten, down_time, status')
    .order('down_time', { ascending: false });

  if (minAging > 0) {
    query = query.gte('down_time', minAging);
  }

  const [recordsRes, poRes] = await Promise.all([
    query,
    supabaseAdmin.from('po_list').select('name, kabupaten_coverage, provinsi_coverage, status'),
  ]);

  if (recordsRes.error || !recordsRes.data) return ['❌ Gagal mengambil data overdue.'];

  const records = recordsRes.data;
  const poList: POEntry[] = (poRes.data ?? []) as POEntry[];
  const SEP = '=========================';

  if (!records.length) {
    return [
      minAging > 0
        ? `✅ Tidak ada TT overdue ≥${minAging} hari.`
        : '✅ Tidak ada TT open saat ini.',
    ];
  }

  const bulanNames = [
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
  ];
  const wib = getWIBParts(0);
  const tanggalLong = `${wib.date} ${bulanNames[wib.month]} ${wib.year}`;

  const header = minAging > 0
    ? `Berikut Update/Prioritas, Aging > ${minAging} Hari, tanggal ${tanggalLong}:`
    : `Berikut Update/Prioritas, tanggal ${tanggalLong}:`;

  let text = `${header}\n\n`;
  let currentAging = -1;
  let counter = 1;

  for (const record of records) {
    if (record.down_time !== currentAging) {
      currentAging = record.down_time;
      text += `Aging ${currentAging} Hari\n${SEP}\n`;
    }
    const statusIcon = record.status === 'CLOSED' ? '✅' : '❌';
    const poName = findPOName(record.provinsi ?? '', record.kabupaten ?? '', poList);
    text += `${counter}. ${record.site_id} - ${record.site_name} ${statusIcon}\n`;
    text += `> *PO*: ${poName} | ${record.provinsi ?? '-'}\n\n`;
    counter++;
  }

  text += `Total: ${records.length} TT`;

  return splitIntoChunks(text, /\n(?=Aging \d+ Hari\n=+)/);
}

async function generateOverdueSummary(): Promise<string> {
  const [recordsRes, poRes] = await Promise.all([
    supabaseAdmin
      .from('tt_records')
      .select('ticket_id, site_name, provinsi, kabupaten, down_time')
      .eq('status', 'OPEN')
      .gte('down_time', 8)
      .order('down_time', { ascending: false }),
    supabaseAdmin.from('po_list').select('name, kabupaten_coverage, provinsi_coverage, status'),
  ]);

  if (recordsRes.error || !recordsRes.data?.length) return '✅ Tidak ada TT overdue saat ini.';

  const records = recordsRes.data;
  const poList: POEntry[] = (poRes.data ?? []) as POEntry[];
  const today = wibDMY();

  const poCount: Record<string, number> = {};
  for (const r of records) {
    const name = findPOName(r.provinsi ?? '', r.kabupaten ?? '', poList);
    poCount[name] = (poCount[name] || 0) + 1;
  }
  const topPO = Object.entries(poCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const provCount: Record<string, number> = {};
  for (const r of records) {
    const p = r.provinsi ?? '-';
    provCount[p] = (provCount[p] || 0) + 1;
  }
  const topProv = Object.entries(provCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const agings = records.map((r: any) => r.down_time);
  const maxAging = Math.max(...agings);
  const avgAging = Math.round(agings.reduce((a: number, b: number) => a + b, 0) / agings.length);
  const oldest = records[0];
  const oldestPO = findPOName(oldest.provinsi ?? '', oldest.kabupaten ?? '', poList);
  const overdue30 = records.filter((r: any) => r.down_time >= 30).length;

  return `📊 *Overdue Summary — ${today}*

⚠️ *Total Overdue ≥8h:* ${records.length} TT
🚨 *Overdue ≥30h:* ${overdue30} TT

👤 *Top PO beban terberat:*
${topPO.map(([name, count], i) => `  ${i + 1}. ${name} — ${count} TT`).join('\n')}

🗺 *Provinsi terdampak:*
${topProv.map(([prov, count], i) => `  ${i + 1}. ${prov} — ${count} TT`).join('\n')}

📅 *Aging tertua:* ${maxAging} hari
   ${oldest.site_name} (PO: ${oldestPO})
📈 *Rata-rata aging:* ${avgAging} hari`;
}

async function generateOverduePrediksi(): Promise<string[]> {
  const [recordsRes, poRes] = await Promise.all([
    supabaseAdmin
      .from('tt_records')
      .select('ticket_id, site_name, provinsi, kabupaten, down_time')
      .eq('status', 'OPEN')
      .in('down_time', [6, 7])
      .order('down_time', { ascending: false }),
    supabaseAdmin.from('po_list').select('name, kabupaten_coverage, provinsi_coverage, status'),
  ]);

  const records = recordsRes.data ?? [];
  const poList: POEntry[] = (poRes.data ?? []) as POEntry[];
  const today = wibDMY();

  if (!records.length) {
    return [`✅ Tidak ada TT yang mendekati overdue (aging 6-7 hari) — ${today}`];
  }

  const SEP = '=========================';
  let text = `🔮 *Prediksi Overdue — ${today}*\n_Site berikut akan overdue dalam 1-2 hari:_\n\n`;
  let currentAging = -1;
  let counter = 1;

  for (const record of records) {
    if (record.down_time !== currentAging) {
      currentAging = record.down_time;
      text += `Aging ${currentAging} Hari\n${SEP}\n`;
    }
    const poName = findPOName(record.provinsi ?? '', record.kabupaten ?? '', poList);
    text += `${counter}. ${record.ticket_id} - ${record.site_name} ❌\n`;
    text += `> *PO*: ${poName} | ${record.provinsi ?? '-'}\n\n`;
    counter++;
  }

  text += `⚡ Total: ${records.length} TT akan segera overdue`;
  return splitIntoChunks(text, /\n(?=Aging \d+ Hari\n=+)/);
}

/** Parse "DD/MM/YY" atau "DD/MM/YYYY" → Date. Null jika tidak valid. */
function parseDMY(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const year = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
  const date = new Date(year, parseInt(m, 10) - 1, parseInt(d, 10));
  return isNaN(date.getTime()) ? null : date;
}

async function generateTargetNarrative(fromDate: Date, toDate: Date): Promise<string[]> {
  const [recordsRes, poRes] = await Promise.all([
    supabaseAdmin
      .from('tt_records')
      .select('ticket_id, site_name, provinsi, kabupaten, target_online_original, status'),
    supabaseAdmin.from('po_list').select('name, kabupaten_coverage, provinsi_coverage, status'),
  ]);

  const allRecords = recordsRes.data ?? [];
  const poList: POEntry[] = (poRes.data ?? []) as POEntry[];

  const fromStart = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
  const toEnd = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate(), 23, 59, 59);

  const inRange = allRecords.filter((r: any) => {
    const d = parseDMY(r.target_online_original ?? '');
    if (!d) return false;
    const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return t >= fromStart && t <= toEnd;
  });

  const poNames = new Set<string>();
  for (const r of inRange) {
    const name = findPOName(r.provinsi ?? '', r.kabupaten ?? '', poList);
    if (name !== '-') poNames.add(name);
  }

  const fmtDMY2 = (d: Date) =>
    `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;

  const isSingleDay =
    fromDate.getUTCFullYear() === toDate.getUTCFullYear() &&
    fromDate.getUTCMonth() === toDate.getUTCMonth() &&
    fromDate.getUTCDate() === toDate.getUTCDate();
  const dateLabel = isSingleDay
    ? fmtDMY2(fromDate)
    : `${fmtDMY2(fromDate)} - ${fmtDMY2(toDate)}`;

  const poListStr = [...poNames].sort().join(', ') || '-';

  const narrative = `Dear all, berikut update progress penyelesaian tiket target online hari ini (${dateLabel}) dengan target online yang sudah disesuaikan dengan WM terakhir.\nTerimakasih 🙏\n\nPO: ${poListStr}`;
  return splitIntoChunks(narrative);
}

async function generateSCurveSummary(
  area: number | null,
  baselineType: 'active' | 'last' = 'active',
): Promise<string> {
  let baselineData: { id: string; label: string; baseline_date: string } | null = null;

  if (baselineType === 'active') {
    const { data } = await supabaseAdmin
      .from('s_curve_baselines')
      .select('id, label, baseline_date')
      .eq('status', 'active')
      .maybeSingle();
    baselineData = data as typeof baselineData;
  } else {
    const { data } = await supabaseAdmin
      .from('s_curve_baselines')
      .select('id, label, baseline_date')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    baselineData = data as typeof baselineData;
  }

  if (!baselineData) {
    return `❌ Tidak ada baseline ${baselineType === 'active' ? 'aktif' : 'terakhir'}.`;
  }

  const baseline = baselineData;

  let targetQuery = supabaseAdmin
    .from('s_curve_targets')
    .select('is_online, target_online, area')
    .eq('baseline_id', baseline.id);

  if (area !== null) {
    targetQuery = targetQuery.eq('area', area);
  }

  const { data: targetsData } = await targetQuery;
  const targets = (targetsData ?? []) as Array<{
    is_online: boolean;
    target_online: string | null;
    area: number | null;
  }>;

  const totalTarget = targets.length;
  const onlineCount = targets.filter((t) => t.is_online).length;
  const percent = totalTarget > 0 ? Math.round((onlineCount / totalTarget) * 100) : 0;

  // Hari ke-berapa (WIB)
  const todayISO = getWIBDate(0);
  const parseIsoToUtcMs = (iso: string) =>
    Date.UTC(
      parseInt(iso.slice(0, 4), 10),
      parseInt(iso.slice(5, 7), 10) - 1,
      parseInt(iso.slice(8, 10), 10),
    );
  const dayNumber =
    Math.floor(
      (parseIsoToUtcMs(todayISO) - parseIsoToUtcMs(baseline.baseline_date)) /
        (1000 * 60 * 60 * 24),
    ) + 1;

  // Planned sampai hari ini — string compare aman karena format ISO sama
  const plannedToday = targets.filter(
    (t) => t.target_online && t.target_online <= todayISO,
  ).length;

  const gap = onlineCount - plannedToday;
  const gapLabel =
    gap >= 0
      ? `+${gap} TT (ahead schedule! 🚀)`
      : `${gap} TT (behind schedule ⚠️)`;

  const areaLabel = area === null ? 'Global' : `Area ${area}`;

  const bulanNames = [
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
  ];
  const wib = getWIBParts(0);
  const tanggalLong = `${wib.date} ${bulanNames[wib.month]} ${wib.year}`;

  return `📊 *S-Curve ${areaLabel} — ${baseline.label}*
Hari ke-${dayNumber} dari 7 (${tanggalLong})

🎯 Target: ${totalTarget} TT
✅ Actual Online: ${onlineCount} TT (${percent}%)
📌 Planned hari ini: ${plannedToday} TT
📈 Gap: ${gapLabel}`;
}

async function generateRekapPagi(): Promise<string> {
  const yesterdayStr = getWIBDate(-1);

  const { data: snapshot } = await supabaseAdmin
    .from('daily_snapshots')
    .select('*')
    .eq('snapshot_date', yesterdayStr)
    .maybeSingle();

  const { data: records } = await supabaseAdmin
    .from('tt_records')
    .select('down_time');

  const allRecords = records ?? [];
  const totalTT = allRecords.length;
  const newOpenToday = allRecords.filter((r: any) => r.down_time === 1).length;
  const openLt30 = allRecords.filter((r: any) => r.down_time < 30).length;
  const openGt30 = allRecords.filter((r: any) => r.down_time >= 30 && r.down_time < 60).length;
  const openGt60 = allRecords.filter((r: any) => r.down_time >= 60).length;

  const { data: templateData } = await supabaseAdmin
    .from('bot_templates')
    .select('template_text')
    .eq('template_key', 'rekap_pagi')
    .maybeSingle();

  const template = templateData?.template_text || '';

  const wib = getWIBParts(0);
  const hariNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const hari = hariNames[wib.day];
  const tanggal = `${wib.date} ${bulanNames[wib.month]} ${wib.year}`;

  const closedKemarin = snapshot?.total_closed ?? 0;

  return template
    .replace('{HARI}', hari)
    .replace('{TANGGAL}', tanggal)
    .replace('{TOTAL_TT}', totalTT.toString())
    .replace('{OPEN_LT30}', openLt30.toString())
    .replace('{OPEN_GT30}', openGt30.toString())
    .replace('{OPEN_GT60}', openGt60.toString())
    .replace('{NEW_OPEN}', newOpenToday.toString())
    .replace('{CLOSED_KEMARIN}', closedKemarin.toString());
}

// ─── Command router ───────────────────────────────────────────────────────────

const COMMAND_LIST = `📋 *NOC Bot — Command List*

*📸 Capture*
/target — Recap target online hari ini
/target 1 — Hari ini + besok
/target 2 s/d 5 — Max 5 hari ke depan

*📊 Overdue*
/overdue — Semua TT open
/overdue [n] — Aging ≥ n hari (contoh: /overdue 8)
/overdue progress — Open & closed dengan status
/overdue summary — Statistik ringkas
/overdue prediksi — Site hampir overdue (6-7 hari)

*📈 Summary*
/summary — KPI ringkasan

*📢 Rekap*
/rekap-pagi — Rekap harian pagi (summary kemarin + hari ini)

*📈 S-Curve*
/scurve — Report lengkap (global + 3 area)
/scurve 1/2/3 — Per area tertentu
/scurve last — Final report baseline terakhir (Selasa malam)

*📋 RTGS Mahaga*
/rtgs — Laporan TT open: Internal (≥ 7 hari, full) + External (≥ 10 hari, ringkas)
/rtgs-list [n] — Daftar TT bernomor untuk edit (≥ n hari, default 7)
/rtgs-edit-problem-N <text> — Edit Problem Hasil Analisa untuk #N
/rtgs-edit-action-N <text> — Edit Action untuk #N
/rtgs-edit-kendala-N <text> — Edit Kendala untuk #N
/rtgs-edit-target-N <text> — Edit Plan Target Online untuk #N

*🏠 UBIQU DIRUMA*
/diruma — PNG top-10 NON-HTB (aging terlama) + Excel HTB (butuh spare HTB-A/HTB-B)

/help — Tampilkan daftar ini`;

async function processCommand(text: string, chatId: string) {
  const parts = text.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const arg = (parts[1] ?? '').toLowerCase();

  // Dynamic command: /rtgs-edit-<field>-<idx> <body text>
  // Body teks bisa multi-word atau multiline (ditulis setelah command).
  const editMatch = command.match(
    /^\/rtgs-edit-(problem|action|kendala|target)-(\d+)$/,
  );
  if (editMatch) {
    const fieldAlias = editMatch[1] as RtgsFieldAlias;
    const idx = parseInt(editMatch[2], 10);
    const valueStart = text.indexOf(parts[0]) + parts[0].length;
    const value = text.slice(valueStart).trim();
    await handleRtgsEdit(chatId, fieldAlias, idx, value);
    return;
  }

  switch (command) {

    case '/rtgs-list': {
      let minAging = 7;
      if (arg) {
        const n = parseInt(arg, 10);
        if (isNaN(n) || n < 1) {
          await sendTelegramMessage(
            chatId,
            '⚠️ Argumen tidak valid. Gunakan /rtgs-list, atau /rtgs-list <angka> (contoh: /rtgs-list 5)',
          );
          break;
        }
        minAging = n;
      }
      await handleRtgsList(chatId, minAging);
      break;
    }

    case '/target': {
      const days = Math.min(parseInt(arg) || 0, 5);
      await sendTelegramMessage(chatId, '⏳ Syncing data dari Google Sheet...');
      try {
        await syncFromGoogleSheet();
      } catch (err: any) {
        await sendTelegramMessage(chatId, `⚠️ Sync gagal: ${err.message}. Melanjutkan dengan data lama...`);
      }
      await sendTelegramMessage(chatId, '📡 Data diupdate. Generating capture...');

      const wibToday = getWIBParts(0);
      const wibTo = getWIBParts(days);
      const today = new Date(Date.UTC(wibToday.year, wibToday.month, wibToday.date));
      const toDate = new Date(Date.UTC(wibTo.year, wibTo.month, wibTo.date));
      const from = getWIBDate(0);
      const to = getWIBDate(days);
      const captureUrl = `${APP_URL}/noc/capture?type=multiday&from=${from}&to=${to}`;

      await sendCaptureToTelegram(chatId, captureUrl);

      const narrativeChunks = await generateTargetNarrative(today, toDate);
      await sendTelegramChunks(chatId, narrativeChunks);
      break;
    }

    case '/targettoday':
      await sendTelegramMessage(chatId, 'Command ini sudah diganti. Gunakan /target');
      break;
    case '/closedtoday':
      await syncAndCapture(chatId, `${APP_URL}/noc/capture?type=closed`);
      break;

    case '/overdue': {
      const num = parseInt(arg, 10);
      const isNumeric = !isNaN(num) && num > 0;
      const validKeywords = ['', 'progress', 'summary', 'prediksi'];

      if (!isNumeric && !validKeywords.includes(arg)) {
        await sendTelegramMessage(
          chatId,
          '⚠️ Argumen tidak valid. Gunakan /overdue, /overdue [angka], /overdue progress, /overdue summary, atau /overdue prediksi',
        );
        break;
      }

      await sendTelegramMessage(chatId, '⏳ Syncing data dari Google Sheet...');
      try {
        await syncFromGoogleSheet();
      } catch (err: any) {
        await sendTelegramMessage(chatId, `⚠️ Sync gagal: ${err.message}. Melanjutkan dengan data lama...`);
      }

      let chunks: string[] = [];
      if (isNumeric) {
        chunks = await generateOverdueText({ minAging: num });
      } else {
        switch (arg) {
          case '':
            chunks = await generateOverdueText({ minAging: 0 });
            break;
          case 'progress':
            chunks = await generateOverdueText({ showClosed: true });
            break;
          case 'summary':
            chunks = [await generateOverdueSummary()];
            break;
          case 'prediksi':
            chunks = await generateOverduePrediksi();
            break;
        }
      }
      await sendTelegramChunks(chatId, chunks);
      break;
    }

    case '/summary': {
      const summaryText = await generateSummaryText();
      await sendTelegramMessage(chatId, summaryText);
      break;
    }

    case '/rekap-pagi': {
      const text = await generateRekapPagi();
      await sendTelegramMessage(chatId, text);
      break;
    }

    case '/scurve': {
      if (arg === '1' || arg === '2' || arg === '3') {
        await sendTelegramMessage(chatId, `⏳ Generating S-Curve Area ${arg}...`);
        const captureUrl = `${APP_URL}/noc/scurve-capture?area=${arg}&baseline=active`;
        await sendCaptureToTelegram(chatId, captureUrl, {
          filename: `scurve-area-${arg}.png`,
          waitSelector: '#scurve-capture-ready',
        });
        const summary = await generateSCurveSummary(parseInt(arg, 10));
        await sendTelegramMessage(chatId, summary);
      } else if (arg === 'last' || arg === '') {
        const summaryMode: 'active' | 'last' = arg === 'last' ? 'last' : 'active';
        const baselineKey = summaryMode;
        const fileSuffix = arg === 'last' ? '-final' : '';

        await sendTelegramMessage(
          chatId,
          arg === 'last'
            ? '⏳ Generating S-Curve final report (2 images)...'
            : '⏳ Generating S-Curve report (2 images)...',
        );

        // Image 1: Global single — chart besar + breakdown table harian
        const url1 = `${APP_URL}/noc/scurve-capture?area=global&baseline=${baselineKey}`;
        await sendCaptureToTelegram(chatId, url1, {
          filename: `scurve-global${fileSuffix}.png`,
          waitSelector: '#scurve-capture-ready',
        });
        const globalSummary = await generateSCurveSummary(null, summaryMode);
        await sendTelegramMessage(chatId, globalSummary);

        // Image 2: 2x2 grid — Global + Area 1 + Area 2 + Area 3 dalam satu gambar
        const url2 = `${APP_URL}/noc/scurve-capture-grid?baseline=${baselineKey}`;
        await sendCaptureToTelegram(chatId, url2, {
          filename: `scurve-grid${fileSuffix}.png`,
          waitSelector: '#scurve-capture-ready',
        });
        const summary1 = await generateSCurveSummary(1, summaryMode);
        const summary2 = await generateSCurveSummary(2, summaryMode);
        const summary3 = await generateSCurveSummary(3, summaryMode);
        await sendTelegramMessage(chatId, `${summary1}\n\n${summary2}\n\n${summary3}`);
      } else {
        await sendTelegramMessage(
          chatId,
          '⚠️ Argumen tidak valid. Gunakan /scurve, /scurve 1/2/3, atau /scurve last',
        );
      }
      break;
    }

    case '/rtgs': {
      await sendTelegramMessage(chatId, '⏳ Syncing data dari Google Sheet...');
      try {
        await syncFromGoogleSheet();
      } catch (err: any) {
        await sendTelegramMessage(
          chatId,
          `⚠️ Sync gagal: ${err.message}. Melanjutkan dengan data lama...`,
        );
      }
      await sendTelegramMessage(
        chatId,
        '📸 Generating RTGS Mahaga report (2 images)...',
      );

      const wib = getWIBParts(0);
      const yyyy = wib.year;
      const mm = String(wib.month + 1).padStart(2, '0');
      const dd = String(wib.date).padStart(2, '0');
      const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mi = String(now.getUTCMinutes()).padStart(2, '0');
      const stamp = `${yyyy}-${mm}-${dd}-${hh}${mi}`;

      // Image 1: Internal — semua kolom, umur ≥ 7 hari
      await sendCaptureToTelegram(chatId, `${APP_URL}/noc/rtgs-capture`, {
        filename: `rtgs-mahaga-internal-${stamp}.png`,
        waitSelector: '#rtgs-capture-ready',
      });

      // Image 2: External — 7 kolom (Action / Plan Target Online / Update Target Online disembunyikan), umur ≥ 10 hari
      await sendCaptureToTelegram(
        chatId,
        `${APP_URL}/noc/rtgs-capture?variant=external`,
        {
          filename: `rtgs-mahaga-external-${stamp}.png`,
          waitSelector: '#rtgs-capture-ready',
        },
      );
      break;
    }

    case '/diruma': {
      await sendTelegramMessage(
        chatId,
        '⏳ Menyiapkan rekap UBIQU DIRUMA (PNG + Excel)...',
      );

      const w = getWIBParts(0);
      const yyyy = w.year;
      const mm = String(w.month + 1).padStart(2, '0');
      const dd = String(w.date).padStart(2, '0');
      const wnow = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const hh = String(wnow.getUTCHours()).padStart(2, '0');
      const mi = String(wnow.getUTCMinutes()).padStart(2, '0');
      const dateLabel = `${dd}/${mm}/${yyyy}`;
      const timeLabel = `${hh}:${mi}`;
      const stamp = `${yyyy}-${mm}-${dd}-${hh}${mi}`;

      // 1) PNG top-10 NON-HTB (aging terlama) + narasi.
      await sendCaptureToTelegram(
        chatId,
        `${APP_URL}/noc/ubiqu-diruma-capture`,
        {
          filename: `ubiqu-diruma-nonhtb-${stamp}.png`,
          waitSelector: '#ubiqu-capture-ready',
          caption:
            'Berikut rekap list TT Ubiqu Diruma untuk 10 lokasi dengan usia tiket terlama.',
        },
      );

      // 2) Excel HTB (butuh spare HTB-A/HTB-B) + narasi.
      try {
        const { buffer, htbCount } = await buildDirumaHtbExcel(
          dateLabel,
          timeLabel,
        );
        if (htbCount === 0) {
          await sendTelegramMessage(
            chatId,
            'ℹ️ Tidak ada tiket HTB saat ini — Excel tidak dikirim.',
          );
        } else {
          await sendTelegramDocument(
            chatId,
            buffer,
            `diruma_offline_HTB_${dd}${mm}${yyyy}.xlsx`,
            'Berikut data tiket ubiqu diruma yang membutuhkan spare HTB-A dan HTB-B',
          );
        }
      } catch (err: any) {
        await sendTelegramMessage(
          chatId,
          `❌ Gagal generate Excel HTB: ${err.message}`,
        );
      }

      // 3) Penutup.
      await sendTelegramMessage(chatId, 'Terima kasih', { parseMode: null });
      break;
    }

    case '/help':
      await sendTelegramMessage(chatId, COMMAND_LIST);
      break;

    default:
      if (text.startsWith('/')) {
        await sendTelegramMessage(chatId, COMMAND_LIST);
      }
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

  await processCommand(text, allowedChatId!);

  return res.status(200).json({ ok: true });
}
