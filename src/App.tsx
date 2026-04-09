import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
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
import NocLayout from "./pages/noc/NocLayout";

import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
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
        <Route path="/noc/*" element={<NocLayout />} />

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
          <AuthenticatedApp />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
