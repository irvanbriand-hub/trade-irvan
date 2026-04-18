import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { Trash2, BarChart3 } from 'lucide-react';
import { NOCProvider } from '@/lib/noc/hooks/useNOC';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { useAuth } from '@/hooks/useAuth';
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

const tabs = [
  { to: 'dashboard', label: 'Dashboard', icon: '📊' },
  { to: 'recap', label: 'Rekap', icon: '📋' },
  { to: 'generate', label: 'Generate', icon: '💬' },
  { to: 'po', label: 'PO', icon: '👤' },
  { to: 'settings', label: 'Settings', icon: '⚙️' },
];

function NocTabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const isActive = pathname.endsWith(`/noc/${tab.to}`) || pathname === `/noc/${tab.to}`;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={[
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
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
          {resetting ? 'Menghapus...' : 'Reset Data'}
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

function TradeJournalButton() {
  const { user } = useAuth();
  return (
    <Button variant="outline" size="sm" className="gap-1.5" asChild>
      <Link to={user ? '/journal' : '/login'}>
        <BarChart3 className="h-3.5 w-3.5" />
        {user ? 'Trade Journal' : 'Login ke Trade Journal'}
      </Link>
    </Button>
  );
}

function NocInner() {
  const { pathname } = useLocation();
  const isPOPage = pathname.endsWith('/po');
  const isSettingsPage = pathname.endsWith('/settings');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📡</span>
          <div>
            <h1 className="text-2xl font-bold">NOC Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitoring trouble ticket jaringan</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TradeJournalButton />
          <ResetDataButton />
        </div>
      </div>

      {/* TSV Uploader — hidden on PO & Settings page */}
      {!isPOPage && !isSettingsPage && <TsvUploader />}

      {/* Tabs */}
      <NocTabs />

      {/* Content */}
      <div className="pt-2">
        <Routes>
          <Route path="/" element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<NocDashboard />} />
          <Route path="recap" element={<NocRecap />} />
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
        <Route path="*" element={<NocInner />} />
      </Routes>
    </NOCProvider>
  );
}
