import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { resolveLoginEmail } from "@/lib/noc-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart3, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Auth() {
  const { signIn } = useAuth();
  const [params] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Tujuan setelah login: ?redirect= bila ada, kalau tidak biarkan
  // PublicOnlyRoute yang menentukan (owner → /dashboard, NOC → /noc).
  const isNoc = (params.get("redirect") || "").startsWith("/noc");

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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-border">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{isNoc ? "NOC Dashboard" : "TradingJournal"}</CardTitle>
          <p className="text-sm text-muted-foreground">Masuk ke akun kamu</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Username / Email</label>
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
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Password</label>
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
          <div className="mt-3 text-center">
            <Link to="/noc" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Kembali ke NOC Dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
