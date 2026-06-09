// Tipe-tipe inti untuk fitur UBIQU DIRUMA (/noc/ubiqu-diruma).
// Lihat plan: iya-nomor-tiket-aku-partitioned-swing.md.

/** Baris mentah dari file Excel tiket (hanya kolom yang dipakai). */
export interface TicketRaw {
  ticket_id: string;       // "TT 1038696"           (TICKET ID — kunci edit)
  ticket_number: string;   // "TIC-.../ TT 1038696"  (TICKET NUMBER — No Tiket lengkap)
  site_id: string;         // SUBSCRIBER NUMBER       (Site ID)
  site_name: string;
  province: string;
  city: string;
  district: string;
  package_name: string;
  trouble_category: string;
  dur_days: number;
  ticket_status: string;
  ticket_date: string;
  address: string;
}

/** Datasheet referensi hasil parse workbook (3 sheet). */
export interface ParsedDatasheet {
  product: { paket_name: string; product: string }[];
  po: { provins: string; kabupaten: string; nama_po: string }[];
  htbSites: { site_key: string }[];
}

/** Baris dataset terenrich (siap simpan ke ud_dataset). */
export interface DatasetRow {
  ticket_id: string;
  ticket_number: string;
  site_id: string;
  site_name: string;
  province: string;
  city: string;
  district: string;
  package_name: string;
  trouble_category: string;
  dur_days: number;
  ticket_status: string;
  ticket_date: string;
  address: string;
  product: string;
  po_name: string;
  htb_label: 'HTB' | 'NON HTB';
}

/**
 * Override sel manual (1 row per ticket_id).
 * NON-HTB (diisi di web): po, kendala, mrq_number, resi, eta, status_pengiriman.
 * HTB (diisi via Excel roundtrip, satu-satunya yang persist lintas hari): progress_teknisi.
 */
export interface UbiquEdit {
  id: string;
  ticket_id: string;
  po_name_edited: string | null;
  kendala_edited: string | null;
  mrq_number_edited: string | null;
  resi_edited: string | null;
  eta_edited: string | null;
  status_pengiriman_edited: string | null;
  progress_teknisi_edited: string | null;
  is_po_edited: boolean;
  is_kendala_edited: boolean;
  is_mrq_number_edited: boolean;
  is_resi_edited: boolean;
  is_eta_edited: boolean;
  is_status_pengiriman_edited: boolean;
  is_progress_teknisi_edited: boolean;
  created_at: string;
  updated_at: string;
}

export type UbiquField =
  | 'po'
  | 'kendala'
  | 'mrq_number'
  | 'resi'
  | 'eta'
  | 'status_pengiriman'
  | 'progress_teknisi';

/** Hasil transform: dataset + statistik untuk banner/header. */
export interface TransformResult {
  rows: DatasetRow[];      // semua baris lolos filter UBIQU DIRUMA, sorted dur_days desc
  totalTickets: number;    // total baris di file
  unmappedPackages: number; // paket yang tak ketemu di datasheet PRODUCT
  htbCount: number;
  nonHtbCount: number;
}

/** Filter produk yang ditarget halaman ini. */
export const TARGET_PRODUCT = 'UBIQU DIRUMA';

/** Berapa baris teratas (by dur_days) yang masuk capture PNG NON-HTB. */
export const CAPTURE_TOP_N = 10;

/** Prefix nama file Excel HTB yang di-generate. */
export const HTB_FILE_PREFIX = 'diruma_offline_HTB';

/** Header tabel Excel HTB (12 kolom, urutan pasti — sesuai contoh referensi). */
export const HTB_EXCEL_HEADERS = [
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
] as const;

/** Judul (baris atas) file Excel HTB. */
export function htbExcelTitle(dateLabel: string, timeLabel: string): string {
  return `Tiket Ubiqu Diruma yang membutuhkan spare HTB-A dan HTB-B, Update : ${dateLabel}, Jam ${timeLabel} WIB`;
}

/** Judul (merah) capture PNG NON-HTB. */
export function nonHtbCaptureTitle(dateLabel: string, timeLabel: string): string {
  return `Tiket Ubiqu Diruma 10 lokasi teratas aging terlama, update : ${dateLabel}, Jam ${timeLabel} WIB`;
}
