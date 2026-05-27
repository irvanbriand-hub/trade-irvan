import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Clock, Trash2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useBulkSetStatus, useBulkDeleteSchedules } from "@/hooks/useContentSchedules";
import { BulkRescheduleDialog } from "./BulkRescheduleDialog";

interface BulkActionsBarProps {
  selectedIds: string[];
  onClear: () => void;
}

// Bar mengambang di bawah ketika ada slot terpilih.
export function BulkActionsBar({ selectedIds, onClear }: BulkActionsBarProps) {
  const setStatus = useBulkSetStatus();
  const del = useBulkDeleteSchedules();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (selectedIds.length === 0) return null;
  const count = selectedIds.length;

  const mark = async (status: "posted" | "missed") => {
    try {
      await setStatus.mutateAsync({ ids: selectedIds, status });
      toast({ title: `${count} slot ditandai ${status === "posted" ? "Posted" : "Missed"}` });
      onClear();
    } catch (e) {
      toast({ title: "Gagal update status", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync({ ids: selectedIds });
      toast({ title: `${count} slot dihapus` });
      setConfirmDelete(false);
      onClear();
    } catch (e) {
      toast({ title: "Gagal hapus", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-2xl">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card/95 backdrop-blur-sm shadow-2xl px-3 py-2 overflow-x-auto">
          <span className="text-sm font-medium whitespace-nowrap">{count} terpilih</span>
          <div className="h-5 w-px bg-border mx-1 shrink-0" />
          <Button size="sm" variant="ghost" className="gap-1.5 text-emerald-500 shrink-0" onClick={() => mark("posted")} disabled={setStatus.isPending}>
            <CheckCircle2 className="h-4 w-4" /> Posted
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-rose-500 shrink-0" onClick={() => mark("missed")} disabled={setStatus.isPending}>
            <XCircle className="h-4 w-4" /> Missed
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 shrink-0" onClick={() => setRescheduleOpen(true)}>
            <Clock className="h-4 w-4" /> Geser
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-rose-500 shrink-0" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" /> Hapus
          </Button>
          <div className="h-5 w-px bg-border mx-1 shrink-0" />
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <BulkRescheduleDialog open={rescheduleOpen} onOpenChange={setRescheduleOpen} ids={selectedIds} onDone={onClear} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {count} slot?</AlertDialogTitle>
            <AlertDialogDescription>Tindakan ini tidak bisa dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={del.isPending}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
