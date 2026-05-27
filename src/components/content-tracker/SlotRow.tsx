import { format } from "date-fns";
import { CheckCircle2, XCircle, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { PageBadge } from "./PageBadge";
import { StatusBadge } from "./StatusBadge";
import { useSetScheduleStatus, useDeleteSchedule, type ContentScheduleWithPage } from "@/hooks/useContentSchedules";
import { deriveStatus } from "@/lib/content-tracker";

interface SlotRowProps {
  slot: ContentScheduleWithPage;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEdit?: (slot: ContentScheduleWithPage) => void;
  showDate?: boolean;
}

export function SlotRow({ slot, selected, onToggleSelect, onEdit, showDate }: SlotRowProps) {
  const setStatus = useSetScheduleStatus();
  const del = useDeleteSchedule();
  const status = deriveStatus(slot);
  const busy = setStatus.isPending || del.isPending;

  const mark = async (s: "posted" | "missed" | "scheduled") => {
    try {
      await setStatus.mutateAsync({ id: slot.id, status: s });
    } catch (e) {
      toast({ title: "Gagal update", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(slot.id);
      toast({ title: "Slot dihapus" });
    } catch (e) {
      toast({ title: "Gagal hapus", description: (e as Error).message, variant: "destructive" });
    }
  };

  const at = new Date(slot.scheduled_at);
  const done = slot.status === "posted" || slot.status === "missed";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      {onToggleSelect && (
        <Checkbox
          checked={!!selected}
          onCheckedChange={() => onToggleSelect(slot.id)}
          className="mt-1 shrink-0"
          aria-label="Pilih slot"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold tabular-nums">
            {showDate ? format(at, "dd MMM • HH:mm") : format(at, "HH:mm")}
          </span>
          <StatusBadge status={status} />
        </div>
        <div className="mt-1 text-sm text-foreground break-words">{slot.title}</div>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          {slot.content_pages && (
            <PageBadge platform={slot.content_pages.platform} name={slot.content_pages.name} color={slot.content_pages.color} />
          )}
          {slot.notes && <span className="text-xs text-muted-foreground italic">“{slot.notes}”</span>}
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {!done ? (
          <>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500" title="Posted" onClick={() => mark("posted")} disabled={busy}>
              <CheckCircle2 className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" title="Missed" onClick={() => mark("missed")} disabled={busy}>
              <XCircle className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Kembalikan ke Terjadwal" onClick={() => mark("scheduled")} disabled={busy}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {onEdit && (
          <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => onEdit(slot)} disabled={busy}>
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" title="Hapus" onClick={handleDelete} disabled={busy}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
