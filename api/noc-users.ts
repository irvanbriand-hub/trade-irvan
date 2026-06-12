// Admin endpoint untuk mengelola akun username/password NOC.
// Memakai SUPABASE_SERVICE_ROLE_KEY (bypass RLS) + supabase.auth.admin.*.
// Hanya boleh dipanggil oleh owner (NOC_ADMIN_EMAIL), diverifikasi dari JWT.
//
// Endpoints:
//   GET                          → list akun NOC
//   POST   { username, password} → buat akun
//   PATCH  { id, password }      → reset password
//   DELETE { id }                → hapus akun
import { createClient } from '@supabase/supabase-js';

// HARUS identik dengan NOC_USER_DOMAIN di src/lib/noc-auth.ts.
const NOC_USER_DOMAIN = 'noc.tradeirvan.local';
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function usernameOf(email?: string | null): string {
  const e = (email ?? '').toLowerCase();
  const suffix = `@${NOC_USER_DOMAIN}`;
  return e.endsWith(suffix) ? e.slice(0, -suffix.length) : e;
}

// Verifikasi pemanggil adalah owner. Mengembalikan true/false.
async function isOwner(req: any): Promise<boolean> {
  const auth = req.headers?.authorization || req.headers?.Authorization || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.email) return false;

  const callerEmail = data.user.email.trim().toLowerCase();
  const ownerEmail = (process.env.NOC_ADMIN_EMAIL || '').trim().toLowerCase();
  if (ownerEmail) return callerEmail === ownerEmail;
  // Fallback bila env belum diset: owner = email asli (bukan akun NOC synthetic).
  return !callerEmail.endsWith(`@${NOC_USER_DOMAIN}`);
}

async function listNocUsers() {
  const out: Array<{ id: string; username: string; created_at: string }> = [];
  // listUsers ter-paginate; ambil sampai habis (tim kecil → cukup beberapa halaman).
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if ((u.email ?? '').toLowerCase().endsWith(`@${NOC_USER_DOMAIN}`)) {
        out.push({ id: u.id, username: usernameOf(u.email), created_at: u.created_at });
      }
    }
    if (users.length < 200) break;
  }
  out.sort((a, b) => a.username.localeCompare(b.username));
  return out;
}

export default async function handler(req: any, res: any) {
  try {
    if (!(await isOwner(req))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (req.method === 'GET') {
      const users = await listNocUsers();
      return res.status(200).json({ users });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (req.method === 'POST') {
      const username = String(body.username ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      if (!USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Username tidak valid (3–32, huruf kecil/angka/._-).' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password minimal 6 karakter.' });
      }
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: `${username}@${NOC_USER_DOMAIN}`,
        password,
        email_confirm: true,
        app_metadata: { role: 'noc' },
      });
      if (error) {
        const msg = /already|exists|registered/i.test(error.message)
          ? 'Username sudah dipakai.'
          : error.message;
        return res.status(400).json({ error: msg });
      }
      return res.status(200).json({ id: data.user.id, username });
    }

    if (req.method === 'PATCH') {
      const id = String(body.id ?? '');
      const password = String(body.password ?? '');
      if (!id) return res.status(400).json({ error: 'id wajib.' });
      if (password.length < 6) return res.status(400).json({ error: 'Password minimal 6 karakter.' });
      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = String(body.id ?? '');
      if (!id) return res.status(400).json({ error: 'id wajib.' });
      const { error } = await supabaseAdmin.auth.admin.deleteUserById(id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Internal error' });
  }
}
