import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTicketFile } from './parseTicket';
import { parseDatasheetFile } from './parseDatasheet';
import { transformTickets, classifyHTB } from './transform';
import { resolvePO } from './poMatcher';
import { extractTT } from './htbExcel';

/** Bungkus buffer jadi objek File-like (cukup punya arrayBuffer()). */
function fileFrom(name: string): File {
  const buf = readFileSync(join(process.cwd(), 'sample_data', name));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return { arrayBuffer: async () => ab } as unknown as File;
}

describe('UBIQU DIRUMA pipeline (sample data 04-06-2026)', () => {
  it('parse + transform menghasilkan angka tervalidasi', async () => {
    const tickets = await parseTicketFile(
      fileFrom('ticket_list_f_list_ticket_all - 04-06-2026.xls'),
    );
    const ref = await parseDatasheetFile(fileFrom('example sheet.xlsx'));

    // Datasheet ter-parse
    expect(ref.product.length).toBeGreaterThan(300);
    expect(ref.po.length).toBeGreaterThan(20);

    const result = transformTickets(tickets, ref);

    expect(result.totalTickets).toBeGreaterThan(400);
    expect(result.rows.length).toBe(123); // UBIQU DIRUMA
    expect(result.htbCount).toBe(52);
    expect(result.nonHtbCount).toBe(71);

    // Sort dur_days desc → top umur 78
    expect(result.rows[0].dur_days).toBe(78);
    // Top row = HTB Converter di Sumsel, PO ketemu
    expect(result.rows[0].htb_label).toBe('HTB');
    expect(result.rows[0].po_name).not.toBe('');

    // Kolom baru ter-parse: No Tiket lengkap (punya TT) + Site ID non-kosong
    expect(result.rows[0].ticket_number).toMatch(/TT\s*\d+/);
    expect(result.rows[0].site_id).not.toBe('');
  });

  it('classifyHTB: Converter/HTB → HTB, lainnya → NON HTB', () => {
    const empty = new Set<string>();
    expect(classifyHTB('HTB Converter', 'X', empty)).toBe('HTB');
    expect(classifyHTB('Media Converter FO', 'X', empty)).toBe('HTB');
    expect(classifyHTB('HTB Converter/HTB-A', 'X', empty)).toBe('HTB');
    expect(classifyHTB('Ubiqu Hardware - Kabel FO', 'X', empty)).toBe('NON HTB');
    expect(classifyHTB('Refer to Ticket Cluster Prob', 'X', empty)).toBe(
      'NON HTB',
    );
  });

  it('extractTT: ambil token TT dari No Tiket lengkap', () => {
    expect(extractTT('TIC-PSN/NOM/2606/CKRG-193090 / TT 1038582')).toBe(
      'TT 1038582',
    );
    expect(extractTT('TT 997328')).toBe('TT 997328');
    expect(extractTT('tanpa nomor')).toBe('');
  });

  it('resolvePO: grup provinsi + JABAR per-kabupaten', () => {
    const po = [
      { provins: 'SULAWESI', kabupaten: 'All', nama_po: 'Dicky' },
      { provins: 'SULAWESI UTARA', kabupaten: 'All', nama_po: 'Dicky' },
      { provins: 'JAWA BARAT', kabupaten: 'KAB. CIANJUR', nama_po: 'Angga' },
      { provins: 'JAWA BARAT', kabupaten: 'KAB. GARUT', nama_po: 'Anjar' },
    ];
    // Grup prefix
    expect(resolvePO('SULAWESI SELATAN', '', '', po)).toBe('Dicky');
    // Spesifik menang atas grup
    expect(resolvePO('SULAWESI UTARA', '', '', po)).toBe('Dicky');
    // JABAR per kabupaten
    expect(resolvePO('JAWA BARAT', 'CIANJUR', '', po)).toBe('Angga');
    expect(resolvePO('JAWA BARAT', 'GARUT', '', po)).toBe('Anjar');
    // JABAR di luar daftar → tak ketemu
    expect(resolvePO('JAWA BARAT', 'BANDUNG', '', po)).toBe('');
  });
});
