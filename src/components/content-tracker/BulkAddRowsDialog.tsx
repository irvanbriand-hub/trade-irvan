import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PlatformIcon } from "./PlatformIcon";
import { useContentPages, type ContentPage } from "@/hooks/useContentPages";
import { useCreateScheduleBatch } from "@/hooks/useContentSchedules";
import { HOURS, hourLabel, toDateStr, dateAtHour, platformMeta } from "@/lib/content-tracker";

interface BulkAddRowsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  onCreated?: (batchId: string, count: number) => void;
}

interface PostRow {
  id: string;
  date: string;
  hour: number;
  brand: string;
  channelIds: Set<string>;
  title: string;
  notes: string;
}

const NO_BRAND = "Lainnya";
const brandKey = (p: ContentPage) => p.brand?.trim() || NO_BRAND;
const rowId = () => Math.random().toString(36).slice(2, 10);

export function BulkAddRowsDialog({ open, onOpenChange, defaultDate, onCreated }: BulkAddRowsDialogProps) {
  const { data: pages } = useContentPages();
  const batch = useCreateScheduleBatch();

  const [rows, setRows] = useState<PostRow[]>([]);

  // Daftar brand unik
  const brands = useMemo(() => {
    const seen: string[] = [];
    for (const p of pages ?? []) {
      const k = brandKey(p);
      if (!seen.includes(k)) seen.push(k);
    }
    return seen;
  }, [pages]);

  const channelsByBrand = useMemo(() => {
    const map = new Map<string, ContentPage[]>();
    for (const p of pages ?? []) {
      const k = brandKey(p);
      const arr = map.get(k) ?? [];
      arr.push(p);
      map.set(k, arr);
    }
    return map;
  }, [pages]);

  const makeRow = (seed?: Partial<PostRow>): PostRow => {
    const date = seed?.date ?? toDateStr(defaultDate ?? new Date());
    const hour = seed?.hour ?? 8;
    const brand = seed?.brand ?? brands[0] ?? "";
    const channels = channelsByBrand.get(brand) ?? [];
    const channelIds = seed?.channelIds ?? new Set(channels.map((c) => c.id));
    return {
      id: rowId(),
      date,
      hour,
      brand,
      channelIds,
      title: seed?.title ?? "",
      notes: seed?.notes ?? "",
    };
  };

  // Reset tiap dialog dibuka
  useEffect(() => {
    if (!open) return;
    if (brands.length === 0) {
      setRows([]);
      return;
    }
    setRows([makeRow()]);
    // makeRow akan re-init kalau brands belum siap saat open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brands.length]);

  const updateRow = (id: string, patch: Partial<PostRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onBrandChange = (id: string, brand: string) => {
    const chans = channelsByBrand.get(brand) ?? [];
    updateRow(id, { brand, channelIds: new Set(chans.map((c) => c.id)) });
  };

  const toggleChannel = (rowIdent: string, chanId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowIdent) return r;
        const next = new Set(r.channelIds);
        next.has(chanId) ? next.delete(chanId) : next.add(chanId);
        return { ...r, channelIds: next };
      }),
    );
  };

  const addRow = () => {
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      makeRow(last ? { date: last.date, hour: last.hour, brand: last.brand } : undefined),
    ]);
  };

  const duplicateRow = (id: string) => {
    const src = rows.find((r) => r.id === id);
    if (!src) return;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      const copy: PostRow = { ...src, id: rowId(), channelIds: new Set(src.channelIds) };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  // Hitung total slot yang akan dibuat (sum channel per row)
  const totalSlots = useMemo(
    () => rows.reduce((acc, r) => acc + r.channelIds.size, 0),
    [rows],
  );

  const handleSubmit = async () => {
    const items: Array<{ page_id: string; scheduled_at: string; title: string; notes: string | null }> = [];
    for (const r of rows) {
      if (!r.date) {
        toast({ title: "Tanggal kosong di salah satu baris", variant: "destructive" });
        return;
      }
      if (r.channelIds.size === 0) {
        toast({ title: `Brand "${r.brand}" tanpa channel — hapus baris atau pilih channel`, variant: "destructive" });
        return;
      }
      const scheduled_at = dateAtHour(r.date, r.hour).toISOString();
      const cleanTitle = r.title.trim();
      const cleanNotes = r.notes.trim() || null;
      for (const pid of r.channelIds) {
        items.push({ page_id: pid, scheduled_at, title: cleanTitle, notes: cleanNotes });
      }
    }
    if (items.length === 0) {
      toast({ title: "Belum ada slot untuk disimpan", variant: "destructive" });
      return;
    }
    try {
      const res = await batch.mutateAsync(items);
      toast({ title: `${res.count} slot dibuat` });
      onCreated?.(res.batchId, res.count);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tambah Beberapa Slot</DialogTitle>
          <DialogDescription>
            Susun banyak post sekaligus (beda tanggal/jam/brand) lalu submit satu kali.
            Pas buat mapping konten mingguan.
          </DialogDescription>
        </DialogHeader>

        {brands.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Belum ada brand. Tambah channel dulu di tab Halaman.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r, idx) => {
              const chans = channelsByBrand.get(r.brand) ?? [];
              return (
                <div key={r.id} className="rounded-lg border border-border bg-card p-3 space-y-2.5">
                  {/* Header baris */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Post #{idx + 1}</span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Duplikat baris"
                        onClick={() => duplicateRow(r.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-rose-500"
                        title="Hapus baris"
                        onClick={() => removeRow(r.id)}
                        disabled={rows.length <= 1}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Tanggal + Jam + Brand */}
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-3 space-y-1">
                      <Label className="text-[11px]">Tanggal</Label>
                      <Input
                        type="date"
                        value={r.date}
                        onChange={(e) => updateRow(r.id, { date: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <Label className="text-[11px]">Jam</Label>
                      <Select value={String(r.hour)} onValueChange={(v) => updateRow(r.id, { hour: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-[240px]">
                          {HOURS.map((h) => (
                            <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-7 space-y-1">
                      <Label className="text-[11px]">Brand</Label>
                      <Select value={r.brand} onValueChange={(v) => onBrandChange(r.id, v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Channels checkbox row */}
                  <div className="space-y-1">
                    <Label className="text-[11px]">Channel ({r.channelIds.size}/{chans.length})</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {chans.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">Brand ini belum punya channel.</span>
                      ) : chans.map((c) => {
                        const checked = r.channelIds.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer text-xs transition-colors ${
                              checked ? "bg-accent border-primary/30" : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleChannel(r.id, c.id)}
                              className="h-3.5 w-3.5"
                            />
                            <PlatformIcon platform={c.platform} size={13} />
                            <span>{platformMeta(c.platform).label}</span>
                            {c.content_type && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{c.content_type}</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tema + Catatan */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Tema / Judul <span className="text-muted-foreground">(opsional)</span></Label>
                      <Input
                        value={r.title}
                        onChange={(e) => updateRow(r.id, { title: e.target.value })}
                        placeholder="kosongkan kalau tidak perlu"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Catatan / Sub-niche <span className="text-muted-foreground">(opsional)</span></Label>
                      <Input
                        value={r.notes}
                        onChange={(e) => updateRow(r.id, { notes: e.target.value })}
                        placeholder="mis. olahraga / family / pekerjaan"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            <Button variant="outline" className="w-full gap-1.5" onClick={addRow}>
              <Plus className="h-4 w-4" /> Tambah baris
            </Button>
          </div>
        )}

        <DialogFooter className="mt-2 flex-row sm:justify-between items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {rows.length} baris · <span className="font-semibold text-foreground">{totalSlots}</span> slot akan dibuat
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={batch.isPending || totalSlots === 0}>
              {batch.isPending ? "Menyimpan..." : `Buat ${totalSlots} Slot`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
