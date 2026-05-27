import { useMemo, useState } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  addMonths, subMonths, format, isSameDay,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CalendarDayCell } from "@/components/content-tracker/CalendarDayCell";
import { SlotRow } from "@/components/content-tracker/SlotRow";
import { SlotFormDialog } from "@/components/content-tracker/SlotFormDialog";
import { PageSelect } from "@/components/content-tracker/PageSelect";
import { useContentSchedules, type ContentScheduleWithPage } from "@/hooks/useContentSchedules";
import { useContentPages } from "@/hooks/useContentPages";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export default function ContentCalendarView() {
  const [cursor, setCursor] = useState(new Date());
  const [pageId, setPageId] = useState<string>("all");
  const [dayOpen, setDayOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [slotFormOpen, setSlotFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<ContentScheduleWithPage | null>(null);

  const { data: pages } = useContentPages();

  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const { data: slots } = useContentSchedules({
    from: gridStart.toISOString(),
    to: gridEnd.toISOString(),
    pageId: pageId === "all" ? undefined : pageId,
  });

  const daySlots = useMemo(
    () => (selectedDay ? (slots ?? []).filter((s) => isSameDay(new Date(s.scheduled_at), selectedDay)) : []),
    [slots, selectedDay],
  );

  const openDay = (d: Date) => {
    setSelectedDay(d);
    setDayOpen(true);
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[140px] text-center">
            {format(cursor, "MMMM yyyy", { locale: idLocale })}
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Hari ini</Button>
        </div>
        <PageSelect
          value={pageId}
          onValueChange={setPageId}
          pages={pages ?? []}
          includeAll
          allLabel="Semua channel"
          className="w-[220px]"
        />
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <CalendarDayCell
            key={d.toISOString()}
            date={d}
            currentMonth={cursor.getMonth()}
            slots={slots ?? []}
            onClick={openDay}
          />
        ))}
      </div>

      {/* Day detail sheet */}
      <Sheet open={dayOpen} onOpenChange={setDayOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDay && format(selectedDay, "EEEE, dd MMMM yyyy", { locale: idLocale })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              onClick={() => { setEditSlot(null); setSlotFormOpen(true); }}
            >
              <Plus className="h-4 w-4" /> Tambah slot di hari ini
            </Button>
            {daySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Belum ada slot.</p>
            ) : (
              daySlots.map((s) => (
                <SlotRow key={s.id} slot={s} onEdit={(slot) => { setEditSlot(slot); setSlotFormOpen(true); }} />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <SlotFormDialog
        open={slotFormOpen}
        onOpenChange={setSlotFormOpen}
        slot={editSlot}
        multi={!editSlot}
        defaultPageId={pageId === "all" ? undefined : pageId}
        defaultDate={selectedDay ?? undefined}
      />
    </div>
  );
}
