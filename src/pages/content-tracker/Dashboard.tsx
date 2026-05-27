import { useMemo } from "react";
import { Link } from "react-router-dom";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { PageBadge } from "@/components/content-tracker/PageBadge";
import { PlatformIcon } from "@/components/content-tracker/PlatformIcon";
import { useContentSchedules, useUpcomingSchedules } from "@/hooks/useContentSchedules";
import { useContentPages } from "@/hooks/useContentPages";
import { deriveStatus, platformMeta, PLATFORMS } from "@/lib/content-tracker";

function Kpi({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: number; className?: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className={`flex items-center gap-2 text-xs sm:text-sm ${className ?? "text-muted-foreground"}`}>
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ContentDashboard() {
  const now = new Date();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();

  const { data: pages } = useContentPages();
  const { data: monthSlots } = useContentSchedules({ from: monthStart, to: monthEnd });
  const { data: pending } = useContentSchedules({ status: "scheduled", to: now.toISOString() });
  const { data: upcoming } = useUpcomingSchedules(7);

  const stats = useMemo(() => {
    const rows = monthSlots ?? [];
    return {
      scheduled: rows.filter((r) => deriveStatus(r) === "scheduled").length,
      posted: rows.filter((r) => r.status === "posted").length,
      missed: rows.filter((r) => r.status === "missed").length,
    };
  }, [monthSlots]);

  const pendingCount = pending?.length ?? 0;

  // Ringkasan per platform (bulan ini)
  const perPlatform = useMemo(() => {
    const rows = monthSlots ?? [];
    return PLATFORMS.map((p) => {
      const platSlots = rows.filter((r) => r.content_pages?.platform === p);
      return {
        platform: p,
        total: platSlots.length,
        posted: platSlots.filter((r) => r.status === "posted").length,
        pages: (pages ?? []).filter((pg) => pg.platform === p).length,
      };
    }).filter((x) => x.pages > 0 || x.total > 0);
  }, [monthSlots, pages]);

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<CalendarClock className="h-4 w-4" />} label="Terjadwal (bln ini)" value={stats.scheduled} />
        <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Pending Konfirmasi" value={pendingCount} className="text-amber-500" />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Posted (bln ini)" value={stats.posted} className="text-emerald-500" />
        <Kpi icon={<XCircle className="h-4 w-4" />} label="Missed (bln ini)" value={stats.missed} className="text-rose-500" />
      </div>

      {/* Per platform */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Ringkasan Platform (bulan ini)</h2>
        {perPlatform.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada halaman. <Link to="../pages" className="text-primary underline">Tambah halaman dulu</Link>.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {perPlatform.map((p) => {
              const meta = platformMeta(p.platform);
              return (
                <Card key={p.platform}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1.5"><PlatformIcon platform={p.platform} /> {meta.label}</span>
                      <span className="text-xs text-muted-foreground">{p.pages} halaman</span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-xl font-bold tabular-nums text-emerald-500">{p.posted}</span>
                      <span className="text-xs text-muted-foreground">/ {p.total} posted</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming 7 hari */}
      <div>
        <h2 className="text-sm font-semibold mb-2">Akan Datang (7 hari)</h2>
        {(upcoming ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Tidak ada slot terjadwal dalam 7 hari ke depan.</p>
        ) : (
          <div className="space-y-2">
            {(upcoming ?? []).map((s) => (
              <Card key={s.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums whitespace-nowrap">
                    {format(new Date(s.scheduled_at), "dd MMM HH:mm", { locale: idLocale })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                  {s.content_pages && (
                    <PageBadge platform={s.content_pages.platform} name={s.content_pages.name} color={s.content_pages.color} />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
