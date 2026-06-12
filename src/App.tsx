import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { canAccessTradingApp, isNocOnlyUser } from "@/lib/noc-auth";
import Dashboard from "./pages/Dashboard";
import Journal from "./pages/Journal";
import Portfolio from "./pages/Portfolio";
import Categories from "./pages/Categories";
import Statistics from "./pages/Statistics";
import Screener from "./pages/Screener";
import WatchlistRekomendasi from "./pages/WatchlistRekomendasi";
import WrScanner from "./pages/WrScanner";
import LaporanKeuangan from "./pages/LaporanKeuangan";
import HistoricalBacktest from "./pages/HistoricalBacktest";
import SkMonitoring from "./pages/SkMonitoring";
import AnalisaEntry from "./pages/AnalisaEntry";
import SwingMonitoring from "./pages/SwingMonitoring";
import Bandarmology from "./pages/Bandarmology";
import AccumWatch from "./pages/AccumWatch";
import ModalEquity from "./pages/ModalEquity";
import ResearchScreener from "./pages/ResearchScreener";
import AraHunter from "./pages/AraHunter";
import JendralHunter from "./pages/JendralHunter";
import BackupRestore from "./pages/BackupRestore";
import ContentTrackerLayout from "./pages/content-tracker/ContentTrackerLayout";
import { canAccessContentTracker } from "@/lib/content-tracker";
import NocLayout from "./pages/noc/NocLayout";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Spinner reusable
function Spinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Landing default sesuai jenis akun.
function homeFor(email?: string | null) {
  return isNocOnlyUser(email) ? "/noc" : "/dashboard";
}

// Route "/" — arahkan sesuai status & jenis akun. Guest → /login.
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(user.email)} replace />;
}

// Hanya untuk /login — kalau sudah login, redirect ke ?redirect= (kalau ada) atau home sesuai akun.
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <Spinner />;
  if (user) {
    const redirect = params.get("redirect");
    return <Navigate to={redirect || homeFor(user.email)} replace />;
  }
  return <>{children}</>;
}

// Gerbang untuk /noc/* — wajib login (owner atau akun NOC). Belum login → /login?redirect=.
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

// Semua route trading — redirect ke /login jika belum login
function ProtectedApp() {
  const { user, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  // Akun NOC-only tidak boleh masuk route trading — lempar ke /noc.
  if (!canAccessTradingApp(user.email)) return <Navigate to="/noc" replace />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/screener" element={<Screener />} />
        <Route path="/watchlist-rekomendasi" element={<WatchlistRekomendasi />} />
        <Route path="/wr-scanner" element={<WrScanner />} />
        <Route path="/laporan-keuangan" element={<LaporanKeuangan />} />
        <Route path="/historical-backtest" element={<HistoricalBacktest />} />
        <Route path="/sk-monitoring" element={<SkMonitoring />} />
        <Route path="/analisa-entry" element={<AnalisaEntry />} />
        <Route path="/swing-monitoring" element={<SwingMonitoring />} />
        <Route path="/bandarmology" element={<Bandarmology />} />
        <Route path="/accum-watch" element={<AccumWatch />} />
        <Route path="/modal-equity" element={<ModalEquity />} />
        <Route path="/research-screener" element={<ResearchScreener />} />
        <Route path="/ara-hunter" element={<AraHunter />} />
        <Route path="/jendral-hunter" element={<JendralHunter />} />
        <Route path="/backup" element={<BackupRestore />} />
        <Route
          path="/content-tracker/*"
          element={canAccessContentTracker(user.email) ? <ContentTrackerLayout /> : <Navigate to="/dashboard" replace />}
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Default → /noc jika belum login, /dashboard jika sudah login */}
            <Route path="/" element={<RootRedirect />} />

            {/* NOC — wajib login (owner atau akun NOC team) */}
            <Route path="/noc/*" element={<RequireAuth><NocLayout /></RequireAuth>} />

            {/* PUBLIC: Login — redirect ke /noc jika sudah login */}
            <Route path="/login" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />

            {/* PROTECTED: semua route trading */}
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
