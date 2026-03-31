import { useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Pencil, Trash2, Plus, RefreshCw, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStampDuty, useUpsertStampDuty, useDeleteStampDuty, type StampDuty } from "@/hooks/useStampDuty";
import { useToast } from "@/hooks/use-toast";

const LS_KEY = "stamp-duty-open";

const fmtRp = (val: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

interface FormState {
  trade_date: string;
  amount: string;
  notes: string;
  auto: boolean;
}

const emptyForm = (): FormState => ({
  trade_date: format(new Date(), "yyyy-MM-dd"),
  amount: "10000",
  notes: "",
  auto: false,
});

export function StampDutySection() {
  const { data: duties, isLoading } = useStampDuty();
  const upsert = useUpsertStampDuty();
  const remove = useDeleteStampDuty();
  const { toast } = useToast();

  // Collapsible — default collapsed, persist ke localStorage
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_KEY) === "true"; } catch { return false; }
  });

  const toggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(LS_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  };

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StampDuty | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalMaterai = (duties || []).reduce((sum, d) => sum + d.amount, 0);

  const openAdd = (e: React.MouseEvent) => {
    e.stopPropagation(); // jangan trigger toggle saat klik tombol
    setEditTarget(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (d: StampDuty) => {
    setEditTarget(d);
    setForm({ trade_date: d.trade_date, amount: String(d.amount), notes: d.notes || "", auto: d.auto });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const amount = parseInt(form.amount);
    if (!form.trade_date || isNaN(amount) || amount <= 0) {
      toast({ title: "Validasi gagal", description: "Tanggal dan jumlah wajib diisi", variant: "destructive" });
      return;
    }
    upsert.mutate(
      { trade_date: form.trade_date, amount, auto: false, notes: form.notes || null },
      {
        onSuccess: () => {
          toast({ title: "Berhasil", description: "Data materai disimpan" });
          setDialogOpen(false);
        },
        onError: (e: any) => {
          toast({ title: "Gagal", description: e.message, variant: "destructive" });
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    remove.mutate(deleteId, {
      onSuccess: () => {
        toast({ title: "Berhasil", description: "Data materai dihapus" });
        setDeleteId(null);
      },
    });
  };

  return (
    <>
      <Card className="border-border">
        {/* ── Header (selalu tampil, klik untuk toggle) ── */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={toggleOpen}
        >
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground">Biaya Materai</span>
            <span className="text-xs text-muted-foreground font-mono">
              Total: {fmtRp(totalMaterai)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={openAdd}
            >
              <Plus className="h-3 w-3" /> Tambah Manual
            </Button>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-300",
                isOpen && "rotate-180"
              )}
            />
          </div>
        </div>

        {/* ── Content collapsible dengan CSS transition ── */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out",
            isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <CardContent className="pt-0 pb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Memuat...
              </div>
            ) : !duties || duties.length === 0 ? (
              <p className="text-center py-6 text-muted-foreground text-sm">
                Belum ada data materai. Materai akan otomatis ditambah saat ada SELL dengan total transaksi &gt; Rp 10.000.000.
              </p>
            ) : (
              <div className="space-y-2">
                {[...duties].sort((a, b) => b.trade_date.localeCompare(a.trade_date)).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/30 border border-border text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-foreground font-medium">
                        {format(new Date(d.trade_date), "d MMM yyyy", { locale: localeId })}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          d.auto
                            ? "text-muted-foreground border-muted-foreground/30"
                            : "text-primary border-primary/30"
                        )}
                      >
                        {d.auto ? "otomatis" : "manual"}
                      </Badge>
                      {d.notes && (
                        <span className="text-muted-foreground">{d.notes}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-loss font-semibold">-{fmtRp(d.amount)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => openEdit(d)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setDeleteId(d.id)}
                      >
                        <Trash2 className="h-3 w-3 text-loss" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Materai" : "Tambah Materai Manual"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Tanggal</Label>
              <Input
                type="date"
                value={form.trade_date}
                onChange={(e) => setForm((f) => ({ ...f, trade_date: e.target.value }))}
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Jumlah (Rp)</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="text-xs h-9 font-mono"
                placeholder="10000"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes (opsional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="text-xs h-9"
                placeholder="Contoh: override nilai materai"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Menyimpan sebagai manual (auto=false) — tidak akan di-overwrite oleh sistem.
              Untuk mengembalikan ke otomatis, hapus record ini dan biarkan sistem mengisi ulang.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Batal</Button>
            <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Data Materai?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Record ini akan dihapus. Kalau record ini otomatis, sistem mungkin akan mengisi ulang
            saat ada perubahan trade pada tanggal yang sama.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={remove.isPending}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
