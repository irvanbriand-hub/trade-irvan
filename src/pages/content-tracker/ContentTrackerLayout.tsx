import { useState } from "react";
import { Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { Plus, CalendarPlus, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToastAction } from "@/components/ui/toast";
import { SlotFormDialog } from "@/components/content-tracker/SlotFormDialog";
import { BulkScheduleDialog } from "@/components/content-tracker/BulkScheduleDialog";
import { BulkAddRowsDialog } from "@/components/content-tracker/BulkAddRowsDialog";
import { toast } from "@/hooks/use-toast";
import { useBulkDeleteSchedules } from "@/hooks/useContentSchedules";
import ContentDashboard from "./Dashboard";
import ContentCalendarView from "./CalendarView";
import ContentGridView from "./GridView";
import ContentListView from "./ListView";
import ContentPageDetail from "./PageDetail";
import ContentPagesManager from "./PagesManager";

const tabs = [
  { to: "dashboard", label: "Dashboard", icon: "📊" },
  { to: "grid", label: "Grid", icon: "▦" },
  { to: "calendar", label: "Kalender", icon: "🗓️" },
  { to: "list", label: "List", icon: "📋" },
  { to: "pages", label: "Halaman", icon: "📱" },
];

function Tabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const isActive = pathname.includes(`/content-tracker/${tab.to}`);
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={[
              "flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground",
            ].join(" ")}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function ContentTrackerLayout() {
  const [slotOpen, setSlotOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRowsOpen, setBulkRowsOpen] = useState(false);
  const bulkDelete = useBulkDeleteSchedules();

  // Undo batch terakhir hasil generate
  const undoBatch = async (batchId: string) => {
    try {
      await bulkDelete.mutateAsync({ batchId });
      toast({ title: "Batch dibatalkan" });
    } catch (e) {
      toast({ title: "Gagal membatalkan", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">📅</span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Content Tracker</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Jadwal & checklist posting konten</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkOpen(true)}>
            <CalendarPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Generate Massal</span>
            <span className="sm:hidden">Generate</span>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkRowsOpen(true)}>
            <ListPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Plan Mingguan</span>
            <span className="sm:hidden">Plan</span>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setSlotOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tambah Slot</span>
            <span className="sm:hidden">Slot</span>
          </Button>
        </div>
      </div>

      <Tabs />

      <div className="pt-2">
        <Routes>
          <Route path="/" element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<ContentDashboard />} />
          <Route path="grid" element={<ContentGridView />} />
          <Route path="calendar" element={<ContentCalendarView />} />
          <Route path="list" element={<ContentListView />} />
          <Route path="pages" element={<ContentPagesManager />} />
          <Route path="page/:id" element={<ContentPageDetail />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </div>

      <SlotFormDialog open={slotOpen} onOpenChange={setSlotOpen} multi />
      <BulkAddRowsDialog
        open={bulkRowsOpen}
        onOpenChange={setBulkRowsOpen}
        onCreated={(batchId, count) => {
          toast({
            title: `${count} slot dibuat`,
            description: "Batalkan batch ini bila keliru.",
            action: (
              <ToastAction altText="Urungkan" onClick={() => undoBatch(batchId)}>
                Urungkan
              </ToastAction>
            ),
          });
        }}
      />
      <BulkScheduleDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onGenerated={(batchId, count) => {
          // BulkScheduleDialog sudah menampilkan toast sukses; di sini tawarkan undo.
          toast({
            title: `${count} slot dibuat`,
            description: "Batalkan batch ini bila keliru.",
            action: (
              <ToastAction altText="Urungkan" onClick={() => undoBatch(batchId)}>
                Urungkan
              </ToastAction>
            ),
          });
        }}
      />
    </div>
  );
}
