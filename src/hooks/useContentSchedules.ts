import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { addDays } from "date-fns";
import { generateSlots, type BulkGenInput, type SlotStatus } from "@/lib/content-tracker";

export type ContentSchedule = Tables<"content_schedules">;
export type ContentScheduleInsert = TablesInsert<"content_schedules">;

// Schedule + ringkasan page-nya (hasil embed PostgREST)
export type ContentScheduleWithPage = ContentSchedule & {
  content_pages: Pick<Tables<"content_pages">, "id" | "name" | "platform" | "color"> | null;
};

export interface ScheduleFilters {
  pageId?: string;
  platform?: string;
  from?: string; // ISO datetime (inklusif)
  to?: string; // ISO datetime (inklusif)
  status?: SlotStatus;
}

export function useContentSchedules(filters: ScheduleFilters = {}) {
  return useQuery({
    queryKey: ["content_schedules", filters],
    queryFn: async () => {
      let q = supabase
        .from("content_schedules")
        .select("*, content_pages(id, name, platform, color)")
        .order("scheduled_at", { ascending: true });

      if (filters.pageId) q = q.eq("page_id", filters.pageId);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.from) q = q.gte("scheduled_at", filters.from);
      if (filters.to) q = q.lte("scheduled_at", filters.to);

      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as unknown as ContentScheduleWithPage[];
      // Filter platform di client (relasi embed tidak bisa difilter langsung tanpa inner join)
      if (filters.platform) {
        rows = rows.filter((r) => r.content_pages?.platform === filters.platform);
      }
      return rows;
    },
  });
}

// Tipe ringkas untuk grid (tanpa embed page agar payload kecil)
export type GridSlot = Pick<ContentSchedule, "id" | "page_id" | "scheduled_at" | "title" | "notes" | "status" | "posted_at">;

// Fetch semua slot dalam rentang (sebulan) dengan pagination .range() —
// channel per-jam bisa >1000 baris/bulan (limit default PostgREST 1000).
export function useMonthGrid({ from, to }: { from: string; to: string }) {
  return useQuery({
    queryKey: ["content_schedules", "grid", from, to],
    queryFn: async () => {
      const PAGE = 1000;
      const all: GridSlot[] = [];
      let offset = 0;
      // Loop sampai batch terakhir < PAGE
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("content_schedules")
          .select("id, page_id, scheduled_at, title, notes, status, posted_at")
          .gte("scheduled_at", from)
          .lte("scheduled_at", to)
          .order("scheduled_at", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as GridSlot[];
        all.push(...batch);
        if (batch.length < PAGE) break;
        offset += PAGE;
      }
      return all;
    },
  });
}

// Slot mendatang N hari ke depan yang masih 'scheduled' (untuk dashboard)
export function useUpcomingSchedules(days = 7) {
  const now = new Date();
  const to = addDays(now, days);
  return useQuery({
    queryKey: ["content_schedules", "upcoming", days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_schedules")
        .select("*, content_pages(id, name, platform, color)")
        .eq("status", "scheduled")
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", to.toISOString())
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ContentScheduleWithPage[];
    },
  });
}

