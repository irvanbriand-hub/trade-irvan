// Bootstrap session untuk headless capture (Puppeteer dari Telegram webhook).
//
// /noc/* kini wajib login. Puppeteer tidak punya session interaktif, jadi
// webhook me-mint magiclink token (single-use, short-lived) untuk akun
// "capture bot" dan menempelkannya ke URL sebagai `#cap_otp=<token>`.
// Halaman capture mengonsumsi token ini lalu setSession sebelum render.
import { supabase } from "@/integrations/supabase/client";

export function hasCaptureToken(): boolean {
  if (typeof window === "undefined") return false;
  return /(?:^#|[#&])cap_otp=/.test(window.location.hash);
}

// Verifikasi magiclink token dari hash → set session Supabase. Hash selalu
// dibersihkan setelahnya (anti bocor & anti re-run). Return true bila sesi aktif.
export async function consumeCaptureToken(): Promise<boolean> {
  const match = window.location.hash.match(/cap_otp=([^&]+)/);
  const stripHash = () =>
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

  if (!match) return false;
  const token_hash = decodeURIComponent(match[1]);
  try {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
    stripHash();
    return !error && !!data.session;
  } catch {
    stripHash();
    return false;
  }
}
