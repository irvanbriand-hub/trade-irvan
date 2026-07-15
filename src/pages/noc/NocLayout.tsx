import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  Trash2,
  BarChart3,
  LogOut,
  Sun,
  Moon,
  Radio,
  LayoutDashboard,
  ClipboardList,
  TrendingUp,
  MapPin,
  Home,
  MessageSquare,
  Database,
  Activity,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { NOCProvider } from '@/lib/noc/hooks/useNOC';
import { useNOC } from '@/lib/noc/hooks/useNOC';
import { useAuth } from '@/hooks/useAuth';
import { canAccessTradingApp, displayName } from '@/lib/noc-auth';
import { TRADING_ENABLED } from '@/lib/feature-flags';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import NocDashboard from './NocDashboard';
import NocRecap from './NocRecap';
import NocGenerate from './NocGenerate';
import NocDatek from './NocDatek';
import NocMonitoring from './NocMonitoring';
import NocSettings from './NocSettings';
import NOCCapturePage from './NOCCapturePage';
import NOCSCurve from './NOCSCurve';
import NOCSCurveCapture from './NOCSCurveCapture';
import NOCSCurveCaptureGrid from './NOCSCurveCaptureGrid';
import NOCRtgs from './NOCRtgs';
import NOCRtgsCapture from './NOCRtgsCapture';
import NocMindmapCapture from './NocMindmapCapture';
import UbiquDirumaPage from '@/features/ubiqu-diruma/pages/UbiquDirumaPage';
import UbiquDirumaCapture from './UbiquDirumaCapture';

type Tab = { to: string; label: string; Icon: LucideIcon };

const tabs: Tab[] = [
  { to: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: 'recap', label: 'Rekap', Icon: ClipboardList },
  { to: 'scurve', label: 'S-Curve', Icon: TrendingUp },
  { to: 'rtgs', label: 'RTGS', Icon: MapPin },
  { to: 'ubiqu-diruma', label: 'UBIQU', Icon: Home },
  { to: 'generate', label: 'Generate', Icon: MessageSquare },
  { to: 'datek', label: 'Datek', Icon: Database },
  { to: 'monitoring', label: 'Monitoring', Icon: Activity },
  { to: 'settings', label: 'Settings', Icon: SettingsIcon },
];

// Brand mark — simpel, pojok kiri. Head-lead tool, terpisah dari webapp NOC utama.
function Brand() {
  return (
    <Link to="/noc/dashboard" className="flex items-center gap-2.5 group">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Radio className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight">NOC</span>
        <span className="hidden sm:block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Network Ops
        </span>
      </span>
    </Link>
  );
}

// Navigasi utama — baris kedua top bar.
function NocNav() {
  const { pathname } = useLocation();
  return (
    <nav className="flex gap-0.5 overflow-x-auto scrollbar-hide px-2 sm:px-4">
      {tabs.map(({ to, label, Icon }) => {
        const isActive = pathname.includes(`/noc/${to}`);
        return (
          <NavLink
            key={to}
            to={to}
            className={[
              'relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors',
              'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors',
              isActive
                ? 'text-primary after:bg-primary'
                : 'text-muted-foreground hover:text-foreground after:bg-transparent',
            ].join(' ')}
          >
            <Icon className="h-4 w-4" strokeWidth={2.25} />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}

// Toggle terang/gelap.
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Ganti tema"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
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
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-muted-foreground hover:text-destructive"
          disabled={resetting}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden lg:inline">{resetting ? 'Menghapus…' : 'Reset'}</span>
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
// Ikut hilang saat modul trading dimatikan lewat feature flag.
function TradeJournalButton() {
  const { user } = useAuth();
  if (!TRADING_ENABLED) return null;
  if (!canAccessTradingApp(user?.email)) return null;
  return (
    <Button variant="outline" size="sm" className="h-9 gap-1.5" asChild>
      <Link to="/journal">
        <BarChart3 className="h-4 w-4" />
        <span className="hidden lg:inline">Trade Journal</span>
      </Link>
    </Button>
  );
}

// Identitas user + logout, dalam dropdown.
function UserMenu() {
  const { user, signOut } = useAuth();
  const name = displayName(user?.email);
  const initials = (name || '?').slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 gap-2 px-1.5 sm:px-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline max-w-[120px] truncate text-sm font-medium">
            {name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{name}</span>
          <span className="text-xs font-normal text-muted-foreground truncate">
            {user?.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NocInner() {
  const { pathname } = useLocation();
  const isDatekPage = pathname.includes('/datek');
  const isSettingsPage = pathname.endsWith('/settings');
  const isRtgsPage = pathname.endsWith('/rtgs');
  const isUbiquPage = pathname.endsWith('/ubiqu-diruma');
  const isMonitoringPage = pathname.endsWith('/monitoring');
  const showUploader = !isDatekPage && !isSettingsPage && !isRtgsPage && !isUbiquPage && !isMonitoringPage;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar — sticky, dua baris: brand + aksi, lalu navigasi */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            <TradeJournalButton />
            <ResetDataButton />
            <ThemeToggle />
            <div className="mx-1.5 hidden h-6 w-px bg-border sm:block" />
            <UserMenu />
          </div>
        </div>
        <NocNav />
      </header>

      {/* Konten */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-5 space-y-4">
          {showUploader && <TsvUploader />}
          <Routes>
            <Route path="/" element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<NocDashboard />} />
            <Route path="recap" element={<NocRecap />} />
            <Route path="scurve" element={<NOCSCurve />} />
            <Route path="rtgs" element={<NOCRtgs />} />
            <Route path="ubiqu-diruma" element={<UbiquDirumaPage />} />
            <Route path="generate" element={<NocGenerate />} />
            <Route path="datek/*" element={<NocDatek />} />
            <Route path="monitoring" element={<NocMonitoring />} />
            <Route path="settings" element={<NocSettings />} />
          </Routes>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-primary" />
            NOC · Network Operations Center
          </span>
          <span>Monitoring trouble ticket jaringan</span>
        </div>
      </footer>
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
        <Route path="mindmap-capture" element={<NocMindmapCapture />} />
        <Route path="ubiqu-diruma-capture" element={<UbiquDirumaCapture />} />
        <Route path="*" element={<NocInner />} />
      </Routes>
    </NOCProvider>
  );
}
