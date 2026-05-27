import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useBulkRescheduleSchedules } from "@/hooks/useContentSchedules";

interface BulkRescheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: string[];
  onDone?: () => void;
}

export function BulkRescheduleDialog({ open, onOpenChange, ids, onDone }: BulkRescheduleDialogProps) {
  const reschedule = useBulkRescheduleSchedules();
  const [shiftHours, setShiftHours] = useState(0);

  useEffect(() => { if (open) setShiftHours(0); }, [open]);

  const handleSubmit = async () => {
    if (shiftHours === 0) return toast({ title: "Masukkan jumlah jam (boleh negatif)", variant: "destructive" });
    try {
      await reschedule.mutateAsync({ ids, shiftHours });
      toast({ title: `${ids.length} slot digeser ${shiftHours > 0 ? "+" : ""}${shiftHours} jam` });
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Gagal geser jadwal", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Geser Jadwal ({ids.length} slot)</DialogTitle>
          <DialogDescription>Geser jam tayang. Positif = mundur ke depan, negatif = maju ke belakang.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Geser (jam)</Label>
          <Input
            type="number"
            value={shiftHours}
            onChange={(e) => setShiftHours(Number(e.target.value) || 0)}
            placeholder="mis. 24 atau -3"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={reschedule.isPending}>
            {reschedule.isPending ? "Menggeser..." : "Geser"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
