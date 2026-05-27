import { useState } from "react";
import { startOfDay, endOfDay, format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCheck, Plus, CalendarPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { SlotRow } from "./SlotRow";
import { SlotFormDialog } from "./SlotFormDialog";
import { BulkScheduleDialog } from "./BulkScheduleDialog";
import { PlatformIcon } from "./PlatformIcon";
import { useContentSchedules, useBulkSetStatus, type ContentScheduleWithPage } from "@/hooks/useContentSchedules";
import type { ContentPage } from "@/hooks/useContentPages";

interface CellDayEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: ContentPage | null;
  day: Date | null;
}

export function CellDayEditor({ open, onOpenChange, page, day }: CellDayEditorProps) {
  const bulkStatus = useBulkSetStatus();
  const [slotFormOpen, setSlotFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<ContentScheduleWithPage | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const dayStart = day ? startOfDay(day).toISOString() : undefined;
  const dayEnd = day ? endOfDay(day).toISOString() : undefined;

  const { data: slots } = useContentSchedules({
    pageId: open && page ? page.id : undefined,
    from: dayStart,
    to: dayEnd,
  });

  const daySlots = slots ?? [];
  const pendingIds = daySlots.filter((s) => s.status !== "posted").map((s) => s.id);

  const markAllDone = async () => {
    if (pendingIds.length === 0) return;
    try {
      await bulkStatus.mutateAsync({ ids: pendingIds, status: "posted" });
      toast({ title: `${pendingIds.length} post ditandai Posted` });
    } catch (e) {
      toast({ title: "Gagal update", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {page && <PlatformIcon platform={page.platform} size={18} />}
            {page?.name}
            {page?.content_type && <span className="text-xs font-normal text-muted-foreground">· {page.content_type}</span>}
          </SheetTitle>
          <SheetDescription>
            {day && format(day, "EEEE, dd MMMM yyyy", { locale: idLocale })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {/* Aksi cepat */}
          <div className="grid grid-cols-1 gap-2">
            <Button size="sm" variant="default" className="gap-1.5" onClick={markAllDone} disabled={bulkStatus.isPending || pendingIds.length === 0}>
              <CheckCheck className="h-4 w-4" /> Tandai Semua DONE {pendingIds.length > 0 ? `(${pendingIds.length})` : ""}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditSlot(null); setSlotFormOpen(true); }}>
                <Plus className="h-4 w-4" /> Tambah slot
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setBulkOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> Massal jam
              </Button>
            </div>
          </div>

          {/* List post hari itu */}
          {daySlots.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Belum ada slot di hari ini.</p>
          ) : (
            <div className="space-y-2 pt-1">
              {daySlots.map((s) => (
                <SlotRow key={s.id} slot={s} onEdit={(slot) => { setEditSlot(slot); setSlotFormOpen(true); }} />
              ))}
            </div>
          )}
        </div>

        <SlotFormDialog
          open={slotFormOpen}
          onOpenChange={setSlotFormOpen}
          slot={editSlot}
          defaultPageId={page?.id}
          defaultDate={day ?? undefined}
        />
        <BulkScheduleDialog open={bulkOpen} onOpenChange={setBulkOpen} defaultPageId={page?.id} defaultDate={day ?? undefined} />
      </SheetContent>
    </Sheet>
  );
}
