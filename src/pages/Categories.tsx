import { useState } from "react";
import { useCategories, useAddCategory, useUpdateCategory, useDeleteCategory } from "@/hooks/useCategories";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Categories() {
  const { data: categories, isLoading } = useCategories();
  const addCategory = useAddCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    addCategory.mutate(newName.trim(), {
      onSuccess: () => { setNewName(""); toast({ title: "Kategori ditambahkan" }); },
    });
  };

  const handleUpdate = (id: string) => {
    if (!editName.trim()) return;
    updateCategory.mutate({ id, name: editName.trim() }, {
      onSuccess: () => { setEditId(null); toast({ title: "Kategori diperbarui" }); },
    });
  };

  const handleDelete = (id: string) => {
    deleteCategory.mutate(id, {
      onSuccess: () => toast({ title: "Kategori dihapus" }),
    });
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Manajemen Kategori</h1>

      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Tambah Kategori Baru</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Nama kategori (misal: Day Trading - BPJS)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="text-sm"
            />
            <Button onClick={handleAdd} disabled={addCategory.isPending}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daftar Kategori</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Memuat...</p>
          ) : categories && categories.length > 0 ? (
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center gap-2 p-3 rounded-lg bg-accent/30 border border-border">
                  {editId === c.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="text-sm flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(c.id)}
                      />
                      <Button size="icon" className="h-8 w-8" onClick={() => handleUpdate(c.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-foreground">{c.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => { setEditId(c.id); setEditName(c.name); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleDelete(c.id)}
                      >
                        <Trash2 className="h-3 w-3 text-loss" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground text-sm">Belum ada kategori</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
