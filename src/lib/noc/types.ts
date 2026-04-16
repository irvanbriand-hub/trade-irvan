export interface PO {
  id: string;
  name: string;
  area: 1 | 2 | 3;
  provinsi_coverage: string[];
  kabupaten_coverage: string[];
  status: 'active' | 'inactive';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface POInsert {
  name: string;
  area: 1 | 2 | 3;
  provinsi_coverage: string[];
  kabupaten_coverage: string[];
  status?: 'active' | 'inactive';
  notes?: string | null;
}

export interface TTRecord {
  tiketInternal: string;
  ticketId: string;
  siteId: string;
  status: 'OPEN' | 'CLOSED' | string;
  siteName: string;
  provinsi: string;
  kabupaten: string;
  layanan: string;
  dateStart: string;
  downTime: number;
  targetOnline: string;
  actualOnline: string;
  probClass: string;
  detailProb: string;
  note: string;
  teknisNT: string;
  // derived
  area: 0 | 1 | 2 | 3;
  po: PO | null;
  closeType: 'noc' | 'om' | 'om-visit' | null;
  isReschedule: boolean;
  isVisit: boolean;
}

export interface NOCSummary {
  totalTT: number;
  totalOpen: number;
  totalClosed: number;
  closeNOC: number;
  closeOM: number;
  closeVisit: number;
  teknis: number;
  nonTeknis: number;
  byArea: Record<number, AreaSummary>;
}

export interface AreaSummary {
  total: number;
  open: number;
  closed: number;
  closeNOC: number;
  closeOM: number;
  closeVisit: number;
}

export type CloseType = 'noc' | 'om' | 'om-visit';

export interface NOCState {
  rawData: TTRecord[];
  uploadDate: string;
  isLoading: boolean;
}

export interface TTRecordDB {
  id: string;
  ticket_id: string;
  site_id: string | null;
  site_name: string;
  provinsi: string | null;
  kabupaten: string | null;
  tiket_internal: string | null;
  status: 'OPEN' | 'CLOSED';
  down_time: number;
  date_start: string | null;
  target_online_original: string | null;
  target_online_edited: string | null;
  reschedule_note: string | null;
  actual_online: string | null;
  prob_class: string | null;
  detail_prob: string | null;
  note_original: string | null;
  teknis_nt: string | null;
  upload_date: string | null;
  is_manually_edited: boolean;
  created_at: string;
  last_updated: string;
}

export interface SiteNote {
  id: string;
  site_id: string;
  site_name: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface MergeResult {
  inserted: number;
  updated: number;
  updatedFull: number;
  updatedProtected: number;
  statusChanged: number;
  unchanged: number;
  totalInDB: number;
}
