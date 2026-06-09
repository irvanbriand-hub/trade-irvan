// Pipeline transform: lookup PRODUCT → filter UBIQU DIRUMA → lookup PO →
// klasifikasi HTB → sort dur_days desc. Murni fungsi (mudah di-test).

import type {
  DatasetRow,
  ParsedDatasheet,
  TicketRaw,
  TransformResult,
} from './types';
import { TARGET_PRODUCT } from './types';
import { resolvePO } from './poMatcher';

function normKey(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * HTB jika trouble category memuat "Converter" / "HTB" ATAU site ada di daftar HTB.
 * Tervalidasi ke data asli: kategori HTB (HTB Converter, Media Converter FO,
 * HTB Media Converter…, HTB Converter/HTB-A) semuanya memuat "Converter"/"HTB";
 * kategori NON-HTB (Ubiqu Hardware - *, Kabel FO, ONT, Refer to…) tidak.
 */
export function classifyHTB(
  troubleCategory: string,
  siteName: string,
  htbSet: Set<string>,
): 'HTB' | 'NON HTB' {
  if (/converter|htb/i.test(troubleCategory)) return 'HTB';
  if (htbSet.size > 0 && htbSet.has(normKey(siteName))) return 'HTB';
  return 'NON HTB';
}

export function transformTickets(
  tickets: TicketRaw[],
  ref: ParsedDatasheet,
): TransformResult {
  // Map paket → product (first match menang; duplikat di datasheet diabaikan).
  const productMap = new Map<string, string>();
  for (const p of ref.product) {
    const k = normKey(p.paket_name);
    if (!productMap.has(k)) productMap.set(k, p.product);
  }

  const htbSet = new Set(ref.htbSites.map((h) => normKey(h.site_key)));

  const unmappedPackages = new Set<string>();
  const rows: DatasetRow[] = [];

  for (const t of tickets) {
    const product = productMap.get(normKey(t.package_name)) ?? '';
    if (!product) unmappedPackages.add(normKey(t.package_name));
    if (product !== TARGET_PRODUCT) continue;

    rows.push({
      ticket_id: t.ticket_id,
      ticket_number: t.ticket_number,
      site_id: t.site_id,
      site_name: t.site_name,
      province: t.province,
      city: t.city,
      district: t.district,
      package_name: t.package_name,
      trouble_category: t.trouble_category,
      dur_days: t.dur_days,
      ticket_status: t.ticket_status,
      ticket_date: t.ticket_date,
      address: t.address,
      product,
      po_name: resolvePO(t.province, t.city, t.district, ref.po),
      htb_label: classifyHTB(t.trouble_category, t.site_name, htbSet),
    });
  }

  rows.sort((a, b) => b.dur_days - a.dur_days);

  return {
    rows,
    totalTickets: tickets.length,
    unmappedPackages: unmappedPackages.size,
    htbCount: rows.filter((r) => r.htb_label === 'HTB').length,
    nonHtbCount: rows.filter((r) => r.htb_label === 'NON HTB').length,
  };
}
