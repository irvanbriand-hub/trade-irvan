import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { PlatformIcon } from "@/components/content-tracker/PlatformIcon";
import { useContentPages, useCreateContentPage, useUpdateContentPage, useDeleteContentPage, type ContentPage } from "@/hooks/useContentPages";
import { PLATFORMS, PLATFORM_META, platformMeta, CONTENT_TYPES, type Platform } from "@/lib/content-tracker";

function PageDialog({ open, onOpenChange, page, brands }: { open: boolean; onOpenChange: (o: boolean) => void; page: ContentPage | null; brands: string[] }) {
  const create = useCreateContentPage();
  const update = useUpdateContentPage();
  const isEdit = !!page;

  const [platform, setPlatform] = useState<Platform>("facebook");
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [contentType, setContentType] = useState<string>("Post");
  const [handle, setHandle] = useState("");
  const [color, setColor] = useState(PLATFORM_META.facebook.color);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (page) {
      setPlatform(page.platform as Platform);
      setBrand(page.brand ?? "");
      setName(page.name);
      setContentType(page.content_type ?? "Post");
      setHandle(page.handle ?? "");
      setColor(page.color ?? platformMeta(page.platform).color);
      setIsActive(page.is_active);
    } else {
      setPlatform("facebook");
      setBrand("");
      setName("");
      setContentType("Post");
      setHandle("");
      setColor(PLATFORM_META.facebook.color);
      setIsActive(true);
    }
  }, [open, page]);

  const submitting = create.isPending || update.isPending;

  const handleSubmit = async () => {
    if (!name.trim()) return toast({ title: "Nama halaman wajib diisi", variant: "destructive" });
    const payload = { platform, brand: brand.trim() || null, name: name.trim(), content_type: contentType, handle: handle.trim() || null, color, is_active: isActive };
    try {
      if (isEdit && page) {
        await update.mutateAsync({ id: page.id, ...payload });
        toast({ title: "Halaman diperbarui" });
      } else {
        await create.mutateAsync(payload);
        toast({ title: "Halaman ditambahkan" });
      }
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Gagal menyimpan", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Halaman" : "Tambah Halaman"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Brand / Project</Label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="mis. Amaze_Transform"
              list="content-brand-list"
            />
            <datalist id="content-brand-list">
              {brands.map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select
              value={platform}
              onValueChange={(v) => {
                const p = v as Platform;
                setPlatform(p);
                // Set warna default platform bila belum diubah manual / saat create
                if (!isEdit) setColor(PLATFORM_META[p].color);
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-2"><PlatformIcon platform={p} /> {PLATFORM_META[p].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nama halaman <span className="text-rose-500">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Tips Trading IDX" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipe konten</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Handle / URL (opsional)</Label>
            <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@username" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1.5">
              <Label>Warna</Label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-16 rounded border border-border bg-transparent cursor-pointer" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm">Aktif</span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? "Menyimpan..." : "Simpan"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContentPagesManager() {
  const { data: pages } = useContentPages();
  const del = useDeleteContentPage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPage, setEditPage] = useState<ContentPage | null>(null);
  const [confirmDel, setConfirmDel] = useState<ContentPage | null>(null);

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await del.mutateAsync(confirmDel.id);
      toast({ title: "Halaman dihapus" });
      setConfirmDel(null);
    } catch (e) {
      toast({ title: "Gagal hapus", description: (e as Error).message, variant: "destructive" });
    }
  };

  const NO_BRAND = "Lainnya";
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ContentPage[]>();
    for (const p of pages ?? []) {
      const key = p.brand?.trim() || NO_BRAND;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(p);
    }
    return order.map((brand) => ({ brand, pages: map.get(brand)! }));
  }, [pages]);

  const brandSuggestions = useMemo(
    () => Array.from(new Set((pages ?? []).map((p) => p.brand?.trim()).filter(Boolean) as string[])),
    [pages],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(pages ?? []).length} halaman</p>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditPage(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Tambah Halaman
        </Button>
      </div>

      {(pages ?? []).length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">Belum ada halaman. Tambah halaman untuk mulai menjadwalkan konten.</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.brand} className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                {group.brand}
                <span className="text-xs font-normal text-muted-foreground">({group.pages.length})</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.pages.map((p) => (
                  <Card key={p.id} className={p.is_active ? "" : "opacity-60"}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: p.color ?? platformMeta(p.platform).color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon platform={p.platform} size={15} />
                          <span className="text-sm font-semibold truncate">{p.name}</span>
                          {p.content_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{p.content_type}</span>}
                          {!p.is_active && <span className="text-[10px] text-muted-foreground">(nonaktif)</span>}
                        </div>
                        {p.handle && <div className="text-xs text-muted-foreground truncate">{p.handle}</div>}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" asChild title="Detail">
                          <Link to={`../page/${p.id}`}><ChevronRight className="h-4 w-4" /></Link>
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => { setEditPage(p); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" title="Hapus" onClick={() => setConfirmDel(p)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PageDialog open={dialogOpen} onOpenChange={setDialogOpen} page={editPage} brands={brandSuggestions} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus halaman "{confirmDel?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Semua slot jadwal milik halaman ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={del.isPending}>
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
