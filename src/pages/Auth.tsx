import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { resolveLoginEmail } from "@/lib/noc-auth";
import { TRADING_ENABLED } from "@/lib/feature-flags";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart3, Radio, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Auth() {
  const { signIn } = useAuth();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Tujuan setelah login: ?redirect= bila ada, kalau tidak biarkan
  // PublicOnlyRoute yang menentukan (owner → /dashboard, NOC → /noc).
  // Saat modul trading dimatikan, login selalu di-branding NOC.
  const isNoc = !TRADING_ENABLED || (params.get("redirect") || "").startsWith("/noc");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      toast({ title: "Error", description: "Username/email dan password wajib diisi", variant: "destructive" });
      return;
    }
    setLoading(true);
    const email = resolveLoginEmail(identifier);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      toast({ title: "Login gagal", description: "Username/email atau password salah.", variant: "destructive" });
    }
    // Sukses → onAuthStateChange memicu redirect via PublicOnlyRoute.
  };

  const brandTitle = isNoc ? "NOC" : "TradingJournal";
  const brandSubtitle = isNoc ? "Network Operations Center" : "Trading Journal";
  const BrandIcon = isNoc ? Radio : BarChart3;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background flex items-center justify-center p-4">
      {/* Aksen latar halus */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <BrandIcon className="h-7 w-7" strokeWidth={2.5} />
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{brandTitle}</h1>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {brandSubtitle}
          </p>
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-5 text-center">
              <h2 className="text-base font-semibold">Masuk ke akun kamu</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gunakan username atau email yang diberikan admin
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Username / Email</label>
                <Input
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  placeholder="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Password</label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button type="submit" className="w-full h-10" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Masuk
              </Button>
            </form>

            <p className="mt-4 text-center text-[11px] text-muted-foreground">
              Akun dibuat oleh admin. Hubungi admin untuk reset password.
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          NOC · Network Operations Center
        </p>
      </div>
    </div>
  );
}
