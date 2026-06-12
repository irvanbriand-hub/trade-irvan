// Auth helpers untuk NOC.
//
// Supabase Auth itu email-based, jadi "login by username" diimplementasikan via
// synthetic email: username `budi` disimpan sebagai `budi@noc.tradeirvan.local`.
// User cukup mengetik username + password; kode yang menambahkan domain.
//
// Owner (kamu) tetap login pakai email asli (mengandung "@"). Akun NOC tim pakai
// username (tanpa "@") yang dipetakan ke domain synthetic di bawah ini.

// Domain synthetic untuk akun username NOC. JANGAN diubah setelah ada user yang
// dibuat — kalau berubah, semua akun lama tidak bisa login (email-nya berubah).
// Harus identik dengan konstanta di api/noc-users.ts.
export const NOC_USER_DOMAIN = "noc.tradeirvan.local";

// Username yang valid: huruf kecil/angka/titik/underscore/strip, 3–32 char.
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username.trim().toLowerCase());
}

// Ubah input login (username ATAU email) menjadi email yang dipakai Supabase.
// - Mengandung "@"  → diperlakukan sebagai email (owner), apa adanya (lowercased).
// - Tanpa "@"       → username NOC → `<username>@<domain>`.
export function resolveLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (v.includes("@")) return v;
  return `${v}@${NOC_USER_DOMAIN}`;
}

// True kalau email ini adalah akun NOC-only (username synthetic), BUKAN owner.
export function isNocOnlyUser(email?: string | null): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${NOC_USER_DOMAIN}`);
}

// Akun NOC-only tidak boleh mengakses route Trading Journal.
// Owner (email asli) boleh akses semuanya.
export function canAccessTradingApp(email?: string | null): boolean {
  const e = (email ?? "").trim();
  return e.length > 0 && !isNocOnlyUser(e);
}

// Nama tampilan: untuk akun NOC, tampilkan username (tanpa domain); selain itu email.
export function displayName(email?: string | null): string {
  const e = (email ?? "").trim();
  if (!e) return "";
  if (isNocOnlyUser(e)) return e.slice(0, e.indexOf("@"));
  return e;
}
