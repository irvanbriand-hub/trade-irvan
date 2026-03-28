import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useCategories } from "@/hooks/useCategories";
import {
  useWatchlistRekomendasi,
  useAddWatchlistRekomendasi,
  useUpdateWatchlistRekomendasi,
  useDeleteWatchlistRekomendasi,
} from "@/hooks/useWatchlistRekomendasi";

export default function WatchlistRekomendasi() {
  const { data: wlItems = [], isLoading } = useWatchlistRekomendasi();
  const { data: categories = [] } = useCategories();
  const addMutation = useAddWatchlistRekomendasi();
  const updateMutation = useUpdateWatchlistRekomendasi();
  const deleteMutation = useDeleteWatchlistRekomendasi();

  const [ticker, setTicker] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [entryDate, setEntryDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editTicker, setEditTicker] = useState("");
  const [editCategoryId, setEditCategoryId] = useState<string>("");
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editNotes, setEditNotes] = useState("");

  const handleAdd = async () => {
    if (!ticker.trim()) {
      toast({ title: "Ticker wajib diisi", variant: "destructive" });
      return;
    }
    try {
      await addMutation.mutateAsync({
        ticker: ticker.toUpperCase().trim(),
        category_id: categoryId || null,
        entry_date: format(entryDate, "yyyy-MM-dd"),
        notes: notes.trim() || null,
      });
      setTicker("");
      setCategoryId("");
      setEntryDate(new Date());
      setNotes("");
      toast({ title: "Berhasil ditambahkan ke WL Rekomendasi" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const startEdit = (item: any) => {
    setEditId(item.id);
    setEditTicker(item.ticker);
    setEditCategoryId(item.category_id || "");
    setEditDate(new Date(item.entry_date));
    setEditNotes(item.notes || "");
  };

  const handleUpdate = async () => {
    if (!editId) return;
    try {
      await updateMutation.mutateAsync({
        id: editId,
        ticker: editTicker.toUpperCase().trim(),
        category_id: editCategoryId || null,
        entry_date: format(editDate, "yyyy-MM-dd"),
        notes: editNotes.trim() || null,
      });
      setEditId(null);
      toast({ title: "WL Rekomendasi diperbarui" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Dihapus dari WL Rekomendasi" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const getCategoryName = (catId: string | null) => {
    if (!catId) return "—";
    return categories.find((c) => c.id === catId)?.name || "—";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Watchlist Rekomendasi</h1>

      {/* Add Form */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Plus className="h-4 w-4" /> Tambah WL Rekomendasi
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Input
            placeholder="Ticker (contoh: BBCA)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="uppercase"
          />
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih Kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-start text-left font-normal", !entryDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {entryDate ? format(entryDate, "dd/MM/yyyy") : "Pilih tanggal"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={entryDate} onSelect={(d) => d && setEntryDate(d)} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Button onClick={handleAdd} disabled={addMutation.isPending} className="w-full sm:w-auto">
            {addMutation.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
        <Textarea placeholder="Notes (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Memuat data...</div>
      ) : wlItems.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">Belum ada WL Rekomendasi</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Ticker</th>
                <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground">Kategori</th>
                <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground hidden sm:table-cell">Tanggal Masuk</th>
                <th className="p-3 text-left text-xs font-semibold uppercase text-muted-foreground hidden md:table-cell">Notes</th>
                <th className="p-3 text-center text-xs font-semibold uppercase text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {wlItems.map((item, i) => (
                <tr key={item.id} className={cn("border-b border-border/50 transition-colors hover:bg-accent/50", i % 2 === 0 ? "bg-card" : "bg-card/50")}>
                  {editId === item.id ? (
                    <>
                      <td className="p-2">
                        <Input value={editTicker} onChange={(e) => setEditTicker(e.target.value)} className="h-8 text-xs uppercase" />
                      </td>
                      <td className="p-2">
                        <Select value={editCategoryId} onValueChange={setEditCategoryId}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 hidden sm:table-cell">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                              <CalendarIcon className="mr-1 h-3 w-3" />
                              {format(editDate, "dd/MM/yyyy")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={editDate} onSelect={(d) => d && setEditDate(d)} className="p-3 pointer-events-auto" />
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="p-2 hidden md:table-cell">
                        <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="h-8 text-xs" />
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleUpdate} disabled={updateMutation.isPending}>
                            <Save className="h-3.5 w-3.5 text-gain" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}>
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="p-3 font-bold font-mono text-foreground">{item.ticker}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className="text-[10px]">{getCategoryName(item.category_id)}</Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">
                        {format(new Date(item.entry_date), "dd/MM/yyyy")}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[200px]">{item.notes || "—"}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(item)}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(item.id)} disabled={deleteMutation.isPending}>
                            <Trash2 className="h-3.5 w-3.5 text-loss" />
                          </Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
