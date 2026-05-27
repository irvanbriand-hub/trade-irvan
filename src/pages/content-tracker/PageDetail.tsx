import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SlotRow } from "@/components/content-tracker/SlotRow";
import { SlotFormDialog } from "@/components/content-tracker/SlotFormDialog";
import { useContentPages } from "@/hooks/useContentPages";
import { useContentSchedules, type ContentScheduleWithPage } from "@/hooks/useContentSchedules";
import { deriveStatus, platformMeta } from "@/lib/content-tracker";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function ContentPageDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: pages } = useContentPages();
  const { data: slots } = useContentSchedules({ pageId: id });
  const [formOpen, setFormOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<ContentScheduleWithPage | null>(null);

  const page = (pages ?? []).find((p) => p.id === id);

  const { upcoming, history, stats, lastPosted } = useMemo(() => {
    const now = new Date();
    const rows = slots ?? [];
    const up = rows.filter((r) => new Date(r.scheduled_at) >= now && r.status === "scheduled");
    const hist = rows.filter((r) => !(new Date(r.scheduled_at) >= now && r.status === "scheduled"))
      .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
    const posted = rows.filter((r) => r.status === "posted").sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
    return {
      upcoming: up,
      history: hist,
      lastPosted: posted[0] ?? null,
      stats: {
        posted: posted.length,
        missed: rows.filter((r) => r.status === "missed").length,
        pending: rows.filter((r) => deriveStatus(r) === "pending").length,
        scheduled: rows.filter((r) => deriveStatus(r) === "scheduled").length,
      },
    };
  }, [slots]);

  if (!page) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="gap-1.5"><Link to="../pages"><ArrowLeft className="h-4 w-4" /> Kembali</Link></Button>
        <p className="text-sm text-muted-foreground">Halaman tidak ditemukan.</p>
      </div>
    );
  }

  const meta = platformMeta(page.platform);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="gap-1.5"><Link to="../pages"><ArrowLeft className="h-4 w-4" /> Halaman</Link></Button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: page.color ?? meta.color }} />
        <div className="min-w-0">
          <h2 className="text-lg font-bold truncate">{meta.emoji} {page.name}</h2>
          <p className="text-xs text-muted-foreground">
            {meta.label}{page.handle ? ` • ${page.handle}` : ""}
            {lastPosted ? ` • Terakhir post: ${format(new Date(lastPosted.scheduled_at), "dd MMM yyyy", { locale: idLocale })}` : " • Belum ada post"}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold tabular-nums text-blue-500">{stats.scheduled}</div><div className="text-[11px] text-muted-foreground">Terjadwal</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold tabular-nums text-amber-500">{stats.pending}</div><div className="text-[11px] text-muted-foreground">Pending</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold tabular-nums text-emerald-500">{stats.posted}</div><div className="text-[11px] text-muted-foreground">Posted</div></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><div className="text-lg font-bold tabular-nums text-rose-500">{stats.missed}</div><div className="text-[11px] text-muted-foreground">Missed</div></CardContent></Card>
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Akan Datang ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada slot mendatang.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((s) => <SlotRow key={s.id} slot={s} showDate onEdit={(slot) => { setEditSlot(slot); setFormOpen(true); }} />)}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Riwayat ({history.length})</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
        ) : (
          <div className="space-y-2">
            {history.map((s) => <SlotRow key={s.id} slot={s} showDate onEdit={(slot) => { setEditSlot(slot); setFormOpen(true); }} />)}
          </div>
        )}
      </div>

      <SlotFormDialog open={formOpen} onOpenChange={setFormOpen} slot={editSlot} defaultPageId={page.id} />
    </div>
  );
}
