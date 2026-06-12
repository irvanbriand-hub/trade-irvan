import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { Trash2, BarChart3, LogOut } from 'lucide-react';
import { NOCProvider } from '@/lib/noc/hooks/useNOC';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { useAuth } from '@/hooks/useAuth';
import { canAccessTradingApp, displayName } from '@/lib/noc-auth';
import { TsvUploader } from '@/components/noc/TsvUploader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import NocDashboard from './NocDashboard';
import NocRecap from './NocRecap';
import NocGenerate from './NocGenerate';
import NocPO from './NocPO';
import NocSettings from './NocSettings';
import NOCCapturePage from './NOCCapturePage';
import NOCSCurve from './NOCSCurve';
import NOCSCurveCapture from './NOCSCurveCapture';
import NOCSCurveCaptureGrid from './NOCSCurveCaptureGrid';
import NOCRtgs from './NOCRtgs';
import NOCRtgsCapture from './NOCRtgsCapture';
import UbiquDirumaPage from '@/features/ubiqu-diruma/pages/UbiquDirumaPage';
import UbiquDirumaCapture from './UbiquDirumaCapture';

const tabs = [
  { to: 'dashboard', label: 'Dashboard', icon: '📊' },
  { to: 'recap', label: 'Rekap', icon: '📋' },
  { to: 'scurve', label: 'S-Curve', icon: '📈' },
  { to: 'rtgs', label: 'RTGS', icon: '📌' },
  { to: 'ubiqu-diruma', label: 'UBIQU', icon: '🏠' },
  { to: 'generate', label: 'Generate', icon: '💬' },
  { to: 'po', label: 'PO', icon: '👤' },
  { to: 'settings', label: 'Settings', icon: '⚙️' },
];

function NocTabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
      {tabs.map((tab) => {
        const isActive = pathname.endsWith(`/noc/${tab.to}`) || pathname === `/noc/${tab.to}`;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={[
              'flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground',
            ].join(' ')}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </NavLink>
        );
      })}
    </div>
  );
}

function ResetDataButton() {
  const { resetData } = useNOC();
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    setResetting(true);
    try {
      await resetData();
    } finally {
      setResetting(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5" disabled={resetting}>
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {resetting ? 'Menghapus...' : 'Reset Data'}
          </span>
          <span className="sm:hidden">
            {resetting ? '...' : 'Reset'}
          </span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus semua data TT?</AlertDialogTitle>
          <AlertDialogDescription>
            Semua data trouble ticket di database akan dihapus, termasuk edit manual target online
            dan catatan reschedule yang belum disimpan ulang. Aksi ini tidak bisa dibatalkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReset}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Hapus Semua
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Tombol Trade Journal — hanya untuk owner (akun NOC-only tidak punya akses).
function TradeJournalButton() {
  const { user } = useAuth();
  if (!canAccessTradingApp(user?.email)) return null;
  return (
    <Button variant="outline" size="sm" className="gap-1.5" asChild>
      <Link to="/journal">
        <BarChart3 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Trade Journal</span>
        <span className="sm:hidden">Journal</span>
      </Link>
    </Button>
  );
}

// Identitas user + logout.
function UserMenu() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline text-xs text-muted-foreground max-w-[140px] truncate">
        {displayName(user?.email)}
      </span>
      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => signOut()}>
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Keluar</span>
      </Button>
    </div>
  );
}

function NocInner() {
  const { pathname } = useLocation();
  const isPOPage = pathname.endsWith('/po');
  const isSettingsPage = pathname.endsWith('/settings');
  const isRtgsPage = pathname.endsWith('/rtgs');
  const isUbiquPage = pathname.endsWith('/ubiqu-diruma');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl flex-shrink-0">📡</span>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">NOC Dashboard</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Monitoring trouble ticket jaringan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <TradeJournalButton />
          <ResetDataButton />
          <UserMenu />
        </div>
      </div>

      {/* TSV Uploader — hidden on PO, Settings, RTGS, dan UBIQU page */}
      {!isPOPage && !isSettingsPage && !isRtgsPage && !isUbiquPage && (
        <TsvUploader />
      )}

      {/* Tabs */}
      <NocTabs />

      {/* Content */}
      <div className="pt-2">
        <Routes>
          <Route path="/" element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<NocDashboard />} />
          <Route path="recap" element={<NocRecap />} />
          <Route path="scurve" element={<NOCSCurve />} />
          <Route path="rtgs" element={<NOCRtgs />} />
          <Route path="ubiqu-diruma" element={<UbiquDirumaPage />} />
          <Route path="generate" element={<NocGenerate />} />
          <Route path="po" element={<NocPO />} />
          <Route path="settings" element={<NocSettings />} />
        </Routes>
      </div>
    </div>
  );
}

export default function NocLayout() {
  return (
    <NOCProvider>
      <Routes>
        <Route path="capture" element={<NOCCapturePage />} />
        <Route path="scurve-capture" element={<NOCSCurveCapture />} />
        <Route path="scurve-capture-grid" element={<NOCSCurveCaptureGrid />} />
        <Route path="rtgs-capture" element={<NOCRtgsCapture />} />
        <Route path="ubiqu-diruma-capture" element={<UbiquDirumaCapture />} />
        <Route path="*" element={<NocInner />} />
      </Routes>
    </NOCProvider>
  );
}
