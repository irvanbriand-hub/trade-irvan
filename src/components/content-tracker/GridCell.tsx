import type { CellSummary } from "@/lib/content-tracker";

interface GridCellProps {
  summary: CellSummary;
  onClick: () => void;
  isToday?: boolean;
  inMonth?: boolean;
}

// Sel matrix untuk satu (channel, hari). Warna mengikuti status agregat.
export function GridCell({ summary, onClick, isToday, inMonth = true }: GridCellProps) {
  const { total, posted, status, hasPending } = summary;

  const base =
    status === "done"
      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30"
      : status === "schedule"
        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 hover:bg-blue-500/25"
        : "bg-muted/30 text-muted-foreground hover:bg-muted/60";

  // Tint pengingat untuk slot terjadwal yang sudah lewat & belum di-checklist
  const pendingRing = hasPending ? "ring-1 ring-inset ring-amber-500/60" : "";

  const label =
    status === "NY" ? "" : total > 1 ? `${posted}/${total}` : status === "done" ? "✓" : "•";

  return (
    <button
      onClick={onClick}
      title={total > 0 ? `${posted}/${total} posted` : "Belum ada slot"}
      className={`h-9 w-full min-w-[34px] rounded text-[11px] font-medium tabular-nums transition-colors ${base} ${pendingRing} ${
        isToday ? "outline outline-1 outline-primary" : ""
      } ${inMonth ? "" : "opacity-40"}`}
    >
      {label}
    </button>
  );
}
