import { isSameDay, isToday, getDay } from "date-fns";
import { deriveStatus, platformMeta, STATUS_META } from "@/lib/content-tracker";
import type { ContentScheduleWithPage } from "@/hooks/useContentSchedules";

interface CalendarDayCellProps {
  date: Date;
  currentMonth: number; // 0-11 — untuk dim hari di luar bulan
  slots: ContentScheduleWithPage[];
  onClick: (date: Date) => void;
}

const MAX_PILLS = 3;

export function CalendarDayCell({ date, currentMonth, slots, onClick }: CalendarDayCellProps) {
  const inMonth = date.getMonth() === currentMonth;
  const today = isToday(date);
  const dow = getDay(date);
  const weekend = dow === 0 || dow === 6;
  const daySlots = slots.filter((s) => isSameDay(new Date(s.scheduled_at), date));
  const visible = daySlots.slice(0, MAX_PILLS);
  const extra = daySlots.length - visible.length;

  return (
    <button
      onClick={() => onClick(date)}
      className={`flex flex-col items-stretch gap-1 rounded-md border p-1.5 text-left transition-colors min-h-[64px] sm:min-h-[88px] ${
        inMonth
          ? weekend
            ? "border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10"
            : "border-border bg-card hover:bg-accent"
          : "border-transparent bg-muted/20 text-muted-foreground"
      }`}
    >
      <span className={`text-xs font-medium tabular-nums ${
        today ? "text-primary font-bold" : weekend && inMonth ? "text-rose-500" : ""
      }`}>
        {date.getDate()}
      </span>
      <div className="flex flex-col gap-0.5">
        {visible.map((s) => {
          const status = deriveStatus(s);
          const meta = platformMeta(s.content_pages?.platform ?? "");
          const label = s.title?.trim() || s.content_pages?.name || meta.label;
          return (
            <span
              key={s.id}
              className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight"
              style={{ backgroundColor: `${s.content_pages?.color || meta.color}22` }}
            >
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_META[status].dotClass}`} />
              <span className="truncate">{meta.emoji} {label}</span>
            </span>
          );
        })}
        {extra > 0 && <span className="text-[10px] text-muted-foreground px-1">+{extra} lagi</span>}
      </div>
    </button>
  );
}
