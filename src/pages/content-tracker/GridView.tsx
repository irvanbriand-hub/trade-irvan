import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDate, getDay, isSameDay,
  addMonths, subMonths, format,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { ChevronLeft, ChevronRight, ChevronDown, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { GridCell } from "@/components/content-tracker/GridCell";
import { CellDayEditor } from "@/components/content-tracker/CellDayEditor";
import { SlotRow } from "@/components/content-tracker/SlotRow";
import { PlatformIcon } from "@/components/content-tracker/PlatformIcon";
import { useContentPages, type ContentPage } from "@/hooks/useContentPages";
import { useMonthGrid, useBulkSetStatus, type GridSlot, type ContentScheduleWithPage } from "@/hooks/useContentSchedules";
import { cellSummary, platformMeta, PLATFORMS } from "@/lib/content-tracker";

export default function ContentGridView() {
  const [cursor, setCursor] = useState(new Date());
  const [platform, setPlatform] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editorPage, setEditorPage] = useState<ContentPage | null>(null);
  const [editorDay, setEditorDay] = useState<Date | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dayMassDay, setDayMassDay] = useState<Date | null>(null);
  const [dayMassOpen, setDayMassOpen] = useState(false);

  const { data: pages } = useContentPages();
  const bulkStatus = useBulkSetStatus();

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = useMemo(() => eachDayOfInterval({ start: monthStart, end: monthEnd }), [monthStart, monthEnd]);

  const { data: slots, isLoading } = useMonthGrid({
    from: monthStart.toISOString(),
    to: monthEnd.toISOString(),
  });

  // Lookup: pageId -> (dayNumber -> slots[])
  const lookup = useMemo(() => {
    const map = new Map<string, Map<number, GridSlot[]>>();
    for (const s of slots ?? []) {
      const dayNum = getDate(new Date(s.scheduled_at));
      let inner = map.get(s.page_id);
      if (!inner) { inner = new Map(); map.set(s.page_id, inner); }
      const arr = inner.get(dayNum);
      if (arr) arr.push(s);
      else inner.set(dayNum, [s]);
    }
    return map;
  }, [slots]);

  const rows = useMemo(
    () => (pages ?? []).filter((p) => platform === "all" || p.platform === platform),
    [pages, platform],
  );

  // Kelompokkan channel per brand (urutan mengikuti sort dari useContentPages)
  const NO_BRAND = "Lainnya";
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ContentPage[]>();
    for (const p of rows) {
      const key = p.brand?.trim() || NO_BRAND;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(p);
    }
    return order.map((brand) => ({ brand, pages: map.get(brand)! }));
  }, [rows]);

  const toggleBrand = (brand: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(brand) ? next.delete(brand) : next.add(brand);
      return next;
    });

  // Label baris: tonjolkan platform (brand sudah jadi header). Kalau nama channel
  // beda dari brand (channel ad-hoc), tampilkan nama itu.
  const rowLabel = (page: ContentPage) =>
    page.name && page.name !== page.brand ? page.name : platformMeta(page.platform).label;

  const openCell = (page: ContentPage, day: Date) => {
    setEditorPage(page);
    setEditorDay(day);
    setEditorOpen(true);
  };

  const openDayMass = (day: Date) => {
    setDayMassDay(day);
    setDayMassOpen(true);
  };

  // Slot di hari yang dipilih (semua channel) — di-filter di client dari grid lookup
  const dayMassSlots = useMemo(() => {
    if (!dayMassDay) return [] as GridSlot[];
    const dayNum = getDate(dayMassDay);
    const monthMatch = dayMassDay.getMonth() === cursor.getMonth() && dayMassDay.getFullYear() === cursor.getFullYear();
    if (!monthMatch) return [];
    const out: GridSlot[] = [];
    for (const row of rows) {
      const inner = lookup.get(row.id);
      const dayArr = inner?.get(dayNum);
      if (dayArr) out.push(...dayArr);
    }
    return out.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  }, [dayMassDay, cursor, rows, lookup]);

  // Untuk SlotRow butuh ContentScheduleWithPage — kita merge dengan pages
  const dayMassSlotsWithPage = useMemo<ContentScheduleWithPage[]>(
    () =>
      dayMassSlots.map((s) => {
        const p = (pages ?? []).find((pg) => pg.id === s.page_id);
        return {
          ...s,
          user_id: "",
          created_at: "",
          updated_at: "",
          bulk_batch_id: null,
          content_pages: p
            ? { id: p.id, name: p.name, platform: p.platform, color: p.color }
            : null,
        } as ContentScheduleWithPage;
      }),
    [dayMassSlots, pages],
  );

  const dayMassPendingIds = useMemo(
    () => dayMassSlots.filter((s) => s.status !== "posted").map((s) => s.id),
    [dayMassSlots],
  );

  const dayMassMarkAllDone = async () => {
    if (dayMassPendingIds.length === 0) return;
    try {
      await bulkStatus.mutateAsync({ ids: dayMassPendingIds, status: "posted" });
      toast({ title: `${dayMassPendingIds.length} post ditandai Posted` });
    } catch (e) {
      toast({ title: "Gagal update", description: (e as Error).message, variant: "destructive" });
    }
  };

  const colCount = days.length + 1;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[140px] text-center">
            {format(cursor, "MMMM yyyy", { locale: idLocale })}
          </span>
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>Hari ini</Button>
        </div>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua platform</SelectItem>
            {PLATFORMS.map((p) => (
              <SelectItem key={p} value={p}>
                <span className="flex items-center gap-2"><PlatformIcon platform={p} /> {platformMeta(p).label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500/30" /> DONE</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-500/25" /> Schedule</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" /> NY (kosong)</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded ring-1 ring-inset ring-amber-500/60" /> ada yang overdue</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-500/15" /> Weekend (Sab/Min)</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Belum ada channel. <Link to="../pages" className="text-primary underline">Tambah channel dulu</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-card border-b border-r border-border px-3 py-2 text-left text-xs font-semibold min-w-[180px]">
                  Channel
                </th>
                {days.map((d) => {
                  const today = isSameDay(d, new Date());
                  const dow = getDay(d); // 0=Min, 6=Sab
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <th
                      key={d.toISOString()}
                      className={`border-b border-border p-0 text-center text-[11px] font-medium tabular-nums min-w-[34px] ${
                        weekend ? "bg-rose-500/10 text-rose-500" : today ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => openDayMass(d)}
                        title="Aksi massal untuk tanggal ini (semua channel)"
                        className="w-full h-full px-0.5 py-2 hover:bg-accent/50 transition-colors cursor-pointer"
                      >
                        {getDate(d)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isCollapsed = collapsed.has(group.brand);
                return (
                  <React.Fragment key={group.brand}>
                    {/* Header brand (collapse/expand) */}
                    <tr className="bg-muted/40">
                      <td colSpan={colCount} className="p-0 border-b border-border">
                        <button
                          onClick={() => toggleBrand(group.brand)}
                          className="sticky left-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold bg-muted/40 hover:bg-muted/70 transition-colors w-max"
                        >
                          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          {group.brand}
                          <span className="text-xs font-normal text-muted-foreground">({group.pages.length})</span>
                        </button>
                      </td>
                    </tr>

                    {/* Baris channel */}
                    {!isCollapsed && group.pages.map((page) => {
                      const meta = platformMeta(page.platform);
                      const inner = lookup.get(page.id);
                      return (
                        <tr key={page.id} className="hover:bg-accent/30">
                          <td className="sticky left-0 z-10 bg-card border-r border-b border-border pl-6 pr-3 py-1.5 min-w-[180px]">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: page.color ?? meta.color }} />
                              <PlatformIcon platform={page.platform} size={15} />
                              <span className="text-sm truncate">{rowLabel(page)}</span>
                              {page.content_type && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{page.content_type}</span>
                              )}
                            </div>
                          </td>
                          {days.map((d) => {
                            const daySlots = inner?.get(getDate(d)) ?? [];
                            const summary = cellSummary(daySlots);
                            const dow = getDay(d);
                            const weekend = dow === 0 || dow === 6;
                            return (
                              <td
                                key={d.toISOString()}
                                className={`border-b border-border/50 p-0.5 ${weekend ? "bg-rose-500/5" : ""}`}
                              >
                                <GridCell
                                  summary={summary}
                                  isToday={isSameDay(d, new Date())}
                                  onClick={() => openCell(page, d)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Memuat data…</p>}

      <CellDayEditor open={editorOpen} onOpenChange={setEditorOpen} page={editorPage} day={editorDay} />

      {/* Sheet aksi massal per hari (semua channel) */}
      <Sheet open={dayMassOpen} onOpenChange={setDayMassOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {dayMassDay && format(dayMassDay, "EEEE, dd MMMM yyyy", { locale: idLocale })}
            </SheetTitle>
            <SheetDescription>
              Aksi massal lintas semua channel pada hari ini.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-2">
            <Button
              size="sm"
              variant="default"
              className="w-full gap-1.5"
              onClick={dayMassMarkAllDone}
              disabled={bulkStatus.isPending || dayMassPendingIds.length === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Tandai Semua DONE {dayMassPendingIds.length > 0 ? `(${dayMassPendingIds.length})` : ""}
            </Button>

            {dayMassSlotsWithPage.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Belum ada slot di hari ini.
              </p>
            ) : (
              <div className="space-y-2 pt-1">
                {dayMassSlotsWithPage.map((s) => (
                  <SlotRow key={s.id} slot={s} />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