// --------------------------------------------------------------------------
// Single-slot mutations
// --------------------------------------------------------------------------
export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slot: Omit<ContentScheduleInsert, "user_id">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("content_schedules")
        .insert({ ...slot, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

// Buat banyak slot sekaligus (1 konten ke beberapa channel). Diberi shared bulk_batch_id.
export function useCreateSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      pageIds: string[];
      scheduled_at: string;
      title: string;
      notes?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (input.pageIds.length === 0) throw new Error("Pilih minimal satu channel.");
      const batchId = crypto.randomUUID();
      const rows: ContentScheduleInsert[] = input.pageIds.map((page_id) => ({
        user_id: user.id,
        page_id,
        scheduled_at: input.scheduled_at,
        title: input.title,
        notes: input.notes ?? null,
        bulk_batch_id: batchId,
      }));
      const { error } = await supabase.from("content_schedules").insert(rows);
      if (error) throw error;
      return { count: rows.length };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

// Insert banyak slot dengan scheduled_at/title/notes BERBEDA per item.
// Berbeda dari useCreateSchedules (yang share scheduled_at) — dipakai untuk
// mass-input multi-row (plan mingguan dengan banyak post variasi).
export function useCreateScheduleBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{
      page_id: string;
      scheduled_at: string;
      title: string;
      notes?: string | null;
    }>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (items.length === 0) throw new Error("Tidak ada baris untuk disimpan.");
      const batchId = crypto.randomUUID();
      const rows: ContentScheduleInsert[] = items.map((it) => ({
        user_id: user.id,
        page_id: it.page_id,
        scheduled_at: it.scheduled_at,
        title: it.title,
        notes: it.notes ?? null,
        bulk_batch_id: batchId,
      }));
      const { error } = await supabase.from("content_schedules").insert(rows);
      if (error) throw error;
      return { count: rows.length, batchId };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Pick<ContentSchedule, "title" | "notes" | "scheduled_at" | "status" | "posted_at" | "page_id">>) => {
      const { error } = await supabase.from("content_schedules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

// Set status satu slot. posted_at otomatis diisi/dikosongkan.
export function useSetScheduleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SlotStatus }) => {
      const { error } = await supabase
        .from("content_schedules")
        .update({ status, posted_at: status === "posted" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

// --------------------------------------------------------------------------
// Bulk operations
// --------------------------------------------------------------------------
export interface BulkGenerateInput extends BulkGenInput {
  pageId: string;
}

export function useBulkGenerateSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pageId, ...gen }: BulkGenerateInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const slots = generateSlots(gen);
      if (slots.length === 0) throw new Error("Tidak ada slot untuk dibuat — cek tanggal & interval.");
      const batchId = crypto.randomUUID();
      const rows: ContentScheduleInsert[] = slots.map((s) => ({
        user_id: user.id,
        page_id: pageId,
        scheduled_at: s.scheduled_at.toISOString(),
        title: s.title,
        notes: gen.notes ?? null,
        bulk_batch_id: batchId,
      }));
      const { error } = await supabase.from("content_schedules").insert(rows);
      if (error) throw error;
      return { batchId, count: rows.length };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

export function useBulkSetStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: SlotStatus }) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("content_schedules")
        .update({ status, posted_at: status === "posted" ? new Date().toISOString() : null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

export function useBulkDeleteSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { ids?: string[]; batchId?: string; from?: string; to?: string; pageId?: string }) => {
      let q = supabase.from("content_schedules").delete();
      if (args.batchId) {
        q = q.eq("bulk_batch_id", args.batchId);
      } else if (args.ids && args.ids.length > 0) {
        q = q.in("id", args.ids);
      } else if (args.from && args.to) {
        q = q.gte("scheduled_at", args.from).lte("scheduled_at", args.to);
        if (args.pageId) q = q.eq("page_id", args.pageId);
      } else {
        throw new Error("Bulk delete butuh ids, batchId, atau rentang tanggal.");
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}

// Geser jam tayang beberapa slot sekaligus (±N jam).
export function useBulkRescheduleSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, shiftHours }: { ids: string[]; shiftHours: number }) => {
      if (ids.length === 0) return;
      // Ambil scheduled_at lama, hitung baru, update satu per satu (jumlah biasanya kecil)
      const { data, error } = await supabase
        .from("content_schedules")
        .select("id, scheduled_at")
        .in("id", ids);
      if (error) throw error;
      const updates = (data ?? []).map((r) => {
        const next = new Date(new Date(r.scheduled_at).getTime() + shiftHours * 3600_000);
        return supabase.from("content_schedules").update({ scheduled_at: next.toISOString() }).eq("id", r.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find((res) => res.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_schedules"] }),
  });
}
