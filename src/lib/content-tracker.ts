// Helpers murni untuk Content Tracker — tanpa side effect, mudah di-test.
import { addHours, addDays, isBefore } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

export type ContentPage = Tables<"content_pages">;
export type ContentSchedule = Tables<"content_schedules">;

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------
export type Platform = "facebook" | "instagram" | "youtube" | "tiktok";

// Akses Content Tracker dibatasi hanya untuk email ini (selain RLS per-user).
export const CONTENT_TRACKER_EMAIL = "irvanbriand@gmail.com";
export function canAccessContentTracker(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase() === CONTENT_TRACKER_EMAIL;
}

export const PLATFORMS: Platform[] = ["facebook", "instagram", "youtube", "tiktok"];

export interface PlatformMeta {
  label: string;
  emoji: string;
  color: string; // default warna page (hex)
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  facebook: { label: "Facebook", emoji: "📘", color: "#1877F2" },
  instagram: { label: "Instagram", emoji: "📸", color: "#E4405F" },
  youtube: { label: "YouTube", emoji: "▶️", color: "#FF0000" },
  tiktok: { label: "TikTok", emoji: "🎵", color: "#000000" },
};

export function platformMeta(platform: string): PlatformMeta {
  return PLATFORM_META[platform as Platform] ?? { label: platform, emoji: "🌐", color: "#6B7280" };
}

// ---------------------------------------------------------------------------
// Tipe konten (preset, dipilih per channel)
// ---------------------------------------------------------------------------
export const CONTENT_TYPES = ["Post", "Reels", "Story", "Video", "Shorts", "Carousel"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
// Status tersimpan di DB: 'scheduled' | 'posted' | 'missed'.
// 'pending' (Pending Konfirmasi) TIDAK disimpan — diturunkan di frontend ketika
// slot masih 'scheduled' tetapi jam tayangnya sudah lewat.
export type SlotStatus = "scheduled" | "posted" | "missed";
export type DerivedStatus = SlotStatus | "pending";

export function deriveStatus(
  slot: Pick<ContentSchedule, "status" | "scheduled_at">,
  now: Date = new Date(),
): DerivedStatus {
  if (slot.status === "posted") return "posted";
  if (slot.status === "missed") return "missed";
  // status === 'scheduled'
  if (isBefore(new Date(slot.scheduled_at), now)) return "pending";
  return "scheduled";
}

export interface StatusMeta {
  label: string;
  // Tailwind class untuk badge (bg + text + border)
  badgeClass: string;
  // Warna dot/pill di kalender
  dotClass: string;
}

export const STATUS_META: Record<DerivedStatus, StatusMeta> = {
  scheduled: {
    label: "Terjadwal",
    badgeClass: "bg-blue-500/15 text-blue-500 border-blue-500/30",
    dotClass: "bg-blue-500",
  },
  pending: {
    label: "Pending Konfirmasi",
    badgeClass: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    dotClass: "bg-amber-500",
  },
  posted: {
    label: "Posted",
    badgeClass: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    dotClass: "bg-emerald-500",
  },
  missed: {
    label: "Missed",
    badgeClass: "bg-rose-500/15 text-rose-500 border-rose-500/30",
    dotClass: "bg-rose-500",
  },
};

// ---------------------------------------------------------------------------
// Datetime helpers untuk <input type="datetime-local"> (waktu lokal, tanpa TZ shift)
// ---------------------------------------------------------------------------
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): Date {
  // value: "YYYY-MM-DDTHH:mm" — diinterpretasi sebagai waktu lokal
  return new Date(value);
}

// Jam-saja (semua post tepat di jam, tanpa menit)
export const HOURS = Array.from({ length: 24 }, (_, i) => i);
export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
export function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function dateAtHour(dateStr: string, hour: number): Date {
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00`);
}

// ---------------------------------------------------------------------------
// Bulk slot generator
// ---------------------------------------------------------------------------
export type IntervalUnit = "hours" | "days";

export interface BulkGenInput {
  startAt: Date; // tanggal + jam mulai slot pertama
  endAt: Date; // batas akhir (inklusif): slot dibuat selama scheduled_at <= endAt
  intervalValue: number; // mis. 1
  intervalUnit: IntervalUnit; // 'hours' | 'days'
  titleTemplate: string; // judul untuk tiap slot; {n} & {date} & {time} di-substitusi
  notes?: string | null;
}

export interface GeneratedSlot {
  scheduled_at: Date;
  title: string;
}

const MAX_SLOTS = 1000; // guard supaya tidak generate ribuan slot tak sengaja

export function buildTitle(template: string, index: number, at: Date): string {
  const dd = String(at.getDate()).padStart(2, "0");
  const mm = String(at.getMonth() + 1).padStart(2, "0");
  const hh = String(at.getHours()).padStart(2, "0");
  const mi = String(at.getMinutes()).padStart(2, "0");
  return template
    .replace(/\{n\}/g, String(index + 1))
    .replace(/\{date\}/g, `${dd}/${mm}`)
    .replace(/\{time\}/g, `${hh}:${mi}`)
    .trim();
}

// Menghasilkan daftar slot dari input. Tidak melempar untuk input kosong —
// validasi (start < end, interval > 0) dilakukan pemanggil sebelum submit.
export function generateSlots(input: BulkGenInput): GeneratedSlot[] {
  const { startAt, endAt, intervalValue, intervalUnit, titleTemplate } = input;
  const slots: GeneratedSlot[] = [];
  if (intervalValue <= 0 || isBefore(endAt, startAt)) return slots;

  let cursor = new Date(startAt);
  let i = 0;
  while (!isBefore(endAt, cursor) && i < MAX_SLOTS) {
    slots.push({
      scheduled_at: new Date(cursor),
      title: buildTitle(titleTemplate || "Konten {n}", i, cursor),
    });
    cursor = intervalUnit === "hours"
      ? addHours(cursor, intervalValue)
      : addDays(cursor, intervalValue);
    i++;
  }
  return slots;
}

// Hitung jumlah slot tanpa membangun array (untuk preview cepat / guard UI).
export function countSlots(input: BulkGenInput): number {
  const { startAt, endAt, intervalValue, intervalUnit } = input;
  if (intervalValue <= 0 || isBefore(endAt, startAt)) return 0;
  let cursor = new Date(startAt);
  let n = 0;
  while (!isBefore(endAt, cursor) && n < MAX_SLOTS) {
    n++;
    cursor = intervalUnit === "hours"
      ? addHours(cursor, intervalValue)
      : addDays(cursor, intervalValue);
  }
  return n;
}

// ---------------------------------------------------------------------------
// Ringkasan sel grid: agregasi slot satu (channel, hari)
// ---------------------------------------------------------------------------
export type CellStatus = "NY" | "schedule" | "done";

export interface CellSummary {
  total: number;
  posted: number;
  missed: number;
  status: CellStatus; // NY = tidak ada slot; done = semua posted; selain itu = schedule
  hasPending: boolean; // ada slot 'scheduled' yang sudah lewat jam tayang
}

export function cellSummary(
  daySlots: Pick<ContentSchedule, "status" | "scheduled_at">[],
  now: Date = new Date(),
): CellSummary {
  const total = daySlots.length;
  const posted = daySlots.filter((s) => s.status === "posted").length;
  const missed = daySlots.filter((s) => s.status === "missed").length;
  const hasPending = daySlots.some((s) => deriveStatus(s, now) === "pending");
  let status: CellStatus = "NY";
  if (total > 0) status = posted === total ? "done" : "schedule";
  return { total, posted, missed, status, hasPending };
}
