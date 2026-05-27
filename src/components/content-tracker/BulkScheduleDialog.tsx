import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PageSelect } from "./PageSelect";
import { useContentPages } from "@/hooks/useContentPages";
import { useBulkGenerateSchedules } from "@/hooks/useContentSchedules";
import {
  generateSlots, countSlots, toDateStr, dateAtHour, HOURS, hourLabel,
  type IntervalUnit, type BulkGenInput,
} from "@/lib/content-tracker";
import { format, addDays } from "date-fns";

interface BulkScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPageId?: string;
  defaultDate?: Date;
  // Dipanggil setelah sukses, membawa batchId untuk fitur undo
  onGenerated?: (batchId: string, count: number) => void;
}

export function BulkScheduleDialog({ open, onOpenChange, defaultPageId, defaultDate, onGenerated }: BulkScheduleDialogProps) {
  const { data: pages } = useContentPages();
  const bulkGen = useBulkGenerateSchedules();

  const [pageId, setPageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startHour, setStartHour] = useState(8);
  const [endDate, setEndDate] = useState("");
  const [endHour, setEndHour] = useState(20);
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("hours");
  const [titleTemplate, setTitleTemplate] = useState("Konten {n}");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    const base = defaultDate ?? new Date();
    setPageId(defaultPageId ?? "");
    setStartDate(toDateStr(base));
    setStartHour(8);
    setEndDate(toDateStr(addDays(base, 7)));
    setEndHour(20);
    setIntervalValue(1);
    setIntervalUnit("hours");
    setTitleTemplate("Konten {n}");
    setNotes("");
  }, [open, defaultPageId, defaultDate]);

  const genInput: BulkGenInput | null = useMemo(() => {
    if (!startDate || !endDate) return null;
    return {
      startAt: dateAtHour(startDate, startHour),
      endAt: dateAtHour(endDate, endHour),
      intervalValue,
      intervalUnit,
      titleTemplate,
      notes: notes.trim() || null,
    };
  }, [startDate, startHour, endDate, endHour, intervalValue, intervalUnit, titleTemplate, notes]);

  const total = genInput ? countSlots(genInput) : 0;
  const preview = useMemo(() => (genInput ? generateSlots(genInput).slice(0, 8) : []), [genInput]);

  const handleSubmit = async () => {
    if (!pageId) return toast({ title: "Pilih channel dulu", variant: "destructive" });
    if (!genInput) return toast({ title: "Lengkapi tanggal mulai & akhir", variant: "destructive" });
    if (total === 0) return toast({ title: "Tidak ada slot — cek tanggal & interval", variant: "destructive" });
    try {
      const res = await bulkGen.mutateAsync({ pageId, ...genInput });
      toast({ title: `${res.count} slot dibuat` });
      onGenerated?.(res.batchId, res.count);
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Gagal generate", description: (e as Error).message, variant: "destructive" });
    }
  };

  const HourSelect = ({ value, onChange }: { value: number; onChange: (h: number) => void }) => (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-[260px]">
        {HOURS.map((h) => <SelectItem key={h} value={String(h)}>{hourLabel(h)}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Jadwal Massal</DialogTitle>
          <DialogDescription>
            Buat banyak slot sekaligus. Placeholder judul: <code>{"{n}"}</code> nomor urut, <code>{"{date}"}</code> tanggal, <code>{"{time}"}</code> jam.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <PageSelect value={pageId} onValueChange={setPageId} pages={pages ?? []} placeholder="Pilih channel" />
          </div>

          {/* Mulai */}
          <div className="space-y-1.5">
            <Label>Mulai (tanggal & jam)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <HourSelect value={startHour} onChange={setStartHour} />
            </div>
          </div>

          {/* Sampai */}
          <div className="space-y-1.5">
            <Label>Sampai (tanggal & jam)</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <HourSelect value={endHour} onChange={setEndHour} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Setiap</Label>
              <Input
                type="number"
                min={1}
                value={intervalValue}
                onChange={(e) => setIntervalValue(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Satuan</Label>
              <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as IntervalUnit)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">Jam</SelectItem>
                  <SelectItem value="days">Hari</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Template judul</Label>
            <Input value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} placeholder="Konten {n}" />
          </div>

          <div className="space-y-1.5">
            <Label>Catatan (opsional, untuk semua slot)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-sm font-medium mb-2">
              {total > 0 ? <>Akan dibuat <span className="text-primary">{total}</span> slot</> : "Belum ada slot — cek tanggal & interval"}
              {total > 1000 && <span className="text-amber-500"> (dibatasi maksimal 1000)</span>}
            </div>
            {preview.length > 0 && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {preview.map((s, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate">{s.title}</span>
                    <span className="shrink-0 tabular-nums">{format(s.scheduled_at, "dd MMM HH:mm")}</span>
                  </li>
                ))}
                {total > preview.length && <li className="italic">…dan {total - preview.length} slot lainnya</li>}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={bulkGen.isPending || total === 0}>
            {bulkGen.isPending ? "Membuat..." : `Buat ${total} Slot`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
