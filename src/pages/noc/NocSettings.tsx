import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { canAccessTradingApp } from '@/lib/noc-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save, UserPlus, KeyRound, Trash2, Users } from 'lucide-react';

interface NocUser {
  id: string;
  username: string;
  created_at: string;
}

// Panggil /api/noc-users dengan Bearer token owner.
async function callNocUsers(method: string, body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch('/api/noc-users', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

// Panel manajemen akun NOC — hanya dirender untuk owner.
function NocUserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<NocUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await callNocUsers('GET');
      setUsers(users ?? []);
    } catch (e: any) {
      toast({ title: 'Gagal memuat user', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await callNocUsers('POST', { username, password });
      toast({ title: 'Akun dibuat', description: `Username "${username.trim().toLowerCase()}" siap dipakai.` });
      setUsername('');
      setPassword('');
      await load();
    } catch (e: any) {
      toast({ title: 'Gagal membuat akun', description: e.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleReset(u: NocUser) {
    const pwd = window.prompt(`Password baru untuk "${u.username}" (min 6 karakter):`);
    if (!pwd) return;
    setBusyId(u.id);
    try {
      await callNocUsers('PATCH', { id: u.id, password: pwd });
      toast({ title: 'Password direset', description: `"${u.username}" diperbarui.` });
    } catch (e: any) {
      toast({ title: 'Gagal reset', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u: NocUser) {
    if (!window.confirm(`Hapus akun "${u.username}"? Akun tidak bisa login lagi.`)) return;
    setBusyId(u.id);
    try {
      await callNocUsers('DELETE', { id: u.id });
      toast({ title: 'Akun dihapus', description: `"${u.username}" telah dihapus.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Gagal menghapus', description: e.message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4" />
          Manajemen User NOC
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Username</label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mis. budi"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-9"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">Password (min 6)</label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password awal"
              className="h-9"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={creating || !username || !password}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Tambah
          </Button>
        </form>

        <div className="rounded-md border border-border">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Memuat user...
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Belum ada akun NOC.</div>
          ) : (
            <ul className="divide-y divide-border">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono text-sm">{u.username}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={busyId === u.id}
                      onClick={() => handleReset(u)}
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Reset</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-destructive hover:text-destructive"
                      disabled={busyId === u.id}
                      onClick={() => handleDelete(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Hapus</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Akun login pakai <strong>username + password</strong> (tanpa email). Manajemen user hanya berjalan di
          environment production (Vercel).
        </p>
      </CardContent>
    </Card>
  );
}

const PLACEHOLDERS = [
  { key: '{HARI}', desc: 'Nama hari (Senin, Selasa, ...)' },
  { key: '{TANGGAL}', desc: 'Tanggal lengkap (18 April 2026)' },
  { key: '{TOTAL_TT}', desc: 'Total tiket (open + closed)' },
  { key: '{OPEN_LT30}', desc: 'Tiket aging < 30 hari' },
  { key: '{OPEN_GT30}', desc: 'Tiket aging 30–59 hari' },
  { key: '{OPEN_GT60}', desc: 'Tiket aging ≥ 60 hari' },
  { key: '{NEW_OPEN}', desc: 'TT hari ini (down_time = 1)' },
  { key: '{CLOSED_KEMARIN}', desc: 'Total closed dari snapshot kemarin' },
];

export default function NocSettings() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isOwner = canAccessTradingApp(user?.email);
  const [template, setTemplate] = useState('');
  const [initial, setInitial] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabase
        .from('bot_templates' as any)
        .select('template_text')
        .eq('template_key', 'rekap_pagi')
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        toast({ title: 'Gagal load template', description: error.message, variant: 'destructive' });
      } else if (data) {
        const text = (data as any).template_text ?? '';
        setTemplate(text);
        setInitial(text);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('bot_templates' as any)
      .update({ template_text: template, updated_at: new Date().toISOString() })
      .eq('template_key', 'rekap_pagi');
    setSaving(false);

    if (error) {
      toast({ title: 'Gagal menyimpan', description: error.message, variant: 'destructive' });
      return;
    }
    setInitial(template);
    toast({ title: 'Template disimpan' });
  }

  const dirty = template !== initial;

  return (
    <div className="space-y-4">
      {isOwner && <NocUserManagement />}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template Rekap Pagi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">
              Placeholder yang tersedia:
            </div>
            <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {PLACEHOLDERS.map((p) => (
                <div key={p.key} className="flex gap-2">
                  <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[11px]">
                    {p.key}
                  </code>
                  <span className="text-muted-foreground">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading template...
            </div>
          ) : (
            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={20}
              className="font-mono text-sm"
              placeholder="Template rekap pagi..."
            />
          )}

          <div className="flex items-center justify-end gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">Ada perubahan belum disimpan</span>
            )}
            <Button
              onClick={handleSave}
              disabled={loading || saving || !dirty}
              size="sm"
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Simpan Template
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
