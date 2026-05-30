import { useMemo, useState } from "react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlotRow } from "@/components/content-tracker/SlotRow";
import { SlotFormDialog } from "@/components/content-tracker/SlotFormDialog";
import { BulkActionsBar } from "@/components/content-tracker/BulkActionsBar";
import { PageSelect } from "@/components/content-tracker/PageSelect";
import { PlatformIcon } from "@/components/content-tracker/PlatformIcon";
import { useContentSchedules, type ContentScheduleWithPage } from "@/hooks/useContentSchedules";
import { useContentPages } from "@/hooks/useContentPages";
import { deriveStatus, platformMeta, PLATFORMS, type DerivedStatus } from "@/lib/content-tracker";

const STATUS_OPTIONS: { value: DerivedStatus | "all"; label: string }[] = [
  { value: "all", label: "Semua status" },
  { value: "scheduled", label: "Terjadwal" },
  { value: "pending", label: "Pending Konfirmasi" },
  { value: "posted", label: "Posted" },
  { value: "missed", label: "Missed" },
];

function isoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function ContentListView() {
  const now = new Date();
  const [from, setFrom] = useState(isoDate(startOfMonth(now)));
  const [to, setTo] = useState(isoDate(endOfMonth(now)));
  const [platform, setPlatform] = useState<string>("all");
  const [pageId, setPageId] = useState<string>("all");
  const [status, setStatus] = useState<DerivedStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editSlot, setEditSlot] = useState<ContentScheduleWithPage | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data: pages } = useContentPages();

  const { data: slots } = useContentSchedules({
    from: new Date(`${from}T00:00:00`).toISOString(),
    to: new Date(`${to}T23:59:59`).toISOString(),
    pageId: pageId === "all" ? undefined : pageId,
  });

  const filtered = useMemo(() => {
    let rows = slots ?? [];
    if (platform !== "all") rows = rows.filter((r) => r.content_pages?.platform === platform);
    if (status !== "all") rows = rows.filter((r) => deriveStatus(r) === status);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => (r.title ?? "").toLowerCase().includes(q) || (r.notes ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [slots, platform, status, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.id));
      return next;
    });
  };

  // Bersihkan id terpilih yang sudah tidak ada di hasil (mis. setelah dihapus)
  const selectedIds = useMemo(
    () => Array.from(selected).filter((id) => (slots ?? []).some((s) => s.id === id)),
    [selected, slots],
  );

  return (
    <div className="space-y-4 pb-20">
      {/* Filters */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Dari</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sampai</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {PLATFORMS.map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="flex items-center gap-2"><PlatformIcon platform={p} /> {platformMeta(p).label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Channel</Label>
          <PageSelect value={pageId} onValueChange={setPageId} pages={pages ?? []} includeAll allLabel="Semua" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as DerivedStatus | "all")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Cari judul</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="judul / catatan" />
          </div>
        </div>
      </div>

      {/* Select-all + count */}
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Pilih semua" />
          <span className="text-muted-foreground">{filtered.length} slot</span>
        </label>
        {selectedIds.length > 0 && (
          <button className="text-xs text-primary" onClick={() => setSelected(new Set())}>Bersihkan pilihan</button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-10">Tidak ada slot pada filter ini.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <SlotRow
              key={s.id}
              slot={s}
              showDate
              selected={selected.has(s.id)}
              onToggleSelect={toggle}
              onEdit={(slot) => { setEditSlot(slot); setFormOpen(true); }}
            />
          ))}
        </div>
      )}

      <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelected(new Set())} />

      <SlotFormDialog open={formOpen} onOpenChange={setFormOpen} slot={editSlot} />
    </div>
  );
}
