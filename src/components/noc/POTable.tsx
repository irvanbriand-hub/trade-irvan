import { useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  usePOList, useAddPO, useUpdatePO, useDeletePO, useTogglePOStatus,
} from '@/lib/noc/hooks/usePOList';
import { AREA_NAMES } from '@/lib/noc/constants';
import { POForm } from './POForm';
import type { PO, POInsert } from '@/lib/noc/types';

export function POTable() {
  const { data: poList = [], isLoading } = usePOList();
  const addPO = useAddPO();
  const updatePO = useUpdatePO();
  const deletePO = useDeletePO();
  const toggleStatus = useTogglePOStatus();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PO | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PO | null>(null);

  function openAdd() {
    setEditTarget(undefined);
    setFormOpen(true);
  }

  function openEdit(po: PO) {
    setEditTarget(po);
    setFormOpen(true);
  }

  async function handleFormSubmit(values: POInsert) {
    try {
      if (editTarget) {
        await updatePO.mutateAsync({ id: editTarget.id, ...values });
        toast({ title: 'PO diperbarui' });
      } else {
        await addPO.mutateAsync(values);
        toast({ title: 'PO ditambahkan' });
      }
      setFormOpen(false);
    } catch {
      toast({ title: 'Gagal menyimpan', variant: 'destructive' });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deletePO.mutateAsync(deleteTarget.id);
      toast({ title: `PO "${deleteTarget.name}" dihapus` });
    } catch {
      toast({ title: 'Gagal menghapus', variant: 'destructive' });
    } finally {
      setDeleteTarget(null);
    }
  }

  async function handleToggle(po: PO) {
    const next = po.status === 'active' ? 'inactive' : 'active';
    try {
      await toggleStatus.mutateAsync({ id: po.id, status: next });
    } catch {
      toast({ title: 'Gagal mengubah status', variant: 'destructive' });
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Memuat data PO...</div>;
  }

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" /> Tambah PO
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nama PO</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Area</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Provinsi Coverage</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Kabupaten Khusus</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {poList.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-muted-foreground">
                  Belum ada PO. Klik "Tambah PO" untuk memulai.
                </td>
              </tr>
            ) : (
              poList.map((po) => (
                <tr key={po.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{po.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      Area {po.area} — {AREA_NAMES[po.area]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {po.provinsi_coverage.length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        po.provinsi_coverage.slice(0, 3).map((p) => (
                          <Badge key={p} variant="secondary" className="text-xs px-1.5 py-0">
                            {p}
                          </Badge>
                        ))
                      )}
                      {po.provinsi_coverage.length > 3 && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          +{po.provinsi_coverage.length - 3}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(po.kabupaten_coverage ?? []).length === 0 ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : (
                        (po.kabupaten_coverage ?? []).slice(0, 2).map((k) => (
                          <Badge key={k} variant="outline" className="text-xs px-1.5 py-0">
                            {k}
                          </Badge>
                        ))
                      )}
                      {(po.kabupaten_coverage ?? []).length > 2 && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          +{(po.kabupaten_coverage ?? []).length - 2}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={po.status === 'active'}
                        onCheckedChange={() => handleToggle(po)}
                        className="scale-90"
                      />
                      <span className={po.status === 'active' ? 'text-green-500 text-xs' : 'text-muted-foreground text-xs'}>
                        {po.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(po)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(po)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <POForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
        defaultValues={editTarget}
        isLoading={addPO.isPending || updatePO.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus PO?</AlertDialogTitle>
            <AlertDialogDescription>
              PO <span className="font-medium text-foreground">"{deleteTarget?.name}"</span> akan dihapus permanen.
              Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
