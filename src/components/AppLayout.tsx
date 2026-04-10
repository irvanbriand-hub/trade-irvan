import { useState, useRef, useEffect, useCallback } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3, Menu, X, LogOut, ChevronDown, ChevronRight,
  Search, Zap, Landmark, LineChart, BookOpen, Sun, Moon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

interface NavChild {
  to: string;
  label: string;
}

interface NavGroup {
  label: string;
  icon: string;
  to?: string;
  children?: NavChild[];
}

const navGroups: NavGroup[] = [
  {
    label: "Screener",
    icon: "📊",
    children: [
      { to: "/screener", label: "BPJS Screener" },
      { to: "/screener?tab=superketat", label: "Superketat Screener" },
      { to: "/screener?tab=swing", label: "Swing Screener" },
      { to: "/research-screener", label: "🔬 Research Screener" },
      { to: "/ara-hunter", label: "🎯 ARA Hunter" },
      { to: "/jendral-hunter", label: "🎯 Jendral Hunter" },
      { to: "/watchlist-rekomendasi", label: "WL Rekomendasi" },
    ],
  },
  {
    label: "Entry",
    icon: "🎯",
    children: [
      { to: "/analisa-entry", label: "Analisa Entry" },
      { to: "/sk-monitoring", label: "SK Monitoring" },
      { to: "/swing-monitoring", label: "Swing Monitoring" },
      { to: "/accum-watch", label: "Accum Watch" },
    ],
  },
  {
    label: "Bandarmology",
    icon: "🏦",
    to: "/bandarmology",
  },
  {
    label: "Analisa",
    icon: "📈",
    children: [
      { to: "/wr-scanner", label: "Data WR Scanner" },
      { to: "/historical-backtest", label: "Historical Backtest" },
      { to: "/laporan-keuangan", label: "Laporan Keuangan" },
    ],
  },
  {
    label: "Jurnal",
    icon: "📔",
    children: [
      { to: "/journal", label: "Jurnal Trading" },
      { to: "/portfolio", label: "Portfolio" },
      { to: "/statistics", label: "Statistik" },
      { to: "/categories", label: "Kategori" },
      { to: "/modal-equity", label: "Modal & Equity" },
      { to: "/backup", label: "💾 Backup & Restore" },
    ],
  },
  {
    label: "NOC",
    icon: "📡",
    to: "/noc",
  },
];

function DesktopDropdown({ group }: { group: NavGroup }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  const isGroupActive = group.to
    ? location.pathname === group.to
    : group.children?.some((c) => location.pathname === c.to.split("?")[0]) ?? false;

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 200);
  };

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  if (group.to && !group.children) {
    return (
      <NavLink
        to={group.to}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
          isGroupActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <span>{group.icon}</span>
        {group.label}
      </NavLink>
    );
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
          isGroupActive
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        }`}
      >
        <span>{group.icon}</span>
        {group.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-[200px] bg-card border border-border rounded-lg shadow-xl py-1 z-50 animate-in fade-in-0 slide-in-from-top-2 duration-150">
          {group.children?.map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm transition-colors ${
                location.pathname === child.to.split("?")[0]
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const location = useLocation();
  const { user, signOut } = useAuth();

  const toggleGroup = (label: string) => {
    setExpanded(expanded === label ? null : label);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute top-0 left-0 right-0 bg-card border-b border-border shadow-2xl max-h-[85vh] overflow-y-auto animate-in slide-in-from-top duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-bold text-foreground">TradingJournal</span>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Dashboard */}
        <NavLink
          to="/"
          end
          onClick={onClose}
          className={`flex items-center gap-3 px-4 py-3 text-sm font-medium border-b border-border/50 min-h-[44px] ${
            location.pathname === "/"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📊 Dashboard
        </NavLink>

        {/* Nav Groups */}
        {navGroups.map((group) => (
          <div key={group.label} className="border-b border-border/50">
            {group.to && !group.children ? (
              <NavLink
                to={group.to}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium min-h-[44px] ${
                  location.pathname === group.to
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{group.icon}</span>
                {group.label}
              </NavLink>
            ) : (
              <>
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={`flex items-center justify-between w-full px-4 py-3 text-sm font-medium min-h-[44px] ${
                    group.children?.some((c) => location.pathname === c.to.split("?")[0])
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span>{group.icon}</span>
                    {group.label}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${expanded === group.label ? "rotate-180" : ""}`}
                  />
                </button>
                {expanded === group.label && (
                  <div className="bg-muted/30 animate-in slide-in-from-top-1 duration-150">
                    {group.children?.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        onClick={onClose}
                        className={`flex items-center gap-3 pl-10 pr-4 py-3 text-sm min-h-[44px] ${
                          location.pathname === child.to.split("?")[0]
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {/* User Info & Logout */}
        <div className="p-4 space-y-2">
          {user && (
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={() => { signOut(); onClose(); }}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center h-14">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2 mr-6 shrink-0">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-foreground leading-tight">TradingJournal</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">IDX • BEI</p>
            </div>
          </NavLink>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            <NavLink
              to="/"
              end
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                location.pathname === "/"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              Dashboard
            </NavLink>

            {navGroups.map((group) => (
              <DesktopDropdown key={group.label} group={group} />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-gain animate-pulse-glow" />
              <span>Market Open</span>
            </div>
            {user && (
              <span className="hidden lg:block text-xs text-muted-foreground truncate max-w-[160px]">
                {user.email}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex h-8 w-8 relative"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Toggle theme"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:flex h-8 w-8"
              onClick={signOut}
              title="Logout"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </Button>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <MobileMenu isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main Content - full width */}
      <main className="max-w-[1400px] mx-auto px-4 py-4 lg:py-6">{children}</main>
    </div>
  );
}
