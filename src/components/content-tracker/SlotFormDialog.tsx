import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PageSelect } from "./PageSelect";
import { PlatformIcon } from "./PlatformIcon";
import { useContentPages, type ContentPage } from "@/hooks/useContentPages";
import { useCreateSchedule, useCreateSchedules, useUpdateSchedule, type ContentSchedule } from "@/hooks/useContentSchedules";
import { HOURS, hourLabel, toDateStr, dateAtHour, platformMeta } from "@/lib/content-tracker";

interface SlotFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Mode edit: kirim slot existing. Mode create: kosong.
  slot?: ContentSchedule | null;
  // Nilai default untuk create
  defaultPageId?: string;
  defaultDate?: Date;
  // Mode multi: pilih brand + ceklist banyak channel (1 konten → banyak platform)
  multi?: boolean;
}

const NO_BRAND = "Lainnya";
const brandKey = (p: ContentPage) => p.brand?.trim() || NO_BRAND;

export function SlotFormDialog({ open, onOpenChange, slot, defaultPageId, defaultDate, multi }: SlotFormDialogProps) {
  const { data: pages } = useContentPages();
  const createOne = useCreateSchedule();
  const createMany = useCreateSchedules();
  const update = useUpdateSchedule();
  const isEdit = !!slot;
  const isMulti = !isEdit && !!multi;

  const [pageId, setPageId] = useState("");
  const [brand, setBrand] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dateStr, setDateStr] = useState("");
  const [hour, setHour] = useState(8);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  // Daftar brand unik (urutan mengikuti sort pages)
  const brands = useMemo(() => {
    const seen: string[] = [];
    for (const p of pages ?? []) {
      const k = brandKey(p);
      if (!seen.includes(k)) seen.push(k);
    }
    return seen;
  }, [pages]);

  const brandChannels = useMemo(
    () => (pages ?? []).filter((p) => brandKey(p) === brand),
    [pages, brand],
  );

  // Reset form tiap dialog dibuka
  useEffect(() => {
    if (!open) return;
    const baseDate = slot ? new Date(slot.scheduled_at) : (defaultDate ?? new Date());
    setDateStr(toDateStr(baseDate));
    setHour(slot ? new Date(slot.scheduled_at).getHours() : (defaultDate ? defaultDate.getHours() : 8));
    setTitle(slot?.title ?? "");
    setNotes(slot?.notes ?? "");

    if (slot) {
      setPageId(slot.page_id);
    } else if (isMulti) {
      // Default brand: brand dari defaultPageId, else brand pertama
      const seedPage = defaultPageId ? (pages ?? []).find((p) => p.id === defaultPageId) : null;
      const defBrand = seedPage ? brandKey(seedPage) : (pages?.[0] ? brandKey(pages[0]) : "");
      setBrand(defBrand);
      const chans = (pages ?? []).filter((p) => brandKey(p) === defBrand);
      setSelectedIds(new Set(chans.map((c) => c.id)));
    } else {
      setPageId(defaultPageId ?? "");
    }
  }, [open, slot, defaultPageId, defaultDate, isMulti, pages]);

  // Saat brand berganti di mode multi → centang semua channel brand itu
  const onBrandChange = (b: string) => {
    setBrand(b);
    const chans = (pages ?? []).filter((p) => brandKey(p) === b);
    setSelectedIds(new Set(chans.map((c) => c.id)));
  };

  const toggleChannel = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submitting = createOne.isPending || createMany.isPending || update.isPending;

  const handleSubmit = async () => {
    if (!dateStr) return toast({ title: "Tanggal wajib diisi", variant: "destructive" });
    const scheduled_at = dateAtHour(dateStr, hour).toISOString();
    const cleanTitle = title.trim();

    try {
      if (isEdit && slot) {
        await update.mutateAsync({ id: slot.id, page_id: pageId, scheduled_at, title: cleanTitle, notes: notes.trim() || null });
        toast({ title: "Slot diperbarui" });
      } else if (isMulti) {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return toast({ title: "Pilih minimal satu channel", variant: "destructive" });
        const res = await createMany.mutateAsync({ pageIds: ids, scheduled_at, title: cleanTitle, notes: notes.trim() || null });
        toast({ title: `${res.count} slot dibuat (${brand})` });
      } else {
        if (!pageId) return toast({ title: "Pilih channel dulu", variant: "destructive" });
        await createOne.mutateAsync({ page_id: pageId, scheduled_at, title: cleanTitle, notes: notes.trim() || null });
        toast({ title: "Slot dibuat" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Slot" : "Tambah Slot"}</DialogTitle>
          <DialogDescription>
            {isMulti
              ? "Pilih brand, lalu ceklist channel mana saja yang akan diposting (1 konten sekaligus)."
              : "Jadwal posting konten manual. Tema/judul opsional — boleh dikosongkan."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {isMulti ? (
            <>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Select value={brand} onValueChange={onBrandChange}>
                  <SelectTrigger><SelectValue placeholder="Pilih brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Channel yang diposting</Label>
                <div className="space-y-1.5 rounded-lg border border-border p-2">
                  {brandChannels.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Brand ini belum punya channel.</p>
                  ) : brandChannels.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer py-1 min-h-[36px]">
                      <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleChannel(c.id)} />
                      <PlatformIcon platform={c.platform} size={15} />
                      <span className="text-sm">{platformMeta(c.platform).label}</span>
                      {c.content_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{c.content_type}</span>}
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <PageSelect value={pageId} onValueChange={setPageId} pages={pages ?? []} placeholder="Pilih channel" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Jam</Label>
              <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[260px]">
                  {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tema / Judul <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="kosongkan kalau tidak perlu" />
          </div>

          <div className="space-y-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. reels viral / gagal upload" rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Menyimpan..." : isMulti ? `Buat ${selectedIds.size} Slot` : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
