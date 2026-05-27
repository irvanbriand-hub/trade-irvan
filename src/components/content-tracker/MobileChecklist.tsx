import { format, isSameDay } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { SlotRow } from "./SlotRow";
import type { ContentScheduleWithPage } from "@/hooks/useContentSchedules";

interface MobileChecklistProps {
  slots: ContentScheduleWithPage[];
  onEdit?: (slot: ContentScheduleWithPage) => void;
}

// Mengelompokkan slot per hari untuk checklist cepat di mobile.
export function MobileChecklist({ slots, onEdit }: MobileChecklistProps) {
  if (slots.length === 0) {
    return <div className="text-center text-sm text-muted-foreground py-10">Tidak ada slot.</div>;
  }

  // Kelompokkan berdasarkan tanggal (slots sudah terurut scheduled_at asc dari query)
  const groups: { date: Date; items: ContentScheduleWithPage[] }[] = [];
  for (const s of slots) {
    const d = new Date(s.scheduled_at);
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.date, d)) last.items.push(s);
    else groups.push({ date: d, items: [s] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.date.toISOString()} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sticky top-14 bg-background py-1 z-10">
            {format(g.date, "EEEE, dd MMMM yyyy", { locale: idLocale })}
          </h3>
          {g.items.map((s) => (
            <SlotRow key={s.id} slot={s} onEdit={onEdit} />
          ))}
        </div>
      ))}
    </div>
  );
}
